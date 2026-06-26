require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const session = require('express-session');
const passport = require('./config/passport');
const { initDB } = require('./config/db');
const routes = require('./routes/index');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'https://syncbeat-olive.vercel.app',
];

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(session({
  secret: process.env.JWT_SECRET || 'syncbeat_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' },
}));

app.use(passport.initialize());
app.use(passport.session());

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use('/api', routes);
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── SOCKET SETUP INLINE ────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const { pool } = require('./config/db');

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      'SELECT id, name, email, role FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (!result.rows.length) return next(new Error('User not found'));
    socket.user = result.rows[0];
    next();
  } catch (err) {
    console.error('Socket auth error:', err.message);
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`SOCKET CONNECTED: ${socket.user.name} (${socket.id})`);

  socket.on('join-session', async ({ sessionId }) => {
    console.log(`JOIN-SESSION: ${socket.user.name} -> ${sessionId}`);
    try {
      const session = await pool.query(
        `SELECT s.*,
          so.id as song_id, so.title as song_title, so.artist as song_artist,
          so.cover_url as song_cover_url, so.cloudinary_url as song_cloudinary_url
         FROM sessions s
         LEFT JOIN songs so ON s.current_song_id = so.id
         WHERE s.id = $1 AND s.is_active = TRUE`,
        [sessionId]
      );

      if (!session.rows.length) {
        console.log(`Session ${sessionId} not found`);
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      const sess = session.rows[0];

      await pool.query(
        `INSERT INTO session_members (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [sessionId, socket.user.id]
      );

      socket.join(`session:${sessionId}`);
      socket.currentSessionId = sessionId;

      let chatHistory = [];
      try {
        const hist = await pool.query(
          `SELECT id, user_id, user_name, message, created_at FROM session_messages
           WHERE session_id = $1 ORDER BY created_at ASC LIMIT 100`,
          [sessionId]
        );
        chatHistory = hist.rows;
      } catch (e) {
        console.warn('Chat history error:', e.message);
      }

      const memberList = await pool.query(
        `SELECT u.id, u.name FROM session_members sm
         JOIN users u ON sm.user_id = u.id WHERE sm.session_id = $1`,
        [sessionId]
      );

      const currentSong = sess.song_id ? {
        id: sess.song_id,
        title: sess.song_title,
        artist: sess.song_artist,
        cover_url: sess.song_cover_url,
        cloudinary_url: sess.song_cloudinary_url,
      } : null;

      const statePayload = {
        sessionId, id: sess.id, name: sess.name,
        host_id: sess.host_id, code: sess.code,
        is_playing: sess.is_playing,
        current_position: sess.current_position || 0,
        current_song_id: sess.current_song_id,
        currentSong, chatHistory,
      };

      console.log(`EMITTING session-state to ${socket.user.name}: song=${currentSong?.title || 'none'}`);
      socket.emit('session-state', statePayload);

      socket.to(`session:${sessionId}`).emit('user-joined', {
        user: { id: socket.user.id, name: socket.user.name },
        members: memberList.rows,
      });
      console.log(`JOIN-SESSION complete for ${socket.user.name}`);
    } catch (err) {
      console.error('JOIN-SESSION ERROR:', err.message, err.stack);
      socket.emit('error', { message: 'Join failed: ' + err.message });
    }
  });

  socket.on('change-song', async ({ sessionId, songId }) => {
    console.log(`CHANGE-SONG: ${socket.user.name} -> ${songId} in ${sessionId}`);
    try {
      const [sess, songResult] = await Promise.all([
        pool.query('SELECT host_id FROM sessions WHERE id = $1', [sessionId]),
        pool.query('SELECT id, title, artist, cover_url, cloudinary_url FROM songs WHERE id = $1', [songId]),
      ]);
      if (!sess.rows.length || !songResult.rows.length) return;
      if (sess.rows[0].host_id !== socket.user.id && socket.user.role !== 'admin') {
        socket.emit('error', { message: 'Only host can change songs' });
        return;
      }
      const song = songResult.rows[0];
      await pool.query(
        `UPDATE sessions SET current_song_id=$1, current_position=0, is_playing=TRUE, updated_at=NOW() WHERE id=$2`,
        [songId, sessionId]
      );
      console.log(`BROADCASTING song-changed: ${song.title} to session:${sessionId}`);
      io.to(`session:${sessionId}`).emit('song-changed', { song, changedBy: socket.user.name });
    } catch (err) {
      console.error('CHANGE-SONG ERROR:', err.message);
      socket.emit('error', { message: 'Song change failed' });
    }
  });

  socket.on('playback-update', async ({ sessionId, isPlaying, currentPosition }) => {
    try {
      const sess = await pool.query('SELECT host_id FROM sessions WHERE id=$1', [sessionId]);
      if (!sess.rows.length) return;
      if (sess.rows[0].host_id !== socket.user.id && socket.user.role !== 'admin') return;
      const updates = []; const params = []; let i = 1;
      if (isPlaying !== undefined) { updates.push(`is_playing=$${i++}`); params.push(isPlaying); }
      if (currentPosition !== undefined) { updates.push(`current_position=$${i++}`); params.push(currentPosition); }
      updates.push('updated_at=NOW()');
      params.push(sessionId);
      await pool.query(`UPDATE sessions SET ${updates.join(',')} WHERE id=$${i}`, params);
      io.to(`session:${sessionId}`).emit('playback-sync', { isPlaying, currentPosition });
    } catch (err) {
      console.error('PLAYBACK-UPDATE ERROR:', err.message);
    }
  });

  socket.on('chat-message', async ({ sessionId, message }) => {
    if (!message?.trim()) return;
    const text = message.trim().substring(0, 500);
    try {
      const saved = await pool.query(
        `INSERT INTO session_messages (session_id, user_id, user_name, message)
         VALUES ($1,$2,$3,$4) RETURNING id, created_at`,
        [sessionId, socket.user.id, socket.user.name, text]
      );
      io.to(`session:${sessionId}`).emit('chat-message', {
        id: saved.rows[0].id, userId: socket.user.id,
        userName: socket.user.name, message: text, createdAt: saved.rows[0].created_at,
      });
    } catch (err) {
      console.error('CHAT ERROR:', err.message);
    }
  });

  socket.on('leave-session', async ({ sessionId }) => {
    try {
      socket.leave(`session:${sessionId}`);
      await pool.query('DELETE FROM session_members WHERE session_id=$1 AND user_id=$2',
        [sessionId, socket.user.id]);
      const ml = await pool.query(
        `SELECT u.id, u.name FROM session_members sm JOIN users u ON sm.user_id=u.id WHERE sm.session_id=$1`,
        [sessionId]);
      socket.to(`session:${sessionId}`).emit('user-left', {
        user: { id: socket.user.id, name: socket.user.name }, members: ml.rows,
      });
      socket.currentSessionId = null;
    } catch (err) { console.error('LEAVE ERROR:', err.message); }
  });

  socket.on('disconnect', async () => {
    console.log(`SOCKET DISCONNECTED: ${socket.user?.name}`);
    try {
      if (socket.currentSessionId) {
        await pool.query('DELETE FROM session_members WHERE session_id=$1 AND user_id=$2',
          [socket.currentSessionId, socket.user.id]);
        const ml = await pool.query(
          `SELECT u.id, u.name FROM session_members sm JOIN users u ON sm.user_id=u.id WHERE sm.session_id=$1`,
          [socket.currentSessionId]);
        socket.to(`session:${socket.currentSessionId}`).emit('user-left', {
          user: { id: socket.user.id, name: socket.user.name }, members: ml.rows,
        });
      }
    } catch (err) { console.error('DISCONNECT ERROR:', err.message); }
  });
});

const PORT = process.env.PORT || 5000;
const start = async () => {
  try {
    await initDB();
    server.listen(PORT, () => console.log(`SyncBeat server running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
};
start();