import express from 'express';
import Joi from 'joi';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.js';
import { encrypt } from '../services/crypto.service.js';
import { indexFile, queryRAG } from '../services/rag.service.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

const settingsSchema = Joi.object({
  llmProvider: Joi.string().valid('gemini', 'openai', 'openrouter', 'ollama', 'custom').required(),
  llmApiKey: Joi.string().allow('', null).optional(),
  llmEndpoint: Joi.string().allow('', null).optional(),
  llmModelName: Joi.string().min(1).required(),
  embeddingProvider: Joi.string().valid('local', 'gemini', 'openai').required(),
  embeddingModelName: Joi.string().min(1).required(),
});

const querySchema = Joi.object({
  query: Joi.string().min(1).required(),
  fileIds: Joi.array().items(Joi.string().uuid()).allow(null).optional(),
});

// GET user RAG / LLM settings
router.get('/settings', authenticate, async (req, res, next) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('llm_provider, llm_api_key, llm_endpoint, llm_model_name, embedding_provider, embedding_model_name')
      .eq('id', req.userId)
      .single();

    if (error || !profile) {
      return res.status(404).json({ message: 'Settings not found' });
    }

    res.status(200).json({
      llmProvider: profile.llm_provider || 'gemini',
      llmEndpoint: profile.llm_endpoint || '',
      llmModelName: profile.llm_model_name || 'gemini-1.5-flash',
      embeddingProvider: profile.embedding_provider || 'local',
      embeddingModelName: profile.embedding_model_name || 'all-MiniLM-L6-v2',
      hasApiKey: !!profile.llm_api_key,
    });
  } catch (error) {
    next(error);
  }
});

// POST save user RAG / LLM settings
router.post('/settings', authenticate, validate(settingsSchema), async (req, res, next) => {
  try {
    const {
      llmProvider,
      llmApiKey,
      llmEndpoint,
      llmModelName,
      embeddingProvider,
      embeddingModelName,
    } = req.body;

    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('llm_api_key')
      .eq('id', req.userId)
      .single();

    let encryptedKey = currentProfile?.llm_api_key || null;

    // Only update key if a new one is provided or explicitly cleared
    if (llmApiKey !== undefined) {
      if (llmApiKey === null || llmApiKey === '') {
        encryptedKey = null;
      } else if (llmApiKey !== '••••••••') {
        encryptedKey = encrypt(llmApiKey);
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        llm_provider: llmProvider,
        llm_api_key: encryptedKey,
        llm_endpoint: llmEndpoint || null,
        llm_model_name: llmModelName,
        embedding_provider: embeddingProvider,
        embedding_model_name: embeddingModelName,
      })
      .eq('id', req.userId);

    if (error) {
      throw error;
    }

    res.status(200).json({ message: 'RAG settings updated successfully' });
  } catch (error) {
    next(error);
  }
});

// POST manually index a file
router.post('/index/:fileId', authenticate, async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const result = await indexFile(req.userId, fileId);

    res.status(200).json({
      message: 'File successfully indexed for RAG',
      chunksIndexed: result.chunkCount,
    });
  } catch (error) {
    next(error);
  }
});

// POST query RAG over files
router.post('/query', authenticate, validate(querySchema), async (req, res, next) => {
  try {
    const { query, fileIds } = req.body;
    const result = await queryRAG(req.userId, query, fileIds);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
