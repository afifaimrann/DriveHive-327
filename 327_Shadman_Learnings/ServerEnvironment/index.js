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

//Will be removed if multiple account testing is successful
const auth = new google.auth.OAuth2(
    "",
    "",
    ""
);

auth.setCredentials({ access_token: "" });
const folderId = "";
const driveId = "suppose1";

//02-02-2025
//testing multiple storages, across multiple accounts.
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

//02-02-2025
//Looking for available storage in the allocated drives
//Might integrate to possible new upload endpoint.
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

//31-01-2025
/*Working approach to uploading files in drive using multer via endpoints.
I need to work on the logic behind efficiently switching between multiple
drives and to also set up multiple drives. */
app.post("/upload", upload.single('file'), async (req, res) => {
    const drive = google.drive({ version: 'v3', auth });
    const file = req.file;
    const fileName = file.originalname;
    const fileSize = file.size;

    if (fileSize > availableStorage()) {
        res.send('Not enough storage available');
        // Logic for switching to another drive
    }
    const response = await drive.files.create({
        requestBody: {
            name: fileName,
            mimeType: file.mimetype,
            parents: [folderId],
        },
        media: {
            mimeType: file.mimetype,
            body: fs.createReadStream(file.path),
        }
    });
    /*Working approach to upload metadata of files into Firestore. From there
    we can gain file names to view the files uploaded, map where chunks are etc.
    Future work would be done on this. */
    try {
        const fileMetaData = {
            name: fileName,
            size: fileSize,
            uploadedAt: new Date().toISOString(),
            isChunked: false, //Kept this, we can use it in future to treat edge cases for demo 1.
            driveId: driveId,
            googleDrivefileId: response.data.id,
            mimeType: file.mimetype,
            downloadUrl: `https://drive.google.com/file/d/${response.data.id}/view`
        }

        const addData = await db.collection("files").add(fileMetaData);
        fs.unlinkSync(file.path);
    } catch (err) {
        console.log(err);
    }
    res.send(response.data);

})


/*Working approach to list all the files uploaded via post request, hopefully across
all drives as well. */
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




