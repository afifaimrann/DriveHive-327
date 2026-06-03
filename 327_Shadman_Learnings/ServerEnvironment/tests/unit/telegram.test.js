import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isRateLimited } from '../../src/services/telegram.service.js';

describe('Telegram Bot Service - Rate Limiting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should allow up to 5 attempts per minute and then rate limit', () => {
    const chatId = 'test_chat_id_123';

    // 1st to 5th attempt should be allowed (return false for isRateLimited)
    expect(isRateLimited(chatId)).toBe(false);
    expect(isRateLimited(chatId)).toBe(false);
    expect(isRateLimited(chatId)).toBe(false);
    expect(isRateLimited(chatId)).toBe(false);
    expect(isRateLimited(chatId)).toBe(false);

    // 6th attempt should be rate-limited (return true)
    expect(isRateLimited(chatId)).toBe(true);
  });

  it('should reset rate limit after 1 minute', () => {
    const chatId = 'test_chat_id_456';

    // Burn 5 attempts
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(chatId)).toBe(false);
    }

    // 6th is rate limited
    expect(isRateLimited(chatId)).toBe(true);

    // Fast-forward time by 61 seconds
    vi.advanceTimersByTime(61000);

    // Should be allowed again
    expect(isRateLimited(chatId)).toBe(false);
  });
});
