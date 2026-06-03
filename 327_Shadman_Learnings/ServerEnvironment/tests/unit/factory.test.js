import { vi, describe, it, expect } from 'vitest';

// Mock the provider modules relative to this test file using constructible classes
vi.mock('../../src/providers/google-drive.js', () => {
  return {
    GoogleDriveStorage: class {
      constructor(config) {
        this.provider = 'google';
        this.id = config.id;
        this.accessToken = config.accessToken;
        this.folderId = config.folderId;
      }
    }
  };
});

vi.mock('../../src/providers/dropbox.js', () => {
  return {
    DropboxStorage: class {
      constructor(config) {
        this.provider = 'dropbox';
        this.id = config.id;
        this.accessToken = config.accessToken;
        this.basePath = config.basePath;
      }
    }
  };
});

// Import the factory after mocks are registered
import { createCloudStorage } from '../../src/providers/factory.js';

describe('Storage Provider Factory', () => {
  it('should instantiate GoogleDriveStorage for google provider', () => {
    const account = {
      id: 'google-acc-123',
      provider: 'google',
      accessToken: 'token-abc',
      folder_id: 'folder-999',
    };

    const storage = createCloudStorage(account);

    expect(storage.provider).toBe('google');
    expect(storage.id).toBe('google-acc-123');
    expect(storage.accessToken).toBe('token-abc');
    expect(storage.folderId).toBe('folder-999');
  });

  it('should instantiate DropboxStorage for dropbox provider', () => {
    const account = {
      id: 'dropbox-acc-456',
      provider: 'dropbox',
      accessToken: 'token-xyz',
      base_path: '/hive-root',
    };

    const storage = createCloudStorage(account);

    expect(storage.provider).toBe('dropbox');
    expect(storage.id).toBe('dropbox-acc-456');
    expect(storage.accessToken).toBe('token-xyz');
    expect(storage.basePath).toBe('/hive-root');
  });

  it('should throw an error for unsupported storage provider', () => {
    const account = {
      id: 'unknown-acc-789',
      provider: 'onedrive',
      accessToken: 'token-123',
    };

    expect(() => createCloudStorage(account)).toThrow('Unsupported storage provider: onedrive');
  });
});
