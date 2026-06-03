import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const SyncPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [error, setError] = useState('');

  const fetchSessions = async () => {
    try {
      const res = await api.get('/sessions');
      setSessions(res.data.sessions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!sessionName.trim()) return setError('Session name required');
    setCreating(true);
    try {
      const res = await api.post('/sessions', { name: sessionName.trim() });
      navigate(`/sync/${res.data.session.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page-wrap">
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <h1 className="page-title" style={{ margin: 0 }}>🔄 Sync Sessions</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Session</button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="font-display" style={{ fontSize: 20, marginBottom: 20 }}>Create Session</h2>
            {error && <div className="auth-msg error" style={{ marginBottom: 12 }}>⚠ {error}</div>}
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label>Session Name</label>
                <input className="input" placeholder="e.g. Friday Night Vibes" value={sessionName} onChange={e => setSessionName(e.target.value)} autoFocus />
              </div>
              <div className="flex gap-1">
                <button type="button" className="btn btn-ghost w-full" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary w-full" disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center" style={{ padding: 60 }}><div className="spinner" /></div>
      ) : sessions.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔄</div>
          <p style={{ marginBottom: 16 }}>No active sessions. Start one and invite your friends!</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create Session</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sessions.map(s => (
            <div key={s.id} className="session-card" onClick={() => navigate(`/sync/${s.id}`)}>
              <div className="session-live-dot" />
              <div className="session-info" style={{ flex: 1 }}>
                <p className="session-name">{s.name}</p>
                <p className="session-meta">Hosted by {s.host_name} · {s.member_count} listening</p>
                {s.current_song_title && (
                  <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 4 }}>
                    🎵 {s.current_song_title} {s.current_song_artist && `— ${s.current_song_artist}`}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {s.host_id === user?.id && <span className="badge badge-purple">HOST</span>}
                <span className="badge badge-green">LIVE</span>
                <button className="btn btn-ghost btn-sm">Join →</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SyncPage;
