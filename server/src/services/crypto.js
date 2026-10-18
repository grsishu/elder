import crypto from 'crypto';
import { config } from '../config.js';

// Derive a 32-byte key from sessionSecret or fallback
const SECRET_KEY = crypto.createHash('sha256').update(config.sessionSecret || 'smriti-saathi-secure-key-2026').digest();
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt a plaintext string using AES-256-GCM
 * Returns string format: ivHex:authTagHex:encryptedHex
 */
export function encryptHealthField(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string
 */
export function decryptHealthField(encryptedString) {
  if (!encryptedString || typeof encryptedString !== 'string') return null;
  const parts = encryptedString.split(':');
  if (parts.length !== 3) return null;

  try {
    const [ivHex, tagHex, contentHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(contentHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return null;
  }
}
