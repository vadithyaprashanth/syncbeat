const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { pool } = require('./db');

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails[0].value.toLowerCase();
    const name  = profile.displayName;
    const pic   = profile.photos?.[0]?.value || null;

    // Check if user exists
    let result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      // Create new user (no password — Google account)
      result = await pool.query(
        `INSERT INTO users (name, email, password_hash, is_verified, profile_pic)
         VALUES ($1, $2, NULL, TRUE, $3) RETURNING *`,
        [name, email, pic]
      );
    } else {
      // Update profile pic if changed
      await pool.query('UPDATE users SET profile_pic = $1 WHERE email = $2', [pic, email]);
      result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    }

    return done(null, result.rows[0]);
  } catch (err) {
    return done(err, null);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;