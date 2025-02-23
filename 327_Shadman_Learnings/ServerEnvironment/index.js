//Complete revamp of code, from 17/02/25-22/02/25
//Added Dropbox functionalities, dropped OneDrive for revoke of API access

const express = require("express");
const app = express();
const { google } = require("googleapis");
const { Dropbox } = require("dropbox");
const fetch = require("node-fetch");
const admin = require("firebase-admin");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const serviceAccount = require("/Users/shadman/Downloads/firebase_credentials.json");
const { createCloudStorage } = require("./cloudStorageFactory"); //new Function to instantiate cloud buckets
const fs = require("fs");
//New classes for handling chunked file uploads and downloads
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



/*First an object for uploading in chunks is created, with existing cloud storages and the file
as parameters. Then the slice function gets called to slice and dice the function, which in return
gives us an array with data for each of the chunks, where they are stored, how big they are etc. 

For an unchunked file however, we have the exact same approach but this time, the entire file gets treated as
a singular chunk. The upload logic is exactly the same, we introduce the bucket storage instantiator class and 
its upload method(to upload as a single entire chunked file.)*/



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
      fileMetaData.chunks = await uploader.sliceUpload(); // calling the method of the class to upload the chunk, returns an array consisting of metadata for each of the chunks sliced and uploaded 
    } else {
      console.log(`Uploading unchunked file: ${fileName}`);

      /*An existing bug for uploading unchunked files where blank chunks
      were getting uploaded, which we struggled to resolve hence included the 
      getBestAccount method in this file as well. Not essentially the best practice
      but it gets the job done. */

      const account = await getBestAccount(fileSize); //Gets the account which can fit the file < 200MB
      if (!account) throw new Error("No available storage");
      const storage = createCloudStorage(account); //Instantiates the cloud storage bucket
      const uploadResult = await storage.uploadChunk({
        name: fileName,
        mimeType: file.mimetype,
        range: { start: 0, end: file.size - 1 }
      }, file.path);
      fileMetaData.chunks.push({
        ...uploadResult,
        type: uploadResult.type
      }); //Same logic as before, just we are treating the entire file as a single chunk now.
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

/*The purpose of these functions in this file is to help unchunked file uploads,
for which we do not have a class yet. */

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
      const available = await availableStorage(account); //Used to check the available storage in the account
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
  return validAccounts[randomIndex]; //Returns the account which can fit the file, in a random manner
};

/*

 */

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
    const fileData = fileDoc.data(); // Extracted file data to directly pass to download class
    console.log(`File found: ${fileData.name}, Size: ${fileData.size} bytes, Chunks: ${fileData.chunks.length}`);

    // Setting headers once (before downloading chunks)
    res.setHeader("Content-Disposition", `attachment; filename="${fileData.name}"`);
    res.setHeader("Content-Type", fileData.mimeType);
    res.setHeader("Content-Length", fileData.size);

    if (fileData.isChunked) {
      console.log(`Downloading chunked file: ${fileData.name}`);
      // Sorting chunks in proper order by offset
      const sortedChunks = fileData.chunks.sort((a, b) => a.offset - b.offset);

      for (const chunk of sortedChunks) {
        console.log(`Processing chunk at offset ${chunk.offset}, type: ${chunk.type}`);
        // Finding the cloud account based on driveId 
        const account = cloudAccounts.find(acc => acc.id === chunk.driveId); //This code was shortened from previous version but does the same task.
        if (!account) {
          //console.log('DebugStatementDownload');
          console.error(`No associated account found for chunk at offset ${chunk.offset}`);
          return res.status(500).send(`Associated account not found for chunk at offset ${chunk.offset}`);
        }

        // Using appropriate download handler based on chunk type
        /*Took this approach to download our files because we exactly do not know which
        chunks are where, since we now have multiple platforms to download from. Though
        a checker class would have been much cleaner, but we use our bucket classes to download
        the chunks nonetheless. */

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
      const singleChunk = fileData.chunks[0]; // Our single file is a singular chunk, so accessing it by first index of array.
      const account = cloudAccounts.find(acc => acc.id === singleChunk.driveId);
      if (!account) {
        console.error("Associated account not found for unchunked file");
        return res.status(500).send("Associated account not found");
      }

      const storage = createCloudStorage(account); //Instantiating the cloud storage bucket
      //Type checker to download the file from the respective cloud storage, debug statements included.
      if (singleChunk.type === "google") {
        try {
          const stream = await storage.downloadChunk(singleChunk);
          console.log("Streaming unchunked Google Drive file"); //Debug
          stream
            .on("error", err => {
              console.error("Error streaming file:", err);
              if (!res.headersSent) {
                res.status(500).end();
              } else {
                res.destroy(err);
              }
            })
            .pipe(res); //Piping the stream to the res object to pass to the client
        } catch (err) {
          console.error("Error fetching file from Google Drive:", err);
          return res.status(500).send("Failed to fetch file from Google Drive");
        }
      } else if (singleChunk.type === "dropbox") {
        try {
          const fileBinary = await storage.downloadChunk(singleChunk);
          console.log("Writing unchunked Dropbox file"); //Debug
          res.write(fileBinary); // Writing the file in binary to the res object
          res.end();
        } catch (err) {
          console.error("Error fetching file from Dropbox:", err);
          return res.status(500).send("Failed to fetch file from Dropbox");
        }
      } else {
        console.error(`Unsupported file type: ${singleChunk.type}`); //Previous update uplodaded chunked files did not have a type in their fields, hence after adding this we figured.
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

//This remained the same as before, no changes, fetches the file names with data from Firestore.
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
