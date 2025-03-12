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
//this is a test comment to check if the changes are being reflected in the git repo
//this is a test comment from my other device to check if the sync is working
const {
  ChunkedFileUploads,
  UnchunkedFileDownloads,
  DriveChunkedFile,
  DropboxChunkedFile,
  downloadHandlers,
  unchunkedDownloadHandlers
} = require("./fileHandler");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Bucket options
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

//Defining Authenticator base class, which could be used to add more platforms if needed
class Authenticator {
  authenticate(account) {
    throw new Error("authenticate() must be implemented by subclass");
  }
}

//Google Drive bucket Authenticator
class GoogleDriveAuthenticator extends Authenticator {
  authenticate(account) {
    account.auth.setCredentials({
      access_token: account.access_token,
    });
  }
}

//Dropbox bucket Authenticator
class DropboxAuthenticator extends Authenticator {
  authenticate(account) {
    account.client = new Dropbox({ accessToken: account.accessToken, fetch });
  }
}

//Mapping of storage types to authenticators, extention available for future platforms
const authenticatorMapping = {
  google: GoogleDriveAuthenticator,
  dropbox: DropboxAuthenticator,
  //onedrive: OneDriveAuthenticator or so on
};

//Authenticating each cloud account
cloudAccounts.forEach(account => {
  const AuthenticatorClass = authenticatorMapping[account.type];
  if (!AuthenticatorClass) {
    throw new Error(`Unsupported cloud account type: ${account.type}`);
  }
  const authenticator = new AuthenticatorClass();
  authenticator.authenticate(account);
});

//Point to be noted

/*Only chunked operations are done at first on the server side, where they are getting sliced, 
or creating a steam to  pipe into the response object, before triggering the API call directly. Only once
server side file handling is completed, chunked files are dealt with their respective 
bucket APIs.


Unchunked files are calling APIs directly through the classes here.
*/

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
      const uploader = new ChunkedFileUploads(file, cloudAccounts); // Server side file handling
      fileMetaData.chunks = await uploader.sliceUpload(); // Files getting sliced, handled and then uploaded via API calls
    } else {
      console.log(`Uploading unchunked file: ${fileName}`);
      const storageInstances = cloudAccounts.map(account => createCloudStorage(account)); // Creating cloud storage instances to select one which can fit the file
      let selectedStorage = null;
      for (const storage of storageInstances) {
        try {
          const available = await storage.getAvailableStorage(); // Fetching available storage
          if (fileSize <= available) {
            selectedStorage = storage; // Account selected
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
      }, file.path); // File details to work with, this is the direct API call.
      fileMetaData.chunks.push({
        ...uploadResult,
        type: uploadResult.type
      }); // Pushing relevant metadata of the chunks to store for later in firestore
    }

    await db.collection("files").add(fileMetaData); // Adding file metadata to firestore
    fs.unlinkSync(file.path); // Deleting the file from the server

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
  const fileName = req.query.fileName; // Prompt the user to enter a file name
  console.log(`Received download request for file: ${fileName}`);

  if (!fileName) {
    console.log("Error: fileName query parameter is missing");
    return res.status(400).send("fileName query parameter is required");
  }

  try {
    console.log("Querying Firestore for file metadata...");
    // Check if the file exists in firestore database
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

    // Setting necessary headers for the file to be downloaded
    res.setHeader("Content-Disposition", `attachment; filename="${fileData.name}"`);
    res.setHeader("Content-Type", fileData.mimeType);
    res.setHeader("Content-Length", fileData.size);

    if (fileData.isChunked) {
      console.log(`Downloading chunked file: ${fileData.name}`);
      const sortedChunks = fileData.chunks.sort((a, b) => a.offset - b.offset);

      // Sorting the chunks by their offset to determine which chunk comes first
      // Downloading the chunks one by one
      for (const chunk of sortedChunks) {
        console.log(`Processing chunk at offset ${chunk.offset}, type: ${chunk.type}`);
        const HandlerClass = downloadHandlers[chunk.type]; // A mapper to check what type of chunk is it
        if (!HandlerClass) {
          console.error(`Unsupported chunk type: ${chunk.type}`);
          return res.status(500).send(`Unsupported chunk type: ${chunk.type}`);
        }
        const downloader = new HandlerClass(fileData, cloudAccounts); // Calling the checked type of the bucket
        await downloader.streamChunkToResponse(chunk, res); // Downloading the chunk via server handling of files
      }
      console.log(`Completed downloading all chunks for file: ${fileData.name}`);
      res.end();
    } else {
      console.log(`Downloading unchunked file: ${fileData.name}`);
      const singleChunk = fileData.chunks[0];
      const HandlerClass = unchunkedDownloadHandlers[singleChunk.type]; //Use the unchunked handler mapping
      if (!HandlerClass) {
        console.error(`Unsupported file type: ${singleChunk.type}`);
        return res.status(500).send(`Unsupported file type: ${singleChunk.type}`);
      }
      const unchunkedDownloader = new HandlerClass(fileData, cloudAccounts);
      await unchunkedDownloader.downloadFile(res); // Direct API call
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

// This endpoint basically does the retrieval of the file names from our firestore database.
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