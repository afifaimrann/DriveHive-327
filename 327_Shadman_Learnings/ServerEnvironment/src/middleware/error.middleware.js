import logger from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

/**
 * Global Express error handling middleware.
 * Formats app errors into standardized JSON responses.
 */
export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const errorCode = err.code || 'INTERNAL_SERVER_ERROR';

  logger.error(
    {
      err: {
        message: err.message,
        stack: err.stack,
        ...err,
      },
      url: req.originalUrl,
      method: req.method,
      userId: req.userId,
    },
    'Request error'
  );

  // If headers already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  const response = {
    status: 'error',
    code: errorCode,
    message: statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'An unexpected internal server error occurred'
      : err.message,
  };

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

export default errorHandler;
