//This file is basically responsible for creating new buckets if needed,
//having their API calls made from here. These get called in fileHandler,
//which does server side handling of files.

const fs = require("fs");
const { google } = require("googleapis");
const { Dropbox } = require("dropbox");
const fetch = require("node-fetch");

class CloudStorage {
  /**
   * Upload a chunk of a file.
   * @param {Object} chunkInfo - { name, mimeType, range: {start, end} }
   * @param {string} filePath - The path of the source file.
   * @returns {Object} - Provider-specific metadata 
   */
  async uploadChunk(chunkInfo, filePath) {
    throw new Error("uploadChunk() must be implemented by subclass");
  }
  
  /**
   * Download a chunk of a file.
   * @param {Object} chunkInfo - Metadata for the chunk.
   * @returns {ReadableStream|Buffer} - A stream (Google Drive) or Buffer (Dropbox).
   */
  async downloadChunk(chunkInfo) {
    throw new Error("downloadChunk() must be implemented by subclass");
  }

  /**
   * Get the available storage for this cloud storage provider.
   * @returns {Promise<number>} - The available storage in bytes.
   */
  async getAvailableStorage() {
    throw new Error("getAvailableStorage() must be implemented by subclass");
  }

  //More functionalities could be added based on demo 3, 4 requirements
}

class GoogleDriveStorage extends CloudStorage {
  constructor({ id, auth, folderId }) {
    super();
    this.id = id;
    this.auth = auth;
    this.folderId = folderId;
  }

  async uploadChunk(chunkInfo, filePath) {
    console.log(`[GoogleDriveStorage] Uploading chunk ${chunkInfo.name}...`);
    const drive = google.drive({ version: "v3", auth: this.auth });
    const sliceStream = fs.createReadStream(filePath, {
      start: chunkInfo.range.start,
      end: chunkInfo.range.end
    }); //Based on info passed on, creating a stream to upload the chunk
    const response = await drive.files.create({
      requestBody: {
        name: chunkInfo.name,
        mimeType: chunkInfo.mimeType, //File type
        parents: [this.folderId], //Location to upload
      }, //API call made 
      media: {
        mimeType: chunkInfo.mimeType,
        body: sliceStream, //Content to upload
      }
    });
    console.log(`[GoogleDriveStorage] Uploaded chunk ${chunkInfo.name} (fileId: ${response.data.id})`);
    return {
      type: "google", //Essential metadata to store for downloading/ other stuff if needed
      fileId: response.data.id,
      driveId: this.id
    };
  }

  async downloadChunk(chunkInfo) {
    console.log(`[GoogleDriveStorage] Downloading chunk with fileId ${chunkInfo.fileId}...`);
    const drive = google.drive({ version: "v3", auth: this.auth });
    const response = await drive.files.get({
      fileId: chunkInfo.fileId,
      alt: "media"
    }, { responseType: "stream" }); //API call
    return response.data;
  }
  //Getting available storage for the account
  async getAvailableStorage() {
    const drive = google.drive({ version: "v3", auth: this.auth });
    const response = await drive.about.get({ fields: "storageQuota" });
    const storageQuota = response.data.storageQuota;
    return parseInt(storageQuota.limit) - parseInt(storageQuota.usageInDrive);
  }
}

class DropboxStorage extends CloudStorage {
  constructor({ id, accessToken, basePath }) {
    super();
    this.id = id;
    this.accessToken = accessToken;
    this.basePath = basePath || "";
    this.client = new Dropbox({ accessToken: this.accessToken, fetch }); //Authenticating the account
  }

  async uploadChunk(chunkInfo, filePath) {
    console.log(`[DropboxStorage] Uploading chunk ${chunkInfo.name}...`);
    const fileBuffer = fs.readFileSync(filePath);
    const sliced = Uint8Array.prototype.slice.call(
      fileBuffer,
      chunkInfo.range.start,
      chunkInfo.range.end + 1
    ); //Using the range from info passed to slice the file, dealing with buffer in binary
    const fileContent = Buffer.from(sliced);
    const path = `${this.basePath}/${chunkInfo.name}`;
    const response = await this.client.filesUpload({
      path: path,
      contents: fileContent,
      mode: { ".tag": "overwrite" }
    }); //API call
    console.log(`[DropboxStorage] Uploaded chunk ${chunkInfo.name} (path: ${response.result.path_display})`);
    return {
      type: "dropbox",
      path: response.result.path_display,
      driveId: this.id
    };
  }

  async downloadChunk(chunkInfo) {
    console.log(`[DropboxStorage] Downloading chunk from path ${chunkInfo.path}...`);
    const response = await this.client.filesDownload({ path: chunkInfo.path }); //API Call
    return response.result.fileBinary;
  }
  //Getting available storage for the account
  async getAvailableStorage() {
    const response = await this.client.usersGetSpaceUsage();
    return response.result.allocation.allocated - response.result.used;
  }
}

module.exports = { CloudStorage, GoogleDriveStorage, DropboxStorage };