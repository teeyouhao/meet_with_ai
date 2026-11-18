import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { findUserByEmail, createUser, findLegacyProfileByEmail } from '../services/userService.js';
import { generateToken } from '../utils/jwt.js';
import { optionalAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

/**
 * POST /auth/register
 * Native TypeScript Registration using PostgreSQL
 */
router.post('/register', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address is required.' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }
    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      return res.status(400).json({ error: 'Full name is required.' });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await createUser({
      email,
      passwordHash,
      fullName: fullName.trim(),
      role: 'user'
    });

    const userPayload = {
      id: newUser.id,
      email: newUser.email,
      fullName: newUser.full_name,
      role: newUser.role
    };

    const token = generateToken(userPayload);
    res.cookie('token', token, COOKIE_OPTIONS);

    return res.status(201).json({
      success: true,
      token,
      user: userPayload
    });
  } catch (err: any) {
    console.error('[auth/register] Error:', err);
    return res.status(500).json({ error: err.message || 'Registration failed.' });
  }
});

/**
 * POST /auth/login
 * Native TypeScript Login using PostgreSQL
 */
router.post('/login', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      const legacyProfile = await findLegacyProfileByEmail(email);
      if (legacyProfile) {
        return res.status(401).json({
          error: 'Your account was migrated from legacy auth. Please click "Sign up free" below to set your password and access your existing meetings!'
        });
      }
      return res.status(401).json({ error: 'No account found with this email. Please click "Sign up free" below to create one.' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect password. Please try again or click "Sign up free" to reset.' });
    }

    const userPayload = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role
    };

    const token = generateToken(userPayload);
    res.cookie('token', token, COOKIE_OPTIONS);

    return res.json({
      success: true,
      token,
      user: userPayload
    });
  } catch (err: any) {
    console.error('[auth/login] Error:', err);
    return res.status(500).json({ error: err.message || 'Login failed.' });
  }
});

/**
 * GET /auth/session & GET /auth/me
 * Retrieves the currently active user profile from JWT
 */
router.get(['/session', '/me'], optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.json({
      authenticated: false,
      user: null
    });
  }

  return res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.fullName,
      fullName: req.user.fullName,
      role: req.user.role
    }
  });
});

/**
 * POST /auth/logout
 * Clears JWT session cookie
 */
router.post('/logout', (_req: AuthenticatedRequest, res: Response) => {
  res.clearCookie('token', COOKIE_OPTIONS);
  return res.json({ success: true });
});

export default router;
