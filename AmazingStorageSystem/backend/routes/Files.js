const express = require("express");
const multer = require("multer");
const { uploadFile } = require("../services/googleDriveService");

const router = express.Router();
const upload = multer();

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = await uploadFile(req.file);
    res.json({ fileId: file.id, link: `https://drive.google.com/file/d/${file.id}` });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

module.exports = router;
