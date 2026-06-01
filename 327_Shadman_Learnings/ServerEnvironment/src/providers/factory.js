import { GoogleDriveStorage } from './google-drive.js';
import { DropboxStorage } from './dropbox.js';
import { PROVIDERS } from '../config/constants.js';

/**
 * Factory function to create a cloud storage instance from an account record.
 *
 * @param {object} account - Account object with decrypted accessToken
 * @param {string} account.id - Cloud account ID
 * @param {string} account.provider - 'google' or 'dropbox'
 * @param {string} account.accessToken - Decrypted access token
 * @param {string} [account.folder_id] - Google Drive folder ID
 * @param {string} [account.base_path] - Dropbox base path
 * @returns {CloudStorage} A provider-specific storage instance
 */
export function createCloudStorage(account) {
  switch (account.provider) {
    case PROVIDERS.GOOGLE:
      return new GoogleDriveStorage({
        id: account.id,
        accessToken: account.accessToken,
        folderId: account.folder_id,
      });

    case PROVIDERS.DROPBOX:
      return new DropboxStorage({
        id: account.id,
        accessToken: account.accessToken,
        basePath: account.base_path,
      });

    default:
      throw new Error(`Unsupported storage provider: ${account.provider}`);
  }
}
