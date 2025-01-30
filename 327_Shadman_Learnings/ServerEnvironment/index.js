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


const auth = new google.auth.OAuth2(
    "CLIENT_ID",
    "CLIENT_SECRET",
    "REDIRECT_URL"
);

auth.setCredentials({ access_token: "" });
const folderId = "";


app.get("/test", (req,res)=>{
    res.send("Hello World");
})




//30-01-2025
//Having issues with setting up server side logic for uploading files in chunks. 
/*Initial plan was to do slicing in the frontend, but trying to implement the
entire logic in backend. */

app.post("/upload", async (req,res)=>{
    const drive = google.drive({ version: "v3", auth });

    await async function uploadFileInChunks(auth, folderId) {
        const fileSize = fs.statSync(filePath).size;
        let start = 0;
        let end = Math.min(chunkSize, fileSize); //If any file less than 16MB
        let chunkNumber = 0;
        while (start < fileSize) {
            const chunkStream = fs.createReadStream(filePath, { start, end });
            // Create a new file for each chunk
            const fileId = await initiateUpload(auth, chunkNumber, folderId);
            // Upload the current chunk to the newly created file
            await uploadChunk(auth, fileId, chunkStream, start, end, fileSize);
            console.log(`Uploaded chunk ${chunkNumber}`);
            // Move to the next chunk
            start = end;
            end = Math.min(start + chunkSize, fileSize);
            chunkNumber++;
        }
        console.log("All chunks successfully uploaded as separate files.");
    }

    async function initiateUpload(auth, chunkNumber, folderId) {
        const drive = google.drive({ version: "v3", auth }); //authenticated drive obj
        const res = await drive.files.create({
            requestBody: {
                name: `${fileNameWithoutExt}_chunk_${chunkNumber}${fileExtension}`, // Unique name for each chunk
                parents: [folderId],
            },
            media: {
                mimeType: "application/octet-stream", //We are dealing in binary
            },
            uploadType: "resumable", //Felt this was useful from the documentation
        });
        return res.data.id; // Return the file ID for this chunk
    }
})



app.listen(PORT, ()=> {
    console.log(`Server is running on port ${PORT}`);
})