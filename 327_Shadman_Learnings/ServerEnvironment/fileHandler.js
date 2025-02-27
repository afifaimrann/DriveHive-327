const fs = require("fs");
const { createCloudStorage } = require("./cloudStorageFactory");

// Base class for handling files and cloud accounts
class FileHandler {
  constructor(file, cloudAccounts) {
    this.file = file;
    this.cloudAccounts = cloudAccounts;
    this.storageInstances = cloudAccounts.map(account => createCloudStorage(account));
  }

  async getBestAccount(chunkSize) {
    const validStorages = [];
    for (const storage of this.storageInstances) {
      try {
        const available = await storage.getAvailableStorage();
        if (chunkSize <= available) {
          validStorages.push(storage);
        }
      } catch (error) {
        console.error(`Error checking storage for ${storage.id}:`, error);
      }
    }
    if (validStorages.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * validStorages.length);
    return validStorages[randomIndex];
  }
}

// Class for handling chunked file uploads
class ChunkedFileUploads extends FileHandler {
  constructor(file, cloudAccounts) {
    super(file, cloudAccounts);
    this.CHUNK_SIZE = 100 * 1024 * 1024; // 100MB
  }

  async sliceUpload() {
    let offset = 0;
    const chunkUploads = [];
    while (offset < this.file.size) {
      const currentChunkSize = Math.min(this.CHUNK_SIZE, this.file.size - offset);
      const storage = await this.getBestAccount(currentChunkSize);
      if (!storage) {
        throw new Error(`No available storage for chunk at offset ${offset}`);
      }
      const chunkInfo = {
        name: `${this.file.originalname}-chunk-${offset}-${offset + currentChunkSize - 1}`,
        mimeType: this.file.mimetype,
        range: { start: offset, end: offset + currentChunkSize - 1 }
      };
      try {
        const uploadResult = await storage.uploadChunk(chunkInfo, this.file.path);
        chunkUploads.push({
          ...uploadResult,
          chunkSize: currentChunkSize,
          offset: offset,
          type: uploadResult.type
        });
        offset += currentChunkSize;
      } catch (error) {
        console.error(`Error uploading chunk at offset ${offset} to ${storage.id}:`, error);
        throw error;
      }
    }
    return chunkUploads;
  }
}

// Base class for all file downloads
class FileDownloads extends FileHandler {
  constructor(fileMetaData, cloudAccounts) {
    super(fileMetaData, cloudAccounts);
    this.fileMetaData = fileMetaData;
  }

  getStorageForChunk(chunk) {
    const account = this.cloudAccounts.find(acc => acc.id === chunk.driveId);
    if (!account) {
      throw new Error(`Associated account not found for chunk at offset ${chunk.offset || 'unknown'}`);
    }
    return createCloudStorage(account);
  }
}

// Class for handling chunked file downloads
class ChunkedFileDownloads extends FileDownloads {
  // Constructor inherited from FileDownloads, no need to redefine
  async downloadChunk(chunk) {
    throw new Error("downloadChunk() must be implemented in a subclass");
  }
}

// Google Drive-specific chunked file downloads
class DriveChunkedFile extends ChunkedFileDownloads {
  async downloadChunk(chunk, res) {
    const storage = this.getStorageForChunk(chunk);
    try {
      const stream = await storage.downloadChunk(chunk);
      await new Promise((resolve, reject) => {
        stream
          .on("end", () => {
            console.log(`Finished streaming chunk offset ${chunk.offset}`);
            resolve();
          })
          .on("error", (err) => {
            console.error(`Error streaming chunk offset ${chunk.offset}:`, err);
            reject(err);
          })
          .pipe(res, { end: false });
      });
    } catch (err) {
      console.error(`Failed to fetch Google Drive chunk at offset ${chunk.offset}:`, err);
      throw err;
    }
  }
}

// Dropbox-specific chunked file downloads
class DropboxChunkedFile extends ChunkedFileDownloads {
  async downloadChunk(chunk, res) {
    const storage = this.getStorageForChunk(chunk);
    try {
      const fileBinary = await storage.downloadChunk(chunk);
      res.write(fileBinary);
    } catch (err) {
      console.error(`Error downloading Dropbox chunk at offset ${chunk.offset}:`, err);
      throw err;
    }
  }
}

// Class for handling unchunked file downloads
class UnchunkedFileDownloads extends FileDownloads {
  // Constructor inherited from FileDownloads, no need to redefine
  async downloadFile(res) {
    const singleChunk = this.fileMetaData.chunks[0]; // Unchunked files have one chunk
    const storage = this.getStorageForChunk(singleChunk);

    try {
      if (singleChunk.type === "google") {
        const stream = await storage.downloadChunk(singleChunk);
        stream
          .on("error", err => {
            console.error("Error streaming file:", err);
            if (!res.headersSent) {
              res.status(500).end();
            } else {
              res.destroy(err);
            }
          })
          .pipe(res);
      } else if (singleChunk.type === "dropbox") {
        const fileBinary = await storage.downloadChunk(singleChunk);
        res.write(fileBinary);
        res.end();
      } else {
        throw new Error(`Unsupported file type: ${singleChunk.type}`);
      }
    } catch (err) {
      console.error(`Error downloading unchunked file:`, err);
      throw err;
    }
  }
}

// Handlers for chunked downloads
const downloadHandlers = {
  google: DriveChunkedFile,
  dropbox: DropboxChunkedFile
  // New types can be added here, e.g., 'onedrive': OneDriveChunkedFile
};

// Export all classes and handlers
module.exports = {
  FileHandler,
  ChunkedFileUploads,
  FileDownloads,
  ChunkedFileDownloads,
  DriveChunkedFile,
  DropboxChunkedFile,
  UnchunkedFileDownloads,
  downloadHandlers
};