const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const setupSocket = (server) => {
  const { Server } = require('socket.io');
  const io = new Server(server, {
    cors: {
      origin: [process.env.FRONTEND_URL || 'http://localhost:3000', 'http://localhost:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [decoded.userId]);
      if (!result.rows.length) return next(new Error('User not found'));
      socket.user = result.rows[0];
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Connected: ${socket.user.name}`);

    socket.on('join-session', async ({ sessionId }) => {
      try {
        const session = await pool.query(
          `SELECT s.* FROM sessions s WHERE s.id = $1 AND s.is_active = TRUE`,
          [sessionId]
        );
        if (!session.rows.length) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        socket.join(`session:${sessionId}`);
        socket.currentSessionId = sessionId;

        // Load chat history for this session
        const history = await pool.query(
          `SELECT id, user_id, user_name, message, created_at
           FROM session_messages
           WHERE session_id = $1
           ORDER BY created_at ASC`,
          [sessionId]
        );

        socket.emit('session-state', {
          sessionId,
          ...session.rows[0],
          user: socket.user,
          chatHistory: history.rows,
        });

        // Add to session_members table
await pool.query(
  `INSERT INTO session_members (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
  [sessionId, socket.user.id]
);

// Get updated member list
const memberList = await pool.query(
  `SELECT u.id, u.name FROM session_members sm
   JOIN users u ON sm.user_id = u.id
   WHERE sm.session_id = $1`,
  [sessionId]
);

// Broadcast updated members to everyone in room
io.to(`session:${sessionId}`).emit('user-joined', {
  user: { id: socket.user.id, name: socket.user.name },
  members: memberList.rows,
});
      } catch (err) {
        console.error('join-session error:', err.message);
        socket.emit('error', { message: 'Failed to join session' });
      }
    });

    socket.on('leave-session', async ({ sessionId }) => {
  socket.leave(`session:${sessionId}`);
  await pool.query(
    'DELETE FROM session_members WHERE session_id = $1 AND user_id = $2',
    [sessionId, socket.user.id]
  ).catch(() => {});
  const memberList = await pool.query(
    `SELECT u.id, u.name FROM session_members sm
     JOIN users u ON sm.user_id = u.id
     WHERE sm.session_id = $1`,
    [sessionId]
  ).catch(() => ({ rows: [] }));
  socket.to(`session:${sessionId}`).emit('user-left', {
    user: { id: socket.user.id, name: socket.user.name },
    members: memberList.rows,
  });
  socket.currentSessionId = null;
});

    socket.on('playback-update', async ({ sessionId, isPlaying, currentPosition, songId }) => {
      try {
        const session = await pool.query('SELECT host_id FROM sessions WHERE id = $1', [sessionId]);
        if (!session.rows.length) return;
        if (session.rows[0].host_id !== socket.user.id && socket.user.role !== 'admin') {
          socket.emit('error', { message: 'Only the host can control playback' });
          return;
        }
        const updates = []; const params = []; let i = 1;
        if (isPlaying !== undefined) { updates.push(`is_playing = $${i++}`); params.push(isPlaying); }
        if (currentPosition !== undefined) { updates.push(`current_position = $${i++}`); params.push(currentPosition); }
        if (songId !== undefined) { updates.push(`current_song_id = $${i++}`); params.push(songId); }
        updates.push('updated_at = NOW()');
        params.push(sessionId);
        await pool.query(`UPDATE sessions SET ${updates.join(', ')} WHERE id = $${i}`, params);
        io.to(`session:${sessionId}`).emit('playback-sync', { isPlaying, currentPosition, songId, updatedBy: socket.user.name });
      } catch (err) {
        socket.emit('error', { message: 'Playback update failed' });
      }
    });

    socket.on('change-song', async ({ sessionId, songId }) => {
      try {
        const [session, song] = await Promise.all([
          pool.query('SELECT host_id FROM sessions WHERE id = $1', [sessionId]),
          pool.query('SELECT * FROM songs WHERE id = $1', [songId]),
        ]);
        if (!session.rows.length || !song.rows.length) return;
        if (session.rows[0].host_id !== socket.user.id && socket.user.role !== 'admin') {
          socket.emit('error', { message: 'Only the host can change the song' });
          return;
        }
        await pool.query(
          `UPDATE sessions SET current_song_id = $1, current_position = 0, is_playing = TRUE, updated_at = NOW() WHERE id = $2`,
          [songId, sessionId]
        );
        io.to(`session:${sessionId}`).emit('song-changed', { song: song.rows[0], changedBy: socket.user.name });
      } catch (err) {
        socket.emit('error', { message: 'Song change failed' });
      }
    });

    // Chat message — save to DB and broadcast to session members only
    socket.on('chat-message', async ({ sessionId, message }) => {
      if (!message?.trim()) return;
      const text = message.trim().substring(0, 500);
      try {
        // Save to database
        const saved = await pool.query(
          `INSERT INTO session_messages (session_id, user_id, user_name, message)
           VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
          [sessionId, socket.user.id, socket.user.name, text]
        );

        const msgPayload = {
          id: saved.rows[0].id,
          userId: socket.user.id,
          userName: socket.user.name,
          message: text,
          createdAt: saved.rows[0].created_at,
        };

        // Broadcast ONLY to users in this session room
        io.to(`session:${sessionId}`).emit('chat-message', msgPayload);
      } catch (err) {
        console.error('chat-message error:', err.message);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('disconnect', () => {
      if (socket.currentSessionId) {
        socket.to(`session:${socket.currentSessionId}`).emit('user-left', {
          user: { id: socket.user.id, name: socket.user.name },
        });
      }
      console.log(`Disconnected: ${socket.user?.name}`);
    });
  });
};

module.exports = setupSocket;