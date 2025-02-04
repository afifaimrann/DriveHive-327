const fs = require("fs");
const { google } = require("googleapis");
const express = require("express");
const admin = require("firebase-admin");

const app = express();
admin.initializeApp();
const db = admin.firestore();

const getAuth = (driveId) => {
    const driveAccount = driveAccounts.find((acc) => acc.id === driveId);
    return driveAccount ? driveAccount.auth : null;
};

app.get("/download/:fileId", async (req, res) => {
    const fileId = req.params.fileId;

    // retrieve file from Firestore
    const fileDoc = await db.collection("files").doc(fileId).get();
    if (!fileDoc.exists) {
        return res.status(404).send("File not found.");
    }

    const fileData = fileDoc.data();
    const { name, chunks } = fileData;
    
    const mergedFilePath = `./downloads/${name}`;
    const writeStream = fs.createWriteStream(mergedFilePath);

    for (const chunk of chunks) {
        const { driveId, googleDriveFileId } = chunk;
        const auth = getAuth(driveId);
        if (!auth) {
            return res.status(500).send("Drive authentication error.");
        }

        const drive = google.drive({ version: "v3", auth });
        const tempChunkPath = `./downloads/temp_${chunk.partNumber}`;

        try {
            const response = await drive.files.get(
                { fileId: googleDriveFileId, alt: "media" },
                { responseType: "stream" }
            );

            // save chunk to temporary file
            const chunkStream = fs.createWriteStream(tempChunkPath);
            await new Promise((resolve, reject) => {
                response.data.pipe(chunkStream);
                response.data.on("end", resolve);
                response.data.on("error", reject);
            });

            // integrate chunk to final merged file
            const chunkBuffer = fs.readFileSync(tempChunkPath);
            writeStream.write(chunkBuffer);
            fs.unlinkSync(tempChunkPath); // for removing temp chunk file
        } catch (error) {
            console.error("Error downloading chunk:", error);
            return res.status(500).send("Error downloading file chunks.");
        }
    }

    writeStream.end();

    // send the merged file for downloading
    res.download(mergedFilePath, name, (err) => {
        if (err) {
            console.error("Download error:", err);
            return res.status(500).send("Error sending file.");
        }
        fs.unlinkSync(mergedFilePath); // delete the merged file after download
    });
});
