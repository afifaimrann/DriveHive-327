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
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'SECRETBRO';


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
const token = "HIDDEN"; // Replace with your BotFather token
const bot = new TelegramBot(token, { polling: false }); // Webhook, not polling

// Middleware to parse JSON bodies (for webhook)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function createAuthToken(chatId, type) {
  const tokenDoc = db.collection('authTokens').doc();
  const tokenId = tokenDoc.id;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

  await tokenDoc.set({
    chatId: chatId.toString(),
    type, // 'register' or 'login'
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    used: false
  });

  return tokenId;
}

// Webhook endpoint for Telegram updates
app.post("/telegram-webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Set webhook (run this once or on server start)
const webhookUrl = "https://aea2-103-180-245-255.ngrok-free.app/telegram-webhook"; // Replace with ngrok or deployed URL
bot.setWebHook(webhookUrl).then(() => {
  console.log(`Webhook set to ${webhookUrl}`);
}).catch(err => {
  console.error("Error setting webhook:", err);
});

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id.toString();

  const usersSnapshot = await db.collection('users').where('telegramChatId', '==', chatId).get();
  
  if (!usersSnapshot.empty) {
    bot.sendMessage(chatId, "Welcome back!");
  } else {
    const registerToken = await createAuthToken(chatId, 'register');
    const loginToken = await createAuthToken(chatId, 'login');
    const registerUrl = `https://aea2-103-180-245-255.ngrok-free.app/register?token=${registerToken}`;
    const loginUrl = `https://aea2-103-180-245-255.ngrok-free.app/login?token=${loginToken}`;

    bot.sendMessage(chatId, "Welcome! To use this bot, please register or log in.", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Register", url: registerUrl }],
          [{ text: "Log in", url: loginUrl }]
        ]
      }
    });
  }
});


bot.onText(/\/login/, async (msg) => {
  const chatId = msg.chat.id.toString();
  const token = await createAuthToken(chatId, 'login');
  const loginUrl = `https://aea2-103-180-245-255.ngrok-free.app/login?token=${token}`;

  bot.sendMessage(chatId, "Please log in to link your account.", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Log in", url: loginUrl }]
      ]
    }
  });
});

// Handle /upload command
bot.onText(/\/upload/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Please send the file you want to upload.");
});

bot.on("document", async (msg) => {
  const chatId = msg.chat.id.toString();

  const usersSnapshot = await db.collection('users').where('telegramChatId', '==', chatId).get();
  if (usersSnapshot.empty) {
    bot.sendMessage(chatId, "You are not linked to an account. Use /start to register or log in.");
    return;
  }

  const userId = usersSnapshot.docs[0].id;
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name || `file_${fileId}`;
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
  const chatId = msg.chat.id.toString();
  const fileName = match[1];

  const usersSnapshot = await db.collection('users').where('telegramChatId', '==', chatId).get();
  if (usersSnapshot.empty) {
    bot.sendMessage(chatId, "You are not linked to an account. Use /start to register or log in.");
    return;
  }

  const userId = usersSnapshot.docs[0].id;
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

  try {
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
  const chatId = msg.chat.id.toString();

  const usersSnapshot = await db.collection('users').where('telegramChatId', '==', chatId).get();
  if (usersSnapshot.empty) {
    bot.sendMessage(chatId, "You are not linked to an account. Use /start to register or log in.");
    return;
  }

  const userId = usersSnapshot.docs[0].id;
  const userRef = db.collection('users').doc(userId);
  const filesSnapshot = await userRef.collection('files').get();
  const fileNames = filesSnapshot.docs.map(doc => doc.data().name);

  if (fileNames.length === 0) {
    bot.sendMessage(chatId, "You haven’t uploaded any files yet.");
  } else {
    bot.sendMessage(chatId, "Your files:\n" + fileNames.join("\n"));
  }
});

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Expecting "Bearer <token>"

  if (!token) return res.status(401).send("Authentication required");

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).send("Invalid or expired token");
    req.userId = user.userId;
    next();
  });
}

app.get('/register', (req, res) => {
  const token = req.query.token;
  res.send(`
    <form method="post" action="/register">
      ${token ? `<input type="hidden" name="token" value="${token}">` : ''}
      <input type="text" name="username" placeholder="Username" required>
      <input type="password" name="password" placeholder="Password" required>
      <button type="submit">Register</button>
    </form>
  `);
});

app.post('/register', async (req, res) => {
  const { username, password, token } = req.body;

  const usersSnapshot = await db.collection('users').where('username', '==', username).get();
  if (!usersSnapshot.empty) {
    return res.status(400).send("Username already taken");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const userDoc = db.collection('users').doc();
  const userData = {
    username,
    password: hashedPassword,
    createdAt: new Date().toISOString()
  };

  if (token) {
    const tokenDoc = await db.collection('authTokens').doc(token).get();
    if (tokenDoc.exists && tokenDoc.data().type === 'register' && !tokenDoc.data().used) {
      userData.telegramChatId = tokenDoc.data().chatId;
      await tokenDoc.ref.update({ used: true });
      bot.sendMessage(tokenDoc.data().chatId, "Registration successful! You are now linked.");
    }
  }

  await userDoc.set(userData);
  const jwtToken = jwt.sign({ userId: userDoc.id }, JWT_SECRET, { expiresIn: '1h' });
  res.send({ message: "Registered successfully", token: jwtToken });
});

app.get('/login', (req, res) => {
  const token = req.query.token;
  res.send(`
    <form method="post" action="/login">
      ${token ? `<input type="hidden" name="token" value="${token}">` : ''}
      <input type="text" name="username" placeholder="Username" required>
      <input type="password" name="password" placeholder="Password" required>
      <button type="submit">Log in</button>
    </form>
  `);
});

app.post('/login', async (req, res) => {
  const { username, password, token } = req.body;

  const usersSnapshot = await db.collection('users').where('username', '==', username).get();
  if (usersSnapshot.empty) {
    return res.status(400).send("Invalid username or password");
  }

  const userDoc = usersSnapshot.docs[0];
  const userData = userDoc.data();

  const passwordMatch = await bcrypt.compare(password, userData.password);
  if (!passwordMatch) {
    return res.status(400).send("Invalid username or password");
  }

  if (token) {
    const tokenDoc = await db.collection('authTokens').doc(token).get();
    if (tokenDoc.exists && tokenDoc.data().type === 'login' && !tokenDoc.data().used) {
      await userDoc.ref.update({ telegramChatId: tokenDoc.data().chatId });
      await tokenDoc.ref.update({ used: true });
      bot.sendMessage(tokenDoc.data().chatId, "Login successful! Your Telegram account is now linked.");
    }
  }

  const jwtToken = jwt.sign({ userId: userDoc.id }, JWT_SECRET, { expiresIn: '1h' });
  res.send({ message: "Logged in successfully", token: jwtToken });
});


app.post('/generate-link-code', authenticateToken, async (req, res) => {
  const userId = req.userId;
  const code = Math.random().toString(36).substring(2, 8); // 6-character code

  await db.collection('users').doc(userId).update({ linkCode: code });
  res.send({ message: `Send this code to the bot to link your account: ${code}` });
});


bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text;

  if (!text) return; // Ignore non-text messages
  if (text.startsWith('/')) return; // Ignore commands

  const usersSnapshot = await db.collection('users').where('linkCode', '==', text).get();
  if (!usersSnapshot.empty) {
    const userDoc = usersSnapshot.docs[0];
    await userDoc.ref.update({
      telegramChatId: chatId,
      linkCode: null
    });
    bot.sendMessage(chatId, "Your Telegram account has been linked successfully!");
  } else {
    bot.sendMessage(chatId, "Invalid code. Please try again.");
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

app.post("/upload", authenticateToken, upload.single("file"), async (req, res) => {
  const userId = req.userId;
  const file = req.file;
  const fileName = file.originalname;
  const fileSize = file.size;
  const CHUNK_LIMIT = 200 * 1024 * 1024;

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
      const uploader = new ChunkedFileUploads(file, cloudAccounts);
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
      const uploadResult = await selectedStorage.uploadChunk({
        name: fileName,
        mimeType: file.mimetype,
        range: { start: 0, end: fileSize - 1 }
      }, file.path);
      fileMetaData.chunks.push({ ...uploadResult, type: uploadResult.type });
    }

    const userRef = db.collection('users').doc(userId);
    await userRef.collection('files').add(fileMetaData);
    fs.unlinkSync(file.path);

    res.send({ message: "File uploaded successfully", metadata: fileMetaData });
  } catch (error) {
    fs.unlinkSync(file.path);
    console.error("Upload error:", error);
    res.status(500).send(error.message);
  }
});

app.get("/download", authenticateToken, async (req, res) => {
  const userId = req.userId;
  const fileName = req.query.fileName;

  if (!fileName) return res.status(400).send("fileName query parameter is required");

  const userRef = db.collection('users').doc(userId);
  const snapshot = await userRef.collection('files').where("name", "==", fileName).get();

  if (snapshot.empty) return res.status(404).send("File not found");

  const fileData = snapshot.docs[0].data();
  res.setHeader("Content-Disposition", `attachment; filename="${fileData.name}"`);
  res.setHeader("Content-Type", fileData.mimeType);
  res.setHeader("Content-Length", fileData.size);

  if (fileData.isChunked) {
    const sortedChunks = fileData.chunks.sort((a, b) => a.offset - b.offset);
    for (const chunk of sortedChunks) {
      const HandlerClass = downloadHandlers[chunk.type];
      const downloader = new HandlerClass(fileData, cloudAccounts);
      await downloader.streamChunkToResponse(chunk, res);
    }
    res.end();
  } else {
    const singleChunk = fileData.chunks[0];
    const HandlerClass = unchunkedDownloadHandlers[singleChunk.type];
    const unchunkedDownloader = new HandlerClass(fileData, cloudAccounts);
    await unchunkedDownloader.downloadFile(res);
  }
});

// This endpoint basically does the retrieval of the file names from our firestore database.
app.get("/files", authenticateToken, async (req, res) => {
  const userId = req.userId;
  const userRef = db.collection('users').doc(userId);
  const snapshot = await userRef.collection('files').get();
  const fileNames = snapshot.docs.map(doc => doc.data().name);
  res.status(200).json({ files: fileNames });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});