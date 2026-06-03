const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test connection
pool.query('SELECT NOW()', (err) => {
  if (err) console.error('❌ PostgreSQL connection error:', err.message);
  else console.log('✅ PostgreSQL connected');
});

const seedAdmin = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'vadithyaprashanth1944@gmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD || '123a,123a,';

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash(adminPassword, 12);
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, is_verified)
         VALUES ($1, $2, $3, 'admin', TRUE)`,
        ['Admin', adminEmail, hash]
      );
      console.log('✅ Admin user seeded:', adminEmail);
    } else {
      console.log('ℹ️  Admin user already exists');
    }
  } catch (err) {
    console.error('❌ Admin seed error:', err.message);
  }
};

const initDB = async () => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('✅ Database schema initialized');
    await seedAdmin();
  } catch (err) {
    console.error('❌ DB init error:', err.message);
    throw err;
  }
};

module.exports = { pool, initDB };