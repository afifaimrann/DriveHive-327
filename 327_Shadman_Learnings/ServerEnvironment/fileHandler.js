const fs = require("fs");
const { createCloudStorage } = require("./cloudStorageFactory");

//Base class for handling files and cloud accounts, mainly the server-client side of heavy lifting
class FileHandler {
  constructor(file, cloudAccounts) {
    this.file = file;
    this.cloudAccounts = cloudAccounts;
    this.storageInstances = cloudAccounts.map(account => createCloudStorage(account));
  }
  //Returns a random account with enough storage for the chunk
  async getBestAccount(chunkSize) {
    const validStorages = [];
    for (const storage of this.storageInstances) {
      try {
        const available = await storage.getAvailableStorage(); //Finds the candidates for the file
        if (chunkSize <= available) {
          validStorages.push(storage);
        }
      } catch (error) {
        console.error(`Error checking storage for ${storage.id}:`, error);
      }
    }
    if (validStorages.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * validStorages.length);
    return validStorages[randomIndex]; //Returns a random account
  }
}

// Class for handling chunked file uploads
class ChunkedFileUploads extends FileHandler {
  constructor(file, cloudAccounts) {
    super(file, cloudAccounts); //Inherits from FileHandler
    this.CHUNK_SIZE = 100 * 1024 * 1024; // 100MB chunk sizes
  }

  //The slice logic is basically the same from update 1, we just had to integrate classes and objects.
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
      }; //Setting the information to download the specific chunk, sent over to API 
      try {
        const uploadResult = await storage.uploadChunk(chunkInfo, this.file.path); //Calling the upload API for the respective type of account
        chunkUploads.push({
          ...uploadResult,
          chunkSize: currentChunkSize,
          offset: offset,
          type: uploadResult.type
        }); //Pushing the metadata of the chunk to store for later in firestore
        offset += currentChunkSize; //Updating the pointer to the next chunk
      } catch (error) {
        console.error(`Error uploading chunk at offset ${offset} to ${storage.id}:`, error);
        throw error;
      }
    }
    return chunkUploads;
  }
}

//Base class for all file downloads, be it chunked or unchunked. Updated after demo 2
class FileDownloads extends FileHandler {
  constructor(fileMetaData, cloudAccounts) {
    super(fileMetaData, cloudAccounts);
    this.fileMetaData = fileMetaData;
  }
  //Locating the account for downloading the chunk
  getStorageForChunk(chunk) {
    const account = this.cloudAccounts.find(acc => acc.id === chunk.driveId);
    if (!account) {
      throw new Error(`Associated account not found for chunk at offset ${chunk.offset || 'unknown'}`);
    }
    return createCloudStorage(account); //Returning the instance created for the corresponding account
  }
}

//Class for handling chunked file downloads
class ChunkedFileDownloads extends FileDownloads {
  //Constructor inherited from FileDownloads, no need to redefine
  async downloadChunk(chunk) {
    throw new Error("downloadChunk() must be implemented in a subclass");
  }
}

//Google Drive specific chunked file downloads. 
//Here, most of the precautions related to server side are handeled, 
// like keeping responses open, when to end etc.
class DriveChunkedFile extends ChunkedFileDownloads {
  async downloadChunk(chunk, res) {
    const storage = this.getStorageForChunk(chunk);
    try {
      const stream = await storage.downloadChunk(chunk); //API call
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
          .pipe(res, { end: false }); //Keeping the stream open to pipe the next chunk
      });
    } catch (err) {
      console.error(`Failed to fetch Google Drive chunk at offset ${chunk.offset}:`, err);
      throw err;
    }
  }
}

//Dropbox specific chunked file downloads
class DropboxChunkedFile extends ChunkedFileDownloads {
  async downloadChunk(chunk, res) {
    const storage = this.getStorageForChunk(chunk);
    try {
      const fileBinary = await storage.downloadChunk(chunk); //API call 
      res.write(fileBinary);
    } catch (err) {
      console.error(`Error downloading Dropbox chunk at offset ${chunk.offset}:`, err);
      throw err;
    }
  }
}

//Class for handling unchunked file downloads
class UnchunkedFileDownloads extends FileDownloads {
  //Constructor inherited from FileDownloads, no need to redefine
  async downloadFile(res) {
    const singleChunk = this.fileMetaData.chunks[0]; //Unchunked files have one chunk, so we just fetch that
    const storage = this.getStorageForChunk(singleChunk); //Fetching the account for the chunk
    //Triggering the respective API call based on the account type, since we are handling files in a different manner, we might need to 
    //introduce more classes for that.
    try {
      if (singleChunk.type === "google") {
        const stream = await storage.downloadChunk(singleChunk); //API call
        stream
          .on("error", err => {
            console.error("Error streaming file:", err);
            if (!res.headersSent) {
              res.status(500).end();
            } else {
              res.destroy(err);
            }
          })
          .pipe(res); //Piping the stream to the response
      } else if (singleChunk.type === "dropbox") {
        const fileBinary = await storage.downloadChunk(singleChunk); //API call
        res.write(fileBinary); //Writing the binary to the response
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

//Handlers for chunked downloads
const downloadHandlers = {
  google: DriveChunkedFile,
  dropbox: DropboxChunkedFile
  //New types can be added here, e.g., 'onedrive': OneDriveChunkedFile
};

//Export all classes and handlers
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