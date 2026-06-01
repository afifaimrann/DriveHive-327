import express from 'express';
import Joi from 'joi';
import { register, login, getUserById } from '../services/auth.service.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.js';

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

export default router;
