//28-01-2025
/*Here the server side of the logic for app handling will be written. I am
planning on doing the slicing of the files in the frontend and backend will
just upload the sliced files. For now, these are my thoughts. Feel free to 
make or suggest changes. */

const express = require("express");
const PORT = 3000;
const app = express();
const fs = require("fs");
const { google } = require("googleapis");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
var admin = require("firebase-admin");

var serviceAccount = require("/Users/shadman/Downloads/amazingstoragesystem-firebase-adminsdk-fbsvc-d39da93c81.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const auth = new google.auth.OAuth2(
    "141215357065-87u4u7v48g1dookd2as92lr06kpgk0eq.apps.googleusercontent.com",
    "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",
    "https://developers.google.com/oauthplayground"
);

auth.setCredentials({ access_token: "ya29.a0AXeO80T60LQB-3g6M7oUjfhoAqjGcrXVdPuvR5ByznU65g3RF4GKSNlISEd7r-xHsT8suRfelOaB91lnAKUP3_PRfk0qpj2gLkzWdvR8n2z6T7L8B3rGeYS0yLUhCrF967mBVaQGUt84EKysbSaT-W57VmKJZ79ZRPtCF2TTaCgYKAWQSARESFQHGX2Mi37Rf0Wj90rkk2uVW8CLaEA0175" });
const folderId = "1s6zhf6xnitlHOI7sagbb5PBvv5W9YiOR";
const driveId = "suppose1";


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

const availableStorage = async () => {
    const drive = google.drive({ version: "v3", auth });
    const response = await drive.about.get({ fields: "storageQuota" });
    const storageQuota = response.data.storageQuota;
    const used = parseInt(storageQuota.usageInDrive);
    const total = parseInt(storageQuota.limit);
    const available = total - used;
    return available;
}

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

    try {
        const fileMetaData = {
            name: fileName,
            size: fileSize,
            uploadedAt: new Date().toISOString(),
            isChunked: false,
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

//For now loading files from drive only. Might set up firebase to store file names being uploaded.
app.get("/folders", async (req, res) => {
    const drive = google.drive({ version: "v3", auth });
    const response = await drive.files.list({
        pageSize: 10,
        fields: "files(id, name)"
    });

    const files = response.data.files;
    if (files.lenth === 0) {
        res.send("No files found");
    }
    res.send(files);
})

//Also decided to keep this since will be using the chunking logic when a drive is out of storage for the file to be uploaded.
//30-01-2025
//Having issues with setting up server side logic for uploading files in chunks. 
/*Initial plan was to do slicing in the frontend, but trying to implement the
entire logic in backend. */

// app.post("/upload", async (req,res)=>{
//     const drive = google.drive({ version: "v3", auth });

//     await async function uploadFileInChunks(auth, folderId) {
//         const fileSize = fs.statSync(filePath).size;
//         let start = 0;
//         let end = Math.min(chunkSize, fileSize); //If any file less than 16MB
//         let chunkNumber = 0;
//         while (start < fileSize) {
//             const chunkStream = fs.createReadStream(filePath, { start, end });
//             // Create a new file for each chunk
//             const fileId = await initiateUpload(auth, chunkNumber, folderId);
//             // Upload the current chunk to the newly created file
//             await uploadChunk(auth, fileId, chunkStream, start, end, fileSize);
//             console.log(`Uploaded chunk ${chunkNumber}`);
//             // Move to the next chunk
//             start = end;
//             end = Math.min(start + chunkSize, fileSize);
//             chunkNumber++;
//         }
//         console.log("All chunks successfully uploaded as separate files.");
//     }

//     async function initiateUpload(auth, chunkNumber, folderId) {
//         const drive = google.drive({ version: "v3", auth }); //authenticated drive obj
//         const res = await drive.files.create({
//             requestBody: {
//                 name: `${fileNameWithoutExt}_chunk_${chunkNumber}${fileExtension}`, // Unique name for each chunk
//                 parents: [folderId],
//             },
//             media: {
//                 mimeType: "application/octet-stream", //We are dealing in binary
//             },
//             uploadType: "resumable", //Felt this was useful from the documentation
//         });
//         return res.data.id; // Return the file ID for this chunk
//     }
// })



app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
})