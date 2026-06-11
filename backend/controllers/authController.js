const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

// ── Generate JWT ──────────────────────────────────────────────────────────
const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

// ── Register ──────────────────────────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (exists.rows.length)
      return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, is_verified)
       VALUES ($1, $2, $3, TRUE) RETURNING id, name, email, role`,
      [name.trim(), email.toLowerCase(), hash]
    );

    const user = result.rows[0];
    const token = generateToken(user.id);
    res.status(201).json({ message: 'Account created!', token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// ── Login ─────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!result.rows.length)
      return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];

    // Google-only accounts have no password
    if (!user.password_hash)
      return res.status(401).json({ error: 'This account uses Google Sign In. Please use the Google button.' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match)
      return res.status(401).json({ error: 'Invalid credentials' });

    const token = generateToken(user.id);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, profile_pic: user.profile_pic },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

// ── Google OAuth callback ─────────────────────────────────────────────────
exports.googleCallback = async (req, res) => {
  try {
    const user = req.user;
    const token = generateToken(user.id);
    // Redirect to frontend with token
    const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendURL}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role, profile_pic: user.profile_pic }))}`);
  } catch (err) {
    console.error('Google callback error:', err);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth?error=google_failed`);
  }
};

// ── Get Me ────────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  res.json({ user: req.user });
};