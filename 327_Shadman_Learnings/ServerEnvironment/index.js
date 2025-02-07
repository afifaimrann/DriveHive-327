//28-01-2025
/*Here the server side of the logic for app handling will be written. I am
planning on doing the slicing of the files in the frontend and backend will
just upload the sliced files. For now, these are my thoughts. Feel free to 
make or suggest changes. */

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

// const auth = new google.auth.OAuth2(
//     "",
//     "",
//     ""
// );

// auth.setCredentials({ access_token: "" });
// const folderId = "";
// const driveId = "suppose1";

//testing multiple storages

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
const getDriveWithMaxSpace = async (fileSize) => {
    let candidate = null;
    let maxAvailable = 0;

    for (const driveAccount of driveAccounts) {
        const available = await availableStorage(driveAccount.auth);
        if (fileSize <= available && available > maxAvailable) {
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
//----------------------------Undertesting Territory--------------------------------
const sliceDriveFunction = async (file) => {
    let temp = 0;
    let remaining = file.size;
    const chunkUploads = []; // Array to hold metadata for each uploaded chunk

    
    for (const driveAccount of driveAccounts) {
        if (remaining <= 0) break; // File has been fully uploaded

        const available = await availableStorage(driveAccount.auth);
        if (available <= 0) {
            continue; // Skip to next drive if no free space
        }

        
        const sliceSize = Math.min(available, remaining);

        // Create a read stream for this slice. The "end" is inclusive, so subtract 1.
        const sliceStream = fs.createReadStream(file.path, {
            start: temp,
            end: temp + sliceSize - 1
        });

        
        const sliceName = `${file.originalname}-chunk-${temp}-${temp + sliceSize - 1}`;

        
        const drive = google.drive({ version: 'v3', auth: driveAccount.auth });
        try {
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

            // Push metadata for this chunk into the array.
            chunkUploads.push({
                driveId: driveAccount.id,
                googleDrivefileId: driveResponse.data.id,
                chunkSize: sliceSize,
                temp: temp,
                sliceName: sliceName
            });
        } catch (error) {
            console.error(`Error uploading chunk to ${driveAccount.id}:`, error);
            throw error;
        }

        // Update the temp and remaining bytes for the next slice.
        temp += sliceSize;
        remaining -= sliceSize;
    }

    if (remaining > 0) {
        throw new Error("Not enough storage");
    }


    return chunkUploads;
};





//----------------------------Undertesting Territory--------------------------------




app.get("/test", (req, res) => {
    res.send("Hello World");
})

// app.get("/available_storage", async(req,res)=>{
//     const drive = google.drive({version: "v3", auth});
//     const response = await drive.about.get({fields: "storageQuota"});
//     const storageQuota = response.data.storageQuota;
//     const used = parseInt(storageQuota.usageInDrive);
//     const total = parseInt(storageQuota.limit);
//     const available = total - used;
//     res.send({used, total, available});
// })
//----------------------------------------------
// const availableStorage = async () => {
//     const drive = google.drive({ version: "v3", auth });
//     const response = await drive.about.get({ fields: "storageQuota" });
//     const storageQuota = response.data.storageQuota;
//     const used = parseInt(storageQuota.usageInDrive);
//     const total = parseInt(storageQuota.limit);
//     const available = total - used;
//     return available;
// }

//31-01-2025
/*Working approach to uploading files in drive using multer via endpoints.
I need to work on the logic behind efficiently switching between multiple
drives and to also set up multiple drives. */


//03-03-2025
/*A working approach to dynamically upload into multiple drives but it currently
is happening based on most empty space available. Demo 1 requires us to
rather slice files when storage is not available. We need to HANDLE SLICING */
app.post("/upload", upload.single('file'), async (req, res) => {
    const file = req.file;
    const fileName = file.originalname;
    const fileSize = file.size;

    // Try a simple upload if a single drive has enough space.
    const driveAccount = await getDriveWithSpace(fileSize);
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
                isChunked: false, // Not chunked
                driveId: driveAccount.id,
                googleDrivefileId: response.data.id,
                mimeType: file.mimetype,
                downloadUrl: `https://drive.google.com/file/d/${response.data.id}/view`
            };

            await db.collection("files").add(fileMetaData);
            fs.unlinkSync(file.path); // Clean up local file after upload
            return res.send(response.data);
        } catch (err) {
            console.log(err);
            return res.status(500).send("Error uploading file");
        }
    } else {
        //06-02-2025
        /*Integration of the newly made method but facing errors:
        1. Out of drive storage error
        2.  Socket hangup error
        3. Unknown error.
        
        I managed to battle 1,3 but cannot understand how to get past 2 for larger files.*/



        //07-02-2025
        /*No breakthroughs today. Trying my absolute best but its always
        one bug or the other. No pushable or working code today unfortunately. */
        try {
            const chunkUploads = await sliceDriveFunction(file);
            const fileMetaData = {
                name: fileName,
                size: fileSize,
                uploadedAt: new Date().toISOString(),
                isChunked: true, // File was chunked across drives
                // Store the chunk metadata array if needed:
                chunks: chunkUploads,
                mimeType: file.mimetype,
            };

            await db.collection("files").add(fileMetaData);
            fs.unlinkSync(file.path);
            return res.send({
                message: "File uploaded in chunks across multiple drives.",
                chunks: chunkUploads
            });
        } catch (error) {
            console.error("Error uploading file in chunks:", error);
            return res.status(500).send("Error uploading file in chunks");
        }
    }
});





//Tested working approach to view the file names from firestore.
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
})

//----------------------------UNTESTED CODE--------------------------------------------

//03-02-2025
//Took the code from Satavisa's files. Will work around these to hopefully integrate the downloading of files.
const fetchFilesFromDrive = async (driveClient) => {
    try {
        const response = await driveClient.files.list({
            pageSize: 100, // fetches up to 100 files
            fields: 'files(id, name, mimeType, size, modifiedTime, parents)',
        });
        return response.data.files;
    } catch (error) {
        console.error('Error fetching files:', error);
        return [];
    }
};


// **Function to merge files 
const mergeStorage = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await user.findById(userId);

        if (!user || !user.driveAccounts || user.driveAccounts.length === 0) {
            return res.status(400).json({ message: 'No linked Google Drive accounts.' });
        }

        let allFiles = [];

        for (const account of user.driveAccounts) {
            const driveClient = driveClient(account.accessToken);
            const files = await fetchFilesFromDrive(driveClient);

            allFiles = [...allFiles, ...files.map(file => ({
                ...file,
                driveAccount: account.email,
            }))];
        }

        res.json({ files: allFiles });
    } catch (error) {
        console.error('Error merging storage:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

//----------------------------UNTESTED CODE--------------------------------------------



//----------------------------Further works---------------------------//
const getDriveWithSpace2 = async (fileSize) => {
    for (const driveAccount of driveAccounts) {
        const available = await availableStorage(driveAccount.auth);
        if (fileSize <= available) {
            return driveAccount;
        }
    }
    return null;
};

//-----------------------------Further works---------------------------//



app.get("/download", async (req, res) => {
    const fileNames = [];
    //reuse this from files endpoint
    // for both chunked & non-chunked file
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

        // handle chunked files
        if (fileData.isChunked) {
            return res.status(501).send("Chunked file download not yet implemented");
        }

        // find the corresponding drive account
        const driveAccount = driveAccounts.find(d => d.id === fileData.driveId);
        if (!driveAccount) {
            return res.status(500).send("Associated Drive account not found");
        }

        // initialize Google Drive client
        const drive = google.drive({ version: 'v3', auth: driveAccount.auth });

        // get file from Google Drive
        const fileMeta = await drive.files.get({
            fileId: fileData.googleDrivefileId,
            fields: 'id, name, mimeType, size'
        });

        // Set response headers
        res.setHeader('Content-Disposition', `attachment; filename="${fileMeta.data.name}"`);
        res.setHeader('Content-Type', fileMeta.data.mimeType);
        res.setHeader('Content-Length', fileMeta.data.size);

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

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).send("Internal server error");
    }
    // till this **
    /*snapshot.forEach(doc => {
        const data = doc.data();
        if (data && data.name) {
            fileNames.push(data.name);
        })*/
});

//request the user to enter a file name.
//any other efficient way would be ok.

//const fileName = req.query.fileName;
//use this to check in the array for available files.

//if the file exists, then download the file.
//})
