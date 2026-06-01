import crypto from 'crypto';
import env from '../config/env.js';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const KEY = Buffer.from(env.encryption.key, 'hex');

/**
 * Encrypt a plaintext string using AES-256-CBC.
 * Returns a string in the format: iv:encryptedData
 *
 * @param {string} text - The plaintext to encrypt
 * @returns {string} The encrypted string (iv:ciphertext)
 */
export function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt an encrypted string produced by encrypt().
 *
 * @param {string} encryptedText - The encrypted string (iv:ciphertext)
 * @returns {string} The decrypted plaintext
 */
export function decrypt(encryptedText) {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const ciphertext = Buffer.from(parts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
