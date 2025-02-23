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
  DriveChunkedFile,
  DropboxChunkedFile
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
    // Metadata for files
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
      // Using the new ChunkedFileUploads class
      const uploader = new ChunkedFileUploads(file, cloudAccounts);
      fileMetaData.chunks = await uploader.sliceUpload();
    } else {
      console.log(`Uploading unchunked file: ${fileName}`);
      const account = await getBestAccount(fileSize);
      if (!account) throw new Error("No available storage");
      const storage = createCloudStorage(account);
      const uploadResult = await storage.uploadChunk({
        name: fileName,
        mimeType: file.mimetype,
        range: { start: 0, end: file.size - 1 }
      }, file.path);
      fileMetaData.chunks.push({
        ...uploadResult,
        type: uploadResult.type
      });
    }

    // Adding metadata to Firestore
    await db.collection("files").add(fileMetaData);
    fs.unlinkSync(file.path); // Free client-side buffer

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

const availableStorage = async (account) => {
  if (account.type === "google") {
    const drive = google.drive({ version: "v3", auth: account.auth });
    const response = await drive.about.get({ fields: "storageQuota" });
    const storageQuota = response.data.storageQuota;
    return parseInt(storageQuota.limit) - parseInt(storageQuota.usageInDrive);
  }
  if (account.type === "dropbox") {
    const dbx = new Dropbox({ accessToken: account.accessToken, fetch });
    const response = await dbx.usersGetSpaceUsage();
    return response.result.allocation.allocated - response.result.used;
  }
  throw new Error("Unknown cloud type");
};

const getBestAccount = async (chunkSize) => {
  const validAccounts = [];
  for (const account of cloudAccounts) {
    try {
      const available = await availableStorage(account);
      if (chunkSize <= available) {
        validAccounts.push(account);
      }
    } catch (error) {
      console.error(`Error checking storage for ${account.id}:`, error);
    }
  }
  if (validAccounts.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * validAccounts.length);
  return validAccounts[randomIndex];
};

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

    // Setting headers once (before streaming)
    res.setHeader("Content-Disposition", `attachment; filename="${fileData.name}"`);
    res.setHeader("Content-Type", fileData.mimeType);
    res.setHeader("Content-Length", fileData.size);

    if (fileData.isChunked) {
      console.log(`Downloading chunked file: ${fileData.name}`);
      // Sorting chunks in proper order by offset
      const sortedChunks = fileData.chunks.sort((a, b) => a.offset - b.offset);

      for (const chunk of sortedChunks) {
        console.log(`Processing chunk at offset ${chunk.offset}, type: ${chunk.type}`);
        // Finding the cloud account based on driveId (or similar identifier)
        const account = cloudAccounts.find(acc => acc.id === chunk.driveId);
        if (!account) {
          console.error(`No associated account found for chunk at offset ${chunk.offset}`);
          return res.status(500).send(`Associated account not found for chunk at offset ${chunk.offset}`);
        }

        // Using appropriate download handler based on chunk type
        if (chunk.type === "google") {
          const driveDownloader = new DriveChunkedFile(fileData, cloudAccounts);
          await driveDownloader.downloadChunk(chunk, res);
        } else if (chunk.type === "dropbox") {
          const dropboxDownloader = new DropboxChunkedFile(fileData, cloudAccounts);
          await dropboxDownloader.downloadChunk(chunk, res);
        } else {
          console.error(`Unsupported chunk type: ${chunk.type}`);
          return res.status(500).send(`Unsupported chunk type: ${chunk.type}`);
        }
      }
      console.log(`Completed downloading all chunks for file: ${fileData.name}`);
      res.end();
    } else {
      console.log(`Downloading unchunked file: ${fileData.name}`);
      const singleChunk = fileData.chunks[0];
      const account = cloudAccounts.find(acc => acc.id === singleChunk.driveId);
      if (!account) {
        console.error("Associated account not found for unchunked file");
        return res.status(500).send("Associated account not found");
      }
      const storage = createCloudStorage(account);
      if (singleChunk.type === "google") {
        try {
          const stream = await storage.downloadChunk(singleChunk);
          console.log("Streaming unchunked Google Drive file...");
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
          console.error("Error fetching file from Google Drive:", err);
          return res.status(500).send("Failed to fetch file from Google Drive");
        }
      } else if (singleChunk.type === "dropbox") {
        try {
          const fileBinary = await storage.downloadChunk(singleChunk);
          console.log("Writing unchunked Dropbox file...");
          res.write(fileBinary);
          res.end();
        } catch (err) {
          console.error("Error fetching file from Dropbox:", err);
          return res.status(500).send("Failed to fetch file from Dropbox");
        }
      } else {
        console.error(`Unsupported file type: ${singleChunk.type}`);
        return res.status(500).send(`Unsupported file type: ${singleChunk.type}`);
      }
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