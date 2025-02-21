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
        accessToken: " ACCESS_TOKEN",
        basePath: ""
    }
];

// For each Google account in your cloudAccounts array
cloudAccounts.forEach(account => {
    if (account.type && account.type === "dropbox") {
      account.client = new Dropbox({ accessToken: account.accessToken, fetch });
    } else {
      account.auth.setCredentials({
        access_token: account.access_token,
      });
    }
  });
  

//Might convert this to a class
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

// Might convert this to a class
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
// Slicing/upload function using our CloudStorage classes
const sliceUploadFunction = async (file) => {
    const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB
    let offset = 0;
    const chunkUploads = [];
    while (offset < file.size) {
        const currentChunkSize = Math.min(CHUNK_SIZE, file.size - offset);
        const account = await getBestAccount(currentChunkSize);
        if (!account) {
            throw new Error(`No available storage for chunk at offset ${offset}`);
        }
        const storage = createCloudStorage(account); // Create storage instance, from cloudStorageFactory.js
        const chunkInfo = {
            name: `${file.originalname}-chunk-${offset}-${offset + currentChunkSize - 1}`,
            mimeType: file.mimetype,
            range: { start: offset, end: offset + currentChunkSize - 1 }
        };
        try {
            const uploadResult = await storage.uploadChunk(chunkInfo, file.path);
            chunkUploads.push({
                ...uploadResult,
                chunkSize: currentChunkSize,
                offset: offset,
                type: uploadResult.type
            });
            offset += currentChunkSize;
        } catch (error) {
            console.error(`Error uploading chunk at offset ${offset} to ${account.id}:`, error);
            throw error;
        }
    }
    return chunkUploads;
};

app.post("/upload", upload.single('file'), async (req, res) => {
    const file = req.file;
    const fileName = file.originalname;
    const fileSize = file.size;
    const CHUNK_LIMIT = 500 * 1024 * 1024; // 500MB limit for non-chunked upload for now

    try {
        //Metadata for files
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
            fileMetaData.chunks = await sliceUploadFunction(file); // Slicing upload function, might be a class named FileFunctionalities
        } else {
            console.log(`Uploading unchunked file: ${fileName}`);
            const account = await getBestAccount(fileSize);
            if (!account) throw new Error("No available storage");
            const storage = createCloudStorage(account); // Creating storage instance, from cloudStorageFactory.js
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
        //Adding metadata to firestore
        await db.collection("files").add(fileMetaData);
        fs.unlinkSync(file.path); //freeing up client side buffer

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

        // Set headers once (before any streaming)
        res.setHeader('Content-Disposition', `attachment; filename="${fileData.name}"`);
        res.setHeader('Content-Type', fileData.mimeType);
        res.setHeader('Content-Length', fileData.size);

        if (fileData.isChunked) {
            console.log(`Downloading chunked file: ${fileData.name}`);
            // Sort chunks in the proper order by offset
            const sortedChunks = fileData.chunks.sort((a, b) => a.offset - b.offset);

            for (const chunk of sortedChunks) {
                console.log(`Processing chunk at offset ${chunk.offset}, type: ${chunk.type}`);
                //shortened version of previous code, basically finding the account using driveID(same name for dropbox bc firestore fields can't be changed once named)
                const account = cloudAccounts.find(acc => acc.id === chunk.driveId); 
                if (!account) {
                    console.error(`No associated account found for chunk at offset ${chunk.offset}`);
                    if (!res.headersSent) {
                        return res.status(500).send(`Associated account not found for chunk at offset ${chunk.offset}`);
                    } else {
                        return res.destroy(new Error(`Associated account not found for chunk at offset ${chunk.offset}`));
                    }
                }

                const storage = createCloudStorage(account); // Creating storage instance, from cloudStorageFactory.js
                if (chunk.type === "google") {
                    try {
                        const stream = await storage.downloadChunk(chunk);
                        console.log(`Streaming Google Drive chunk at offset ${chunk.offset}...`);
                        await new Promise((resolve, reject) => {
                            stream
                                .on("end", () => {
                                    console.log(`Finished streaming chunk offset ${chunk.offset}`);
                                    resolve();
                                })
                                .on("error", (err) => {
                                    console.error(`Error streaming chunk offset ${chunk.offset}:`, err);
                                    if (res.headersSent) {
                                        res.destroy(err);
                                    } else {
                                        reject(err);
                                    }
                                })
                                .pipe(res, { end: false });
                        });
                    } catch (err) {
                        console.error(`Failed to fetch Google Drive chunk at offset ${chunk.offset}:`, err);
                        return res.status(500).send(`Failed to fetch chunk ${chunk.offset} from Google Drive`);
                    }
                } else if (chunk.type === "dropbox") {
                    try {
                        const fileBinary = await storage.downloadChunk(chunk);
                        console.log(`Writing Dropbox chunk at offset ${chunk.offset}...`);
                        res.write(fileBinary);
                        console.log(`Finished writing Dropbox chunk at offset ${chunk.offset}`);
                    } catch (err) {
                        console.error(`Error downloading Dropbox chunk at offset ${chunk.offset}:`, err);
                        return res.status(500).send(`Failed to fetch chunk ${chunk.offset} from Dropbox`);
                    }
                } else {
                    console.error(`Unsupported chunk type: ${chunk.type}`);
                    if (!res.headersSent) {
                        return res.status(500).send(`Unsupported chunk type: ${chunk.type}`);
                    } else {
                        return res.destroy(new Error(`Unsupported chunk type: ${chunk.type}`));
                    }
                }
            }
            console.log(`Completed downloading all chunks for file: ${fileData.name}`);
            res.end();
        } else {
            console.log(`Downloading unchunked file: ${fileData.name}`);
            const singleChunk = fileData.chunks[0];
            //shortened version of previous code, basically finding the account using driveID(same name for dropbox bc firestore fields can't be changed once named)
            const account = cloudAccounts.find(acc => acc.id === singleChunk.driveId);
            if (!account) {
                console.error("Associated account not found for unchunked file");
                if (!res.headersSent) {
                    return res.status(500).send("Associated account not found");
                } else {
                    return res.destroy(new Error("Associated account not found"));
                }
            }
            const storage = createCloudStorage(account); // Creating storage instance, from cloudStorageFactory.js
            if (singleChunk.type === "google") {
                try {
                    const stream = await storage.downloadChunk(singleChunk);
                    console.log(`Streaming unchunked Google Drive file...`);
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
                    console.log(`Writing unchunked Dropbox file...`);
                    res.write(fileBinary);
                    res.end();
                } catch (err) {
                    console.error("Error fetching file from Dropbox:", err);
                    return res.status(500).send("Failed to fetch file from Dropbox");
                }
            } else {
                console.error(`Unsupported file type: ${singleChunk.type}`);
                if (!res.headersSent) {
                    return res.status(500).send(`Unsupported file type: ${singleChunk.type}`);
                } else {
                    return res.destroy(new Error(`Unsupported file type: ${singleChunk.type}`));
                }
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

//Fetching all uploaded files, recorded via firestore.
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
