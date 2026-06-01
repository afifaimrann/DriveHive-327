const fs = require("fs");
const { createCloudStorage } = require("./cloudStorageFactory");

// Base class for handling files and cloud accounts, mainly the server-client side of heavy lifting
class FileHandler {
  constructor(file, cloudAccounts) {
    this.file = file;
    this.cloudAccounts = cloudAccounts;
    this.storageInstances = cloudAccounts.map(account => createCloudStorage(account));
  }

  // Returns a random account with enough storage for the chunk
  async getBestAccount(chunkSize) {
    const validStorages = [];
    for (const storage of this.storageInstances) {
      try {
        const available = await storage.getAvailableStorage(); // Finds the candidates for the file
        if (chunkSize <= available) {
          validStorages.push(storage);
        }
      } catch (error) {
        console.error(`Error checking storage for ${storage.id}:`, error);
      }
    }
    if (validStorages.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * validStorages.length);
    return validStorages[randomIndex]; // Returns a random account
  }
}

// Class for handling chunked file uploads
class ChunkedFileUploads extends FileHandler {
  constructor(file, cloudAccounts) {
    super(file, cloudAccounts); // Inherits from FileHandler
    this.CHUNK_SIZE = 100 * 1024 * 1024; // 100MB chunk sizes
  }

  // The slice logic is basically the same from update 1, we just had to integrate classes and objects.
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
          type: uploadResult.type,
          driveId: storage.id // Ensure driveId is included
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

// Base class for all file downloads, be it chunked or unchunked. Updated after demo 2
class FileDownloads extends FileHandler {
  constructor(fileMetaData, cloudAccounts) {
    super(fileMetaData, cloudAccounts);
    this.fileMetaData = fileMetaData;
  }

  // Locating the account for downloading the chunk
  getStorageForChunk(chunk) {
    const account = this.cloudAccounts.find(acc => acc.id === chunk.driveId);
    if (!account) {
      throw new Error(`Associated account not found for chunk at offset ${chunk.offset || 'unknown'}`);
    }
    return createCloudStorage(account); // Returning the instance created for the corresponding account
  }
}

// Class for handling chunked file downloads
class ChunkedFileDownloads extends FileDownloads {
  async streamChunkToResponse(chunk, res) {
    throw new Error("streamChunkToResponse() must be implemented in a subclass");
  }
}

// Google Drive specific chunked file downloads.
// Here, most of the precautions related to server side are handled,
// like keeping responses open, when to end etc.
class DriveChunkedFile extends ChunkedFileDownloads {
  async streamChunkToResponse(chunk, res) {
    const storage = this.getStorageForChunk(chunk);
    try {
      const stream = await storage.downloadChunk(chunk); // API call
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
          .pipe(res, { end: false }); // Keeping the stream open to pipe the next chunk
      });
    } catch (err) {
      console.error(`Failed to fetch Google Drive chunk at offset ${chunk.offset}:`, err);
      throw err;
    }
  }
}

// Dropbox specific chunked file downloads
class DropboxChunkedFile extends ChunkedFileDownloads {
  async streamChunkToResponse(chunk, res) {
    const storage = this.getStorageForChunk(chunk);
    try {
      const fileBinary = await storage.downloadChunk(chunk); // API call
      res.write(fileBinary);
    } catch (err) {
      console.error(`Error downloading Dropbox chunk at offset ${chunk.offset}:`, err);
      throw err;
    }
  }
}

// Base class for unchunked file downloads
class UnchunkedFileDownloads extends FileDownloads {
  async downloadFile(res) {
    throw new Error("downloadFile() must be implemented in a subclass");
  }
}

// Google Drive specific unchunked file downloads
class UnchunkedDriveDownload extends UnchunkedFileDownloads {
  async downloadFile(res) {
    const singleChunk = this.fileMetaData.chunks[0];
    const storage = this.getStorageForChunk(singleChunk);
    try {
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
    } catch (err) {
      console.error(`Error downloading unchunked file from Google Drive:`, err);
      throw err;
    }
  }
}

// Dropbox specific unchunked file downloads
class UnchunkedDropboxDownload extends UnchunkedFileDownloads {
  async downloadFile(res) {
    const singleChunk = this.fileMetaData.chunks[0];
    const storage = this.getStorageForChunk(singleChunk);
    try {
      const fileBinary = await storage.downloadChunk(singleChunk);
      res.write(fileBinary);
      res.end();
    } catch (err) {
      console.error(`Error downloading unchunked file from Dropbox:`, err);
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

// Handlers for unchunked downloads
const unchunkedDownloadHandlers = {
  google: UnchunkedDriveDownload,
  dropbox: UnchunkedDropboxDownload
  // New types can be added here, e.g., 'onedrive': UnchunkedOneDriveDownload
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
  UnchunkedDriveDownload,
  UnchunkedDropboxDownload,
  downloadHandlers,
  unchunkedDownloadHandlers
};