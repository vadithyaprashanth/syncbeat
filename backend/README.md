# 🎧 SyncBeat — Listen Together in Perfect Sync

A full-stack music sync app. Users register with email + Gmail OTP verification, listen to songs hosted on Cloudinary, and join real-time sync sessions powered by Socket.io.

---

## 🏗 Tech Stack

| Layer       | Technology                            |
|-------------|---------------------------------------|
| Frontend    | React 18, React Router 6, Socket.io   |
| Backend     | Node.js, Express, Socket.io           |
| Database    | PostgreSQL (Render)                   |
| Storage     | Cloudinary (audio + cover images)     |
| Email/OTP   | Gmail SMTP via Nodemailer             |
| Deployment  | Render (backend) + Vercel (frontend)  |

---

## 🔑 Admin Credentials

| Field    | Value                               |
|----------|-------------------------------------|
| Email    | vadithyaprashanth1944@gmail.com     |
| Password | 123a,123a,                          |

---

## 📁 Project Structure

```
syncbeat/
├── backend/
│   ├── config/          # DB connection + schema
│   ├── controllers/     # auth, songs, sessions logic
│   ├── middleware/      # JWT auth
│   ├── routes/          # API routes
│   ├── socket/          # Socket.io real-time sync
│   └── server.js
└── frontend/
    └── src/
        ├── components/  # Sidebar, PlayerBar, SongCard
        ├── context/     # AuthContext
        ├── hooks/       # useSocket
        ├── pages/       # Home, Library, SyncPage, SessionRoom, Admin, Auth
        └── utils/       # axios API helper
```

---

## 🚀 Deployment Guide

### Step 1 — Cloudinary Setup
1. Sign up at https://cloudinary.com (free tier)
2. Go to Dashboard → copy **Cloud Name**, **API Key**, **API Secret**

### Step 2 — Gmail App Password (for OTP)
1. Go to your Google Account → Security → 2-Step Verification (enable it)
2. Then go to **App Passwords** → create one for "Mail"
3. Copy the 16-character password — this is your `GMAIL_APP_PASSWORD`

### Step 3 — Deploy Backend to Render
1. Push your code to GitHub
2. Go to https://render.com → New → **Web Service**
3. Connect your repo, set **Root Directory** to `backend`
4. Set **Build Command**: `npm install`
5. Set **Start Command**: `node server.js`
6. Add these **Environment Variables**:

```
NODE_ENV=production
JWT_SECRET=<random 64-char string>
DATABASE_URL=<Render PostgreSQL URL - see below>
GMAIL_USER=vadithyaprashanth1944@gmail.com
GMAIL_APP_PASSWORD=<your gmail app password>
CLOUDINARY_CLOUD_NAME=<your cloud name>
CLOUDINARY_API_KEY=<your api key>
CLOUDINARY_API_SECRET=<your api secret>
ADMIN_EMAIL=vadithyaprashanth1944@gmail.com
ADMIN_PASSWORD=123a,123a,
FRONTEND_URL=https://your-app.vercel.app
```

### Step 4 — Create PostgreSQL on Render
1. In Render → New → **PostgreSQL**
2. After creation, copy the **Internal Database URL**
3. Paste it as `DATABASE_URL` in your web service env vars
4. The schema is auto-applied on first server start ✅

### Step 5 — Deploy Frontend to Vercel
1. Go to https://vercel.com → New Project → import your repo
2. Set **Root Directory** to `frontend`
3. Add **Environment Variables**:

```
REACT_APP_API_URL=https://your-render-app.onrender.com/api
REACT_APP_SOCKET_URL=https://your-render-app.onrender.com
```

4. Deploy — Vercel auto-handles SPA routing via `vercel.json` ✅

---

## 💻 Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL installed and running locally
- A Gmail account with App Password

### Backend Setup
```bash
cd backend
cp .env.example .env
# Edit .env with your values:
#   DATABASE_URL=postgresql://postgres:password@localhost:5432/syncbeat
#   GMAIL_USER=your@gmail.com
#   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
#   CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET=...
#   JWT_SECRET=any_random_string
#   FRONTEND_URL=http://localhost:3000

# Create local database
psql -U postgres -c "CREATE DATABASE syncbeat;"

npm install
npm run dev
# Server runs on http://localhost:5000
# Schema auto-creates + admin seeded on first run ✅
```

### Frontend Setup
```bash
cd frontend
cp .env.example .env
# .env already has localhost URLs — no changes needed for local dev

npm install
npm start
# App runs on http://localhost:3000
```

---

## 🔐 Auth Flow

1. **Register** → enter name + email + password → OTP sent via Gmail
2. **Verify OTP** → enter 6-digit code from email → account activated + auto login
3. **Login** → email + password → JWT token stored in localStorage
4. **Forgot Password** → enter email → OTP sent → enter OTP + new password

---

## 🎵 Features

- **Library** — browse all songs, search by title/artist/album
- **Player** — persistent bottom bar with play/pause, seek, volume, next/prev
- **Sync Sessions** — create or join rooms, host controls playback for all members
- **Real-time Chat** — chat inside sync sessions
- **Admin Panel** — upload songs to Cloudinary, manage users, view stats

---

## 🌐 API Endpoints

| Method | Endpoint                     | Auth     | Description         |
|--------|------------------------------|----------|---------------------|
| POST   | /api/auth/register           | Public   | Register             |
| POST   | /api/auth/verify-otp         | Public   | Verify email OTP     |
| POST   | /api/auth/login              | Public   | Login               |
| POST   | /api/auth/forgot-password    | Public   | Request reset OTP    |
| POST   | /api/auth/reset-password     | Public   | Reset password       |
| GET    | /api/songs                   | User     | List songs           |
| POST   | /api/songs                   | Admin    | Upload song          |
| DELETE | /api/songs/:id               | Admin    | Delete song          |
| GET    | /api/sessions                | User     | List sessions        |
| POST   | /api/sessions                | User     | Create session       |
| POST   | /api/sessions/:id/join       | User     | Join session         |
| GET    | /api/admin/stats             | Admin    | Dashboard stats      |
| GET    | /api/admin/users             | Admin    | All users            |
| DELETE | /api/admin/users/:id         | Admin    | Delete user          |

---

## 🔌 Socket Events

| Event            | Direction       | Description                    |
|------------------|-----------------|-------------------------------|
| join-session     | Client → Server | Join a session room            |
| leave-session    | Client → Server | Leave a session room           |
| playback-update  | Host → Server   | Broadcast play/pause/seek      |
| change-song      | Host → Server   | Change the current song        |
| chat-message     | Client ↔ Server | Send/receive chat messages     |
| session-state    | Server → Client | Current session state on join  |
| playback-sync    | Server → Client | Playback state to all members  |
| song-changed     | Server → Client | New song to all members        |
