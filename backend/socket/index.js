const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const setupSocket = (server) => {
  const { Server } = require('socket.io');
  const io = new Server(server, {
    cors: {
      origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'http://localhost:3000',
        'https://syncbeat-olive.vercel.app',
      ],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await pool.query(
        'SELECT id, name, email, role FROM users WHERE id = $1', [decoded.userId]
      );
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
        // Get session with full song details
        const session = await pool.query(
          `SELECT s.*,
            so.id as song_id,
            so.title as song_title,
            so.artist as song_artist,
            so.cover_url as song_cover_url,
            so.cloudinary_url as song_cloudinary_url
           FROM sessions s
           LEFT JOIN songs so ON s.current_song_id = so.id
           WHERE s.id = $1 AND s.is_active = TRUE`,
          [sessionId]
        );

        if (!session.rows.length) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        const sess = session.rows[0];

        // Add to members
        await pool.query(
          `INSERT INTO session_members (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [sessionId, socket.user.id]
        );

        socket.join(`session:${sessionId}`);
        socket.currentSessionId = sessionId;

        // Get chat history
        const history = await pool.query(
          `SELECT id, user_id, user_name, message, created_at
           FROM session_messages WHERE session_id = $1 ORDER BY created_at ASC`,
          [sessionId]
        );

        // Get member list
        const memberList = await pool.query(
          `SELECT u.id, u.name FROM session_members sm
           JOIN users u ON sm.user_id = u.id WHERE sm.session_id = $1`,
          [sessionId]
        );

        // Build currentSong object — this is what member needs to play
        const currentSong = sess.song_id ? {
          id: sess.song_id,
          title: sess.song_title,
          artist: sess.song_artist,
          cover_url: sess.song_cover_url,
          cloudinary_url: sess.song_cloudinary_url,  // ← CRITICAL field
        } : null;

        console.log(`${socket.user.name} joined. currentSong:`, currentSong?.title, '| url:', currentSong?.cloudinary_url?.substring(0, 50));

        socket.emit('session-state', {
          sessionId,
          id: sess.id,
          name: sess.name,
          host_id: sess.host_id,
          code: sess.code,
          is_playing: sess.is_playing,
          current_position: sess.current_position,
          current_song_id: sess.current_song_id,
          currentSong,
          chatHistory: history.rows,
        });

        socket.to(`session:${sessionId}`).emit('user-joined', {
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
         JOIN users u ON sm.user_id = u.id WHERE sm.session_id = $1`,
        [sessionId]
      ).catch(() => ({ rows: [] }));

      socket.to(`session:${sessionId}`).emit('user-left', {
        user: { id: socket.user.id, name: socket.user.name },
        members: memberList.rows,
      });
      socket.currentSessionId = null;
    });

    socket.on('playback-update', async ({ sessionId, isPlaying, currentPosition }) => {
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
        updates.push('updated_at = NOW()');
        params.push(sessionId);

        await pool.query(`UPDATE sessions SET ${updates.join(', ')} WHERE id = $${i}`, params);

        io.to(`session:${sessionId}`).emit('playback-sync', { isPlaying, currentPosition });
      } catch (err) {
        socket.emit('error', { message: 'Playback update failed' });
      }
    });

    socket.on('change-song', async ({ sessionId, songId }) => {
      try {
        const [session, songResult] = await Promise.all([
          pool.query('SELECT host_id FROM sessions WHERE id = $1', [sessionId]),
          // Get FULL song with cloudinary_url
          pool.query('SELECT id, title, artist, cover_url, cloudinary_url FROM songs WHERE id = $1', [songId]),
        ]);

        if (!session.rows.length || !songResult.rows.length) return;
        if (session.rows[0].host_id !== socket.user.id && socket.user.role !== 'admin') {
          socket.emit('error', { message: 'Only the host can change songs' });
          return;
        }

        const song = songResult.rows[0];
        console.log(`Song change: ${song.title} | url: ${song.cloudinary_url?.substring(0, 50)}`);

        await pool.query(
          `UPDATE sessions SET current_song_id = $1, current_position = 0, is_playing = TRUE, updated_at = NOW() WHERE id = $2`,
          [songId, sessionId]
        );

        // Broadcast full song object with cloudinary_url to ALL members
        io.to(`session:${sessionId}`).emit('song-changed', {
          song,  // contains id, title, artist, cover_url, cloudinary_url
          changedBy: socket.user.name,
        });
      } catch (err) {
        console.error('change-song error:', err.message);
        socket.emit('error', { message: 'Song change failed' });
      }
    });

    socket.on('chat-message', async ({ sessionId, message }) => {
      if (!message?.trim()) return;
      const text = message.trim().substring(0, 500);
      try {
        const saved = await pool.query(
          `INSERT INTO session_messages (session_id, user_id, user_name, message)
           VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
          [sessionId, socket.user.id, socket.user.name, text]
        );
        io.to(`session:${sessionId}`).emit('chat-message', {
          id: saved.rows[0].id,
          userId: socket.user.id,
          userName: socket.user.name,
          message: text,
          createdAt: saved.rows[0].created_at,
        });
      } catch (err) {
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('disconnect', async () => {
      if (socket.currentSessionId) {
        await pool.query(
          'DELETE FROM session_members WHERE session_id = $1 AND user_id = $2',
          [socket.currentSessionId, socket.user.id]
        ).catch(() => {});

        const memberList = await pool.query(
          `SELECT u.id, u.name FROM session_members sm
           JOIN users u ON sm.user_id = u.id WHERE sm.session_id = $1`,
          [socket.currentSessionId]
        ).catch(() => ({ rows: [] }));

        socket.to(`socket.currentSessionId`).emit('user-left', {
          user: { id: socket.user.id, name: socket.user.name },
          members: memberList.rows,
        });
      }
      console.log(`Disconnected: ${socket.user?.name}`);
    });
  });
};

module.exports = setupSocket;