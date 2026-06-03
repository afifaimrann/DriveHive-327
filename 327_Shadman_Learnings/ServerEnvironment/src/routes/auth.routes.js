import express from 'express';
import Joi from 'joi';
import { register, login, getUserById } from '../services/auth.service.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.js';
import supabase from '../config/supabase.js';

const router = express.Router();

const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const loginSchema = Joi.object({
  login: Joi.string().required(), // Username or Email
  password: Joi.string().required(),
});

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const result = await register(username, email, password);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { login: identifier, password } = req.body;
    const result = await login(identifier, password);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await getUserById(req.userId);
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
});

router.post('/telegram/link-code', authenticate, async (req, res, next) => {
  try {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('profiles')
      .update({
        telegram_link_code: code,
        telegram_link_code_expires_at: expiresAt,
      })
      .eq('id', req.userId);

    if (error) {
      throw error;
    }

    res.status(200).json({ code, expiresAt });
  } catch (error) {
    next(error);
  }
});

router.delete('/telegram/unlink', authenticate, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        telegram_chat_id: null,
        telegram_link_code: null,
        telegram_link_code_expires_at: null,
      })
      .eq('id', req.userId);

    if (error) {
      throw error;
    }

    res.status(200).json({ message: 'Telegram account successfully unlinked' });
  } catch (error) {
    next(error);
  }
});

export default router;
