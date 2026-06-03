const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token provided.' });

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      'SELECT id, email, role, name FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'User not found.' });
    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required.' });
  next();
}

module.exports = { auth, adminOnly };