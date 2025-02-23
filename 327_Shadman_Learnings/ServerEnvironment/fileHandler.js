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

  // Finding an account that has enough available storage for a given chunk, also exists in index.js
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

  /*The slicedUpload logic has not changed at all, except now uses the methods from its 
  parent class and its own methods as well. */

  async sliceUpload() {
    let offset = 0; // Pointer 
    const chunkUploads = []; // Array to store metadata
    /*As long as our pointer is within range of the file size */
    while (offset < this.file.size) {
      const currentChunkSize = Math.min(this.CHUNK_SIZE, this.file.size - offset); // Since our chunks are 100MB, if suppose we have something 580MB, we need to have our last chunk as 80MB, instead of hardcoding 100MB, to avoid errors.
      const account = await this.getBestAccount(currentChunkSize, this.availableStorage.bind(this));
      if (!account) {
        throw new Error(`No available storage for chunk at offset ${offset}`);
      }
      const storage = createCloudStorage(account); // Creating a bucket storage instance
      const chunkInfo = {
        name: `${this.file.originalname}-chunk-${offset}-${offset + currentChunkSize - 1}`,
        mimeType: this.file.mimetype,
        range: { start: offset, end: offset + currentChunkSize - 1 }
      };
      try {
        const uploadResult = await storage.uploadChunk(chunkInfo, this.file.path); // Uploading the chunk and pusing its metadata
        chunkUploads.push({
          ...uploadResult,
          chunkSize: currentChunkSize,
          offset: offset,
          type: uploadResult.type
        });
        offset += currentChunkSize; // Updating the pointer
      } catch (error) {
        console.error(`Error uploading chunk at offset ${offset} to ${account.id}:`, error);
        throw error;
      }
    }
    return chunkUploads; // Returning the metadata
  }
}

// Base class for chunked file downloads
class ChunkedFileDownloads extends FileHandler {
  constructor(fileMetaData, cloudAccounts) {
    // fileMetaData is the object containing metadata of the file
    super(fileMetaData, cloudAccounts);
    this.fileMetaData = fileMetaData;
  }

  // Determining and returning the storage instance for a chunk
  getStorageForChunk(chunk) {
    const account = this.cloudAccounts.find(acc => acc.id === chunk.driveId); // Locating the chunk from our array of cloud storages
    if (!account) {
      throw new Error(`Associated account not found for chunk at offset ${chunk.offset}`);
    }
    return createCloudStorage(account); // Returning the storage instance, created.
  }

  // Method to be overridden based on need, to extend further.
  async downloadChunk(chunk) {
    throw new Error("downloadChunk() must be implemented in a subclass");
  }
}

// Class to handle Google Drive chunk downloads
class DriveChunkedFile extends ChunkedFileDownloads {
  // The purpose of this method is mainly to handle the streaming of the chunk to the client side, for Google Drive. 
  // We had a disasterclass naming the methods.
  async downloadChunk(chunk, res) {
    const storage = this.getStorageForChunk(chunk);
    try {
      const stream = await storage.downloadChunk(chunk); // This is the download chunk method from cloudStorage.js, which sends a steam of the chunk
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
  // The purpose of this method is mainly to handle the streaming of the chunk to the client side, but for Dropbox.
  async downloadChunk(chunk, res) {
    const storage = this.getStorageForChunk(chunk);
    try {
      const fileBinary = await storage.downloadChunk(chunk); // This is the download chunk method from cloudStorage.js, which sends a steam of the chunk
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
