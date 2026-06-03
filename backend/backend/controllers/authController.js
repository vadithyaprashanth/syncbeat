const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { pool } = require('../config/db');

// ── Gmail transporter ─────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const sendOTPEmail = async (to, otp, purpose = 'verify') => {
  const isVerify = purpose === 'verify';
  const subject = isVerify ? 'SyncBeat – Verify Your Email' : 'SyncBeat – Password Reset OTP';
  const html = `
    <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:auto;background:#0f0f13;color:#fff;border-radius:16px;padding:40px;">
      <h2 style="color:#7c3aed;margin-bottom:8px;">🎵 SyncBeat</h2>
      <p style="color:#a1a1aa;margin-bottom:24px;">
        ${isVerify ? 'Welcome! Verify your email to get started.' : 'Here is your password reset OTP.'}
      </p>
      <div style="background:#1e1e2e;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
        <p style="color:#a1a1aa;font-size:13px;margin:0 0 8px;">Your one-time code</p>
        <h1 style="font-size:42px;letter-spacing:12px;color:#7c3aed;margin:0;">${otp}</h1>
      </div>
      <p style="color:#a1a1aa;font-size:13px;">This code expires in <strong style="color:#fff;">10 minutes</strong>. Do not share it with anyone.</p>
      <p style="color:#52525b;font-size:11px;margin-top:24px;">If you did not request this, you can safely ignore this email.</p>
    </div>
  `;
  await transporter.sendMail({
    from: `"SyncBeat" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });
};

// ── register ──────────────────────────────────────────────────────────────
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
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
      [name.trim(), email.toLowerCase(), hash]
    );

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query(
      `INSERT INTO otps (email, otp_code, purpose, expires_at) VALUES ($1, $2, 'verify', $3)`,
      [email.toLowerCase(), otp, expiresAt]
    );
    await sendOTPEmail(email.toLowerCase(), otp, 'verify');

    res.status(201).json({ message: 'Registered! Check your email for the OTP.', userId: result.rows[0].id });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// ── verifyOTP ─────────────────────────────────────────────────────────────
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });

    const result = await pool.query(
      `SELECT * FROM otps
       WHERE email = $1 AND otp_code = $2 AND purpose = 'verify'
         AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email.toLowerCase(), otp]
    );
    if (!result.rows.length)
      return res.status(400).json({ error: 'Invalid or expired OTP' });

    await pool.query('UPDATE otps SET used = TRUE WHERE id = $1', [result.rows[0].id]);
    await pool.query('UPDATE users SET is_verified = TRUE WHERE email = $1', [email.toLowerCase()]);

    const user = await pool.query(
      'SELECT id, name, email, role FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const token = jwt.sign({ userId: user.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Email verified!', token, user: user.rows[0] });
  } catch (err) {
    console.error('verifyOTP error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
};

// ── resendOTP ─────────────────────────────────────────────────────────────
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await pool.query('SELECT id, is_verified FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!user.rows.length) return res.status(404).json({ error: 'User not found' });
    if (user.rows[0].is_verified) return res.status(400).json({ error: 'Email already verified' });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query(
      `INSERT INTO otps (email, otp_code, purpose, expires_at) VALUES ($1, $2, 'verify', $3)`,
      [email.toLowerCase(), otp, expiresAt]
    );
    await sendOTPEmail(email.toLowerCase(), otp, 'verify');
    res.json({ message: 'OTP resent successfully' });
  } catch (err) {
    console.error('resendOTP error:', err);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
};

// ── login ─────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    if (!user.is_verified)
      return res.status(403).json({ error: 'Please verify your email first', needsVerification: true, email: user.email });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, profile_pic: user.profile_pic },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

// ── forgotPassword ────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    // Always respond the same to prevent email enumeration
    if (!result.rows.length)
      return res.json({ message: 'If that email exists, an OTP was sent.' });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query(
      `INSERT INTO otps (email, otp_code, purpose, expires_at) VALUES ($1, $2, 'reset', $3)`,
      [email.toLowerCase(), otp, expiresAt]
    );
    await sendOTPEmail(email.toLowerCase(), otp, 'reset');
    res.json({ message: 'OTP sent to your email.' });
  } catch (err) {
    console.error('forgotPassword error:', err);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
};

// ── resetPassword ─────────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword)
      return res.status(400).json({ error: 'All fields required' });

    const result = await pool.query(
      `SELECT * FROM otps
       WHERE email = $1 AND otp_code = $2 AND purpose = 'reset'
         AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email.toLowerCase(), otp]
    );
    if (!result.rows.length)
      return res.status(400).json({ error: 'Invalid or expired OTP' });

    await pool.query('UPDATE otps SET used = TRUE WHERE id = $1', [result.rows[0].id]);
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email.toLowerCase()]);

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('resetPassword error:', err);
    res.status(500).json({ error: 'Reset failed' });
  }const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { pool } = require('../config/db');

// Configure Cloudinary v2
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Use memory storage — we stream the buffer directly to Cloudinary
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
}).fields([
  { name: 'audio', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]);

// Helper: upload a buffer to Cloudinary via upload_stream
const uploadBuffer = (buffer, options) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
    stream.end(buffer);
  });

// ── Upload Song ──────────────────────────────────────────────────────────
exports.uploadSong = async (req, res) => {
  try {
    if (!req.files || !req.files.audio)
      return res.status(400).json({ error: 'Audio file is required' });

    const { title, artist, album, duration } = req.body;
    if (!title) return res.status(400).json({ error: 'Song title is required' });

    // Upload audio
    const audioResult = await uploadBuffer(req.files.audio[0].buffer, {
      folder:        'syncbeat/songs',
      resource_type: 'video',          // Cloudinary uses 'video' for audio files
      allowed_formats: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'],
    });

    // Upload cover (optional)
    let coverUrl = null;
    let coverPublicId = null;
    if (req.files.cover) {
      const coverResult = await uploadBuffer(req.files.cover[0].buffer, {
        folder:        'syncbeat/covers',
        resource_type: 'image',
        transformation: [{ width: 500, height: 500, crop: 'fill', quality: 'auto' }],
      });
      coverUrl      = coverResult.secure_url;
      coverPublicId = coverResult.public_id;
    }

    const result = await pool.query(
      `INSERT INTO songs
         (title, artist, album, duration, cloudinary_url, cloudinary_public_id,
          cover_url, cover_public_id, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        title,
        artist   || null,
        album    || null,
        duration ? parseInt(duration) : null,
        audioResult.secure_url,
        audioResult.public_id,
        coverUrl,
        coverPublicId,
        req.user.id,
      ]
    );

    res.status(201).json({ message: 'Song uploaded!', song: result.rows[0] });
  } catch (err) {
    console.error('Upload song error:', err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
};

// ── Get All Songs ────────────────────────────────────────────────────────
exports.getSongs = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = '';

    if (search) {
      params.push(`%${search}%`);
      where = `WHERE s.title ILIKE $1 OR s.artist ILIKE $1 OR s.album ILIKE $1`;
    }

    const dataQ = `
      SELECT s.*, u.name AS uploader_name
      FROM songs s LEFT JOIN users u ON s.uploaded_by = u.id
      ${where}
      ORDER BY s.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(parseInt(limit), offset);

    const countQ = search
      ? `SELECT COUNT(*) FROM songs s WHERE s.title ILIKE $1 OR s.artist ILIKE $1 OR s.album ILIKE $1`
      : `SELECT COUNT(*) FROM songs`;
    const countParams = search ? [`%${search}%`] : [];

    const [data, count] = await Promise.all([
      pool.query(dataQ, params),
      pool.query(countQ, countParams),
    ]);

    res.json({
      songs: data.rows,
      total: parseInt(count.rows[0].count),
      page:  parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('Get songs error:', err);
    res.status(500).json({ error: 'Failed to fetch songs' });
  }
};

// ── Get Song by ID ───────────────────────────────────────────────────────
exports.getSongById = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.name AS uploader_name
       FROM songs s LEFT JOIN users u ON s.uploaded_by = u.id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'Song not found' });
    res.json({ song: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch song' });
  }
};

// ── Delete Song ──────────────────────────────────────────────────────────
exports.deleteSong = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM songs WHERE id = $1', [req.params.id]);
    if (!result.rows.length)
      return res.status(404).json({ error: 'Song not found' });

    const song = result.rows[0];

    // Delete from Cloudinary (best-effort)
    try {
      await cloudinary.uploader.destroy(song.cloudinary_public_id, { resource_type: 'video' });
      if (song.cover_public_id)
        await cloudinary.uploader.destroy(song.cover_public_id, { resource_type: 'image' });
    } catch (e) {
      console.warn('Cloudinary delete warning:', e.message);
    }

    await pool.query('DELETE FROM songs WHERE id = $1', [req.params.id]);
    res.json({ message: 'Song deleted' });
  } catch (err) {
    console.error('Delete song error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
};

// ── Increment Play Count ─────────────────────────────────────────────────
exports.incrementPlay = async (req, res) => {
  try {
    await pool.query(
      'UPDATE songs SET play_count = play_count + 1 WHERE id = $1',
      [req.params.id]
    );
    res.json({ message: 'Play count updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update play count' });
  }
};

exports.uploadMiddleware = uploadMiddleware;
};

// ── getMe ─────────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  res.json({ user: req.user });
};