CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_verified BOOLEAN DEFAULT FALSE,
  profile_pic VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  purpose VARCHAR(30) DEFAULT 'verify' CHECK (purpose IN ('verify', 'reset')),
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS songs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  artist VARCHAR(255),
  album VARCHAR(255),
  duration INTEGER,
  cloudinary_url VARCHAR(1000) NOT NULL,
  cloudinary_public_id VARCHAR(500) NOT NULL,
  cover_url VARCHAR(1000),
  cover_public_id VARCHAR(500),
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  play_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  host_id UUID REFERENCES users(id) ON DELETE CASCADE,
  current_song_id UUID REFERENCES songs(id) ON DELETE SET NULL,
  is_playing BOOLEAN DEFAULT FALSE,
  current_position FLOAT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email);
CREATE INDEX IF NOT EXISTS idx_otps_expires ON otps(expires_at);
CREATE INDEX IF NOT EXISTS idx_songs_uploaded_by ON songs(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_sessions_host ON sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_session_members_session ON session_members(session_id);
CREATE INDEX IF NOT EXISTS idx_session_members_user ON session_members(user_id);