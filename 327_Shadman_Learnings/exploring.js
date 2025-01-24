/*24-01-2025, Today's update was moving from Python to js since we might be
 working with MERN stack for our project. I also managed to have a go with
 the google API and it is working with uploads at the moment. I need to check
 wether:
  1. I need stronger Metadata for the files to maintain integrity
  2. I can resolve the issues I faced with downloads and merging.
  3. This structure is compatible with server requests (should be).
  4. I can scale the uploads to multiple google accounts parallely. 
  
  We also need to keep in mind that the refresh token maybe expires in 7 days
  from creation. Need to look up more into that to use the API further. This code 
  works just fine to upload in chunks to google drive.*/

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const filePath = "/Users/shadman/Downloads/mfcc_data4.json"; // Input file
const chunkSize = 16 * 1024 * 1024; // 16 MB
const fileExtension = path.extname(filePath);
const fileNameWithoutExt = path.basename(filePath, fileExtension); // Get the file name without extension





/*This function basically creates a new file each time a chunk is done.
    The files.create function call takes in data like file name, where to store
    and type of file we storing(binary), and a upload type set as resumable.
    Google drive api documentations is the source. Later, we take the 
    ID of the created file so that we can identify and write in it. */





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




/*This function is basically responsible to write in the created file for the chunk.
  After a chunk is done, a file to write in is made on drive, this function comes 
  into action and 'updates' the created file with the content which should be placed
  here. This function might subject to change as I have not tried to download and
  merge from drive. */
async function uploadChunk(auth, fileId, chunkStream, start, end, fileSize) {
    //Headers exist for HTTP protocols, I customised it to handle the uploads.
    const headers = {
        "Content-Type": "application/octet-stream",
        "Content-Length": end - start,
        "Content-Range": `bytes ${start}-${end - 1}/${fileSize}`,
    };
    const drive = google.drive({ version: "v3", auth });
    await drive.files.update({
        fileId,
        media: { body: chunkStream },
        headers,
    });
}





/*The main function where the magic happens. Taking in the authentication ID needed
  to perform drive operations along with the folder in which we are working with, 
  the file being uploaded gets chunked into 16MB sizes, then leveraging JS's asynchronous
  attributes. Ones file gets chunked first, file in drive gets created, the chunk gets read
  and written/updated on the destined drive file. Later the bytes are updated so that it can 
  read the next chunk. */
async function uploadFileInChunks(auth, folderId) {
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





//Use own credentials please! Will provide link on how to get those. Basically authenticating yourself to use api.
const auth = new google.auth.OAuth2(
    "CLIENT ID",
    "CLIENT SECRET",
    "REDIRECT"
);





auth.setCredentials({ access_token: "ACCESS TOKEN" });
const folderId = "FOLDER ID"; // Replace with the Google Drive folder ID. You can get it at the end of your google drive folder URL.
uploadFileInChunks(auth, folderId).catch(console.error); //Initiate the process, log if any errors.


//This is the end of the code. I will be updating this as I learn more about the google drive API.