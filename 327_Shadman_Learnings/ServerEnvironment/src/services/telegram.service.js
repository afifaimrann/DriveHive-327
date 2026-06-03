import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import supabase from '../config/supabase.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { uploadFile, downloadFile } from './storage.service.js';

let bot = null;

// Rate limiting map: chatId -> Array of timestamps (in milliseconds)
const rateLimitMap = new Map();

/**
 * Checks if a chat is rate-limited for link code attempts.
 * Max 5 attempts per 60 seconds.
 * @param {string} chatId 
 * @returns {boolean} True if rate limited, false otherwise.
 */
export function isRateLimited(chatId) {
  const now = Date.now();
  const attempts = rateLimitMap.get(chatId) || [];
  
  // Filter attempts in the last 60 seconds
  const recentAttempts = attempts.filter(timestamp => now - timestamp < 60000);
  
  if (recentAttempts.length >= 5) {
    return true;
  }
  
  recentAttempts.push(now);
  rateLimitMap.set(chatId, recentAttempts);
  return false;
}

/**
 * Get profile linked to a telegram chat ID.
 * @param {string} chatId 
 * @returns {Promise<object|null>} Profile object or null
 */
async function getProfileByChatId(chatId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, email')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data;
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Escapes characters that have special meaning in HTML
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function startBot() {
  if (!env.telegram.token) {
    logger.warn('Telegram token is missing, Telegram bot will not start.');
    return null;
  }

  bot = new TelegramBot(env.telegram.token, { polling: true });
  logger.info('Telegram Bot initialized in polling mode');

  // /start and /help command
  bot.onText(/\/start|\/help/, async (msg) => {
    const chatId = msg.chat.id.toString();
    try {
      const profile = await getProfileByChatId(chatId);
      if (!profile) {
        bot.sendMessage(
          chatId,
          `👋 Welcome to DriveHive! Let's link your Telegram account.\n\n` +
          `1. Go to the DriveHive web dashboard.\n` +
          `2. Navigate to **Cloud Integration / Accounts** page.\n` +
          `3. Under **Telegram Bot Integration**, click **Link Telegram Bot** to generate your temporary 8-character code.\n` +
          `4. Paste that 8-character code here to connect your Telegram account.\n\n` +
          `Example: <code>ABC123XY</code>`,
          { parse_mode: 'HTML' }
        );
      } else {
        bot.sendMessage(
          chatId,
          `👋 Welcome back to DriveHive, <b>${escapeHtml(profile.username)}</b>!\n\n` +
          `You can use the following commands:\n` +
          `📁 /list - List your uploaded files\n` +
          `📥 /download &lt;file_id&gt; - Download a specific file\n` +
          `⚙️ /addstorage - Information on connecting storage nodes\n` +
          `🔌 /unlink - Unlink this bot from your DriveHive account\n\n` +
          `📎 <b>Hint</b>: You can also upload any document (up to 20MB) directly by dragging it here.`,
          { parse_mode: 'HTML' }
        );
      }
    } catch (err) {
      logger.error({ error: err, chatId }, 'Error in /start command');
      bot.sendMessage(chatId, '❌ An error occurred. Please try again later.');
    }
  });

  // /addstorage command
  bot.onText(/\/addstorage/, async (msg) => {
    const chatId = msg.chat.id.toString();
    bot.sendMessage(
      chatId,
      `⚙️ <b>How to Add Storage Nodes:</b>\n\n` +
      `To expand your unified storage pool, go to the <b>Accounts / Cloud Integration</b> page on the DriveHive website.\n` +
      `You can link:\n` +
      `• Google Drive (via OAuth)\n` +
      `• Dropbox (via OAuth)\n\n` +
      `Once linked, files uploaded through Telegram will be distributed automatically across your active nodes.`,
      { parse_mode: 'HTML' }
    );
  });

  // /unlink command
  bot.onText(/\/unlink/, async (msg) => {
    const chatId = msg.chat.id.toString();
    try {
      const profile = await getProfileByChatId(chatId);
      if (!profile) {
        bot.sendMessage(chatId, '❌ This Telegram account is not linked to any DriveHive profile.');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          telegram_chat_id: null,
          telegram_link_code: null,
          telegram_link_code_expires_at: null,
        })
        .eq('id', profile.id);

      if (error) throw error;

      bot.sendMessage(chatId, '🔌 Unlinked successfully! You will no longer receive files or list access. You can link again at any time.');
    } catch (err) {
      logger.error({ error: err, chatId }, 'Error in /unlink command');
      bot.sendMessage(chatId, '❌ An error occurred during unlinking.');
    }
  });

  // /list command
  bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id.toString();
    try {
      const profile = await getProfileByChatId(chatId);
      if (!profile) {
        bot.sendMessage(chatId, '❌ Please link your account first by entering your 8-character code.');
        return;
      }

      const { data: files, error } = await supabase
        .from('files')
        .select('id, name, size, uploaded_at')
        .eq('user_id', profile.id)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;

      if (!files || files.length === 0) {
        bot.sendMessage(chatId, '📁 No files uploaded yet. Drag and drop a file here to upload it!');
        return;
      }

      let responseText = `📁 <b>Your Unified Files:</b>\n\n`;
      files.forEach((file, index) => {
        const sizeStr = formatBytes(file.size);
        if (file.size > 50 * 1024 * 1024) {
          responseText += `${index + 1}. <b>${escapeHtml(file.name)}</b>\n` +
                          `└ size: <code>${sizeStr}</code> | ⚠️ <i>&gt;50MB (Not downloadable via Telegram)</i>\n\n`;
        } else {
          responseText += `${index + 1}. <b>${escapeHtml(file.name)}</b>\n` +
                          `└ size: <code>${sizeStr}</code> | ID: <code>${file.id}</code>\n\n`;
        }
      });
      responseText += `📥 To download a file, send:\n/download <code>file_id</code>`;

      bot.sendMessage(chatId, responseText, { parse_mode: 'HTML' });
    } catch (err) {
      logger.error({ error: err, chatId }, 'Error in /list command');
      bot.sendMessage(chatId, '❌ Failed to retrieve files.');
    }
  });

  // /download command
  bot.onText(/\/download(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    const fileId = match[1]?.trim();

    if (!fileId) {
      bot.sendMessage(chatId, '⚠️ Please specify a file ID. Example: /download <code>FILE_UUID</code>', { parse_mode: 'HTML' });
      return;
    }

    try {
      const profile = await getProfileByChatId(chatId);
      if (!profile) {
        bot.sendMessage(chatId, '❌ Please link your account first.');
        return;
      }

      // Check if file exists and belongs to this user
      const { data: fileRecord, error } = await supabase
        .from('files')
        .select('name, size')
        .eq('id', fileId)
        .eq('user_id', profile.id)
        .single();

      if (error || !fileRecord) {
        bot.sendMessage(chatId, '❌ File not found or access denied.');
        return;
      }

      if (fileRecord.size > 50 * 1024 * 1024) {
        bot.sendMessage(chatId, '❌ Telegram bot API limits outgoing file size to 50MB. This file is too large to send via Telegram.');
        return;
      }

      bot.sendMessage(chatId, `⏳ Downloading <b>${escapeHtml(fileRecord.name)}</b> from unified cloud storage...`, { parse_mode: 'HTML' });

      // Create a temporary path
      const tempDir = path.join(process.cwd(), 'downloads');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const tempFilePath = path.join(tempDir, `${Date.now()}-${fileRecord.name}`);
      const writeStream = fs.createWriteStream(tempFilePath);

      // Download file chunks to writeStream
      await downloadFile(profile.id, fileId, writeStream);

      // Send to user
      await bot.sendDocument(chatId, tempFilePath, {}, { filename: fileRecord.name });

      // Clean up temp file
      fs.unlink(tempFilePath, (err) => {
        if (err) logger.error({ error: err, path: tempFilePath }, 'Failed to delete temp file');
      });
    } catch (err) {
      logger.error({ error: err, chatId, fileId }, 'Error in /download command');
      bot.sendMessage(chatId, '❌ Failed to download file from cloud nodes.');
    }
  });

  // Handle document upload
  bot.on('document', async (msg) => {
    const chatId = msg.chat.id.toString();
    const doc = msg.document;

    try {
      const profile = await getProfileByChatId(chatId);
      if (!profile) {
        bot.sendMessage(chatId, '❌ Please link your account first before uploading.');
        return;
      }

      // Check size limit: 20MB
      if (doc.file_size > 20 * 1024 * 1024) {
        bot.sendMessage(chatId, '❌ File exceeds 20MB limit. The Telegram Bot API restricts uploads to 20MB.');
        return;
      }

      bot.sendMessage(chatId, `⏳ Downloading <b>${escapeHtml(doc.file_name)}</b> from Telegram...`, { parse_mode: 'HTML' });

      // Download the document to a local temp path
      const tempDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const localFilePath = await bot.downloadFile(doc.file_id, tempDir);

      bot.sendMessage(chatId, `📤 Distributing chunks across your unified storage...`);

      // Prepare file object matching Multer signature
      const filePayload = {
        originalname: doc.file_name,
        mimetype: doc.mime_type || 'application/octet-stream',
        size: doc.file_size,
        path: localFilePath,
      };

      await uploadFile(profile.id, filePayload);

      bot.sendMessage(chatId, `✅ <b>${escapeHtml(doc.file_name)}</b> successfully distributed and stored in your unified cloud pool!`, { parse_mode: 'HTML' });

      // Clean up temp file
      fs.unlink(localFilePath, (err) => {
        if (err) logger.error({ error: err, path: localFilePath }, 'Failed to delete temp uploaded file');
      });
    } catch (err) {
      logger.error({ error: err, chatId }, 'Error in document upload');
      bot.sendMessage(chatId, '❌ Failed to upload document. Please ensure you have connected storage nodes with enough space.');
    }
  });

  // Handle linking code entry (8-character uppercase alphanumeric strings)
  bot.on('message', async (msg) => {
    const text = msg.text?.trim();
    if (!text || text.startsWith('/')) return;

    const chatId = msg.chat.id.toString();

    // Check if input fits 8-character uppercase alphanumeric format
    const codeRegex = /^[A-Z0-9]{8}$/;
    if (!codeRegex.test(text)) {
      // If it is an unlinked user attempting something, warn them about format.
      const profile = await getProfileByChatId(chatId);
      if (!profile) {
        bot.sendMessage(
          chatId,
          `⚠️ Invalid code format. The link code must be exactly 8 uppercase alphanumeric characters.\n` +
          `Example: <code>ABC123XY</code>`,
          { parse_mode: 'HTML' }
        );
      }
      return;
    }

    // Apply Rate Limiting
    if (isRateLimited(chatId)) {
      bot.sendMessage(chatId, '⚠️ Too many connection attempts. Please wait 1 minute before trying again.');
      return;
    }

    try {
      const now = new Date().toISOString();

      // Look up profile with matching unexpired link code
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('telegram_link_code', text)
        .gt('telegram_link_code_expires_at', now)
        .maybeSingle();

      if (error || !profile) {
        bot.sendMessage(chatId, '❌ Invalid or expired link code. Please generate a new code on the web dashboard.');
        return;
      }

      // Link the profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          telegram_chat_id: chatId,
          telegram_link_code: null,
          telegram_link_code_expires_at: null,
        })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      bot.sendMessage(
        chatId,
        `✅ <b>Success!</b> Your Telegram account has been linked to the DriveHive user <b>${escapeHtml(profile.username)}</b>.\n\n` +
        `You can now upload files directly here or use /list to browse files.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      logger.error({ error: err, chatId, code: text }, 'Error processing link code');
      bot.sendMessage(chatId, '❌ An error occurred while linking your account.');
    }
  });

  return bot;
}

export function stopBot() {
  if (bot) {
    bot.stopPolling();
    logger.info('Telegram Bot polling stopped');
    bot = null;
  }
}
