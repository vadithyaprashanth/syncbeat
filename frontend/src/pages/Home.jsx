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
      <div className="home-hero">
        <h1 className="font-display">Welcome back,<br /><span className="text-purple">{user?.name}</span> 🎵</h1>
        <p className="text-muted">Discover music, sync with friends, vibe together.</p>
      </div>

      {/* Recent Songs */}
      <section className="home-section">
        <div className="section-header">
          <h2 className="font-display">Recently Added</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/library')}>View All →</button>
        </div>
        {loading ? (
          <div className="flex justify-center" style={{ padding: 40 }}><div className="spinner" /></div>
        ) : recent.length === 0 ? (
          <div className="empty-state">
            <p>🎵 No songs yet.</p>
            {user?.role === 'admin' && <button className="btn btn-primary btn-sm" onClick={() => navigate('/admin')}>Upload Songs</button>}
          </div>
        ) : (
          <div className="songs-grid">
            {recent.map(song => (
              <SongCard
                key={song.id} song={song}
                isActive={currentSong?.id === song.id}
                isPlaying={isPlaying}
                onPlay={() => playSong(song, recent)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Active Sessions */}
      <section className="home-section">
        <div className="section-header">
          <h2 className="font-display">Live Sessions</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/sync')}>All Sessions →</button>
        </div>
        {sessions.length === 0 ? (
          <div className="empty-state">
            <p>🔄 No active sessions. <button className="link-btn" onClick={() => navigate('/sync')}>Start one</button></p>
          </div>
        ) : (
          <div className="sessions-list">
            {sessions.map(s => (
              <div key={s.id} className="session-card" onClick={() => navigate(`/sync/${s.id}`)}>
                <div className="session-live-dot" />
                <div className="session-info">
                  <p className="session-name">{s.name}</p>
                  <p className="session-meta">Hosted by {s.host_name} · {s.member_count} listening</p>
                </div>
                {s.current_song_title && (
                  <div className="session-now">
                    <p style={{ fontSize: 11, color: 'var(--muted)' }}>Now playing</p>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>{s.current_song_title}</p>
                  </div>
                )}
                <span className="badge badge-green">LIVE</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Home;
