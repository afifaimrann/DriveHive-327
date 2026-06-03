import { describe, it, expect } from 'vitest';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ProviderError,
  StorageFullError,
} from '../../src/utils/errors.js';

describe('AppError classes', () => {
  it('AppError constructor should correctly assign properties', () => {
    const error = new AppError('Test error message', 418, 'I_AM_A_TEAPOT');
    expect(error.message).toBe('Test error message');
    expect(error.statusCode).toBe(418);
    expect(error.code).toBe('I_AM_A_TEAPOT');
    expect(error.name).toBe('AppError');
    expect(error.stack).toBeDefined();
  });

  it('AppError constructor should fallback to default values', () => {
    const error = new AppError('Default error');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_ERROR');
  });

  it('BadRequestError subclass should set status 400', () => {
    const error = new BadRequestError('Bad input');
    expect(error.message).toBe('Bad input');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
  });

  it('UnauthorizedError subclass should set status 401', () => {
    const error = new UnauthorizedError();
    expect(error.message).toBe('Authentication required');
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('ForbiddenError subclass should set status 403', () => {
    const error = new ForbiddenError('No permissions');
    expect(error.message).toBe('No permissions');
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });

  it('NotFoundError subclass should set status 404', () => {
    const error = new NotFoundError();
    expect(error.message).toBe('Resource not found');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });

  it('ConflictError subclass should set status 409', () => {
    const error = new ConflictError('Already exists');
    expect(error.message).toBe('Already exists');
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
  });

  it('ValidationError subclass should set status 422 and contain details', () => {
    const details = [{ field: 'email', message: 'invalid' }];
    const error = new ValidationError('Validation failed', details);
    expect(error.message).toBe('Validation failed');
    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual(details);
  });

  it('ProviderError subclass should set status 502 and format provider message', () => {
    const error = new ProviderError('GOOGLE', 'Rate limit exceeded');
    expect(error.message).toBe('[GOOGLE] Rate limit exceeded');
    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('PROVIDER_ERROR');
    expect(error.provider).toBe('GOOGLE');
  });

  it('StorageFullError subclass should set status 507', () => {
    const error = new StorageFullError();
    expect(error.message).toBe('No storage accounts have enough space');
    expect(error.statusCode).toBe(507);
    expect(error.code).toBe('STORAGE_FULL');
  });
});
