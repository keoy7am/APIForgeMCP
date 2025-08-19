import { createHash, randomBytes, scrypt, createCipheriv, createDecipheriv } from 'crypto';
import { promisify } from 'util';
import { Logger } from '../../utils/logger';
import { ValidationError } from '../../utils/errors';

const scryptAsync = promisify(scrypt);

/**
 * Encryption Service
 * 
 * Provides secure encryption and decryption for sensitive environment variables.
 * Uses AES-256-CBC encryption with scrypt key derivation.
 */
export class EncryptionService {
  private logger: Logger;
  private algorithm = 'aes-256-cbc';
  private keyLength = 32;
  private ivLength = 16;
  private saltLength = 16;

  constructor() {
    this.logger = new Logger('EncryptionService');
  }

  /**
   * Encrypt a value using the provided key
   */
  async encrypt(value: string, encryptionKey: string): Promise<string> {
    try {
      if (!value || !encryptionKey) {
        throw new ValidationError('Value and encryption key are required');
      }

      // Generate salt and IV
      const salt = randomBytes(this.saltLength);
      const iv = randomBytes(this.ivLength);

      // Derive key from password using scrypt
      const key = (await scryptAsync(encryptionKey, salt, this.keyLength)) as Buffer;

      // Create cipher
      const cipher = createCipheriv(this.algorithm, key, iv);

      // Encrypt the value
      let encrypted = cipher.update(value, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Combine salt, IV, and encrypted data
      const result = salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;

      this.logger.debug('Value encrypted successfully');
      return result;

    } catch (error) {
      this.logger.error('Encryption failed:', error);
      throw new ValidationError(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt a value using the provided key
   */
  async decrypt(encryptedValue: string, encryptionKey: string): Promise<string> {
    try {
      if (!encryptedValue || !encryptionKey) {
        throw new ValidationError('Encrypted value and encryption key are required');
      }

      // Parse the encrypted data
      const parts = encryptedValue.split(':');
      if (parts.length !== 3) {
        throw new ValidationError('Invalid encrypted data format');
      }

      const salt = Buffer.from(parts[0] || '', 'hex');
      const iv = Buffer.from(parts[1] || '', 'hex');
      const encrypted = parts[2] || '';

      // Validate component lengths
      if (salt.length !== this.saltLength || iv.length !== this.ivLength) {
        throw new ValidationError('Invalid salt or IV length');
      }

      // Derive key from password using scrypt
      const key = (await scryptAsync(encryptionKey, salt, this.keyLength)) as Buffer;

      // Create decipher
      const decipher = createDecipheriv(this.algorithm, key, iv);

      // Decrypt the value
      let decrypted = decipher.update(encrypted || '', 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      this.logger.debug('Value decrypted successfully');
      return decrypted;

    } catch (error) {
      this.logger.error('Decryption failed:', error);
      throw new ValidationError(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a secure encryption key
   */
  generateEncryptionKey(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Validate encryption key format
   */
  validateEncryptionKey(key: string): boolean {
    try {
      if (!key || key.length < 32) {
        return false;
      }

      // Check if it's a valid hex string
      const hexPattern = /^[0-9a-fA-F]+$/;
      return hexPattern.test(key) && key.length % 2 === 0;
    } catch {
      return false;
    }
  }

  /**
   * Check if a value is encrypted (basic format check)
   */
  isEncrypted(value: string): boolean {
    try {
      if (!value || typeof value !== 'string') {
        return false;
      }

      // Check for encrypted format: salt:iv:data
      const parts = value.split(':');
      if (parts.length !== 3) {
        return false;
      }

      // Validate hex format
      const hexPattern = /^[0-9a-fA-F]+$/;
      return parts.every(part => hexPattern.test(part) && part.length > 0);
    } catch {
      return false;
    }
  }

  /**
   * Safely handle encryption/decryption errors
   */
  async safeEncrypt(value: string, encryptionKey?: string): Promise<{ encrypted: string; success: boolean; error?: string }> {
    try {
      if (!encryptionKey) {
        return { encrypted: value, success: false, error: 'No encryption key provided' };
      }

      const encrypted = await this.encrypt(value, encryptionKey);
      return { encrypted, success: true };
    } catch (error) {
      return {
        encrypted: value,
        success: false,
        error: error instanceof Error ? error.message : 'Encryption failed'
      };
    }
  }

  /**
   * Safely handle decryption with fallback
   */
  async safeDecrypt(encryptedValue: string, encryptionKey?: string): Promise<{ decrypted: string; success: boolean; error?: string }> {
    try {
      if (!encryptionKey) {
        return { decrypted: encryptedValue, success: false, error: 'No encryption key provided' };
      }

      if (!this.isEncrypted(encryptedValue)) {
        return { decrypted: encryptedValue, success: true };
      }

      const decrypted = await this.decrypt(encryptedValue, encryptionKey);
      return { decrypted, success: true };
    } catch (error) {
      return {
        decrypted: encryptedValue,
        success: false,
        error: error instanceof Error ? error.message : 'Decryption failed'
      };
    }
  }

  /**
   * Create a hash of the encryption key for verification
   */
  async createKeyHash(encryptionKey: string): Promise<string> {
    try {
      const salt = randomBytes(16);
      const hash = (await scryptAsync(encryptionKey, salt, 32)) as Buffer;
      return salt.toString('hex') + ':' + hash.toString('hex');
    } catch (error) {
      throw new ValidationError(`Failed to create key hash: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify an encryption key against its hash
   */
  async verifyKeyHash(encryptionKey: string, keyHash: string): Promise<boolean> {
    try {
      const parts = keyHash.split(':');
      if (parts.length !== 2) {
        return false;
      }

      const salt = Buffer.from(parts[0] || '', 'hex');
      const expectedHash = Buffer.from(parts[1] || '', 'hex');
      const actualHash = (await scryptAsync(encryptionKey, salt, 32)) as Buffer;

      return actualHash.equals(expectedHash);
    } catch {
      return false;
    }
  }

  /**
   * Generate a simple hash for non-sensitive data
   */
  createHash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }
}