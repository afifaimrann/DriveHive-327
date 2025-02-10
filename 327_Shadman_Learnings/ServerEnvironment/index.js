//28-01-2025
/*Here the server side of the logic for app handling will be written. I am
planning on doing the slicing of the files in the frontend and backend will
just upload the sliced files. For now, these are my thoughts. Feel free to 
make or suggest changes. */


//Existing bug where upload for more than 1.5GB files is not working


const express = require("express");
const app = express();
const fs = require("fs");
const { google } = require("googleapis");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
var admin = require("firebase-admin");

var serviceAccount = require("/Users/shadman/Downloads/firebase_credentials.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const driveAccounts = [
    {
        id: "testDrive",
        auth: new google.auth.OAuth2("CLIENT_ID", "CLIENT_SECRET", "REDIRECT_URI"),
        folderId: "FOLDER_ID",
        access_token: "ACCESS_TOKEN"
    },
    {
        id: "drive1",
        auth: new google.auth.OAuth2("CLIENT_ID", "CLIENT_SECRET", "REDIRECT_URI"),
        folderId: "FOLDER_ID",
        access_token: "ACCESS_TOKEN"
    },
    {
        id: "drive2",
        auth: new google.auth.OAuth2("CLIENT_ID", "CLIENT_SECRET", "REDIRECT_URI"),
        folderId: "FOLDER_ID",
        access_token: "ACCESS_TOKEN"
    },
    {
        id: "drive3",
        auth: new google.auth.OAuth2("CLIENT_ID", "CLIENT_SECRET", "REDIRECT_URI"),
        folderId: "FOLDER_ID",
        access_token: "ACCESS_TOKEN"
    },
    {
        id: "drive4",
        auth: new google.auth.OAuth2("CLIENT_ID", "CLIENT_SECRET", "REDIRECT_URI"),
        folderId: "FOLDER_ID",
        access_token: "ACCESS_TOKEN"
    }
];

driveAccounts.forEach(drive => {
    drive.auth.setCredentials({
        access_token: drive.access_token
    });
});

const availableStorage = async (auth) => {
    const drive = google.drive({ version: "v3", auth });
    const response = await drive.about.get({ fields: "storageQuota" });
    const storageQuota = response.data.storageQuota;
    const used = parseInt(storageQuota.usageInDrive);
    const total = parseInt(storageQuota.limit);
    const available = total - used;
    return available;
};

const getDriveWithSpace = async (fileSize) => {
    for (const driveAccount of driveAccounts) {
        const available = await availableStorage(driveAccount.auth);
        if (fileSize <= available) {
            return driveAccount;
        }
    }
    return null;
};

//02-02-2025
//Looking for the drive with the maximum available storage, which could be efficient approach I think. Needs to be tested.
//Integration to possible new upload endpoint.
//Maybe we do not use this function as demo 1 requires us to tackle the edge case.
const getDriveWithMaxSpace = async (chunkSize) => {
    let candidate = null;
    let maxAvailable = 0;

    for (const driveAccount of driveAccounts) {
        const available = await availableStorage(driveAccount.auth);
        if (chunkSize <= available && available > maxAvailable) {
            maxAvailable = available;
            candidate = driveAccount;
        }
    }
    return candidate;
};
//05-02-2025
/*Facing a bug where the file is not getting sliced as it should have. And cannot
test either until download function is up and running. So keeping this as pause for now.
After cleaning up the bugs, will integrate it into the upload endpoint. through an if else
statement we could check if the file is eligible for single upload or this needs to
be called. Based on that we could make modifications.


It would also be great if someone suggests a way to store the metadata for chunks as well. We
need those to merge I think.*/


// Modified slicing function: Fixed 100MB chunks for files > 600MB
const sliceDriveFunction = async (file) => {
    const CHUNK = 100 * 1024 * 1024; // 100MB, I think 128MB is the max chunk size for http requests to work well. Read somewhere in stackoverflow.
    let offset = 0;
    let chunkIndex = 0;
    const chunkUploads = []; // Array to hold metadata for each uploaded chunk

    while (offset < file.size) {
        // Checking if the current chunk size exceeds the remaining file size
        const currentChunkSize = Math.min(CHUNK, file.size - offset);
        console.log(`Processing chunk ${chunkIndex}: offset ${offset} to ${offset + currentChunkSize - 1} (size: ${currentChunkSize} bytes)`);

        const driveAccount = await getDriveWithMaxSpace(currentChunkSize);
        if (!driveAccount) {
            throw new Error(`Not enough storage available for chunk at offset ${offset}`);
        }
        console.log(`Using drive account "${driveAccount.id}" for chunk ${chunkIndex}`);

        //Creating a read stream for the chunk to handle. 
        const sliceStream = fs.createReadStream(file.path, {
            start: offset,
            end: offset + currentChunkSize - 1
        });

        // Inclusive range, so subtraction of 1 from end.
        const sliceName = `${file.originalname}-chunk-${chunkIndex}-${offset}-${offset + currentChunkSize - 1}`;
        const drive = google.drive({ version: 'v3', auth: driveAccount.auth });
        try {
            console.log(`Uploading chunk ${chunkIndex} to drive "${driveAccount.id}"`);
            const driveResponse = await drive.files.create({
                requestBody: {
                    name: sliceName,
                    mimeType: file.mimetype,
                    parents: [driveAccount.folderId],
                },
                media: {
                    mimeType: file.mimetype,
                    body: sliceStream,
                }
            });
            console.log(`Chunk ${chunkIndex} uploaded successfully. Google Drive File ID: ${driveResponse.data.id}`);

            // Recording metadata for this chunk into an array.
            chunkUploads.push({
                driveId: driveAccount.id,
                googleDrivefileId: driveResponse.data.id,
                chunkSize: currentChunkSize,
                offset: offset,
                sliceName: sliceName
            });
        } catch (error) {
            console.error(`Error uploading chunk ${chunkIndex} to drive "${driveAccount.id}":`, error);
            throw error;
        }

        // Pointing to the next chunk.
        offset += currentChunkSize;
        chunkIndex++;
    }
    return chunkUploads; // Returning the array.
};


app.get("/test", (req, res) => {
    res.send("Hello World");
});

//31-01-2025
/*Working approach to uploading files in drive using multer via endpoints.
I need to work on the logic behind efficiently switching between multiple
drives and to also set up multiple drives. */


//03-03-2025
/*A working approach to dynamically upload into multiple drives but it currently
is happening based on most empty space available. Demo 1 requires us to
rather slice files when storage is not available. We need to HANDLE SLICING */


//06-02-2025
/*Integration of the newly made method but facing errors:
1. Out of drive storage error
2.  Socket hangup error
3. Unknown error.
 
I managed to battle 1,3 but cannot understand how to get past 2 for larger files.*/

//07-02-2025, 08-02-2025
/*Modified the upload endpoint to deal with larger file uploads, in chunks. This
addresses the socket hangup error, timeout errors or storage exhaustion errors. But
still could not get past the edge case. The last else statement should
have addressed the edge case, but it still throws any 1 of the 3 errors. specially
throwing the socket hangup error. */


app.post("/upload", upload.single('file'), async (req, res) => {
    const file = req.file;
    const fileName = file.originalname;
    const fileSize = file.size;
    const CHUNK_LIMIT = 600 * 1024 * 1024; // 600MB in bytes

    if (fileSize > CHUNK_LIMIT) {
        console.log(`Initiating chunked upload...`);
        try {
            const chunkUploads = await sliceDriveFunction(file);
            const fileMetaData = {
                name: fileName,
                size: fileSize,
                uploadedAt: new Date().toISOString(),
                isChunked: true,
                chunks: chunkUploads, // Array of metadata, stored to streamline downloads
                mimeType: file.mimetype,
            };

            await db.collection("files").add(fileMetaData);
            fs.unlinkSync(file.path);
            console.log(`Chunked upload completed for "${fileName}".`);
            return res.send({
                message: "File upload success in chunks.",
                chunks: chunkUploads
            });
        } catch (error) {
            console.error("Error during chunked upload:", error);
            return res.status(500).send("Error uploading file in chunks");
        }
    } else {
        //Simple upload logic. Basically any file < 600MB
        console.log(`Initiating simple upload`);
        const driveAccount = await getDriveWithSpace(fileSize); //tested with getDriveWithSpace
        if (driveAccount) {
            const drive = google.drive({ version: 'v3', auth: driveAccount.auth });
            try {
                const response = await drive.files.create({
                    requestBody: {
                        name: fileName,
                        mimeType: file.mimetype,
                        parents: [driveAccount.folderId],
                    },
                    media: {
                        mimeType: file.mimetype,
                        body: fs.createReadStream(file.path),
                    }
                });

                const fileMetaData = {
                    name: fileName,
                    size: fileSize,
                    uploadedAt: new Date().toISOString(),
                    isChunked: false,
                    driveId: driveAccount.id,
                    googleDrivefileId: response.data.id,
                    mimeType: file.mimetype,
                    downloadUrl: `https://drive.google.com/file/d/${response.data.id}/view`
                };

                await db.collection("files").add(fileMetaData);
                fs.unlinkSync(file.path); // Cleaning the temporary file created to read or write.
                console.log(`Simple upload completed for "${fileName}" using drive "${driveAccount.id}".`);
                return res.send(response.data);
            } catch (err) {
                console.error("Error during simple upload:", err);
                return res.status(500).send("Error uploading file");
            }
        } else {
            //Edge case handler which does not seem to work, but kept it nonetheless.
            console.log(`Edge case trigger`);
            try {
                const chunkUploads = await sliceDriveFunction(file);
                const fileMetaData = {
                    name: fileName,
                    size: fileSize,
                    uploadedAt: new Date().toISOString(),
                    isChunked: true,
                    chunks: chunkUploads,
                    mimeType: file.mimetype,
                };

                await db.collection("files").add(fileMetaData);
                fs.unlinkSync(file.path);
                console.log(`Success edge case trigger`);
                return res.send({
                    chunks: chunkUploads
                });
            } catch (error) {
                console.error(error);
                return res.status(500).send("Error edge case trigger");
            }
        }
    }
});

// Endpoint to list files (metadata retrieval)
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
    console.log(`Server is running on port 3000`);
});

//08-02-25
/*Added to Satavisa and Afifa's existing logic, to handle download of chunked files.
Mostly the logic is the same, just checkes the field inChunks, if true, handles the download
by sorting the chunks subarray according to their bytes offset. Later leverages the googleDriveFolderID 
to track the file location using files.get method, then downloads the file in that location.
It later, "pipes" the chunk into the response stream, wont complete until all chunks from chunks array
have been iterated, got using get method. Later, the promise is resolved to complete the 
http request, with all the contents of the file loaded into the stream, ready for download.*/

app.get("/download", async (req, res) => {
    const fileName = req.query.fileName;
    if (!fileName) {
        return res.status(400).send("fileName query parameter is required");
    }

    try {
        // query Firestore for file
        const snapshot = await db.collection("files")
            .where("name", "==", fileName)
            .get();

        if (snapshot.empty) {
            return res.status(404).send("File not found");
        }

        // Gget the first matching document
        const fileDoc = snapshot.docs[0];
        const fileData = fileDoc.data();

        // Setting the response headers so that the client treats the response as a file download.
        res.setHeader('Content-Disposition', `attachment; filename="${fileData.name}"`);
        res.setHeader('Content-Type', fileData.mimeType);
        res.setHeader('Content-Length', fileData.size);

        if (fileData.isChunked) {
            console.log(`Initiating download for chunked file "${fileData.name}"`);

            // Sorting chunks by offset to reassemble in the correct order.
            const sortedChunks = fileData.chunks.sort((a, b) => {
                if (a.offset < b.offset) {
                    return -1;
                } else if (a.offset > b.offset) {
                    return 1;
                } else {
                    return 0;
                }
            });

            // Iterating over each chunk sequentially.
            for (const chunk of sortedChunks) {
                let driveAccount;
                for (const account of driveAccounts) {
                    if (account.id === chunk.driveId) {
                        driveAccount = account;
                        break;
                    }
                }

                if (!driveAccount) {
                    return res.status(500).send("Associated Drive account not found for a chunk");
                }

                const drive = google.drive({ version: 'v3', auth: driveAccount.auth });
                console.log(`Downloading chunk "${chunk.sliceName}" from drive "${driveAccount.id}"`);

                // Getting the stream for the current chunk from Google Drive.
                const chunkStreamResponse = await drive.files.get({
                    fileId: chunk.googleDrivefileId,
                    alt: 'media'
                }, { responseType: 'stream' });

                // Piping the chunk stream into the response stream.
                await new Promise((resolve, reject) => {
                    chunkStreamResponse.data
                        .on('end', () => {
                            console.log(`Finished downloading chunk "${chunk.sliceName}"`);
                            resolve();
                        })
                        .on('error', (err) => {
                            console.error(`Error streaming chunk "${chunk.sliceName}":`, err);
                            reject(err);
                        })
                        .pipe(res, { end: false });
                });
            }
            // Ending the response after all chunks have been streamed.
            res.end();
        } else {
            console.log(`Initiating download for unchunked file "${fileData.name}"`);

            // find the corresponding drive account
            const driveAccount = driveAccounts.find(d => d.id === fileData.driveId);
            if (!driveAccount) {
                return res.status(500).send("Associated Drive account not found");
            }

            // initialize Google Drive client
            const drive = google.drive({ version: 'v3', auth: driveAccount.auth });
            console.log(`Downloading file from drive "${driveAccount.id}"`);

            // Stream the file from Google Drive
            const response = await drive.files.get({
                fileId: fileData.googleDrivefileId,
                alt: 'media'
            }, { responseType: 'stream' });

            response.data
                .on('error', err => {
                    console.error('Error streaming file:', err);
                    res.status(500).end();
                })
                .pipe(res);
        }
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).send("Internal server error");
    }
});

//Work beyond project update 1



//10-02-2025
/*Today worked on the delete and the update endpoints. The delete endpoint is just a carbon
copy of the upload endpoint, it's just different API calls and removal of metadata from
firestore db.


The preview endpoint has still not been reviewed for multiple drive uploads, since struggling to find a 600+ MB
worth file which is readable and not just binary or machine code mumbo jumbo*/

app.delete("/delete", async (req, res) => {
    const fileName = req.query.fileName;
    if (!fileName) {
        return res.status(400).send("fileName query parameter is required");
    }

    try {
        const snapshot = await db.collection("files")
            .where("name", "==", fileName)
            .get();

        if (snapshot.empty) {
            return res.status(404).send("File not found");
        }

        const fileDoc = snapshot.docs[0];
        const fileData = fileDoc.data();

        if (fileData.isChunked) {
            console.log(`Deleting ${fileData.chunks.length} chunks for ${fileName}`);
            
            const deletePromises = fileData.chunks.map(async (chunk) => {

                let driveAccount;
                for (const account of driveAccounts) {
                    if (account.id === chunk.driveId) {
                        driveAccount = account;
                        break;
                    }
                }

                if (!driveAccount) {
                    console.error(`Drive account ${chunk.driveId} not found for chunk ${chunk.sliceName}`);
                    return;
                }

                try {
                    const drive = google.drive({ version: 'v3', auth: driveAccount.auth });
                    await drive.files.delete({
                        fileId: chunk.googleDrivefileId
                    });
                    console.log(`Deleted chunk ${chunk.sliceName} from ${chunk.driveId}`);
                } catch (error) {
                    console.error(`Failed to delete chunk ${chunk.sliceName}:`, error.message);
                    throw error; 
                }
            });

            await Promise.all(deletePromises);
        } else {
            console.log("Initiating non chunked delete");
            let driveAccount;
            for (const account of driveAccounts) {
                if (account.id === chunk.driveId) {
                    driveAccount = account;
                    break;
                }
            }
            if (!driveAccount) {
                return res.status(500).send("Associated Drive account not found");
            }

            const drive = google.drive({ version: 'v3', auth: driveAccount.auth });
            await drive.files.delete({
                fileId: fileData.googleDrivefileId
            });
            console.log(`Deleted single file ${fileName} from ${fileData.driveId}`);
        }

        await fileDoc.ref.delete();
        console.log(`Removed ${fileName} metadata from Firestore`);

        res.send({
            message: "File deleted successfully",
            fileName: fileName,
            chunksDeleted: fileData.isChunked ? fileData.chunks.length : 0
        });

    } catch (error) {
        console.error("Delete error:", error);
        res.status(500).send({
            error: "Deletion failed",
            message: error.message,
            fileName: fileName
        });
    }
});

//-----------------------------------------UNDER TESTING---------------------------------------------------


//Function to create a readable stream into a buffer, to preview on the client side.
const streamToBuffer = (stream) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', (err) => reject(err));
    });
};

app.get("/preview", async (req, res) => {
    const fileName = req.query.fileName;
    const PREVIEW_SIZE = 1 * 1024 * 1024; // 1MB preview size

    if (!fileName) {
        return res.status(400).send("fileName query parameter is required");
    }

    try {
        // Querying Firestore for the file metadata
        const snapshot = await db.collection("files")
            .where("name", "==", fileName)
            .get();

        if (snapshot.empty) {
            return res.status(404).send("File not found");
        }

        
        const fileDoc = snapshot.docs[0];
        const fileData = fileDoc.data();

        // Letting the browser handle the preview
        res.setHeader('Content-Disposition', `inline; filename="${fileData.name}"`);
        res.setHeader('Content-Type', fileData.mimeType);

        
        if (fileData.isChunked) {
            console.log(`Generating preview for chunked file "${fileData.name}"`);

            const sortedChunks = fileData.chunks.sort((a, b) => {
                if (a.offset < b.offset) {
                    return -1;
                } else if (a.offset > b.offset) {
                    return 1;
                } else {
                    return 0;
                }
            });

            let bytesCollected = 0;
            let previewBuffers = [];

            for (const chunk of sortedChunks) {
                if (bytesCollected >= PREVIEW_SIZE) break;

                // Locating the corresponding drive account for this chunk
                let driveAccount;
                for (const account of driveAccounts) {
                    if (account.id === chunk.driveId) {
                        driveAccount = account;
                        break;
                    }
                }
                if (!driveAccount) {
                    return res.status(500).send("Associated Drive account not found for a chunk");
                }

                const drive = google.drive({ version: 'v3', auth: driveAccount.auth });
                console.log(`Downloading chunk "${chunk.sliceName}" from drive "${driveAccount.id}"`);

                // Retrieving the chunk as a stream from Google Drive
                const driveResponse = await drive.files.get({
                    fileId: chunk.googleDrivefileId,
                    alt: 'media'
                }, { responseType: 'stream' });

                // Converting the stream into a Buffer
                let chunkBuffer = await streamToBuffer(driveResponse.data);

                //Trimming the buffer if it exceeds the remaining preview size
                const bytesNeeded = PREVIEW_SIZE - bytesCollected;
                if (chunkBuffer.length > bytesNeeded) {
                    chunkBuffer = chunkBuffer.slice(0, bytesNeeded);
                }
                previewBuffers.push(chunkBuffer);
                bytesCollected += chunkBuffer.length;
            }

            // Single preview Buffer
            const previewData = Buffer.concat(previewBuffers, bytesCollected);
            res.setHeader('Content-Length', bytesCollected);
            return res.send(previewData);
        } else {
            // For non-chunked files
            console.log(`Generating preview for simple file "${fileData.name}"`);

            let driveAccount;
            for (const account of driveAccounts) {
                if (account.id === fileData.driveId) {
                    driveAccount = account;
                    break;
                }
            }

            if (!driveAccount) {
                return res.status(500).send("Associated Drive account not found");
            }
            const drive = google.drive({ version: 'v3', auth: driveAccount.auth });
            
            // Attempting to fetch the file stream
            const driveResponse = await drive.files.get({
                fileId: fileData.googleDrivefileId,
                alt: 'media'
            }, { responseType: 'stream' });

            // Converting the stream to a Buffer and slice the preview portion
            let fileBuffer = await streamToBuffer(driveResponse.data);
            let previewData = fileBuffer.slice(0, Math.min(PREVIEW_SIZE, fileBuffer.length));
            res.setHeader('Content-Length', previewData.length);
            return res.send(previewData);
        }
    } catch (error) {
        console.error('Preview error:', error);
        return res.status(500).send("Internal server error");
    }
});


//-----------------------------------------UNDER TESTING---------------------------------------------------
