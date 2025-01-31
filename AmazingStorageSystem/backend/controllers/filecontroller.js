import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();
const drive = google.drive({ version: "v3", auth: process.env.GOOGLE_API_KEY });

export const uploadFile = async (req, res) => {
  try {
    const fileMetadata = { name: req.file.originalname };
    const media = { mimeType: req.file.mimetype, body: req.file.buffer };
    
    const response = await drive.files.create({ resource: fileMetadata, media });
    res.json({ fileId: response.data.id });
  } catch (error) {
    res.status(500).json({ error: "Upload failed" });
  }
};

