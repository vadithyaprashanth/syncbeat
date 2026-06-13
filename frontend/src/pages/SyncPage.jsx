import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const SyncPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', password: '' });
  const [joinForm, setJoinForm] = useState({ code: '', password: '' });
  const [createError, setCreateError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [createdSession, setCreatedSession] = useState(null);

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
    if (!createForm.name.trim()) return setCreateError('Session name required');
    setCreating(true);
    setCreateError('');
    try {
      const res = await api.post('/sessions', {
        name: createForm.name.trim(),
        password: createForm.password || undefined,
      });
      setCreatedSession(res.data);
      setShowCreate(false);
      setCreateForm({ name: '', password: '' });
      fetchSessions();
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinByCode = async (e) => {
    e.preventDefault();
    if (!joinForm.code.trim()) return setJoinError('Session code required');
    setJoining(true);
    setJoinError('');
    try {
      const res = await api.post('/sessions/join-by-code', {
        code: joinForm.code.trim(),
        password: joinForm.password || undefined,
      });
      navigate(`/sync/${res.data.sessionId}`);
    } catch (err) {
      setJoinError(err.response?.data?.error || 'Failed to join session');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="page-wrap">
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Sync Sessions</h1>
        <div className="flex gap-1">
          <button className="btn btn-ghost" onClick={() => {
            setShowJoin(true); setShowCreate(false);
            setJoinError(''); setJoinForm({ code: '', password: '' });
          }}>
            Join by Code
          </button>
          <button className="btn btn-primary" onClick={() => {
            setShowCreate(true); setShowJoin(false);
            setCreateError(''); setCreatedSession(null);
          }}>
            + New Session
          </button>
        </div>
      </div>

      {/* Created Session — show code */}
      {createdSession && (
        <div className="card" style={{ marginBottom: 24, maxWidth: 440, border: '1px solid var(--accent)' }}>
          <p style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 8 }}>Session Created!</p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            Share this code with people you want to invite:
          </p>
          <div style={{
            background: 'var(--bg3)', borderRadius: 12, padding: 20,
            textAlign: 'center', marginBottom: 16,
            border: '1px solid var(--border)',
          }}>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>SESSION CODE</p>
            <p style={{ fontSize: 40, fontWeight: 900, letterSpacing: 10, color: 'var(--purple-light)', margin: 0 }}>
              {createdSession.code}
            </p>
            {createdSession.hasPassword && (
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
                Password protected — share the password separately
              </p>
            )}
          </div>
          <div className="flex gap-1">
            <button className="btn btn-ghost btn-sm w-full"
              onClick={() => navigator.clipboard.writeText(createdSession.code)}>
              Copy Code
            </button>
            <button className="btn btn-primary w-full"
              onClick={() => navigate(`/sync/${createdSession.session.id}`)}>
              Enter Session
            </button>
          </div>
        </div>
      )}

      {/* Create Session Form */}
      {showCreate && (
        <div className="card" style={{ marginBottom: 24, maxWidth: 440 }}>
          <h2 className="font-display" style={{ fontSize: 18, marginBottom: 16 }}>Create Session</h2>
          {createError && <div className="auth-msg error" style={{ marginBottom: 12 }}>{createError}</div>}
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="input-group">
              <label>Session Name</label>
              <input className="input" placeholder="e.g. Friday Night Vibes"
                value={createForm.name}
                onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
            <div className="input-group">
              <label>Password (optional)</label>
              <input className="input" type="password" placeholder="Leave blank for no password"
                value={createForm.password}
                onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} />
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Members must enter this password along with the code to join
              </p>
            </div>
            <div className="flex gap-1">
              <button type="button" className="btn btn-ghost w-full"
                onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary w-full" disabled={creating}>
                {creating ? 'Creating...' : 'Create Session'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Join by Code Form — ALWAYS requires manual code entry */}
      {showJoin && (
        <div className="card" style={{ marginBottom: 24, maxWidth: 440 }}>
          <h2 className="font-display" style={{ fontSize: 18, marginBottom: 4 }}>Join Session</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            Ask the host for the session code
          </p>
          {joinError && <div className="auth-msg error" style={{ marginBottom: 12 }}>{joinError}</div>}
          <form onSubmit={handleJoinByCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="input-group">
              <label>Session Code</label>
              <input
                className="input"
                placeholder="Enter 6-character code"
                value={joinForm.code}
                onChange={e => setJoinForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                maxLength={6}
                autoFocus
                autoComplete="off"
                style={{ letterSpacing: 8, fontWeight: 900, fontSize: 22, textAlign: 'center' }}
              />
            </div>
            <div className="input-group">
              <label>Password (if required)</label>
              <input className="input" type="password" placeholder="Leave blank if no password"
                value={joinForm.password}
                onChange={e => setJoinForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="flex gap-1">
              <button type="button" className="btn btn-ghost w-full"
                onClick={() => setShowJoin(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary w-full" disabled={joining}>
                {joining ? 'Joining...' : 'Join Session'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Sessions List — no direct join, info only */}
      {loading ? (
        <div className="flex justify-center" style={{ padding: 60 }}><div className="spinner" /></div>
      ) : sessions.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 48 }}>🎵</div>
          <p style={{ marginBottom: 12 }}>No active sessions. Create one and share the code!</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create Session</button>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            {sessions.length} active session{sessions.length !== 1 ? 's' : ''} — use the code to join
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sessions.map(s => (
              <div key={s.id} className="session-card">
                <div className="session-live-dot" />
                <div className="session-info" style={{ flex: 1 }}>
                  <div className="flex items-center gap-1">
                    <p className="session-name">{s.name}</p>
                    {s.has_password && (
                      <span className="badge badge-purple" style={{ fontSize: 10 }}>Private</span>
                    )}
                    {s.host_id === user?.id && (
                      <span className="badge badge-green" style={{ fontSize: 10 }}>YOUR SESSION</span>
                    )}
                  </div>
                  <p className="session-meta">
                    Hosted by {s.host_name} · {s.member_count} listening
                  </p>
                  {s.current_song_title && (
                    <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 4 }}>
                      Now playing: {s.current_song_title}
                      {s.current_song_artist && ` — ${s.current_song_artist}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="badge badge-green">LIVE</span>
                  {/* Host can enter directly, others must use code */}
                  {s.host_id === user?.id ? (
                    <button className="btn btn-primary btn-sm"
                      onClick={() => navigate(`/sync/${s.id}`)}>
                      Enter
                    </button>
                  ) : (
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setShowJoin(true);
                        setShowCreate(false);
                        setJoinError('');
                        setJoinForm({ code: '', password: '' }); // ← NEVER auto-fill
                      }}>
                      Join with Code
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default SyncPage;