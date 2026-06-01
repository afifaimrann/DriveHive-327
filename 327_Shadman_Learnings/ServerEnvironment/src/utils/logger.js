import pino from 'pino';
import env from '../config/env.js';

/**
 * Structured logger using pino.
 * In development: pretty-printed, colorized output.
 * In production: JSON output for log aggregation.
 */
const logger = pino({
  level: env.isDev ? 'debug' : 'info',
  transport: env.isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

export default logger;
