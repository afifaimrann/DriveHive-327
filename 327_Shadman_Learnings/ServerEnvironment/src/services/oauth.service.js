import { google } from 'googleapis';
import { Dropbox } from 'dropbox';
import crypto from 'crypto';
import supabase from '../config/supabase.js';
import env from '../config/env.js';
import { OAUTH_SCOPES } from '../config/constants.js';
import { encrypt, decrypt } from './crypto.service.js';
import { NotFoundError, ProviderError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// ──────────────────────────────────────────────────────────
//  OAuth URL Generation
// ──────────────────────────────────────────────────────────

/**
 * Generate an OAuth authorization URL for a given provider.
 * Creates a state token stored in Supabase to prevent CSRF.
 *
 * @param {string} userId - The authenticated user's ID
 * @param {string} provider - 'google' or 'dropbox'
 * @returns {{ authUrl: string, state: string }}
 */
export async function getOAuthUrl(userId, provider) {
  // Generate a random state token
  const state = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  // Store state in DB for validation on callback
  await supabase.from('oauth_states').insert({
    user_id: userId,
    provider,
    state,
    expires_at: expiresAt,
  });

  let authUrl;

  if (provider === 'google') {
    const oauth2 = createGoogleOAuth2Client();
    authUrl = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',  // Force consent to always get refresh_token
      scope: OAUTH_SCOPES.google,
      state,
    });
  } else if (provider === 'dropbox') {
    const redirectUri = `${env.appUrl}/api/oauth/callback/dropbox`;
    // Build Dropbox OAuth2 URL manually for code flow
    authUrl =
      `https://www.dropbox.com/oauth2/authorize` +
      `?client_id=${env.dropbox.clientId}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}` +
      `&token_access_type=offline`;
  } else {
    throw new ProviderError(provider, 'Unsupported provider');
  }

  logger.info({ userId, provider }, 'Generated OAuth URL');
  return { authUrl, state };
}

// ──────────────────────────────────────────────────────────
//  OAuth Callbacks (code → token exchange)
// ──────────────────────────────────────────────────────────

/**
 * Handle the OAuth callback for Google Drive.
 * Exchanges the authorization code for tokens and stores them.
 *
 * @param {string} code - Authorization code from Google
 * @param {string} state - State token for CSRF validation
 * @returns {{ provider: string, email: string }}
 */
export async function handleGoogleCallback(code, state) {
  const { userId } = await validateState(state, 'google');

  const oauth2 = createGoogleOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  // Get the user's email from Google
  const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
  const { data: userInfo } = await oauth2Api.userinfo.get();

  // Create a folder in their Drive for DriveHive
  const drive = google.drive({ version: 'v3', auth: oauth2 });
  const folderRes = await drive.files.create({
    requestBody: {
      name: 'DriveHive',
      mimeType: 'application/vnd.google-apps.folder',
    },
  });

  // Store encrypted tokens
  await supabase.from('cloud_accounts').insert({
    user_id: userId,
    provider: 'google',
    email: userInfo.email,
    access_token: encrypt(tokens.access_token),
    refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
    token_expires_at: tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null,
    folder_id: folderRes.data.id,
  });

  // Clean up the state token
  await supabase.from('oauth_states').delete().eq('state', state);

  logger.info({ userId, email: userInfo.email }, 'Google Drive account connected');
  return { provider: 'google', email: userInfo.email };
}

/**
 * Handle the OAuth callback for Dropbox.
 * Exchanges the authorization code for tokens and stores them.
 *
 * @param {string} code - Authorization code from Dropbox
 * @param {string} state - State token for CSRF validation
 * @returns {{ provider: string, email: string }}
 */
export async function handleDropboxCallback(code, state) {
  const { userId } = await validateState(state, 'dropbox');

  const redirectUri = `${env.appUrl}/api/oauth/callback/dropbox`;

  // Exchange code for token using fetch (Dropbox SDK v10 approach)
  const tokenRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: env.dropbox.clientId,
      client_secret: env.dropbox.clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new ProviderError('dropbox', `Token exchange failed: ${err}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token || null;

  // Get user info
  const dbx = new Dropbox({ accessToken });
  const accountRes = await dbx.usersGetCurrentAccount();
  const email = accountRes.result.email;

  // Create a folder for DriveHive
  try {
    await dbx.filesCreateFolderV2({ path: '/DriveHive' });
  } catch (e) {
    // Folder might already exist — that's fine
    if (e?.error?.error?.['.tag'] !== 'path' ||
        e?.error?.error?.path?.['.tag'] !== 'conflict') {
      logger.warn({ error: e }, 'Could not create DriveHive folder (may already exist)');
    }
  }

  // Store encrypted tokens
  await supabase.from('cloud_accounts').insert({
    user_id: userId,
    provider: 'dropbox',
    email,
    access_token: encrypt(accessToken),
    refresh_token: refreshToken ? encrypt(refreshToken) : null,
    token_expires_at: tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null,
    base_path: '/DriveHive',
  });

  // Clean up the state token
  await supabase.from('oauth_states').delete().eq('state', state);

  logger.info({ userId, email }, 'Dropbox account connected');
  return { provider: 'dropbox', email };
}

// ──────────────────────────────────────────────────────────
//  Token Refresh
// ──────────────────────────────────────────────────────────

/**
 * Refresh an expired access token for a cloud account.
 * Updates the stored token in Supabase.
 *
 * @param {object} account - Cloud account row from Supabase
 * @returns {string} The new (decrypted) access token
 */
export async function refreshAccessToken(account) {
  if (account.provider === 'google') {
    return refreshGoogleToken(account);
  } else if (account.provider === 'dropbox') {
    return refreshDropboxToken(account);
  }
  throw new ProviderError(account.provider, 'Cannot refresh token for this provider');
}

async function refreshGoogleToken(account) {
  if (!account.refresh_token) {
    throw new ProviderError('google', 'No refresh token available — user must re-authorize');
  }

  const oauth2 = createGoogleOAuth2Client();
  oauth2.setCredentials({ refresh_token: decrypt(account.refresh_token) });

  const { credentials } = await oauth2.refreshAccessToken();
  const newAccessToken = credentials.access_token;

  // Update stored token
  await supabase
    .from('cloud_accounts')
    .update({
      access_token: encrypt(newAccessToken),
      token_expires_at: credentials.expiry_date
        ? new Date(credentials.expiry_date).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', account.id);

  logger.debug({ accountId: account.id }, 'Google token refreshed');
  return newAccessToken;
}

async function refreshDropboxToken(account) {
  if (!account.refresh_token) {
    throw new ProviderError('dropbox', 'No refresh token available — user must re-authorize');
  }

  const tokenRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decrypt(account.refresh_token),
      client_id: env.dropbox.clientId,
      client_secret: env.dropbox.clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    throw new ProviderError('dropbox', 'Failed to refresh token');
  }

  const data = await tokenRes.json();
  const newAccessToken = data.access_token;

  // Update stored token
  await supabase
    .from('cloud_accounts')
    .update({
      access_token: encrypt(newAccessToken),
      token_expires_at: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', account.id);

  logger.debug({ accountId: account.id }, 'Dropbox token refreshed');
  return newAccessToken;
}

// ──────────────────────────────────────────────────────────
//  Account Management
// ──────────────────────────────────────────────────────────

/**
 * Get all connected cloud accounts for a user.
 *
 * @param {string} userId
 * @returns {Array} List of cloud accounts (tokens excluded)
 */
export async function getConnectedAccounts(userId) {
  const { data, error } = await supabase
    .from('cloud_accounts')
    .select('id, provider, email, folder_id, base_path, created_at')
    .eq('user_id', userId);

  if (error) throw error;
  return data || [];
}

/**
 * Disconnect (delete) a cloud account.
 *
 * @param {string} userId
 * @param {string} accountId
 */
export async function disconnectAccount(userId, accountId) {
  const { error } = await supabase
    .from('cloud_accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', userId);

  if (error) throw error;
  logger.info({ userId, accountId }, 'Cloud account disconnected');
}

/**
 * Get a cloud account with decrypted access token, refreshing if expired.
 *
 * @param {object} account - Cloud account row from Supabase (with encrypted tokens)
 * @returns {object} Account with decrypted access_token field
 */
export async function getAccountWithValidToken(account) {
  const now = new Date();
  const expiresAt = account.token_expires_at
    ? new Date(account.token_expires_at)
    : null;

  let accessToken;

  // If token is expired (or will expire in the next 5 minutes), refresh it
  if (expiresAt && expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    accessToken = await refreshAccessToken(account);
  } else {
    accessToken = decrypt(account.access_token);
  }

  return { ...account, accessToken };
}

// ──────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────

/**
 * Create a Google OAuth2 client with the app's credentials.
 */
function createGoogleOAuth2Client() {
  return new google.auth.OAuth2(
    env.google.clientId,
    env.google.clientSecret,
    `${env.appUrl}/api/oauth/callback/google`
  );
}

/**
 * Validate an OAuth state token from the callback.
 * Ensures it exists, matches the provider, and hasn't expired.
 *
 * @param {string} state
 * @param {string} expectedProvider
 * @returns {{ userId: string }}
 */
async function validateState(state, expectedProvider) {
  const { data, error } = await supabase
    .from('oauth_states')
    .select('*')
    .eq('state', state)
    .single();

  if (error || !data) {
    throw new NotFoundError('Invalid or expired OAuth state token');
  }

  if (data.provider !== expectedProvider) {
    throw new NotFoundError('OAuth state token provider mismatch');
  }

  if (new Date(data.expires_at) < new Date()) {
    await supabase.from('oauth_states').delete().eq('state', state);
    throw new NotFoundError('OAuth state token has expired');
  }

  return { userId: data.user_id };
}
