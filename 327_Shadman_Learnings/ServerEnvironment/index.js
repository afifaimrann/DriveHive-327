const express = require("express");
const app = express();
const TelegramBot = require("node-telegram-bot-api");
const { google } = require("googleapis");
const { Dropbox } = require("dropbox");
const fetch = require("node-fetch");
const admin = require("firebase-admin");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const serviceAccount = require("/Users/shadman/Downloads/firebase_credentials.json");
const { createCloudStorage } = require("./cloudStorageFactory");
const fs = require("fs");
const path = require("path");

const downloadsDir = path.join(__dirname, "downloads");
fs.mkdirSync(downloadsDir, { recursive: true });

const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const {
  ChunkedFileUploads,
  UnchunkedFileDownloads,
  DriveChunkedFile,
  DropboxChunkedFile,
  downloadHandlers,
  unchunkedDownloadHandlers
} = require("./fileHandler");

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Telegram Bot Setup
const token = "TELEGRAM_BOT_ACCESS_TOKEN"; // Replace with your BotFather token
const bot = new TelegramBot(token, { polling: false }); // Webhook, not polling

// Middleware to parse JSON bodies (for webhook)
app.use(express.json());

// Webhook endpoint for Telegram updates
app.post("/telegram-webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Set webhook (run this once or on server start)
const webhookUrl = "https://fd21-103-180-245-255.ngrok-free.app/telegram-webhook"; // Replace with ngrok or deployed URL
bot.setWebHook(webhookUrl).then(() => {
  console.log(`Webhook set to ${webhookUrl}`);
}).catch(err => {
  console.error("Error setting webhook:", err);
});

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString(); // Convert to string for Firestore compatibility

  // Reference to the user's document in the 'users' collection
  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    // New user: register them
    await userRef.set({
      telegramId: userId,
      createdAt: new Date().toISOString()
    });
    bot.sendMessage(chatId, "Welcome! You’ve been registered with our service.");
  } else {
    // Existing user
    bot.sendMessage(chatId, "Welcome back!");
  }
});

// Handle /upload command
bot.onText(/\/upload/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Please send the file you want to upload.");
});

bot.on("document", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString(); // Get the user ID
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name;
  const fileSize = msg.document.file_size;

  let tempFilePath;

  try {
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const response = await fetch(fileUrl);
    const buffer = await response.buffer();
    tempFilePath = `uploads/${fileName}`;
    fs.writeFileSync(tempFilePath, buffer);

    const fileMetaData = {
      name: fileName,
      size: fileSize,
      uploadedAt: new Date().toISOString(),
      mimeType: msg.document.mime_type,
      isChunked: fileSize > 200 * 1024 * 1024,
      chunks: []
    };

    if (fileMetaData.isChunked) {
      const uploader = new ChunkedFileUploads(
        { path: tempFilePath, originalname: fileName, size: fileSize, mimetype: msg.document.mime_type },
        cloudAccounts
      );
      fileMetaData.chunks = await uploader.sliceUpload();
    } else {
      const storageInstances = cloudAccounts.map(account => createCloudStorage(account));
      let selectedStorage = null;
      for (const storage of storageInstances) {
        const available = await storage.getAvailableStorage();
        if (fileSize <= available) {
          selectedStorage = storage;
          break;
        }
      }
      if (!selectedStorage) throw new Error("No available storage");
      const uploadResult = await selectedStorage.uploadChunk(
        {
          name: fileName,
          mimeType: msg.document.mime_type,
          range: { start: 0, end: fileSize - 1 }
        },
        tempFilePath
      );
      fileMetaData.chunks.push({ ...uploadResult, type: uploadResult.type });
    }

    // Store in user's files subcollection instead of root 'files'
    const userRef = db.collection('users').doc(userId);
    await userRef.collection('files').add(fileMetaData);

    fs.unlinkSync(tempFilePath);
    bot.sendMessage(chatId, `File "${fileName}" uploaded successfully!`);
  } catch (error) {
    if (tempFilePath) fs.unlinkSync(tempFilePath);
    console.error("Upload error:", error);
    bot.sendMessage(chatId, `Error uploading file: ${error.message}`);
  }
});

bot.onText(/\/download (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const fileName = match[1];

  try {
    const userRef = db.collection('users').doc(userId);
    const filesSnapshot = await userRef.collection('files').where("name", "==", fileName).get();

    if (filesSnapshot.empty) {
      bot.sendMessage(chatId, `File "${fileName}" not found in your files.`);
      return;
    }

    const fileData = filesSnapshot.docs[0].data();
    if (fileData.size > 50 * 1024 * 1024) {
      bot.sendMessage(chatId, "File too large for Telegram (>50MB). Use the website/app for larger files.");
      return;
    }

    const tempFileName = `${Date.now()}-${fileName}`;
    const tempFilePath = path.join(downloadsDir, tempFileName);
    const writeStream = fs.createWriteStream(tempFilePath);

    writeStream.on('error', (err) => {
      console.error("Write stream error:", err);
      bot.sendMessage(chatId, "Error preparing download.");
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    });

    if (fileData.isChunked) {
      const sortedChunks = fileData.chunks.sort((a, b) => a.offset - b.offset);
      for (const chunk of sortedChunks) {
        const HandlerClass = downloadHandlers[chunk.type];
        const downloader = new HandlerClass(fileData, cloudAccounts);
        await new Promise((resolve, reject) => {
          downloader.streamChunkToResponse(chunk, writeStream);
          writeStream.on("finish", resolve).on("error", reject);
        });
      }
    } else {
      const singleChunk = fileData.chunks[0];
      const HandlerClass = unchunkedDownloadHandlers[singleChunk.type];
      const unchunkedDownloader = new HandlerClass(fileData, cloudAccounts);
      await unchunkedDownloader.downloadFile(writeStream);
    }

    writeStream.end();
    await bot.sendMessage(chatId, "Here’s your file:");
    await bot.sendDocument(chatId, tempFilePath);
    fs.unlinkSync(tempFilePath);
  } catch (error) {
    console.error("Download error:", error);
    bot.sendMessage(chatId, `Error downloading file: ${error.message}`);
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  }
});

bot.onText(/\/list/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  try {
    const userRef = db.collection('users').doc(userId);
    const filesSnapshot = await userRef.collection('files').get();
    const fileNames = filesSnapshot.docs.map(doc => doc.data().name);

    if (fileNames.length === 0) {
      bot.sendMessage(chatId, "You haven’t uploaded any files yet.");
    } else {
      bot.sendMessage(chatId, "Your files:\n" + fileNames.join("\n"));
    }
  } catch (error) {
    console.error("List error:", error);
    bot.sendMessage(chatId, "Error retrieving your file list.");
  }
});

// Your existing cloudAccounts and authenticator code remains unchanged here

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