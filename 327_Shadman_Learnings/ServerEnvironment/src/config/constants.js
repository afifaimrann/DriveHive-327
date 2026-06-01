/**
 * Application-wide constants.
 */

/** Maximum chunk size for file splitting (50 MB) */
export const CHUNK_SIZE = 50 * 1024 * 1024;

/** Supported storage providers */
export const PROVIDERS = {
  GOOGLE: 'google',
  DROPBOX: 'dropbox',
};

/** OAuth scopes per provider */
export const OAUTH_SCOPES = {
  google: [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ],
  dropbox: [],
};

/** Rate limiting defaults */
export const RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,  // 15 minutes
  maxRequests: 100,            // per window
};

/** JWT token configuration */
export const AUTH = {
  saltRounds: 10,
  tokenExpiresIn: '24h',
};

/** Upload limits */
export const UPLOAD = {
  maxFileSize: 500 * 1024 * 1024,  // 500 MB
  allowedMimeTypes: null,           // null = allow all
};
