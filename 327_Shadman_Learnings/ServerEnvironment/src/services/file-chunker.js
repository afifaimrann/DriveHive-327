import { CHUNK_SIZE } from '../config/constants.js';
import { StorageFullError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Generates chunk metadata ranges for a file.
 *
 * @param {object} file - Express multer file object
 * @param {number} customChunkSize - Custom chunk size if specified
 * @returns {Array} List of chunk metadata objects
 */
export function generateChunkMetadata(file, customChunkSize = CHUNK_SIZE) {
  const chunks = [];
  let offset = 0;

  while (offset < file.size) {
    const currentChunkSize = Math.min(customChunkSize, file.size - offset);
    const start = offset;
    const end = offset + currentChunkSize - 1;

    chunks.push({
      name: `${file.originalname}-chunk-${start}-${end}`,
      mimeType: file.mimetype,
      range: { start, end },
      size: currentChunkSize,
      offset,
    });

    offset += currentChunkSize;
  }

  return chunks;
}

/**
 * Find the best account that can hold the chunk.
 * Uses a greedy "most available space" strategy to distribute chunks evenly.
 *
 * @param {number} chunkSize - Size of the chunk in bytes
 * @param {Array<object>} storageInstances - List of CloudStorage instances
 * @returns {Promise<object>} The selected storage instance
 */
export async function selectStorageAccount(chunkSize, storageInstances) {
  const candidates = [];

  for (const storage of storageInstances) {
    try {
      const available = await storage.getAvailableStorage();
      if (available >= chunkSize) {
        candidates.push({ storage, available });
      }
    } catch (error) {
      logger.error(
        { error, accountId: storage.id, provider: storage.provider },
        'Error checking storage quota for account'
      );
    }
  }

  if (candidates.length === 0) {
    throw new StorageFullError('No connected storage accounts have enough space for this chunk');
  }

  // Sort by available space descending (most free space first) to distribute load
  candidates.sort((a, b) => b.available - a.available);

  logger.debug(
    {
      selectedId: candidates[0].storage.id,
      selectedProvider: candidates[0].storage.provider,
      availableSpace: candidates[0].available,
    },
    'Selected best storage account for chunk'
  );

  return candidates[0].storage;
}
