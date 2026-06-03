const { pool } = require('../config/db');

// ── Create Session ────────────────────────────────────────────────────────────
const createSession = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Session name required' });

    const result = await pool.query(
      `INSERT INTO sessions (name, host_id) VALUES ($1, $2) RETURNING *`,
      [name.trim(), req.user.id]
    );
    const session = result.rows[0];
    await pool.query(
      `INSERT INTO session_members (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [session.id, req.user.id]
    );
    res.status(201).json({ session });
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
};

// ── Get All Active Sessions ───────────────────────────────────────────────────
const getSessions = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*,
             u.name AS host_name,
             (SELECT COUNT(*) FROM session_members sm WHERE sm.session_id = s.id) AS member_count,
             so.title      AS current_song_title,
             so.artist     AS current_song_artist,
             so.cover_url  AS current_song_cover
      FROM sessions s
      LEFT JOIN users u  ON s.host_id        = u.id
      LEFT JOIN songs so ON s.current_song_id = so.id
      WHERE s.is_active = TRUE
      ORDER BY s.created_at DESC
    `);
    res.json({ sessions: result.rows });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
};

// ── Get Session by ID ─────────────────────────────────────────────────────────
const getSession = async (req, res) => {
  try {
    const session = await pool.query(`
      SELECT s.*,
             u.name         AS host_name,
             so.title       AS current_song_title,
             so.artist      AS current_song_artist,
             so.cover_url   AS current_song_cover,
             so.cloudinary_url AS current_song_url
      FROM sessions s
      LEFT JOIN users u  ON s.host_id        = u.id
      LEFT JOIN songs so ON s.current_song_id = so.id
      WHERE s.id = $1
    `, [req.params.id]);

    if (!session.rows.length)
      return res.status(404).json({ error: 'Session not found' });

    const members = await pool.query(`
      SELECT u.id, u.name, u.email, sm.joined_at
      FROM session_members sm
      JOIN users u ON sm.user_id = u.id
      WHERE sm.session_id = $1
    `, [req.params.id]);

    res.json({ session: session.rows[0], members: members.rows });
  } catch (err) {
    console.error('Get session error:', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
};

// ── Join Session ──────────────────────────────────────────────────────────────
const joinSession = async (req, res) => {
  try {
    const session = await pool.query(
      'SELECT * FROM sessions WHERE id = $1 AND is_active = TRUE',
      [req.params.id]
    );
    if (!session.rows.length)
      return res.status(404).json({ error: 'Session not found or inactive' });

    await pool.query(
      `INSERT INTO session_members (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Joined session', session: session.rows[0] });
  } catch (err) {
    console.error('Join session error:', err);
    res.status(500).json({ error: 'Failed to join session' });
  }
};

// ── Leave Session ─────────────────────────────────────────────────────────────
const leaveSession = async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM session_members WHERE session_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Left session' });
  } catch (err) {
    console.error('Leave session error:', err);
    res.status(500).json({ error: 'Failed to leave session' });
  }
};

// ── End Session ───────────────────────────────────────────────────────────────
const endSession = async (req, res) => {
  try {
    const session = await pool.query(
      'SELECT * FROM sessions WHERE id = $1', [req.params.id]
    );
    if (!session.rows.length)
      return res.status(404).json({ error: 'Session not found' });

    if (session.rows[0].host_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Only the host or admin can end this session' });

    await pool.query(
      'UPDATE sessions SET is_active = FALSE WHERE id = $1', [req.params.id]
    );
    res.json({ message: 'Session ended' });
  } catch (err) {
    console.error('End session error:', err);
    res.status(500).json({ error: 'Failed to end session' });
  }
};

// ── Admin: All Users ──────────────────────────────────────────────────────────
const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, is_verified, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// ── Admin: Delete User ────────────────────────────────────────────────────────
const deleteUser = async (req, res) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ error: 'Cannot delete yourself' });
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// ── Admin: Stats ──────────────────────────────────────────────────────────────
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
  createSession,
  getSessions,
  getSession,
  joinSession,
  leaveSession,
  endSession,
  getAllUsers,
  deleteUser,
  getStats,
};