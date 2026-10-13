const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const defaultDb = require('../db/connection');
const { createRateLimiter } = require('../middleware/rate-limit');
const { validateRegistration, validateLogin } = require('../validation');

function createAuthRouter(db, { loginLimit = 10, registerLimit = 5, forgotLimit = 5, resetLimit = 10, windowMs = 15 * 60 * 1000 } = {}) {
const router = express.Router();
const loginLimiter = createRateLimiter({ windowMs, max: loginLimit, message: 'Too many login attempts. Please try again later.' });
const registerLimiter = createRateLimiter({ windowMs, max: registerLimit, message: 'Too many registration attempts. Please try again later.' });
const forgotLimiter = createRateLimiter({ windowMs, max: forgotLimit, message: 'Too many reset requests. Please try again later.' });
const resetLimiter = createRateLimiter({ windowMs, max: resetLimit, message: 'Too many reset attempts. Please try again later.' });

router.post('/forgot-password', forgotLimiter, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }

  try {
    const [users] = await db.query('SELECT user_id FROM users WHERE email=?', [email]);
    const response = { message: 'If an account exists for that email, a verification code has been created.' };
    if (users.length) {
      await db.query('DELETE FROM password_reset_tokens WHERE user_id=? OR expires_at <= NOW()', [users[0].user_id]);
      const code = String(crypto.randomInt(100000, 1000000));
      const tokenHash = crypto.createHash('sha256').update(code).digest('hex');
      await db.query(
        'INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))',
        [tokenHash, users[0].user_id]
      );
      if (process.env.NODE_ENV !== 'production') {
        response.verificationCode = code;
      }
    }
    res.json(response);
  } catch (error) {
    console.error('Creating password reset failed:', error);
    res.status(500).json({ error: 'Unable to create a verification code' });
  }
});

router.post('/reset-password', resetLimiter, async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the six-digit verification code.' });
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Password must be at least 8 characters and no more than 72 bytes' });
  }

  const tokenHash = crypto.createHash('sha256').update(code).digest('hex');
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [tokens] = await connection.query(
      'SELECT user_id FROM password_reset_tokens WHERE token_hash=? AND expires_at > NOW() FOR UPDATE',
      [tokenHash]
    );
    if (!tokens.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'This verification code is invalid or expired. Request a new one.' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await connection.query('UPDATE users SET password=? WHERE user_id=?', [passwordHash, tokens[0].user_id]);
    await connection.query('DELETE FROM password_reset_tokens WHERE user_id=?', [tokens[0].user_id]);
    await connection.commit();
    res.json({ message: 'Your password has been updated. You can now log in.' });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('Resetting password failed:', error);
    res.status(500).json({ error: 'Unable to reset password' });
  } finally {
    connection?.release();
  }
});

// POST /api/auth/register
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const validation = validateRegistration(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });
    const { name, email, password, department, bio } = validation.value;

    const hash    = await bcrypt.hash(password, 10);
    const avatar  = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const [result] = await db.query(
      'INSERT INTO users (name,email,password,department,bio,avatar) VALUES (?,?,?,?,?,?)',
      [name, email, hash, department || null, bio || null, avatar]
    );
    req.session.userId = result.insertId;
    req.session.name   = name;
    const [rows] = await db.query('SELECT user_id,name,email,department,bio,avatar,profile_picture,avg_rating,swap_count FROM users WHERE user_id=?', [result.insertId]);
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Email already registered' });
    console.error('Registration failed:', err);
    res.status(500).json({ error: 'Unable to complete registration' });
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const validation = validateLogin(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });
    const { email, password } = validation.value;
    const [rows] = await db.query('SELECT * FROM users WHERE email=?', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user  = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.userId = user.user_id;
    req.session.name   = user.name;
    const { password: _, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).json({ error: 'Unable to complete login' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const [rows] = await db.query(
      'SELECT user_id,name,email,department,bio,avatar,profile_picture,avg_rating,swap_count FROM users WHERE user_id=?',
      [req.session.userId]
    );
    if (!rows.length) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ user: rows[0] });
  } catch (error) {
    console.error('Loading current user failed:', error);
    res.status(500).json({ error: 'Unable to load current user' });
  }
});

return router;
}

const router = createAuthRouter(defaultDb);
router.createAuthRouter = createAuthRouter;
module.exports = router;
