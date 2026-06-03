import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import supabase from '../config/supabase.js';
import env from '../config/env.js';
import { AUTH } from '../config/constants.js';
import { ConflictError, UnauthorizedError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Register a new user.
 *
 * @param {string} username
 * @param {string} email
 * @param {string} password
 * @returns {{ user: object, token: string }}
 */
export async function register(username, email, password) {
  // Check if username or email already exists
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .or(`username.eq.${username},email.eq.${email}`)
    .limit(1);

  if (existing && existing.length > 0) {
    throw new ConflictError('Username or email already taken');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, AUTH.saltRounds);

  // Create user in profiles table
  const { data: user, error } = await supabase
    .from('profiles')
    .insert({
      username,
      email,
      password: hashedPassword,
    })
    .select('id, username, email, created_at')
    .single();

  if (error) {
    logger.error({ error }, 'Failed to create user');
    throw error;
  }

  // Generate JWT
  const token = generateToken(user.id);

  logger.info({ userId: user.id, username }, 'User registered');
  return { user, token };
}

/**
 * Authenticate a user with email/username and password.
 *
 * @param {string} login - Email or username
 * @param {string} password
 * @returns {{ user: object, token: string }}
 */
export async function login(login, password) {
  // Find user by email or username
  const { data: user, error } = await supabase
    .from('profiles')
    .select('id, username, email, password')
    .or(`email.eq.${login},username.eq.${login}`)
    .single();

  if (error || !user) {
    throw new UnauthorizedError('Invalid credentials');
  }

  // Verify password
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new UnauthorizedError('Invalid credentials');
  }

  // Generate JWT
  const token = generateToken(user.id);

  // Remove password from returned user object
  const { password: _, ...safeUser } = user;

  logger.info({ userId: user.id }, 'User logged in');
  return { user: safeUser, token };
}

/**
 * Verify a JWT token and return the decoded payload.
 *
 * @param {string} token
 * @returns {{ userId: string }}
 */
export function verifyToken(token) {
  return jwt.verify(token, env.jwt.secret);
}

/**
 * Get a user profile by ID (without password).
 *
 * @param {string} userId
 * @returns {object} User profile
 */
export async function getUserById(userId) {
  const { data: user, error } = await supabase
    .from('profiles')
    .select('id, username, email, telegram_chat_id, created_at, updated_at')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new UnauthorizedError('User not found');
  }

  return user;
}

/**
 * Generate a JWT token for a given user ID.
 *
 * @param {string} userId
 * @returns {string} JWT token
 */
function generateToken(userId) {
  return jwt.sign({ userId }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });
}
