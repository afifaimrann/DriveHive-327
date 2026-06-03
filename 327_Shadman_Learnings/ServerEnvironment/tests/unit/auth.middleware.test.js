import { vi, describe, it, expect } from 'vitest';
import { authenticate } from '../../src/middleware/auth.middleware.js';
import { UnauthorizedError } from '../../src/utils/errors.js';

// Mock the auth service to bypass actual JWT decoding logic
vi.mock('../../src/services/auth.service.js', () => ({
  verifyToken: vi.fn(),
}));

import { verifyToken } from '../../src/services/auth.service.js';

describe('Auth Middleware', () => {
  it('should authenticate requests with a valid token and append userId', () => {
    const req = {
      headers: {
        authorization: 'Bearer valid-token-123',
      },
    };
    const res = {};
    const next = vi.fn();

    vi.mocked(verifyToken).mockReturnValue({ userId: 'user-guid-999' });

    authenticate(req, res, next);

    expect(verifyToken).toHaveBeenCalledWith('valid-token-123');
    expect(req.userId).toBe('user-guid-999');
    expect(next).toHaveBeenCalledWith(); // called with no arguments means success
  });

  it('should call next with UnauthorizedError if Authorization header is missing', () => {
    const req = {
      headers: {},
    };
    const res = {};
    const next = vi.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    const errorPassed = next.mock.calls[0][0];
    expect(errorPassed).toBeInstanceOf(UnauthorizedError);
    expect(errorPassed.message).toBe('Authentication token required');
  });

  it('should call next with UnauthorizedError if token is malformed', () => {
    const req = {
      headers: {
        authorization: 'Bearer', // missing token part
      },
    };
    const res = {};
    const next = vi.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    const errorPassed = next.mock.calls[0][0];
    expect(errorPassed).toBeInstanceOf(UnauthorizedError);
    expect(errorPassed.message).toBe('Authentication token required');
  });

  it('should call next with UnauthorizedError if verifyToken throws an error', () => {
    const req = {
      headers: {
        authorization: 'Bearer bad-or-expired-token',
      },
    };
    const res = {};
    const next = vi.fn();

    vi.mocked(verifyToken).mockImplementation(() => {
      throw new Error('JWT verification failed');
    });

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    const errorPassed = next.mock.calls[0][0];
    expect(errorPassed).toBeInstanceOf(UnauthorizedError);
    expect(errorPassed.message).toBe('Invalid or expired authentication token');
  });
});
