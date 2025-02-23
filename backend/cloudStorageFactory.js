const { GoogleDriveStorage, DropboxStorage } = require("./cloudStorage");

// Create a cloud storage instance based on the account type.
// @param {Object} account - Account info.
// @returns {CloudStorage} - A cloud storage instance.
// @throws {Error} - If the account type is not supported.

function createCloudStorage(account) {
  if (!account.type || account.type === "google") {
    return new GoogleDriveStorage({
      id: account.id,
      auth: account.auth,
      folderId: account.folderId
    }); //Uses from cloudStorage
  } else if (account.type === "dropbox") {
    return new DropboxStorage({
      id: account.id,
      accessToken: account.accessToken,
      basePath: account.basePath
    }); //Uses from cloudStorage
  }
  throw new Error(`Unsupported cloud account type: ${account.type}`);
}

module.exports = { createCloudStorage };