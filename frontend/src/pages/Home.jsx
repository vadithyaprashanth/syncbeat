import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import SongCard from '../components/Player/SongCard';

const Home = ({ currentSong, setCurrentSong, isPlaying, setIsPlaying, queue, setQueue }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recent, setRecent] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/songs?limit=8'),
      api.get('/sessions'),
    ]).then(([s, sess]) => {
      setRecent(s.data.songs);
      setSessions(sess.data.sessions.slice(0, 3));
    }).finally(() => setLoading(false));
  }, []);

  const playSong = (song, list) => {
    setCurrentSong(song);
    setIsPlaying(true);
    if (list) setQueue(list);
  };

  return (
    <div className="page-wrap">
      {/* Hero */}
      <div style={{
        marginBottom: 40,
        padding: '32px 36px',
        background: 'linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(6,214,160,0.05) 100%)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 200, height: 200, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,58,237,0.2) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, marginBottom: 8, letterSpacing: 1 }}>
          WELCOME BACK
        </p>
        <h1 className="font-display" style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.2, marginBottom: 8 }}>
          {user?.name} 🎵
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 15 }}>
          Discover music, sync with friends, vibe together.
        </p>
      </div>

      {/* Recently Added Songs */}
      <section style={{ marginBottom: 40 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <h2 className="font-display" style={{ fontSize: 20, fontWeight: 700 }}>Recently Added</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/library')}>
            View All →
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center" style={{ padding: 40 }}>
            <div className="spinner" />
          </div>
        ) : recent.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 24px',
            background: 'var(--bg2)', borderRadius: 16,
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>🎵</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>No songs yet.</p>
            {user?.role === 'admin' && (
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/admin')}>
                Upload Songs
              </button>
            )}
          </div>
        ) : (
          <div className="songs-grid">
            {recent.map(song => (
              <SongCard
                key={song.id}
                song={song}
                isActive={currentSong?.id === song.id}
                isPlaying={isPlaying}
                onPlay={() => playSong(song, recent)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Live Sessions */}
      <section style={{ marginBottom: 40 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <h2 className="font-display" style={{ fontSize: 20, fontWeight: 700 }}>Live Sessions</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/sync')}>
            All Sessions →
          </button>
        </div>

        {sessions.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '32px 24px',
            background: 'var(--bg2)', borderRadius: 16,
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.4 }}>🔄</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 12 }}>
              No active sessions right now.
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/sync')}>
              Create a Session
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sessions.map(s => (
              <div key={s.id} style={{
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                transition: 'border-color 0.2s',
              }}>
                {/* Live dot */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: 'var(--accent)',
                  boxShadow: '0 0 6px var(--accent)',
                  flexShrink: 0,
                  animation: 'pulse 2s infinite',
                }} />

                {/* Session info */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0, marginBottom: 2 }}>
                    {s.name}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
                    Hosted by {s.host_name} · {s.member_count} listening
                  </p>
                  {s.current_song_title && (
                    <p style={{ fontSize: 12, color: 'var(--accent)', margin: 0, marginTop: 3 }}>
                      🎵 {s.current_song_title}
                      {s.current_song_artist && ` — ${s.current_song_artist}`}
                    </p>
                  )}
                </div>

                {/* Actions — requires code to join */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{
                    background: 'rgba(6,214,160,0.12)',
                    color: 'var(--accent)',
                    borderRadius: 99, padding: '2px 10px',
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                  }}>
                    LIVE
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate('/sync')}
                    style={{ fontSize: 12 }}
                  >
                    Join with Code →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Home;