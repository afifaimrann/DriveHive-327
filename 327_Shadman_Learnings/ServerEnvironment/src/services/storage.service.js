import fs from 'fs';
import supabase from '../config/supabase.js';
import { createCloudStorage } from '../providers/index.js';
import { getAccountWithValidToken } from './oauth.service.js';
import { generateChunkMetadata, selectStorageAccount } from './file-chunker.js';
import { CHUNK_SIZE } from '../config/constants.js';
import { NotFoundError, AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const CHUNK_LIMIT = 100 * 1024 * 1024; // 100 MB

/**
 * Upload a file, chunking it if it exceeds the limit, and distribute chunks across connected storage providers.
 *
 * @param {string} userId - User ID uploading the file
 * @param {object} file - Express Multer file object
 * @returns {Promise<object>} The created file record metadata
 */
export async function uploadFile(userId, file, onProgress) {
  // 1. Fetch connected cloud accounts for this user
  const { data: accounts, error: accountsError } = await supabase
    .from('cloud_accounts')
    .select('*')
    .eq('user_id', userId);

  if (accountsError) {
    throw accountsError;
  }

  if (!accounts || accounts.length === 0) {
    throw new NotFoundError('No cloud storage accounts connected. Please connect Google Drive or Dropbox.');
  }

  // 2. Validate and refresh tokens, get active storage clients
  const storageInstances = [];
  for (const account of accounts) {
    try {
      const activeAccount = await getAccountWithValidToken(account);
      const storage = createCloudStorage(activeAccount);
      storageInstances.push(storage);
    } catch (err) {
      logger.warn({ accountId: account.id, error: err }, 'Failed to initialize storage account client');
    }
  }

  if (storageInstances.length === 0) {
    throw new AppError('Could not initialize any cloud storage accounts. Please check your account connections.', 500);
  }

  const isChunked = file.size > CHUNK_LIMIT;

  // 3. Create the file record in Supabase
  const { data: fileRecord, error: fileError } = await supabase
    .from('files')
    .insert({
      user_id: userId,
      name: file.originalname,
      mime_type: file.mimetype,
      size: file.size,
      is_chunked: isChunked,
    })
    .select('*')
    .single();

  if (fileError) {
    throw fileError;
  }

  const uploadedChunks = [];

  try {
    if (isChunked) {
      // Chunked Upload
      const chunkMetadataList = generateChunkMetadata(file, CHUNK_SIZE);

      for (let i = 0; i < chunkMetadataList.length; i++) {
        const chunkInfo = chunkMetadataList[i];
        const storage = await selectStorageAccount(chunkInfo.size, storageInstances);
        const account = accounts.find(a => a.id === storage.id);

        if (onProgress) {
          onProgress({
            status: 'uploading',
            chunkIndex: i,
            totalChunks: chunkMetadataList.length,
            provider: storage.provider,
            email: account ? account.email : 'Unknown',
            chunkSize: chunkInfo.size,
          });
        }

        const uploadResult = await storage.uploadChunk(chunkInfo, file.path);

        uploadedChunks.push({
          file_id: fileRecord.id,
          cloud_account_id: storage.id,
          provider: storage.provider,
          provider_file_id: uploadResult.provider_file_id,
          provider_path: uploadResult.provider_path,
          chunk_index: i,
          chunk_size: chunkInfo.size,
          offset_bytes: chunkInfo.offset,
        });
      }
    } else {
      // Single Upload
      const storage = await selectStorageAccount(file.size, storageInstances);
      const account = accounts.find(a => a.id === storage.id);

      if (onProgress) {
        onProgress({
          status: 'uploading',
          chunkIndex: 0,
          totalChunks: 1,
          provider: storage.provider,
          email: account ? account.email : 'Unknown',
          chunkSize: file.size,
        });
      }

      const chunkInfo = {
        name: file.originalname,
        mimeType: file.mimetype,
        range: { start: 0, end: file.size - 1 },
      };

      const uploadResult = await storage.uploadChunk(chunkInfo, file.path);

      uploadedChunks.push({
        file_id: fileRecord.id,
        cloud_account_id: storage.id,
        provider: storage.provider,
        provider_file_id: uploadResult.provider_file_id,
        provider_path: uploadResult.provider_path,
        chunk_index: 0,
        chunk_size: file.size,
        offset_bytes: 0,
      });
    }

    // 4. Save chunk records in DB
    const { error: chunkInsertError } = await supabase
      .from('file_chunks')
      .insert(uploadedChunks);

    if (chunkInsertError) {
      throw chunkInsertError;
    }

    logger.info({ userId, fileId: fileRecord.id, chunksCount: uploadedChunks.length }, 'File upload completed successfully');
    return fileRecord;
  } catch (error) {
    logger.error({ userId, filename: file.originalname, error }, 'Error during file upload, rolling back metadata');

    // Cleanup any successfully uploaded chunks from providers
    for (const chunk of uploadedChunks) {
      try {
        const storage = storageInstances.find(inst => inst.id === chunk.cloud_account_id);
        if (storage) {
          await storage.deleteChunk(chunk);
        }
      } catch (delErr) {
        logger.error({ chunk, error: delErr }, 'Failed to delete chunk during upload rollback cleanup');
      }
    }

    // Delete the file metadata row (chunks will be cascade deleted)
    await supabase.from('files').delete().eq('id', fileRecord.id);

    throw error;
  } finally {
    // Delete local temp file
    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (cleanupErr) {
      logger.warn({ path: file.path, error: cleanupErr }, 'Failed to delete temp upload file');
    }
  }
}

/**
 * Download a file by fetching and streaming all its chunks in order.
 *
 * @param {string} userId - User ID downloading the file
 * @param {string} fileId - ID of the file
 * @param {object} res - Express Response object to stream the file to
 */
export async function downloadFile(userId, fileId, res) {
  // 1. Fetch file record and verify ownership
  const { data: fileRecord, error: fileError } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .eq('user_id', userId)
    .single();

  if (fileError || !fileRecord) {
    throw new NotFoundError('File not found');
  }

  // 2. Fetch all chunks, ordered by chunk_index
  const { data: chunks, error: chunksError } = await supabase
    .from('file_chunks')
    .select('*')
    .eq('file_id', fileId)
    .order('chunk_index', { ascending: true });

  if (chunksError || !chunks || chunks.length === 0) {
    throw new NotFoundError('File chunks not found');
  }

  // Set response headers for download if this is an Express HTTP response
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileRecord.name)}"`);
    res.setHeader('Content-Type', fileRecord.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', fileRecord.size);
  }

  // 3. Download and stream chunks sequentially
  try {
    for (const chunk of chunks) {
      // Fetch credentials for this chunk's cloud account
      const { data: account, error: accountError } = await supabase
        .from('cloud_accounts')
        .select('*')
        .eq('id', chunk.cloud_account_id)
        .single();

      if (accountError || !account) {
        throw new NotFoundError(`Cloud storage account for chunk ${chunk.chunk_index} not found or disconnected`);
      }

      // Refresh token if needed
      const activeAccount = await getAccountWithValidToken(account);
      const storage = createCloudStorage(activeAccount);

      const chunkData = await storage.downloadChunk(chunk);

      if (chunkData && typeof chunkData.pipe === 'function') {
        // It's a stream (Google Drive)
        await new Promise((resolve, reject) => {
          chunkData
            .on('end', resolve)
            .on('error', reject)
            .pipe(res, { end: false });
        });
      } else {
        // It's a buffer (Dropbox)
        res.write(chunkData);
      }
    }

    // Finish response stream
    res.end();
  } catch (err) {
    logger.error({ fileId, error: err }, 'Error downloading file chunks');
    if (typeof res.setHeader === 'function') {
      if (res.headersSent) {
        // Headers already sent, we must destroy the connection to notify the client of a failure
        res.destroy(err);
      } else {
        throw err;
      }
    } else {
      if (typeof res.destroy === 'function') {
        res.destroy(err);
      }
      throw err;
    }
  }
}

/**
 * Delete a file and delete all its chunks from the respective providers.
 *
 * @param {string} userId - User ID deleting the file
 * @param {string} fileId - ID of the file
 */
export async function deleteFile(userId, fileId, onProgress) {
  // 1. Fetch file record and verify ownership
  const { data: fileRecord, error: fileError } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .eq('user_id', userId)
    .single();

  if (fileError || !fileRecord) {
    throw new NotFoundError('File not found');
  }

  // 2. Fetch all chunks
  const { data: chunks, error: chunksError } = await supabase
    .from('file_chunks')
    .select('*')
    .eq('file_id', fileId);

  if (chunksError) {
    throw chunksError;
  }

  // 3. Delete chunks from cloud storage
  if (chunks && chunks.length > 0) {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const { data: account } = await supabase
          .from('cloud_accounts')
          .select('*')
          .eq('id', chunk.cloud_account_id)
          .single();

        if (account) {
          if (onProgress) {
            onProgress({
              status: 'deleting',
              chunkIndex: i,
              totalChunks: chunks.length,
              provider: chunk.provider,
              email: account.email,
              chunkSize: chunk.chunk_size,
            });
          }
          const activeAccount = await getAccountWithValidToken(account);
          const storage = createCloudStorage(activeAccount);
          await storage.deleteChunk(chunk);
        }
      } catch (err) {
        logger.error(
          { chunkId: chunk.id, error: err },
          'Failed to delete chunk from provider during file deletion'
        );
      }
    }
  }

  // 4. Delete file metadata from Supabase (will cascade delete chunks if foreign keys are set up correctly)
  const { error: deleteError } = await supabase
    .from('files')
    .delete()
    .eq('id', fileId);

  if (deleteError) {
    throw deleteError;
  }

  logger.info({ userId, fileId }, 'File and all chunks deleted successfully');
}

/**
 * List all files uploaded by a user.
 *
 * @param {string} userId - User ID
 * @returns {Promise<Array>} List of file records
 */
export async function listFiles(userId) {
  const { data, error } = await supabase
    .from('files')
    .select('id, name, mime_type, size, is_chunked, uploaded_at')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Aggregate storage space stats from all connected accounts for a user.
 *
 * @param {string} userId - User ID
 * @returns {Promise<object>} Quota aggregation metadata
 */
export async function getUserStorageQuota(userId) {
  const { data: accounts, error: accountsError } = await supabase
    .from('cloud_accounts')
    .select('*')
    .eq('user_id', userId);

  if (accountsError) {
    throw accountsError;
  }

  let total = 0;
  let used = 0;
  let available = 0;
  const breakdown = [];

  for (const account of accounts) {
    try {
      const activeAccount = await getAccountWithValidToken(account);
      const storage = createCloudStorage(activeAccount);
      const quota = await storage.getStorageQuota();

      total += quota.total;
      used += quota.used;
      available += quota.available;

      breakdown.push({
        accountId: account.id,
        provider: account.provider,
        email: account.email,
        ...quota,
      });
    } catch (err) {
      logger.error({ accountId: account.id, error: err }, 'Failed to get quota for account');
    }
  }

  return {
    total,
    used,
    available,
    breakdown,
  };
}
