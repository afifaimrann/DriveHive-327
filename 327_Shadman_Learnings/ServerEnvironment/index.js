const express = require("express");
const app = express();
const { google } = require("googleapis");
const { Dropbox } = require("dropbox");
const fetch = require("node-fetch");
const admin = require("firebase-admin");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const serviceAccount = require("/Users/shadman/Downloads/firebase_credentials.json");
const { createCloudStorage } = require("./cloudStorageFactory");
const fs = require("fs");
const {
  ChunkedFileUploads,
  UnchunkedFileDownloads,
  DriveChunkedFile,
  DropboxChunkedFile,
  downloadHandlers
} = require("./fileHandler");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const cloudAccounts = [
  {
    id: "testDrive",
    auth: new google.auth.OAuth2("CLIENT_ID", "CLIENT_SECRET", "REDIRECT_URI"),
    folderId: "FOLDER_ID",
    access_token: "ACCESS_TOKEN",
    type: "google"
  },
  {
    id: "drive1",
    auth: new google.auth.OAuth2("CLIENT_ID", "CLIENT_SECRET", "REDIRECT_URI"),
    folderId: "FOLDER_ID",
    access_token: "ACCESS_TOKEN",
    type: "google"
  },
  {
    id: "drive2",
    auth: new google.auth.OAuth2("CLIENT_ID", "CLIENT_SECRET", "REDIRECT_URI"),
    folderId: "FOLDER_ID",
    access_token: "ACCESS_TOKEN",
    type: "google"
  },
  {
    id: "drive3",
    auth: new google.auth.OAuth2("CLIENT_ID", "CLIENT_SECRET", "REDIRECT_URI"),
    folderId: "FOLDER_ID",
    access_token: "ACCESS_TOKEN",
    type: "google"
  },
  {
    id: "drive4",
    auth: new google.auth.OAuth2("CLIENT_ID", "CLIENT_SECRET", "REDIRECT_URI"),
    folderId: "FOLDER_ID",
    access_token: "ACCESS_TOKEN",
    type: "google"
  },
  {
    type: "dropbox",
    id: "dropbox1",
    accessToken: "ACCESS_TOKEN",
    basePath: ""
  },
  {
    type: "dropbox",
    id: "dropbox2",
    accessToken: "ACCESS_TOKEN",
    basePath: ""
  },
  {
    type: "dropbox",
    id: "dropbox3",
    accessToken: "ACCESS_TOKEN",
    basePath: ""
  },
];

cloudAccounts.forEach(account => {
  if (account.type === "dropbox") {
    account.client = new Dropbox({ accessToken: account.accessToken, fetch });
  } else {
    account.auth.setCredentials({
      access_token: account.access_token,
    });
  }
});

app.post("/upload", upload.single("file"), async (req, res) => {
  const file = req.file;
  const fileName = file.originalname;
  const fileSize = file.size;
  const CHUNK_LIMIT = 200 * 1024 * 1024; // 200MB threshold for non-chunked upload

  try {
    const fileMetaData = {
      name: fileName,
      size: fileSize,
      uploadedAt: new Date().toISOString(),
      mimeType: file.mimetype,
      isChunked: fileSize > CHUNK_LIMIT,
      chunks: []
    };

    if (fileSize > CHUNK_LIMIT) {
      console.log(`File size ${fileSize} > ${CHUNK_LIMIT}, uploading in chunks...`);
      const uploader = new ChunkedFileUploads(file, cloudAccounts);
      fileMetaData.chunks = await uploader.sliceUpload();
    } else {
      console.log(`Uploading unchunked file: ${fileName}`);
      const storageInstances = cloudAccounts.map(account => createCloudStorage(account));
      let selectedStorage = null;
      for (const storage of storageInstances) {
        try {
          const available = await storage.getAvailableStorage();
          if (fileSize <= available) {
            selectedStorage = storage;
            break;
          }
        } catch (error) {
          console.error(`Error checking storage for ${storage.id}:`, error);
        }
      }
      if (!selectedStorage) {
        throw new Error("No available storage for the file");
      }
      const uploadResult = await selectedStorage.uploadChunk({
        name: fileName,
        mimeType: file.mimetype,
        range: { start: 0, end: file.size - 1 }
      }, file.path);
      fileMetaData.chunks.push({
        ...uploadResult,
        type: uploadResult.type
      });
    }

    await db.collection("files").add(fileMetaData);
    fs.unlinkSync(file.path);

    res.send({
      message: "File uploaded successfully",
      metadata: fileMetaData
    });
  } catch (error) {
    fs.unlinkSync(file.path);
    console.error("Upload error:", error);
    res.status(500).send(error.message);
  }
});

app.get("/download", async (req, res) => {
  const fileName = req.query.fileName;
  console.log(`Received download request for file: ${fileName}`);

  if (!fileName) {
    console.log("Error: fileName query parameter is missing");
    return res.status(400).send("fileName query parameter is required");
  }

  try {
    console.log("Querying Firestore for file metadata...");
    const snapshot = await db.collection("files")
      .where("name", "==", fileName)
      .get();

    if (snapshot.empty) {
      console.log(`File "${fileName}" not found in Firestore.`);
      return res.status(404).send("File not found");
    }

    const fileDoc = snapshot.docs[0];
    const fileData = fileDoc.data();
    console.log(`File found: ${fileData.name}, Size: ${fileData.size} bytes, Chunks: ${fileData.chunks.length}`);

    res.setHeader("Content-Disposition", `attachment; filename="${fileData.name}"`);
    res.setHeader("Content-Type", fileData.mimeType);
    res.setHeader("Content-Length", fileData.size);

    if (fileData.isChunked) {
      console.log(`Downloading chunked file: ${fileData.name}`);
      const sortedChunks = fileData.chunks.sort((a, b) => a.offset - b.offset);

      for (const chunk of sortedChunks) {
        console.log(`Processing chunk at offset ${chunk.offset}, type: ${chunk.type}`);
        const HandlerClass = downloadHandlers[chunk.type];
        if (!HandlerClass) {
          console.error(`Unsupported chunk type: ${chunk.type}`);
          return res.status(500).send(`Unsupported chunk type: ${chunk.type}`);
        }
        const downloader = new HandlerClass(fileData, cloudAccounts);
        await downloader.downloadChunk(chunk, res);
      }
      console.log(`Completed downloading all chunks for file: ${fileData.name}`);
      res.end();
    } else {
      console.log(`Downloading unchunked file: ${fileData.name}`);
      const unchunkedDownloader = new UnchunkedFileDownloads(fileData, cloudAccounts);
      await unchunkedDownloader.downloadFile(res);
    }
  } catch (error) {
    console.error("Unexpected download error:", error);
    if (!res.headersSent) {
      res.status(500).send("Internal server error");
    } else {
      res.destroy(error);
    }
  }
});

app.get("/files", async (req, res) => {
  try {
    const snapshot = await db.collection("files").get();
    const fileNames = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data && data.name) {
        fileNames.push(data.name);
      }
    });
    res.status(200).json({ files: fileNames });
  } catch (error) {
    console.error("Error retrieving files:", error);
    res.status(500).send("Error retrieving files");
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});