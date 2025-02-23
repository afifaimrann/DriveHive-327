const fs = require("fs");
const { google } = require("googleapis");
const { Dropbox } = require("dropbox");
const fetch = require("node-fetch");
const { createCloudStorage } = require("./cloudStorageFactory");

// Base class for file handling
class FileHandler {
  constructor(file, cloudAccounts) {
    this.file = file;
    this.cloudAccounts = cloudAccounts;
  }

  // Finding an account that has enough available storage for a given chunk
  async getBestAccount(chunkSize, availableStorageFunc) {
    const validAccounts = [];
    for (const account of this.cloudAccounts) {
      try {
        const available = await availableStorageFunc(account);
        if (chunkSize <= available) {
          validAccounts.push(account);
        }
      } catch (error) {
        console.error(`Error checking storage for ${account.id}:`, error);
      }
    }
    if (validAccounts.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * validAccounts.length);
    return validAccounts[randomIndex];
  }
}

// Class to handle uploads of chunked files.
class ChunkedFileUploads extends FileHandler {
  constructor(file, cloudAccounts) {
    super(file, cloudAccounts);
    this.CHUNK_SIZE = 100 * 1024 * 1024; // 100MB
  }

  async availableStorage(account) {
    if (account.type === "google") {
      const drive = google.drive({ version: "v3", auth: account.auth });
      const response = await drive.about.get({ fields: "storageQuota" });
      const storageQuota = response.data.storageQuota;
      return parseInt(storageQuota.limit) - parseInt(storageQuota.usageInDrive);
    } else if (account.type === "dropbox") {
      const dbx = new Dropbox({ accessToken: account.accessToken, fetch });
      const response = await dbx.usersGetSpaceUsage();
      return response.result.allocation.allocated - response.result.used;
    }
    throw new Error("Unknown cloud type");
  }

  async sliceUpload() {
    let offset = 0;
    const chunkUploads = [];
    while (offset < this.file.size) {
      const currentChunkSize = Math.min(this.CHUNK_SIZE, this.file.size - offset);
      const account = await this.getBestAccount(currentChunkSize, this.availableStorage.bind(this));
      if (!account) {
        throw new Error(`No available storage for chunk at offset ${offset}`);
      }
      const storage = createCloudStorage(account);
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
        console.error(`Error uploading chunk at offset ${offset} to ${account.id}:`, error);
        throw error;
      }
    }
    return chunkUploads;
  }
}

// Base class for chunked file downloads
class ChunkedFileDownloads extends FileHandler {
  constructor(fileMetaData, cloudAccounts) {
    // fileMetaData is the object stored in Firestore (contains chunks info)
    super(fileMetaData, cloudAccounts);
    this.fileMetaData = fileMetaData;
  }

  // Determining and returning the storage instance for a chunk
  getStorageForChunk(chunk) {
    const account = this.cloudAccounts.find(acc => acc.id === chunk.driveId);
    if (!account) {
      throw new Error(`Associated account not found for chunk at offset ${chunk.offset}`);
    }
    return createCloudStorage(account);
  }

  // Method to be overridden by specialized providers
  async downloadChunk(chunk) {
    throw new Error("downloadChunk() must be implemented in a subclass");
  }
}

// Class to handle Google Drive chunk downloads
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

// Class to handle Dropbox chunk downloads
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

module.exports = {
  FileHandler,
  ChunkedFileUploads,
  ChunkedFileDownloads,
  DriveChunkedFile,
  DropboxChunkedFile
};