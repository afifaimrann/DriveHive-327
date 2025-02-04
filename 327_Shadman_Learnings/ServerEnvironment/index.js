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

var serviceAccount = require("firestore-credentials-local-path");

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

    const driveAccount = await getDriveWithMaxSpace(fileSize);
    if (!driveAccount) {
        return res.status(400).send("Not enough storage available on any drive"); //Debugging availability of drive
    }

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


        /*If we are tasked with suppose when chunking a file, this snippet might get triggered
        and the db would have the file name as much times it got chunked. So we need to write our chunking
        function efficiently in order to avoid this getting called, so that the data gets stored only when
        we are uploading for the first time, the file itself as a whole. */


        const fileMetaData = {
            name: fileName,
            size: fileSize,
            uploadedAt: new Date().toISOString(), //Readable date format
            isChunked: false, //Kept this, we can use it in future to treat edge cases for demo 1.
            driveId: driveAccount.id, //We might use this to identify the drive
            googleDrivefileId: response.data.id,
            mimeType: file.mimetype,
            downloadUrl: `https://drive.google.com/file/d/${response.data.id}/view` //We might use this to download the file if it is not chunked.
        };

        await db.collection("files").add(fileMetaData);
        fs.unlinkSync(file.path); // Clean up local file after upload
        res.send(response.data);
    } catch (err) {
        console.log(err);
    }
})


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
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data && data.name) {
            fileNames.push(data.name);
        }
    });

    //request the user to enter a file name.
    //any other efficient way would be ok.

    const fileName = req.query.fileName;
    //use this to check in the array for available files.

    //if the file exists, then download the file.
})