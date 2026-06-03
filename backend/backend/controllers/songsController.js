const cloudinary = require('cloudinary').v2;
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