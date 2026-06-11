const { pool } = require('../config/db');
const crypto = require('crypto');

const generateCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();

// ── Create Session ────────────────────────────────────────────────────────
const createSession = async (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name) return res.status(400).json({ error: 'Session name required' });

    const code = generateCode();
    const hashedPassword = password ? require('bcryptjs').hashSync(password, 10) : null;

    const result = await pool.query(
      `INSERT INTO sessions (name, host_id, code, password)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), req.user.id, code, hashedPassword]
    );
    const session = result.rows[0];

    await pool.query(
      `INSERT INTO session_members (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [session.id, req.user.id]
    );

    res.status(201).json({
      session: { ...session, password: undefined },
      code: session.code,
      hasPassword: !!password,
    });
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
};

// ── Get Active Sessions ───────────────────────────────────────────────────
const getSessions = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.name, s.code, s.is_playing, s.is_active, s.created_at,
        u.name as host_name, s.host_id,
        (s.password IS NOT NULL) as has_password,
        (SELECT COUNT(*) FROM session_members sm WHERE sm.session_id = s.id) as member_count,
        so.title as current_song_title, so.artist as current_song_artist, so.cover_url as current_song_cover
       FROM sessions s
       LEFT JOIN users u ON s.host_id = u.id
       LEFT JOIN songs so ON s.current_song_id = so.id
       WHERE s.is_active = TRUE
       ORDER BY s.created_at DESC`
    );
    res.json({ sessions: result.rows });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
};

// ── Get Session by ID ─────────────────────────────────────────────────────
const getSession = async (req, res) => {
  try {
    const session = await pool.query(
      `SELECT s.id, s.name, s.code, s.host_id, s.current_song_id, s.is_playing,
        s.current_position, s.is_active, s.created_at, s.updated_at,
        (s.password IS NOT NULL) as has_password,
        u.name as host_name,
        so.title as current_song_title, so.artist as current_song_artist,
        so.cover_url as current_song_cover, so.cloudinary_url as current_song_url
       FROM sessions s
       LEFT JOIN users u ON s.host_id = u.id
       LEFT JOIN songs so ON s.current_song_id = so.id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (!session.rows.length) return res.status(404).json({ error: 'Session not found' });

    const members = await pool.query(
      `SELECT u.id, u.name, u.email, sm.joined_at FROM session_members sm
       JOIN users u ON sm.user_id = u.id WHERE sm.session_id = $1`,
      [req.params.id]
    );

    res.json({ session: session.rows[0], members: members.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch session' });
  }
};

// ── Join Session by Code + Password ──────────────────────────────────────
const joinSessionByCode = async (req, res) => {
  try {
    const { code, password } = req.body;
    if (!code) return res.status(400).json({ error: 'Session code required' });

    const result = await pool.query(
      'SELECT * FROM sessions WHERE UPPER(code) = UPPER($1) AND is_active = TRUE',
      [code.trim()]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Session not found. Check the code.' });

    const session = result.rows[0];

    // Check password if session is protected
    if (session.password) {
      if (!password) return res.status(403).json({ error: 'This session requires a password', needsPassword: true });
      const bcrypt = require('bcryptjs');
      const match = bcrypt.compareSync(password, session.password);
      if (!match) return res.status(403).json({ error: 'Incorrect password' });
    }

    await pool.query(
      `INSERT INTO session_members (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [session.id, req.user.id]
    );

    res.json({ message: 'Joined!', sessionId: session.id, session });
  } catch (err) {
    console.error('Join by code error:', err);
    res.status(500).json({ error: 'Failed to join session' });
  }
};

// ── Join Session by ID ────────────────────────────────────────────────────
const joinSession = async (req, res) => {
  try {
    const session = await pool.query(
      'SELECT * FROM sessions WHERE id = $1 AND is_active = TRUE',
      [req.params.id]
    );
    if (!session.rows.length) return res.status(404).json({ error: 'Session not found' });

    await pool.query(
      `INSERT INTO session_members (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Joined', session: session.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to join session' });
  }
};

// ── Leave Session ─────────────────────────────────────────────────────────
const leaveSession = async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM session_members WHERE session_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Left session' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to leave session' });
  }
};

// ── End Session ───────────────────────────────────────────────────────────
const endSession = async (req, res) => {
  try {
    const session = await pool.query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    if (!session.rows.length) return res.status(404).json({ error: 'Session not found' });
    if (session.rows[0].host_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Only the host or admin can end this session' });

    await pool.query('UPDATE sessions SET is_active = FALSE WHERE id = $1', [req.params.id]);
    res.json({ message: 'Session ended' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to end session' });
  }
};

// ── Admin: Get All Users ──────────────────────────────────────────────────
const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, is_verified, created_at FROM users ORDER BY created_at DESC`
    );
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// ── Admin: Delete User ────────────────────────────────────────────────────
const deleteUser = async (req, res) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ error: 'Cannot delete yourself' });
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// ── Admin: Stats ──────────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const [users, songs, sessions, plays] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM songs'),
      pool.query('SELECT COUNT(*) FROM sessions WHERE is_active = TRUE'),
      pool.query('SELECT COALESCE(SUM(play_count), 0) FROM songs'),
    ]);
    res.json({
      totalUsers:     parseInt(users.rows[0].count),
      totalSongs:     parseInt(songs.rows[0].count),
      activeSessions: parseInt(sessions.rows[0].count),
      totalPlays:     parseInt(plays.rows[0].coalesce),
    });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};

module.exports = {
  createSession, getSessions, getSession,
  joinSession, joinSessionByCode, leaveSession, endSession,
  getAllUsers, deleteUser, getStats,
};