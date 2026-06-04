import { Writable } from 'stream';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { pipeline } from '@xenova/transformers';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

import { supabase } from '../config/supabase.js';
import { decrypt } from './crypto.service.js';
import { downloadFile } from './storage.service.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

let localExtractor = null;

/**
 * Cache and retrieve the local transformers pipeline for embeddings
 */
async function getLocalExtractor() {
  if (!localExtractor) {
    logger.info('Initializing local embedding pipeline (Xenova/all-MiniLM-L6-v2)...');
    localExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    logger.info('Local embedding pipeline initialized successfully.');
  }
  return localExtractor;
}

/**
 * A custom Writable stream to reconstruct files in-memory
 */
class MemoryWritable extends Writable {
  constructor() {
    super();
    this.chunks = [];
  }

  _write(chunk, encoding, callback) {
    this.chunks.push(chunk);
    callback();
  }

  setHeader() {} // Express compatibility mock

  getBuffer() {
    return Buffer.concat(this.chunks);
  }
}

/**
 * Extracts text from a file buffer based on the MIME type/extension
 */
export async function extractTextFromBuffer(buffer, mimeType, filename = '') {
  const extension = filename.split('.').pop().toLowerCase();

  try {
    // 1. PDF Documents
    if (mimeType === 'application/pdf' || extension === 'pdf') {
      const parser = new PDFParse({ data: buffer });
      try {
        const textResult = await parser.getText();
        return textResult.text || '';
      } finally {
        await parser.destroy().catch(() => {});
      }
    }

    // 2. Word Documents (DOCX)
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      extension === 'docx'
    ) {
      const data = await mammoth.extractRawText({ buffer });
      return data.value || '';
    }

    // 3. Text, Markdown, CSV, JSON
    if (
      mimeType.startsWith('text/') ||
      ['txt', 'md', 'csv', 'json', 'xml'].includes(extension)
    ) {
      return buffer.toString('utf8');
    }

    throw new ValidationError(`Unsupported file type for text extraction: ${mimeType || extension}`);
  } catch (error) {
    logger.error({ error, mimeType, filename }, 'Error extracting text from file buffer');
    throw new AppError(`Failed to extract text from file: ${error.message}`, 500);
  }
}

/**
 * Splits text into smaller semantic chunks with overlap
 */
export function chunkText(text, chunkSize = 1000, chunkOverlap = 150) {
  if (!text) return [];
  const chunks = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + chunkSize;

    // Adjust endIndex to avoid splitting words
    if (endIndex < text.length) {
      const lastSpace = text.lastIndexOf(' ', endIndex);
      if (lastSpace > startIndex + (chunkSize - 200)) {
        endIndex = lastSpace;
      }
    }

    const chunk = text.slice(startIndex, endIndex).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    startIndex = endIndex - chunkOverlap;
    if (startIndex >= text.length || endIndex >= text.length) {
      break;
    }
  }

  return chunks;
}

/**
 * Generate embedding vector using the user's preferred provider
 */
export async function generateEmbedding(text, provider, apiKey, baseURL) {
  if (provider === 'local') {
    const extractor = await getLocalExtractor();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  if (provider === 'gemini') {
    if (!apiKey) throw new ValidationError('Gemini API key is required for embeddings');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  }

  if (provider === 'openai' || provider === 'openrouter' || provider === 'custom') {
    if (!apiKey && provider !== 'custom') {
      throw new ValidationError(`${provider} API key is required for embeddings`);
    }
    const openai = new OpenAI({
      apiKey: apiKey || 'none',
      baseURL: baseURL || undefined,
    });
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  }

  throw new ValidationError(`Unsupported embedding provider: ${provider}`);
}

/**
 * Reconstructs a file from storage chunks and indexes it for RAG
 */
export async function indexFile(userId, fileId) {
  logger.info({ userId, fileId }, 'Starting file indexing for RAG');

  // 1. Fetch file record
  const { data: fileRecord, error: fileError } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .eq('user_id', userId)
    .single();

  if (fileError || !fileRecord) {
    throw new NotFoundError('File not found');
  }

  // 2. Fetch user LLM/Embedding settings
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    throw new NotFoundError('User profile not found');
  }

  // Default to local embeddings if not configured
  const embeddingProvider = profile.embedding_provider || 'local';
  const decryptedApiKey = profile.llm_api_key ? decrypt(profile.llm_api_key) : null;

  // 3. Download the file into memory
  const memoryStream = new MemoryWritable();
  await downloadFile(userId, fileId, memoryStream);
  const fileBuffer = memoryStream.getBuffer();

  // 4. Extract text
  const extractedText = await extractTextFromBuffer(fileBuffer, fileRecord.mime_type, fileRecord.name);
  if (!extractedText.trim()) {
    logger.warn({ fileId }, 'File contains no extractable text. Skipping indexing.');
    return { chunkCount: 0 };
  }

  // 5. Chunk text
  const textChunks = chunkText(extractedText);
  logger.info({ fileId, chunkCount: textChunks.length }, 'Split file into semantic chunks');

  // 6. Delete any existing chunks for this file
  await supabase.from('document_chunks').delete().eq('file_id', fileId);

  // 7. Generate embeddings and insert into Supabase
  const chunksToInsert = [];
  const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

  for (let i = 0; i < textChunks.length; i++) {
    const chunkTextContent = textChunks[i];
    
    // Generate embedding
    const embedding = await generateEmbedding(
      chunkTextContent,
      embeddingProvider,
      decryptedApiKey,
      profile.llm_endpoint
    );

    chunksToInsert.push({
      file_id: fileId,
      user_id: userId,
      chunk_index: i,
      content: chunkTextContent,
      embedding,
    });

    // Yield control back to Express event loop to handle incoming requests (dashboard view, etc.)
    await yieldToEventLoop();
  }

  try {
    if (chunksToInsert.length > 0) {
      const { error: insertError } = await supabase.from('document_chunks').insert(chunksToInsert);
      if (insertError) {
        throw new AppError(`Failed to save vector chunks: ${insertError.message}`, 500);
      }
    }

    // Set is_indexed to true in database
    await supabase.from('files').update({ is_indexed: true }).eq('id', fileId);

    logger.info({ fileId, chunksIndexed: chunksToInsert.length }, 'Successfully indexed file for RAG');
    return { chunkCount: chunksToInsert.length };
  } catch (error) {
    // Set is_indexed to false on failure
    await supabase.from('files').update({ is_indexed: false }).eq('id', fileId);
    throw error;
  }
}

/**
 * Query files using RAG: Retrieve similar chunks and call LLM
 */
export async function queryRAG(userId, query, fileIds = null) {
  logger.info({ userId, query, fileIds }, 'Starting RAG query execution');

  // 1. Fetch user LLM/Embedding settings
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    throw new NotFoundError('User profile not found');
  }

  const embeddingProvider = profile.embedding_provider || 'local';
  const llmProvider = profile.llm_provider || 'gemini';
  const llmModel = profile.llm_model_name || 'gemini-1.5-flash';
  const decryptedApiKey = profile.llm_api_key ? decrypt(profile.llm_api_key) : null;

  // 2. Generate embedding for query
  const queryVector = await generateEmbedding(
    query,
    embeddingProvider,
    decryptedApiKey,
    profile.llm_endpoint
  );

  // 3. Search Supabase for similar chunks
  const { data: matchedChunks, error: matchError } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryVector,
    match_threshold: 0.05,
    match_count: 5,
    p_user_id: userId,
    p_file_ids: fileIds && fileIds.length > 0 ? fileIds : null,
  });

  if (matchError) {
    logger.error({ matchError }, 'Error calling match_document_chunks RPC');
    throw new AppError(`Database search failed: ${matchError.message}`, 500);
  }

  if (!matchedChunks || matchedChunks.length === 0) {
    return {
      answer: "I couldn't find any relevant information in your uploaded files to answer this question. Please make sure your files are indexed.",
      sources: []
    };
  }

  // 4. Fetch source filenames
  const matchedFileIds = [...new Set(matchedChunks.map(c => c.file_id))];
  const { data: filesData } = await supabase
    .from('files')
    .select('id, name')
    .in('id', matchedFileIds);

  const fileMap = {};
  if (filesData) {
    filesData.forEach(f => {
      fileMap[f.id] = f.name;
    });
  }

  // Format sources
  const sources = matchedChunks.map(chunk => ({
    fileId: chunk.file_id,
    filename: fileMap[chunk.file_id] || 'Unknown File',
    similarity: chunk.similarity,
    content: chunk.content
  }));

  // 5. Construct LLM prompt
  const contextText = matchedChunks.map((c, i) => `[Source ${i + 1}: ${fileMap[c.file_id] || 'Unknown'}]\n${c.content}`).join('\n\n');
  const systemPrompt = `You are DriveHive AI, a helpful virtual assistant.
You help users query, analyze, and search through their uploaded cloud documents.
Answer the user's question using only the provided context snippets from their files.
If the context does not contain enough information to answer the question, politely explain that you cannot find the answer in their documents.
Keep answers clear, well-structured, and concise.

Context snippets:
================
${contextText}
================`;

  // 6. Call the LLM
  let answer = '';
  
  if (llmProvider === 'gemini') {
    if (!decryptedApiKey) throw new ValidationError('Gemini API key is required');
    const genAI = new GoogleGenerativeAI(decryptedApiKey);
    const model = genAI.getGenerativeModel({
      model: llmModel,
      systemInstruction: systemPrompt
    });
    const result = await model.generateContent(query);
    answer = result.response.text();
  } else {
    // OpenAI, OpenRouter, Ollama, or Custom OpenAI-compatible
    if (!decryptedApiKey && llmProvider !== 'ollama' && llmProvider !== 'custom') {
      throw new ValidationError(`${llmProvider} API key is required`);
    }

    const openai = new OpenAI({
      apiKey: decryptedApiKey || 'none',
      baseURL: profile.llm_endpoint || undefined,
      defaultHeaders: llmProvider === 'openrouter' ? {
        'HTTP-Referer': 'https://github.com/afifaimrann/DriveHive-327',
        'X-Title': 'DriveHive'
      } : {}
    });

    const completion = await openai.chat.completions.create({
      model: llmModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ]
    });
    answer = completion.choices[0].message.content;
  }

  return {
    answer,
    sources: sources.map(s => ({ fileId: s.fileId, filename: s.filename })) // Hide raw similarity / content from return
  };
}
