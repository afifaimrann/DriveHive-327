import { verifyToken } from '../services/auth.service.js';
import { UnauthorizedError } from '../utils/errors.js';

/**
 * Authentication middleware.
 * Verifies JWT token and sets req.userId.
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next(new UnauthorizedError('Authentication token required'));
  }

  try {
    const decoded = verifyToken(token);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    next(new UnauthorizedError('Invalid or expired authentication token'));
  }
}

export default authenticate;
