/**
 * Abstract base class for cloud storage providers.
 * Every provider (Google Drive, Dropbox, etc.) must implement these methods.
 */
export class CloudStorage {
  constructor({ id, provider }) {
    if (new.target === CloudStorage) {
      throw new Error('CloudStorage is abstract and cannot be instantiated directly');
    }
    this.id = id;
    this.provider = provider;
  }

  /**
   * Upload a chunk of a file.
   * @param {object} chunkInfo - { name, mimeType, range: { start, end } }
   * @param {string} filePath - Local path to the source file
   * @returns {object} Provider-specific metadata (fileId, path, etc.)
   */
  async uploadChunk(chunkInfo, filePath) {
    throw new Error('uploadChunk() must be implemented by subclass');
  }

  /**
   * Download a chunk of a file.
   * @param {object} chunkInfo - Provider-specific chunk metadata
   * @returns {ReadableStream|Buffer} The chunk data
   */
  async downloadChunk(chunkInfo) {
    throw new Error('downloadChunk() must be implemented by subclass');
  }

  /**
   * Get available storage space in bytes.
   * @returns {number} Available bytes
   */
  async getAvailableStorage() {
    throw new Error('getAvailableStorage() must be implemented by subclass');
  }

  /**
   * Get total storage quota info.
   * @returns {{ total: number, used: number, available: number }}
   */
  async getStorageQuota() {
    throw new Error('getStorageQuota() must be implemented by subclass');
  }

  /**
   * Delete a file/chunk from the provider.
   * @param {object} chunkInfo - Provider-specific chunk metadata
   */
  async deleteChunk(chunkInfo) {
    throw new Error('deleteChunk() must be implemented by subclass');
  }
}

export default CloudStorage;
