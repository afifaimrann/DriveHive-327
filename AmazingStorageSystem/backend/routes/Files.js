import express from 'express';
import { mergeStorage, uploadFile, downloadFile, searchFiles } from '../controllers/fileController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// merge storage 
router.get('/merge-storage', protect, mergeStorage);

// upload file 
router.post('/upload', protect, uploadFile);

// download file
router.get('/download/:fileId', protect, downloadFile);

// search files 
router.get('/search', protect, searchFiles);

export default router;

