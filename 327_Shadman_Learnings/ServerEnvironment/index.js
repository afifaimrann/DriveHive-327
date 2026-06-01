require('dotenv').config();
const express = require("express");
const app = express();
const TelegramBot = require("node-telegram-bot-api");
const { google } = require("googleapis");
const { Dropbox } = require("dropbox");
const fetch = require("node-fetch");
const admin = require("firebase-admin");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const serviceAccountPath = process.env.FIREBASE_CREDENTIALS_PATH || "/Users/shadman/Downloads/firebase_credentials.json";
const serviceAccount = require(serviceAccountPath);
const { createCloudStorage } = require("./cloudStorageFactory");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || 'thisisasecretkeyforcse327demowhichwearetryingtouse';

const crypto = require('crypto');
const pdf = require('pdf-parse');
const csv = require('csv-parser');
const mammoth = require('mammoth');
const OpenAI = require('openai');

const algorithm = 'aes-256-cbc';
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
const ivLength = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(algorithm, ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

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

// Initializing Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Telegram Bot Setup
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: false });

// OpenAI Setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function createAuthToken(chatId, type) {
  const tokenDoc = db.collection('authTokens').doc();
  const tokenId = tokenDoc.id;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await tokenDoc.set({
    chatId: chatId.toString(),
    type,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    used: false
  });

  return tokenId;
}

// Webhook endpoint
app.post("/telegram-webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

const webhookUrl = `${process.env.APP_URL}/telegram-webhook`;
bot.setWebHook(webhookUrl).then(() => {
  console.log(`Webhook set to ${webhookUrl}`);
}).catch(err => {
  console.error("Error setting webhook:", err);
});

// Telegram Commands
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id.toString();
  const usersSnapshot = await db.collection('users').where('telegramChatId', '==', chatId).get();
  
  if (!usersSnapshot.empty) {
    bot.sendMessage(chatId, "Welcome back! You can upload files or ask questions about them.");
  } else {
    const registerToken = await createAuthToken(chatId, 'register');
    const loginToken = await createAuthToken(chatId, 'login');
    const registerUrl = `${process.env.APP_URL}/register?token=${registerToken}`;
    const loginUrl = `${process.env.APP_URL}/login?token=${loginToken}`;

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
  const loginUrl = `${process.env.APP_URL}/login?token=${token}`;

  bot.sendMessage(chatId, "Please log in to link your account.", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Log in", url: loginUrl }]
      ]
    }
  });
});

bot.onText(/\/upload/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Please send the file you want to upload.");
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Commands:\n/upload - Upload a file (PDF, CSV, DOCX, <19MB)\n/download <filename> - Download a file\n/list - List your files\n/register - Register your account\n/login - Log in to an account\nAsk me anything about your uploaded files after uploading!");
});

// Text Extraction Function
async function extractText(filePath, mimeType) {
  if (mimeType === 'application/pdf') {
    const data = await pdf(filePath);
    return data.text;
  } else if (mimeType === 'text/csv') {
    const results = [];
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          const text = results.map(row => Object.values(row).join(', ')).join('\n');
          resolve(text);
        })
        .on('error', reject);
    });
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } else {
    throw new Error('Unsupported file type');
  }
}

// Text Splitting Function
function splitTextIntoChunks(text, chunkSize = 1000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

const CHROMA_TENANT   = 'default_tenant';
const CHROMA_DATABASE = 'default_database';

const BASE_URL = (tenant, database) =>
  `http://localhost:8000/api/v2/tenants/${tenant}/databases/${database}`;


async function getCollection(tenant, database, name) {
  const url = `${BASE_URL(tenant, database)}/collections/${name}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getCollection failed: ${res.statusText}`);
  return await res.json();
}


async function createCollection(tenant, database, name) {
  const url = `${BASE_URL(tenant, database)}/collections`;
  const payload = {
    name,
    embedding_function: "default", 
    dimension: 1536,               
    metric: "cosine"               
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`createCollection failed: ${res.status} - ${errorText}`);
  }
  return await res.json();
}


async function ensureCollectionExists(tenant, database, name) {
  let col = await getCollection(tenant, database, name);
  if (!col) {
    col = await createCollection(tenant, database, name);
  }
  console.log("Collection details:", JSON.stringify(col, null, 2)); // Debug log
  return col;
}


async function addToCollection(tenant, database, collectionId, item) {
  const url = `${BASE_URL(tenant, database)}/collections/${collectionId}/add`;
  const payload = {
    ids: [item.id],
    embeddings: [item.embedding],
    metadatas: [item.metadata],
    documents: [item.metadata.chunk]
  };

  console.log("Adding to Collection ID:", collectionId); 
  console.log("Payload:", JSON.stringify(payload, null, 2)); 

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`addToCollection failed: ${res.status} - ${errorText}`);
  }
}


async function queryCollection(tenant, database, collectionId, embedding, nResults = 5) {
  const url = `${BASE_URL(tenant, database)}/collections/${collectionId}/query`;
  const payload = {
    query_embeddings: [embedding],
    n_results: nResults
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`queryCollection failed: ${res.status} - ${errorText}`);
  }
  const data = await res.json();
  return data.documents[0].map((doc, i) => ({
    document: doc,
    metadata: data.metadatas[0][i]
  }));
}

// OpenAI Embedding and Response Functions
async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });
  return response.data[0].embedding;
}

async function generateResponse(query, context) {
  const prompt = `Based on the following context, answer the question: "${query}"\n\nContext:\n${context}`;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
    });
    if (response.choices && response.choices.length > 0) {
      return response.choices[0].message.content;
    } else {
      throw new Error("No response from OpenAI");
    }
  } catch (error) {
    console.error("Error generating response:", error);
    throw error;
  }
}

// File Upload Handler with Text Extraction and Vector Storage
bot.on("document", async (msg) => {
  const chatId = msg.chat.id.toString();
  const usersSnapshot = await db.collection('users').where('telegramChatId', '==', chatId).get();
  if (usersSnapshot.empty) {
    bot.sendMessage(chatId, "You are not linked to an account. Use /start to register or log in.");
    return;
  }

  const userId = usersSnapshot.docs[0].id;
  const userRef = db.collection('users').doc(userId);
  const cloudAccountsSnapshot = await userRef.collection('cloudAccounts').get();
  const userCloudAccounts = cloudAccountsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  if (userCloudAccounts.length === 0) {
    bot.sendMessage(chatId, "No cloud storage accounts added. Use /addstorage to add one.");
    return;
  }

  userCloudAccounts.forEach(account => {
    if (account.type === 'google') {
      account.auth = new google.auth.OAuth2();
      account.auth.setCredentials({ access_token: decrypt(account.accessToken) });
    } else if (account.type === 'dropbox') {
      account.client = new Dropbox({ accessToken: (account.accessToken), fetch });
    }
  });

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
        userCloudAccounts
      );
      fileMetaData.chunks = await uploader.sliceUpload();
    } else {
      const storageInstances = userCloudAccounts.map(account => createCloudStorage(account));
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
      fileMetaData.chunks.push({ ...uploadResult, type: uploadResult.type, driveId: selectedStorage.id });
    }


    // --- Text extraction and vector storage ---


    const text = await extractText(tempFilePath, fileMetaData.mimeType);
    const chunks = splitTextIntoChunks(text);
    const collectionName = `user_${userId}`;

    
    const collection = await ensureCollectionExists(CHROMA_TENANT, CHROMA_DATABASE, collectionName);
    const collectionId = collection.id; // Extract UUIDv4 ID

    console.log(`Using Collection ID: ${collectionId}`); // Debug log

    // Adding chunks to the collection using collectionId
    for (const [index, chunk] of chunks.entries()) {
      const embedding = await getEmbedding(chunk);
      console.log(`Chunk ${index}:`, chunk); 
      console.log(`Embedding ${index}:`, embedding); 

      await addToCollection(
        CHROMA_TENANT,
        CHROMA_DATABASE,
        collectionId, 
        {
          id: `${fileMetaData.name}_${index}`,
          embedding,
          metadata: { file: fileMetaData.name, chunk }
        }
      );
    }

    // Storing the collectionId in the user's Firestore document
    await userRef.update({ chromaCollectionId: collectionId });

    // Saving file metadata
    await userRef.collection('files').add(fileMetaData);
    fs.unlinkSync(tempFilePath);
    bot.sendMessage(chatId, `File "${fileName}" uploaded successfully! You can now ask questions about it.`);
  } catch (error) {
    if (tempFilePath) fs.unlinkSync(tempFilePath);
    console.error("Upload error:", error);
    bot.sendMessage(chatId, `Error uploading file: ${error.message}`);
  }
});


// Query Handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text;

  if (!text || text.startsWith('/')) return; // Ignoring commands and non-text messages

  const usersSnapshot = await db.collection('users').where('telegramChatId', '==', chatId).get();
  if (usersSnapshot.empty) {
    bot.sendMessage(chatId, "You are not linked to an account. Use /start to register or log in.");
    return;
  }

  const userDoc = usersSnapshot.docs[0];
  const userData = userDoc.data();
  const collectionId = userData.chromaCollectionId; // Retrieving stored ID

  if (!collectionId) {
    bot.sendMessage(chatId, "No collection found. Please upload a file first.");
    return;
  }

  try {
    const queryEmbedding = await getEmbedding(text);
    const similarDocs = await queryCollection(
      CHROMA_TENANT,
      CHROMA_DATABASE,
      collectionId, // Using the stored ID
      queryEmbedding
    );

    if (!similarDocs.length) {
      bot.sendMessage(chatId, "I couldn't find any relevant information in your files.");
      return;
    }

    const context = similarDocs.slice(0, 3).map(doc => doc.document).join('\n');
    const response = await generateResponse(text, context);
    bot.sendMessage(chatId, response);
  } catch (error) {
    console.error("Query error:", error);
    bot.sendMessage(chatId, "Sorry, I couldn’t process your request.");
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

  const cloudAccountsSnapshot = await userRef.collection('cloudAccounts').get();
  const userCloudAccounts = cloudAccountsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  if (userCloudAccounts.length === 0) {
    bot.sendMessage(chatId, "No cloud storage accounts added. Use /addstorage to add one.");
    return;
  }

  userCloudAccounts.forEach(account => {
    if (account.type === 'google') {
      account.auth = new google.auth.OAuth2();
      account.auth.setCredentials({ access_token: account.accessToken });
    } else if (account.type === 'dropbox') {
      account.client = new Dropbox({ accessToken: account.accessToken, fetch });
    }
  });

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
        const downloader = new HandlerClass(fileData, userCloudAccounts);
        await new Promise((resolve, reject) => {
          downloader.streamChunkToResponse(chunk, writeStream);
          writeStream.on("finish", resolve).on("error", reject);
        });
      }
    } else {
      const singleChunk = fileData.chunks[0];
      const HandlerClass = unchunkedDownloadHandlers[singleChunk.type];
      const unchunkedDownloader = new HandlerClass(fileData, userCloudAccounts);
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

bot.onText(/\/addstorage (\w+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  const provider = match[1].toLowerCase();

  if (provider !== 'google' && provider !== 'dropbox') {
    bot.sendMessage(chatId, "Unsupported provider. Use 'google' or 'dropbox'.");
    return;
  }

  const usersSnapshot = await db.collection('users').where('telegramChatId', '==', chatId).get();
  if (usersSnapshot.empty) {
    bot.sendMessage(chatId, "You need to register first. Use /start.");
    return;
  }

  const userId = usersSnapshot.docs[0].id;
  const stateToken = require('crypto').randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.collection('oauthStates').add({
    state: stateToken,
    chatId: chatId,
    provider: provider,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString()
  });

  let authUrl;
  if (provider === 'google') {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.APP_URL}/oauth/callback/google`
    );
    authUrl = auth.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive'],
      state: stateToken
    });
  } else if (provider === 'dropbox') {
    const dbx = new Dropbox({ clientId: process.env.DROPBOX_CLIENT_ID, fetch });
    authUrl = await dbx.auth.getAuthenticationUrl(
      `${process.env.APP_URL}/oauth/callback/dropbox`,
      stateToken,
      'code'
    );
  }

  bot.sendMessage(chatId, `Please authorize access to your ${provider} account:`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: `Authorize ${provider.charAt(0).toUpperCase() + provider.slice(1)}`, url: authUrl }]
      ]
    }
  });
});

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

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
  const code = Math.random().toString(36).substring(2, 8);

  await db.collection('users').doc(userId).update({ linkCode: code });
  res.send({ message: `Send this code to the bot to link your account: ${code}` });
});

const cloudAccounts = [];

class Authenticator {
  authenticate(account) {
    throw new Error("authenticate() must be implemented by subclass");
  }
}

class GoogleDriveAuthenticator extends Authenticator {
  authenticate(account) {
    account.auth.setCredentials({
      access_token: account.access_token,
    });
  }
}

class DropboxAuthenticator extends Authenticator {
  authenticate(account) {
    account.client = new Dropbox({ accessToken: account.accessToken, fetch });
  }
}

const authenticatorMapping = {
  google: GoogleDriveAuthenticator,
  dropbox: DropboxAuthenticator,
};

cloudAccounts.forEach(account => {
  const AuthenticatorClass = authenticatorMapping[account.type];
  if (!AuthenticatorClass) {
    throw new Error(`Unsupported cloud account type: ${account.type}`);
  }
  const authenticator = new AuthenticatorClass();
  authenticator.authenticate(account);
});

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

app.get("/files", authenticateToken, async (req, res) => {
  const userId = req.userId;
  const userRef = db.collection('users').doc(userId);
  const snapshot = await userRef.collection('files').get();
  const fileNames = snapshot.docs.map(doc => doc.data().name);
  res.status(200).json({ files: fileNames });
});

app.get('/oauth/callback/google', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;

  if (!code || !state) {
    return res.status(400).send("Missing code or state");
  }

  const stateSnapshot = await db.collection('oauthStates').where('state', '==', state).get();
  if (stateSnapshot.empty) {
    return res.status(400).send("Invalid state token");
  }

  const stateDoc = stateSnapshot.docs[0];
  const stateData = stateDoc.data();

  if (new Date() > new Date(stateData.expiresAt)) {
    await stateDoc.ref.delete();
    return res.status(400).send("State token expired");
  }

  const chatId = stateData.chatId;
  const provider = stateData.provider;

  if (provider !== 'google') {
    return res.status(400).send("Invalid provider for this state");
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/oauth/callback/google`
  );

  try {
    const { tokens } = await auth.getToken(code);
    auth.setCredentials(tokens);

    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;

    const usersSnapshot = await db.collection('users').where('telegramChatId', '==', chatId).get();
    if (usersSnapshot.empty) {
      return res.status(404).send("User not found");
    }
    const userId = usersSnapshot.docs[0].id;
    const userRef = db.collection('users').doc(userId);

    const drive = google.drive({ version: "v3", auth: auth });
    const folderResponse = await drive.files.create({
      requestBody: {
        name: "MyAppFiles",
        mimeType: "application/vnd.google-apps.folder"
      }
    });
    const folderId = folderResponse.data.id;

    await userRef.collection('cloudAccounts').add({
      type: 'google',
      accessToken: encrypt(accessToken),
      refreshToken: refreshToken ? encrypt(refreshToken) : null,
      folderId: folderId,
      createdAt: new Date().toISOString()
    });

    await stateDoc.ref.delete();
    bot.sendMessage(chatId, "Your Google Drive account has been successfully added!");
    res.send("Authorization successful! You can close this window.");
  } catch (error) {
    console.error("Error exchanging code for token:", error);
    res.status(500).send("Error during authorization");
  }
});

app.get('/oauth/callback/dropbox', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;

  if (!code || !state) {
    return res.status(400).send("Missing code or state");
  }

  const stateSnapshot = await db.collection('oauthStates').where('state', '==', state).get();
  if (stateSnapshot.empty) {
    return res.status(400).send("Invalid state token");
  }

  const stateDoc = stateSnapshot.docs[0];
  const stateData = stateDoc.data();

  if (new Date() > new Date(stateData.expiresAt)) {
    await stateDoc.ref.delete();
    return res.status(400).send("State token expired");
  }

  const chatId = stateData.chatId;
  const provider = stateData.provider;

  if (provider !== 'dropbox') {
    return res.status(400).send("Invalid provider for this state");
  }

  const dbxAuth = new Dropbox({ clientId: process.env.DROPBOX_CLIENT_ID, clientSecret: process.env.DROPBOX_CLIENT_SECRET, fetch });
  try {
    const tokenResponse = await dbxAuth.auth.getAccessTokenFromCode(
      `${process.env.APP_URL}/oauth/callback/dropbox`,
      code
    );
    const accessToken = tokenResponse.result.access_token;
    const dbx = new Dropbox({ accessToken: accessToken, fetch });

    await dbx.filesCreateFolderV2({ path: "/MyAppFiles" });

    const usersSnapshot = await db.collection('users').where('telegramChatId', '==', chatId).get();
    if (usersSnapshot.empty) {
      return res.status(404).send("User not found");
    }
    const userId = usersSnapshot.docs[0].id;
    const userRef = db.collection('users').doc(userId);

    await userRef.collection('cloudAccounts').add({
      type: 'dropbox',
      accessToken: (accessToken),
      basePath: "/MyAppFiles",
      createdAt: new Date().toISOString()
    });

    await stateDoc.ref.delete();
    bot.sendMessage(chatId, "Your Dropbox account has been successfully added!");
    res.send("Authorization successful! You can close this window.");
  } catch (error) {
    console.error("Error during Dropbox authorization:", error);
    res.status(500).send("Error during authorization");
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});