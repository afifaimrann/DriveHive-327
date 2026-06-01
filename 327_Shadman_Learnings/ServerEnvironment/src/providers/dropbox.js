import fs from 'fs';
import { Dropbox } from 'dropbox';
import { CloudStorage } from './base.js';
import logger from '../utils/logger.js';

/**
 * Dropbox storage provider.
 * Handles upload, download, delete, and quota operations for Dropbox.
 */
export class DropboxStorage extends CloudStorage {
  /**
   * @param {object} opts
   * @param {string} opts.id - Cloud account ID (from Supabase)
   * @param {string} opts.accessToken - Decrypted access token
   * @param {string} [opts.basePath=''] - Base folder path in Dropbox
   */
  constructor({ id, accessToken, basePath }) {
    super({ id, provider: 'dropbox' });
    this.accessToken = accessToken;
    this.basePath = basePath || '/DriveHive';
    this.client = new Dropbox({ accessToken: this.accessToken });
  }

  async uploadChunk(chunkInfo, filePath) {
    logger.debug({ chunk: chunkInfo.name, accountId: this.id }, 'Dropbox: uploading chunk');

    const fileBuffer = fs.readFileSync(filePath);
    const sliced = fileBuffer.subarray(chunkInfo.range.start, chunkInfo.range.end + 1);
    const dropboxPath = `${this.basePath}/${chunkInfo.name}`;

    const response = await this.client.filesUpload({
      path: dropboxPath,
      contents: sliced,
      mode: { '.tag': 'overwrite' },
    });

    logger.debug({ path: response.result.path_display }, 'Dropbox: chunk uploaded');

    return {
      provider: 'dropbox',
      provider_file_id: null,
      provider_path: response.result.path_display,
    };
  }

  async downloadChunk(chunkInfo) {
    logger.debug({ path: chunkInfo.provider_path }, 'Dropbox: downloading chunk');

    const response = await this.client.filesDownload({
      path: chunkInfo.provider_path,
    });

    return response.result.fileBinary;
  }

  async deleteChunk(chunkInfo) {
    logger.debug({ path: chunkInfo.provider_path }, 'Dropbox: deleting chunk');

    await this.client.filesDeleteV2({
      path: chunkInfo.provider_path,
    });
  }

  async getAvailableStorage() {
    const quota = await this.getStorageQuota();
    return quota.available;
  }

  async getStorageQuota() {
    const response = await this.client.usersGetSpaceUsage();
    const allocated = response.result.allocation.allocated;
    const used = response.result.used;

    return {
      total: allocated,
      used,
      available: allocated - used,
    };
  }
}

export default DropboxStorage;
