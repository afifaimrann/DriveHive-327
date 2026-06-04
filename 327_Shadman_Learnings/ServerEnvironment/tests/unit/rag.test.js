import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn().mockResolvedValue(
    vi.fn().mockResolvedValue({
      data: new Float32Array([0.5, 0.25, 0.125])
    })
  )
}));

import { chunkText, extractTextFromBuffer, generateEmbedding } from '../../src/services/rag.service.js';

describe('RAG Service - Text Chunking', () => {
  it('should split text into chunks based on size', () => {
    const text = 'This is a sample sentence that will be used to test text chunking functions in DriveHive.';
    const chunks = chunkText(text, 20, 5);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].length).toBeLessThanOrEqual(20);
  });

  it('should handle empty or null text safely', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText(null)).toEqual([]);
  });
});

describe('RAG Service - Text Extraction', () => {
  it('should extract plain text from a buffer', async () => {
    const content = 'Hello world, this is a RAG document text extraction test.';
    const buffer = Buffer.from(content, 'utf8');
    const result = await extractTextFromBuffer(buffer, 'text/plain', 'test.txt');

    expect(result).toBe(content);
  });

  it('should fail gracefully on unsupported types', async () => {
    const buffer = Buffer.from('dummy data');
    await expect(extractTextFromBuffer(buffer, 'application/octet-stream', 'test.bin'))
      .rejects.toThrow('Unsupported file type for text extraction');
  });
});

describe('RAG Service - Embedding Generation API Routes', () => {
  it('should generate embeddings via local provider', async () => {
    // Local extraction should call our mocked pipeline
    const embedding = await generateEmbedding('test query', 'local');
    expect(embedding).toEqual([0.5, 0.25, 0.125]);
  });
});
