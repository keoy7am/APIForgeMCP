/**
 * Tests for EncryptionService
 */

import { jest } from '@jest/globals';
import { EncryptionService } from '../../../src/services/environment/encryption.service';
import { TestAssertions } from '../../utils/test-utils';
import { TestDataManager, testIsolationHelpers } from '../../utils/test-isolation';
import { ValidationError, ConfigurationError } from '../../../src/services/error';
import crypto from 'crypto';

describe('EncryptionService', () => {
  let encryptionService: EncryptionService;
  let testDataManager: TestDataManager;
  const testKey = 'test-encryption-key-32-characters!!';
  const testData = 'sensitive-data-to-encrypt';

  beforeEach(async () => {
    testDataManager = await testIsolationHelpers.beforeEach();
    encryptionService = new EncryptionService();
  });

  afterEach(async () => {
    await testIsolationHelpers.afterEach(testDataManager);
  });

  afterAll(async () => {
    await testIsolationHelpers.afterAll();
  });

  describe('Key Management', () => {
    describe('generateKey', () => {
      it('should generate a cryptographically secure key', () => {
        const key1 = encryptionService.generateKey();
        const key2 = encryptionService.generateKey();

        expect(key1).toHaveLength(32); // 256-bit key
        expect(key2).toHaveLength(32);
        expect(key1).not.toBe(key2); // Should be different each time
        expect(Buffer.isBuffer(key1)).toBe(true);
      });

      it('should generate keys with different lengths', () => {
        const key128 = encryptionService.generateKey(128);
        const key256 = encryptionService.generateKey(256);
        const key512 = encryptionService.generateKey(512);

        expect(key128).toHaveLength(16); // 128-bit
        expect(key256).toHaveLength(32); // 256-bit
        expect(key512).toHaveLength(64); // 512-bit
      });

      it('should validate key length requirements', () => {
        expect(() => encryptionService.generateKey(64)).toThrow(ValidationError);
        expect(() => encryptionService.generateKey(1024)).toThrow(ValidationError);
      });
    });

    describe('validateKey', () => {
      it('should validate correct key formats', () => {
        const validKeys = [
          Buffer.from(testKey, 'utf8'),
          testKey,
          'a'.repeat(32), // 32-character string
          Buffer.alloc(32), // 32-byte buffer
        ];

        validKeys.forEach(key => {
          expect(encryptionService.validateKey(key)).toBe(true);
        });
      });

      it('should reject invalid key formats', () => {
        const invalidKeys = [
          '', // empty string
          'short', // too short
          'a'.repeat(31), // 31 characters (too short)
          'a'.repeat(33), // 33 characters (too long)
          null,
          undefined,
          123,
          {},
          [],
        ];

        invalidKeys.forEach(key => {
          expect(encryptionService.validateKey(key as any)).toBe(false);
        });
      });

      it('should validate key strength', () => {
        const weakKeys = [
          '0'.repeat(32), // all zeros
          'a'.repeat(32), // all same character
          '12345678901234567890123456789012', // predictable pattern
        ];

        weakKeys.forEach(key => {
          expect(encryptionService.validateKey(key, { checkStrength: true })).toBe(false);
        });
      });
    });

    describe('deriveKey', () => {
      it('should derive consistent keys from password', () => {
        const password = 'user-password';
        const salt = 'consistent-salt';

        const key1 = encryptionService.deriveKey(password, salt);
        const key2 = encryptionService.deriveKey(password, salt);

        expect(key1).toEqual(key2);
        expect(Buffer.isBuffer(key1)).toBe(true);
        expect(key1).toHaveLength(32);
      });

      it('should produce different keys with different salts', () => {
        const password = 'user-password';
        const salt1 = 'salt-one';
        const salt2 = 'salt-two';

        const key1 = encryptionService.deriveKey(password, salt1);
        const key2 = encryptionService.deriveKey(password, salt2);

        expect(key1).not.toEqual(key2);
      });

      it('should use configurable iterations', () => {
        const password = 'user-password';
        const salt = 'test-salt';

        const key1 = encryptionService.deriveKey(password, salt, { iterations: 1000 });
        const key2 = encryptionService.deriveKey(password, salt, { iterations: 10000 });

        expect(key1).not.toEqual(key2);
      });
    });
  });

  describe('Encryption Operations', () => {
    describe('encrypt', () => {
      it('should encrypt data successfully', async () => {
        const encrypted = await encryptionService.encrypt(testData, testKey);

        expect(encrypted).toBeDefined();
        expect(typeof encrypted).toBe('string');
        expect(encrypted).not.toBe(testData);
        expect(encrypted.length).toBeGreaterThan(testData.length);
      });

      it('should produce different ciphertext for same data', async () => {
        const encrypted1 = await encryptionService.encrypt(testData, testKey);
        const encrypted2 = await encryptionService.encrypt(testData, testKey);

        expect(encrypted1).not.toBe(encrypted2); // Due to random IV
      });

      it('should handle different data types', async () => {
        const testCases = [
          'simple string',
          JSON.stringify({ key: 'value', number: 123 }),
          Buffer.from('binary data').toString('base64'),
          'unicode text: 测试文本 🚀',
          '', // empty string
        ];

        for (const data of testCases) {
          const encrypted = await encryptionService.encrypt(data, testKey);
          expect(encrypted).toBeDefined();
          expect(typeof encrypted).toBe('string');
        }
      });

      it('should handle large data', async () => {
        const largeData = 'x'.repeat(10000);
        const encrypted = await encryptionService.encrypt(largeData, testKey);

        expect(encrypted).toBeDefined();
        expect(encrypted.length).toBeGreaterThan(largeData.length);
      });

      it('should validate key before encryption', async () => {
        await TestAssertions.expectRejectsWithError(
          encryptionService.encrypt(testData, 'invalid-key'),
          ValidationError,
          'Invalid encryption key'
        );
      });

      it('should handle encryption with different algorithms', async () => {
        const algorithms = ['aes-256-gcm', 'aes-256-cbc', 'aes-192-gcm'];

        for (const algorithm of algorithms) {
          const encrypted = await encryptionService.encrypt(testData, testKey, { algorithm });
          expect(encrypted).toBeDefined();
          expect(typeof encrypted).toBe('string');
        }
      });
    });

    describe('decrypt', () => {
      it('should decrypt data successfully', async () => {
        const encrypted = await encryptionService.encrypt(testData, testKey);
        const decrypted = await encryptionService.decrypt(encrypted, testKey);

        expect(decrypted).toBe(testData);
      });

      it('should handle different encrypted data formats', async () => {
        const testCases = [
          'simple string',
          JSON.stringify({ complex: 'object', with: ['array', 123, true] }),
          'unicode: 测试 🎉',
          '', // empty string
        ];

        for (const originalData of testCases) {
          const encrypted = await encryptionService.encrypt(originalData, testKey);
          const decrypted = await encryptionService.decrypt(encrypted, testKey);
          expect(decrypted).toBe(originalData);
        }
      });

      it('should handle large encrypted data', async () => {
        const largeData = 'large data '.repeat(1000);
        const encrypted = await encryptionService.encrypt(largeData, testKey);
        const decrypted = await encryptionService.decrypt(encrypted, testKey);

        expect(decrypted).toBe(largeData);
      });

      it('should reject invalid encrypted data', async () => {
        const invalidData = [
          'not-encrypted-data',
          'invalid-base64-!@#$',
          '',
          'too-short',
        ];

        for (const data of invalidData) {
          await TestAssertions.expectRejectsWithError(
            encryptionService.decrypt(data, testKey),
            ConfigurationError,
            'Invalid encrypted data format'
          );
        }
      });

      it('should reject wrong decryption key', async () => {
        const encrypted = await encryptionService.encrypt(testData, testKey);
        const wrongKey = 'wrong-encryption-key-32-chars!!!';

        await TestAssertions.expectRejectsWithError(
          encryptionService.decrypt(encrypted, wrongKey),
          ConfigurationError,
          'Failed to decrypt data'
        );
      });

      it('should handle corrupted encrypted data', async () => {
        const encrypted = await encryptionService.encrypt(testData, testKey);
        const corrupted = encrypted.slice(0, -10) + 'corrupted';

        await TestAssertions.expectRejectsWithError(
          encryptionService.decrypt(corrupted, testKey),
          ConfigurationError,
          'Failed to decrypt data'
        );
      });
    });

    describe('encryptObject', () => {
      it('should encrypt object properties selectively', async () => {
        const obj = {
          publicData: 'not encrypted',
          sensitiveField: 'encrypt this',
          nestedObject: {
            publicNested: 'not encrypted',
            sensitiveNested: 'encrypt this too',
          },
          arrayField: ['item1', 'sensitive-item', 'item3'],
        };

        const fieldsToEncrypt = ['sensitiveField', 'nestedObject.sensitiveNested', 'arrayField.1'];

        const encrypted = await encryptionService.encryptObject(obj, testKey, fieldsToEncrypt);

        expect(encrypted.publicData).toBe('not encrypted');
        expect(encrypted.sensitiveField).not.toBe('encrypt this');
        expect(encrypted.nestedObject.publicNested).toBe('not encrypted');
        expect(encrypted.nestedObject.sensitiveNested).not.toBe('encrypt this too');
        expect(encrypted.arrayField[0]).toBe('item1');
        expect(encrypted.arrayField[1]).not.toBe('sensitive-item');
        expect(encrypted.arrayField[2]).toBe('item3');
      });

      it('should handle complex nested objects', async () => {
        const complexObj = {
          user: {
            id: '123',
            profile: {
              name: 'John Doe',
              email: 'john@example.com', // Should be encrypted
              settings: {
                theme: 'dark',
                apiKey: 'secret-api-key', // Should be encrypted
              },
            },
          },
          metadata: {
            created: new Date(),
            tokens: ['token1', 'secret-token-2', 'token3'], // tokens.1 should be encrypted
          },
        };

        const fieldsToEncrypt = [
          'user.profile.email',
          'user.profile.settings.apiKey',
          'metadata.tokens.1',
        ];

        const encrypted = await encryptionService.encryptObject(complexObj, testKey, fieldsToEncrypt);

        expect(encrypted.user.id).toBe('123');
        expect(encrypted.user.profile.name).toBe('John Doe');
        expect(encrypted.user.profile.email).not.toBe('john@example.com');
        expect(encrypted.user.profile.settings.theme).toBe('dark');
        expect(encrypted.user.profile.settings.apiKey).not.toBe('secret-api-key');
        expect(encrypted.metadata.tokens[0]).toBe('token1');
        expect(encrypted.metadata.tokens[1]).not.toBe('secret-token-2');
        expect(encrypted.metadata.tokens[2]).toBe('token3');
      });
    });

    describe('decryptObject', () => {
      it('should decrypt object properties selectively', async () => {
        const obj = {
          publicData: 'not encrypted',
          sensitiveField: 'encrypt this',
          nestedObject: {
            publicNested: 'not encrypted',
            sensitiveNested: 'encrypt this too',
          },
        };

        const fieldsToEncrypt = ['sensitiveField', 'nestedObject.sensitiveNested'];

        const encrypted = await encryptionService.encryptObject(obj, testKey, fieldsToEncrypt);
        const decrypted = await encryptionService.decryptObject(encrypted, testKey, fieldsToEncrypt);

        expect(decrypted).toEqual(obj);
      });
    });
  });

  describe('Hashing Operations', () => {
    describe('hash', () => {
      it('should generate consistent hashes', () => {
        const data = 'data to hash';
        const hash1 = encryptionService.hash(data);
        const hash2 = encryptionService.hash(data);

        expect(hash1).toBe(hash2);
        expect(typeof hash1).toBe('string');
        expect(hash1.length).toBeGreaterThan(0);
      });

      it('should produce different hashes for different data', () => {
        const hash1 = encryptionService.hash('data1');
        const hash2 = encryptionService.hash('data2');

        expect(hash1).not.toBe(hash2);
      });

      it('should support different hash algorithms', () => {
        const data = 'test data';
        const algorithms = ['sha256', 'sha512', 'sha1', 'md5'];

        algorithms.forEach(algorithm => {
          const hash = encryptionService.hash(data, algorithm);
          expect(hash).toBeDefined();
          expect(typeof hash).toBe('string');
        });
      });

      it('should handle different data types', () => {
        const testCases = [
          'string data',
          Buffer.from('buffer data'),
          JSON.stringify({ object: 'data' }),
          '', // empty string
        ];

        testCases.forEach(data => {
          const hash = encryptionService.hash(data);
          expect(hash).toBeDefined();
          expect(typeof hash).toBe('string');
        });
      });
    });

    describe('verifyHash', () => {
      it('should verify correct hashes', () => {
        const data = 'data to verify';
        const hash = encryptionService.hash(data);

        expect(encryptionService.verifyHash(data, hash)).toBe(true);
      });

      it('should reject incorrect hashes', () => {
        const data = 'original data';
        const hash = encryptionService.hash(data);
        const wrongData = 'wrong data';

        expect(encryptionService.verifyHash(wrongData, hash)).toBe(false);
      });

      it('should handle corrupted hashes', () => {
        const data = 'test data';
        const hash = encryptionService.hash(data);
        const corruptedHash = hash.slice(0, -5) + 'xxxxx';

        expect(encryptionService.verifyHash(data, corruptedHash)).toBe(false);
      });
    });

    describe('hmac', () => {
      it('should generate HMAC with key', () => {
        const data = 'data for hmac';
        const key = 'hmac-key';

        const hmac1 = encryptionService.hmac(data, key);
        const hmac2 = encryptionService.hmac(data, key);

        expect(hmac1).toBe(hmac2);
        expect(typeof hmac1).toBe('string');
      });

      it('should produce different HMACs with different keys', () => {
        const data = 'same data';
        const key1 = 'key1';
        const key2 = 'key2';

        const hmac1 = encryptionService.hmac(data, key1);
        const hmac2 = encryptionService.hmac(data, key2);

        expect(hmac1).not.toBe(hmac2);
      });

      it('should verify HMAC correctly', () => {
        const data = 'data to verify';
        const key = 'verification-key';
        const hmac = encryptionService.hmac(data, key);

        expect(encryptionService.verifyHmac(data, hmac, key)).toBe(true);
        expect(encryptionService.verifyHmac('wrong data', hmac, key)).toBe(false);
        expect(encryptionService.verifyHmac(data, hmac, 'wrong key')).toBe(false);
      });
    });
  });

  describe('Advanced Features', () => {
    describe('keyRotation', () => {
      it('should rotate encryption keys', async () => {
        const oldKey = testKey;
        const newKey = 'new-encryption-key-32-characters!';

        // Encrypt with old key
        const encrypted = await encryptionService.encrypt(testData, oldKey);

        // Rotate to new key
        const rotated = await encryptionService.rotateKey(encrypted, oldKey, newKey);

        // Verify can decrypt with new key
        const decrypted = await encryptionService.decrypt(rotated, newKey);
        expect(decrypted).toBe(testData);

        // Verify cannot decrypt with old key
        await TestAssertions.expectRejectsWithError(
          encryptionService.decrypt(rotated, oldKey),
          ConfigurationError,
          'Failed to decrypt data'
        );
      });

      it('should batch rotate multiple encrypted values', async () => {
        const oldKey = testKey;
        const newKey = 'new-encryption-key-32-characters!';
        const testValues = ['value1', 'value2', 'value3'];

        // Encrypt all values with old key
        const encrypted = await Promise.all(
          testValues.map(value => encryptionService.encrypt(value, oldKey))
        );

        // Batch rotate
        const rotated = await encryptionService.batchRotateKeys(encrypted, oldKey, newKey);

        // Verify all can be decrypted with new key
        const decrypted = await Promise.all(
          rotated.map(value => encryptionService.decrypt(value, newKey))
        );

        expect(decrypted).toEqual(testValues);
      });
    });

    describe('secureRandom', () => {
      it('should generate cryptographically secure random values', () => {
        const random1 = encryptionService.secureRandom(32);
        const random2 = encryptionService.secureRandom(32);

        expect(random1).toHaveLength(32);
        expect(random2).toHaveLength(32);
        expect(random1).not.toEqual(random2);
        expect(Buffer.isBuffer(random1)).toBe(true);
      });

      it('should generate different lengths', () => {
        const lengths = [16, 32, 64, 128];

        lengths.forEach(length => {
          const random = encryptionService.secureRandom(length);
          expect(random).toHaveLength(length);
        });
      });
    });

    describe('passwordHashing', () => {
      it('should hash passwords securely', async () => {
        const password = 'user-password-123';
        const hashed = await encryptionService.hashPassword(password);

        expect(hashed).toBeDefined();
        expect(typeof hashed).toBe('string');
        expect(hashed).not.toBe(password);
        expect(hashed.length).toBeGreaterThan(password.length);
      });

      it('should verify passwords correctly', async () => {
        const password = 'user-password-123';
        const hashed = await encryptionService.hashPassword(password);

        const isValid = await encryptionService.verifyPassword(password, hashed);
        const isInvalid = await encryptionService.verifyPassword('wrong-password', hashed);

        expect(isValid).toBe(true);
        expect(isInvalid).toBe(false);
      });

      it('should use configurable salt rounds', async () => {
        const password = 'test-password';
        
        const hash1 = await encryptionService.hashPassword(password, { saltRounds: 10 });
        const hash2 = await encryptionService.hashPassword(password, { saltRounds: 12 });

        expect(hash1).not.toBe(hash2);
        
        expect(await encryptionService.verifyPassword(password, hash1)).toBe(true);
        expect(await encryptionService.verifyPassword(password, hash2)).toBe(true);
      });
    });
  });

  describe('Security and Performance', () => {
    describe('timing attack resistance', () => {
      it('should have consistent timing for hash verification', () => {
        const data = 'test data';
        const hash = encryptionService.hash(data);
        const iterations = 100;

        const times: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const start = process.hrtime.bigint();
          encryptionService.verifyHash(data, hash);
          const end = process.hrtime.bigint();
          times.push(Number(end - start));
        }

        const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
        const variance = times.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / times.length;
        const standardDeviation = Math.sqrt(variance);

        // Standard deviation should be small relative to average time
        expect(standardDeviation / avgTime).toBeLessThan(0.5);
      });
    });

    describe('memory management', () => {
      it('should clear sensitive data from memory', () => {
        const sensitiveData = 'very-sensitive-data';
        const buffer = Buffer.from(sensitiveData);

        encryptionService.clearMemory(buffer);

        // Buffer should be zeroed out
        expect(buffer.every(byte => byte === 0)).toBe(true);
      });
    });

    describe('performance benchmarks', () => {
      it('should encrypt/decrypt within performance limits', async () => {
        const largeData = 'x'.repeat(10000);
        
        const encryptStart = Date.now();
        const encrypted = await encryptionService.encrypt(largeData, testKey);
        const encryptTime = Date.now() - encryptStart;

        const decryptStart = Date.now();
        const decrypted = await encryptionService.decrypt(encrypted, testKey);
        const decryptTime = Date.now() - decryptStart;

        expect(decrypted).toBe(largeData);
        expect(encryptTime).toBeLessThan(1000); // Less than 1 second
        expect(decryptTime).toBeLessThan(1000); // Less than 1 second
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete encryption workflow', async () => {
      // Generate a secure key
      const key = encryptionService.generateKey();
      expect(encryptionService.validateKey(key)).toBe(true);

      // Encrypt sensitive configuration
      const config = {
        database: {
          host: 'localhost',
          password: 'super-secret-password',
          ssl: true,
        },
        apiKeys: {
          stripe: 'sk_live_12345',
          sendgrid: 'SG.12345.abcdef',
        },
        oauth: {
          clientSecret: 'oauth-client-secret',
          redirectUri: 'https://app.example.com/callback',
        },
      };

      const sensitiveFields = [
        'database.password',
        'apiKeys.stripe',
        'apiKeys.sendgrid',
        'oauth.clientSecret',
      ];

      const encrypted = await encryptionService.encryptObject(config, key, sensitiveFields);

      // Verify sensitive fields are encrypted
      expect(encrypted.database.password).not.toBe('super-secret-password');
      expect(encrypted.apiKeys.stripe).not.toBe('sk_live_12345');
      expect(encrypted.oauth.redirectUri).toBe('https://app.example.com/callback'); // Not encrypted

      // Decrypt and verify
      const decrypted = await encryptionService.decryptObject(encrypted, key, sensitiveFields);
      expect(decrypted).toEqual(config);

      // Generate hash for integrity verification
      const configHash = encryptionService.hash(JSON.stringify(config));
      expect(encryptionService.verifyHash(JSON.stringify(decrypted), configHash)).toBe(true);
    });

    it('should handle key derivation and password-based encryption', async () => {
      const userPassword = 'user-secure-password-123';
      const salt = encryptionService.secureRandom(16).toString('hex');

      // Derive key from password
      const derivedKey = encryptionService.deriveKey(userPassword, salt);
      expect(encryptionService.validateKey(derivedKey)).toBe(true);

      // Encrypt user data with derived key
      const userData = {
        personalInfo: {
          ssn: '123-45-6789',
          creditCard: '4111-1111-1111-1111',
          bankAccount: '987654321',
        },
        preferences: {
          theme: 'dark',
          language: 'en',
        },
      };

      const sensitiveFields = [
        'personalInfo.ssn',
        'personalInfo.creditCard',
        'personalInfo.bankAccount',
      ];

      const encrypted = await encryptionService.encryptObject(userData, derivedKey, sensitiveFields);
      const decrypted = await encryptionService.decryptObject(encrypted, derivedKey, sensitiveFields);

      expect(decrypted).toEqual(userData);

      // Verify different password produces different key
      const wrongPassword = 'wrong-password';
      const wrongKey = encryptionService.deriveKey(wrongPassword, salt);
      
      await TestAssertions.expectRejectsWithError(
        encryptionService.decryptObject(encrypted, wrongKey, sensitiveFields),
        ConfigurationError,
        'Failed to decrypt data'
      );
    });
  });
});