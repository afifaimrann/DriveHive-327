//This is the same code from previous commit, but in Js, since we might
//be using it in a node environment.

const fs = require('fs');
const path = require('path');

const filePath = '/Users/shadman/Downloads/mfcc_data4.json'; // Tried also with jpg, pdf, txt, docx. Should work with any file type
const chunkSize = 16 * 1024 * 1024; // 16 MB
const chunkDir = '/Users/shadman/Downloads/Chunks';
fs.mkdirSync(chunkDir, { recursive: true }); // Make a directory if it already doesn't exist, for the chunks
const fileExtension = path.extname(filePath);
const fileNameWithoutExt = path.basename(filePath, fileExtension); // Get the file name without extension

//--------------------------
//console.log(fileNameWithExt);
//console.log(fileNameWithoutExt);
//console.log(fileExtension);
//--------------------------

// Where the breaking down of files happen
const fileBuffer = fs.readFileSync(filePath);
let chunkNumber = 0; // for now, we are maintaining a chunk number for ease of merging
for (let i = 0; i < fileBuffer.length; i += chunkSize) {
    const chunk = fileBuffer.slice(i, i + chunkSize); // 16MB chunks
    const chunkFilePath = path.join(chunkDir, `${fileNameWithoutExt}_chunk_${chunkNumber}`); // naming the chunks with respect to original file name
    fs.writeFileSync(chunkFilePath, chunk); // Write chunk to file
    chunkNumber += 1; // We can later use chunk number as metadata to merge the files
}

console.log(`File successfully chunked into ${chunkNumber} parts`);

//------------------------------------
// Where the merging of files happen

const reconstructedFilePath = `/Users/shadman/Downloads/Reconstruct_${fileNameWithoutExt}${fileExtension}`; // For ease, done locally at first to test
const outputBuffer = Buffer.concat(
    Array.from({ length: chunkNumber }, (_, index) => {
        const chunkFilePath = path.join(chunkDir, `${fileNameWithoutExt}_chunk_${index}`); // Could be made better with hashes and more metadata for files
        return fs.readFileSync(chunkFilePath);
    })
);
fs.writeFileSync(reconstructedFilePath, outputBuffer); // Write the reconstructed file

console.log("Chunks successfully merged");
