import express from 'express';
import multer from 'multer';
import {
  uploadFile,
  downloadFile,
  deleteFile,
  listFiles,
  getUserStorageQuota,
} from '../services/storage.service.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { indexFile } from '../services/rag.service.js';
import logger from '../utils/logger.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/upload', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Set headers for streaming JSON lines progress updates
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    const result = await uploadFile(req.userId, req.file, (progress) => {
      res.write(JSON.stringify(progress) + '\n');
    });

    res.write(JSON.stringify({ status: 'success', file: result }) + '\n');
    res.end();

    // Trigger background RAG indexing if the file has extractable text
    const ext = result.name.split('.').pop().toLowerCase();
    const isTextSupported = ['txt', 'md', 'csv', 'json', 'pdf', 'docx'].includes(ext) || 
                            (result.mime_type && result.mime_type.startsWith('text/'));
    if (isTextSupported) {
      indexFile(req.userId, result.id).catch((err) => {
        logger.error({ error: err, fileId: result.id }, 'Background RAG indexing failed on file upload');
      });
    }
  } catch (error) {
    if (res.headersSent) {
      res.write(JSON.stringify({ status: 'error', message: error.message }) + '\n');
      res.end();
    } else {
      next(error);
    }
  }
});

/**
 * GET /api/storage/download/:fileId
 * Stream/download the combined file.
 */
router.get('/download/:fileId', authenticate, async (req, res, next) => {
  try {
    const { fileId } = req.params;
    await downloadFile(req.userId, fileId, res);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/storage/files
 * List all file metadata records for the user.
 */
router.get('/files', authenticate, async (req, res, next) => {
  try {
    const files = await listFiles(req.userId);
    res.status(200).json({ files });
  } catch (error) {
    next(error);
  }
});

router.delete('/files/:fileId', authenticate, async (req, res, next) => {
  try {
    const { fileId } = req.params;

    // Set headers for streaming JSON lines progress updates
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    await deleteFile(req.userId, fileId, (progress) => {
      res.write(JSON.stringify(progress) + '\n');
    });

    res.write(JSON.stringify({ status: 'success', message: 'File deleted successfully' }) + '\n');
    res.end();
  } catch (error) {
    if (res.headersSent) {
      res.write(JSON.stringify({ status: 'error', message: error.message }) + '\n');
      res.end();
    } else {
      next(error);
    }
  }
});

/**
 * GET /api/storage/quota
 * Aggregate connected cloud account storage quotas.
 */
router.get('/quota', authenticate, async (req, res, next) => {
  try {
    const quota = await getUserStorageQuota(req.userId);
    res.status(200).json(quota);
  } catch (error) {
    next(error);
  }
});

export default router;
