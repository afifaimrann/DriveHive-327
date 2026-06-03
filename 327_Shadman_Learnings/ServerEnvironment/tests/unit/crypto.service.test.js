import { vi, describe, it, expect } from 'vitest';

// Hoisted mock of env.js to prevent validation failure and process.exit(1)
vi.mock('../../src/config/env.js', () => ({
  default: {
    encryption: {
      // 32-byte hex key (64 characters)
      key: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
  },
}));

// Now import the service after the mock is registered
import { encrypt, decrypt } from '../../src/services/crypto.service.js';

describe('Crypto Service', () => {
  it('should encrypt plaintext successfully', () => {
    const text = 'hello-world-secret-123';
    const encrypted = encrypt(text);
    
    expect(encrypted).toBeDefined();
    expect(typeof encrypted).toBe('string');
    // Format should be iv_hex:encrypted_hex
    expect(encrypted).toContain(':');
    
    const parts = encrypted.split(':');
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBe(32); // IV is 16 bytes = 32 hex chars
  });

  it('should decrypt ciphertext back to original plaintext', () => {
    const text = 'my-super-secret-credentials';
    const encrypted = encrypt(text);
    const decrypted = decrypt(encrypted);
    
    expect(decrypted).toBe(text);
  });

  it('should throw an error when decrypting malformed ciphertext', () => {
    expect(() => decrypt('malformed')).toThrow();
    expect(() => decrypt('not-hex:not-hex-data')).toThrow();
  });
});
