import { describe, it, expect, vi } from 'vitest';
import { generateChunkMetadata, selectStorageAccount } from '../../src/services/file-chunker.js';
import { StorageFullError } from '../../src/utils/errors.js';

describe('File Chunker Service', () => {
  describe('generateChunkMetadata', () => {
    it('should return a single chunk for files smaller than the chunk size', () => {
      const file = {
        originalname: 'test.txt',
        mimetype: 'text/plain',
        size: 10 * 1024 * 1024, // 10MB
      };

      const customChunkSize = 50 * 1024 * 1024; // 50MB
      const metadata = generateChunkMetadata(file, customChunkSize);

      expect(metadata.length).toBe(1);
      expect(metadata[0]).toEqual({
        name: 'test.txt-chunk-0-10485759',
        mimeType: 'text/plain',
        range: { start: 0, end: 10485759 },
        size: 10 * 1024 * 1024,
        offset: 0,
      });
    });

    it('should split larger files into multiple chunks of appropriate sizes', () => {
      const file = {
        originalname: 'largefile.zip',
        mimetype: 'application/zip',
        size: 120 * 1024 * 1024, // 120MB
      };

      const customChunkSize = 50 * 1024 * 1024; // 50MB
      const metadata = generateChunkMetadata(file, customChunkSize);

      expect(metadata.length).toBe(3);
      
      // Chunk 1: 50MB
      expect(metadata[0].size).toBe(50 * 1024 * 1024);
      expect(metadata[0].offset).toBe(0);
      expect(metadata[0].range.start).toBe(0);
      expect(metadata[0].range.end).toBe(50 * 1024 * 1024 - 1);

      // Chunk 2: 50MB
      expect(metadata[1].size).toBe(50 * 1024 * 1024);
      expect(metadata[1].offset).toBe(50 * 1024 * 1024);
      expect(metadata[1].range.start).toBe(50 * 1024 * 1024);
      expect(metadata[1].range.end).toBe(100 * 1024 * 1024 - 1);

      // Chunk 3: 20MB
      expect(metadata[2].size).toBe(20 * 1024 * 1024);
      expect(metadata[2].offset).toBe(100 * 1024 * 1024);
      expect(metadata[2].range.start).toBe(100 * 1024 * 1024);
      expect(metadata[2].range.end).toBe(120 * 1024 * 1024 - 1);
    });
  });

  describe('selectStorageAccount', () => {
    it('should select the storage account with the most available space (greedy strategy)', async () => {
      const storage1 = {
        id: 'acc1',
        provider: 'google',
        getAvailableStorage: vi.fn().mockResolvedValue(100 * 1024 * 1024), // 100MB
      };
      const storage2 = {
        id: 'acc2',
        provider: 'dropbox',
        getAvailableStorage: vi.fn().mockResolvedValue(300 * 1024 * 1024), // 300MB
      };
      const storage3 = {
        id: 'acc3',
        provider: 'google',
        getAvailableStorage: vi.fn().mockResolvedValue(200 * 1024 * 1024), // 200MB
      };

      const selected = await selectStorageAccount(50 * 1024 * 1024, [storage1, storage2, storage3]);
      
      expect(selected.id).toBe('acc2'); // 300MB is the highest
      expect(storage1.getAvailableStorage).toHaveBeenCalled();
      expect(storage2.getAvailableStorage).toHaveBeenCalled();
      expect(storage3.getAvailableStorage).toHaveBeenCalled();
    });

    it('should ignore storage accounts that do not have enough space for the chunk', async () => {
      const storage1 = {
        id: 'acc1',
        provider: 'google',
        getAvailableStorage: vi.fn().mockResolvedValue(10 * 1024 * 1024), // 10MB
      };
      const storage2 = {
        id: 'acc2',
        provider: 'dropbox',
        getAvailableStorage: vi.fn().mockResolvedValue(80 * 1024 * 1024), // 80MB
      };

      // Chunk size is 50MB
      const selected = await selectStorageAccount(50 * 1024 * 1024, [storage1, storage2]);
      
      expect(selected.id).toBe('acc2');
      expect(storage1.getAvailableStorage).toHaveBeenCalled();
      expect(storage2.getAvailableStorage).toHaveBeenCalled();
    });

    it('should throw StorageFullError if no accounts have enough space', async () => {
      const storage1 = {
        id: 'acc1',
        provider: 'google',
        getAvailableStorage: vi.fn().mockResolvedValue(10 * 1024 * 1024), // 10MB
      };
      const storage2 = {
        id: 'acc2',
        provider: 'dropbox',
        getAvailableStorage: vi.fn().mockResolvedValue(20 * 1024 * 1024), // 20MB
      };

      await expect(
        selectStorageAccount(50 * 1024 * 1024, [storage1, storage2])
      ).rejects.toThrow(StorageFullError);
    });

    it('should ignore accounts that fail to return available storage space', async () => {
      const storage1 = {
        id: 'acc1',
        provider: 'google',
        getAvailableStorage: vi.fn().mockRejectedValue(new Error('Quota API Error')),
      };
      const storage2 = {
        id: 'acc2',
        provider: 'dropbox',
        getAvailableStorage: vi.fn().mockResolvedValue(80 * 1024 * 1024), // 80MB
      };

      const selected = await selectStorageAccount(50 * 1024 * 1024, [storage1, storage2]);
      expect(selected.id).toBe('acc2');
    });
  });
});
