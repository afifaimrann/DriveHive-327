import express from 'express';
import {
  getOAuthUrl,
  handleGoogleCallback,
  handleDropboxCallback,
  getConnectedAccounts,
  disconnectAccount,
} from '../services/oauth.service.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * GET /api/oauth/connect/:provider
 * Generate an OAuth authorization URL for the user.
 */
router.get('/connect/:provider', authenticate, async (req, res, next) => {
  try {
    const { provider } = req.params;
    const { authUrl } = await getOAuthUrl(req.userId, provider);
    res.status(200).json({ authUrl });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/oauth/callback/google
 * Google Drive OAuth redirection endpoint.
 */
router.get('/callback/google', async (req, res, next) => {
  try {
    const { code, state } = req.query;
    await handleGoogleCallback(code, state);

    res.send(`
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #0f172a; color: #f1f5f9; }
            .container { text-align: center; background: rgba(30, 41, 59, 0.7); padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #334155; }
            h2 { color: #10b981; margin-top: 0; }
            p { color: #94a3b8; }
            button { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 1rem; margin-top: 15px; }
            button:hover { background: #2563eb; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Connection Successful!</h2>
            <p>Your Google Drive account has been connected to DriveHive.</p>
            <p>You can close this window now.</p>
            <button onclick="window.close()">Close Window</button>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/oauth/callback/dropbox
 * Dropbox OAuth redirection endpoint.
 */
router.get('/callback/dropbox', async (req, res, next) => {
  try {
    const { code, state } = req.query;
    await handleDropboxCallback(code, state);

    res.send(`
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #0f172a; color: #f1f5f9; }
            .container { text-align: center; background: rgba(30, 41, 59, 0.7); padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #334155; }
            h2 { color: #10b981; margin-top: 0; }
            p { color: #94a3b8; }
            button { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 1rem; margin-top: 15px; }
            button:hover { background: #2563eb; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Connection Successful!</h2>
            <p>Your Dropbox account has been connected to DriveHive.</p>
            <p>You can close this window now.</p>
            <button onclick="window.close()">Close Window</button>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/oauth/accounts
 * List all connected storage accounts for the authenticated user.
 */
router.get('/accounts', authenticate, async (req, res, next) => {
  try {
    const accounts = await getConnectedAccounts(req.userId);
    res.status(200).json({ accounts });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/oauth/accounts/:accountId
 * Disconnect a cloud storage account.
 */
router.delete('/accounts/:accountId', authenticate, async (req, res, next) => {
  try {
    const { accountId } = req.params;
    await disconnectAccount(req.userId, accountId);
    res.status(200).json({ message: 'Cloud storage account disconnected successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
