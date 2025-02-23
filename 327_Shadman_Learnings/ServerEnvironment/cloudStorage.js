const fs = require("fs");
const { google } = require("googleapis");
const { Dropbox } = require("dropbox");
const fetch = require("node-fetch");

/*Here extension for any type of bucket is possible. In this file, mainly all are just API calls, method overriding, class extension. */
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
    // Creating a stream for the desired byte range
    const sliceStream = fs.createReadStream(filePath, {
      start: chunkInfo.range.start,
      end: chunkInfo.range.end
    });
    const response = await drive.files.create({
      requestBody: {
        name: chunkInfo.name,
        mimeType: chunkInfo.mimeType,
        parents: [this.folderId],
      },
      media: {
        mimeType: chunkInfo.mimeType,
        body: sliceStream,
      }
    });
    console.log(`[GoogleDriveStorage] Uploaded chunk ${chunkInfo.name} (fileId: ${response.data.id})`);
    return {
      type: "google",
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
    }, { responseType: "stream" });
    return response.data; // returns a stream
  }
}


class DropboxStorage extends CloudStorage {
  constructor({ id, accessToken, basePath }) {
    super();
    this.id = id;
    this.accessToken = accessToken;
    this.basePath = basePath || "";
    this.client = new Dropbox({ accessToken: this.accessToken, fetch });
  }

  async uploadChunk(chunkInfo, filePath) {
    console.log(`[DropboxStorage] Uploading chunk ${chunkInfo.name}...`);
    const fileBuffer = fs.readFileSync(filePath);
    
    const sliced = Uint8Array.prototype.slice.call(
      fileBuffer,
      chunkInfo.range.start,
      chunkInfo.range.end + 1
    );
    const fileContent = Buffer.from(sliced);
    // Building the full path – if basePath is empty, this results in '/chunkName'
    const path = `${this.basePath}/${chunkInfo.name}`;
    const response = await this.client.filesUpload({
      path: path,
      contents: fileContent,
      mode: { ".tag": "overwrite" }
    });
    console.log(`[DropboxStorage] Uploaded chunk ${chunkInfo.name} (path: ${response.result.path_display})`);
    return {
      type: "dropbox",
      path: response.result.path_display,
      driveId: this.id
    };
  }

  async downloadChunk(chunkInfo) {
    console.log(`[DropboxStorage] Downloading chunk from path ${chunkInfo.path}...`);
    const response = await this.client.filesDownload({ path: chunkInfo.path });
    // Dropbox returns a Buffer in result.fileBinary
    return response.result.fileBinary;
  }
}

module.exports = { CloudStorage, GoogleDriveStorage, DropboxStorage };
