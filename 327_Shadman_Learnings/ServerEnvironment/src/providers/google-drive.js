import fs from 'fs';
import { google } from 'googleapis';
import { CloudStorage } from './base.js';
import logger from '../utils/logger.js';

/**
 * Google Drive storage provider.
 * Handles upload, download, delete, and quota operations for Google Drive.
 */
export class GoogleDriveStorage extends CloudStorage {
  /**
   * @param {object} opts
   * @param {string} opts.id - Cloud account ID (from Supabase)
   * @param {string} opts.accessToken - Decrypted access token
   * @param {string} opts.folderId - DriveHive folder ID in this Drive account
   */
  constructor({ id, accessToken, folderId }) {
    super({ id, provider: 'google' });
    this.auth = new google.auth.OAuth2();
    this.auth.setCredentials({ access_token: accessToken });
    this.drive = google.drive({ version: 'v3', auth: this.auth });
    this.folderId = folderId;
  }

  async uploadChunk(chunkInfo, filePath) {
    logger.debug({ chunk: chunkInfo.name, accountId: this.id }, 'Google Drive: uploading chunk');

    const sliceStream = fs.createReadStream(filePath, {
      start: chunkInfo.range.start,
      end: chunkInfo.range.end,
    });

    const response = await this.drive.files.create({
      requestBody: {
        name: chunkInfo.name,
        mimeType: chunkInfo.mimeType,
        parents: [this.folderId],
      },
      media: {
        mimeType: chunkInfo.mimeType,
        body: sliceStream,
      },
    });

    logger.debug({ fileId: response.data.id }, 'Google Drive: chunk uploaded');

    return {
      provider: 'google',
      provider_file_id: response.data.id,
      provider_path: null,
    };
  }

  async downloadChunk(chunkInfo) {
    logger.debug({ fileId: chunkInfo.provider_file_id }, 'Google Drive: downloading chunk');

    const response = await this.drive.files.get(
      { fileId: chunkInfo.provider_file_id, alt: 'media' },
      { responseType: 'stream' }
    );

    return response.data;
  }

  async deleteChunk(chunkInfo) {
    logger.debug({ fileId: chunkInfo.provider_file_id }, 'Google Drive: deleting chunk');
    await this.drive.files.delete({ fileId: chunkInfo.provider_file_id });
  }

  async getAvailableStorage() {
    const quota = await this.getStorageQuota();
    return quota.available;
  }

  async getStorageQuota() {
    const response = await this.drive.about.get({ fields: 'storageQuota' });
    const q = response.data.storageQuota;

    const total = parseInt(q.limit, 10) || 0;
    const used = parseInt(q.usage, 10) || 0;

    return {
      total,
      used,
      available: total - used,
    };
  }
}

export default GoogleDriveStorage;
