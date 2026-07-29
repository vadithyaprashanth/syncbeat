import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

/* global io */

const SessionRoom = ({ setCurrentSong, setIsPlaying, isPlaying, currentSong, setSeekTo }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [session, setSession] = useState(null);
  const [members, setMembers] = useState([]);
  const [songs, setSongs] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [activeTab, setActiveTab] = useState('queue');
  const [copied, setCopied] = useState('');
  const [syncStatus, setSyncStatus] = useState('Connecting...');
  const [sessionEnded, setSessionEnded] = useState(false);

  const socketRef = useRef(null);
  const chatEndRef = useRef(null);
  const isHostRef = useRef(false);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  useEffect(() => {
    if (!token) return;
    const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSyncStatus('Connected');
      socket.emit('join-session', { sessionId: id });
    });

    socket.on('session-state', (data) => {
      setSession(data);
      const hostStatus = data.host_id === user.id;
      setIsHost(hostStatus);
      isHostRef.current = hostStatus;

      if (data.currentSong?.cloudinary_url) {
        setSyncStatus(`Syncing: ${data.currentSong.title}`);
        setCurrentSong({ ...data.currentSong });
        setTimeout(() => {
          setIsPlaying(data.is_playing || false);
          if (data.current_position > 2 && setSeekTo) setSeekTo(data.current_position);
        }, 500);
      } else {
        setSyncStatus('Waiting for host to play a song');
      }

      if (data.chatHistory?.length > 0) {
        setMessages(data.chatHistory.map(m => ({
          id: m.id, userId: m.user_id, userName: m.user_name,
          message: m.message, createdAt: m.created_at,
        })));
      }
    });

    socket.on('user-joined', ({ user: u, members: updatedMembers }) => {
      if (updatedMembers) setMembers(updatedMembers);
      else setMembers(m => [...m.filter(x => x.id !== u.id), u]);
      addSystemMsg(`${u.name} joined`);
    });

    socket.on('user-left', ({ user: u, members: updatedMembers }) => {
      if (updatedMembers) setMembers(updatedMembers);
      else setMembers(m => m.filter(x => x.id !== u.id));
      addSystemMsg(`${u.name} left`);
    });

    socket.on('playback-sync', ({ isPlaying: ip, currentPosition }) => {
      setSyncStatus(ip ? 'Playing' : 'Paused');
      if (ip !== undefined) setIsPlaying(ip);
      if (currentPosition !== undefined && setSeekTo) setSeekTo(currentPosition);
    });

    socket.on('song-changed', ({ song, changedBy }) => {
      setSyncStatus(`Now: ${song.title}`);
      setCurrentSong({ ...song });
      setTimeout(() => setIsPlaying(true), 300);
      if (changedBy !== user.name) addSystemMsg(`Now playing: ${song.title}`);
    });

    socket.on('session-ended', () => {
      setSessionEnded(true);
      setCurrentSong(null);
      setIsPlaying(false);
      setTimeout(() => navigate('/sync'), 3000);
    });

    socket.on('chat-message', (msg) => setMessages(m => [...m, msg]));
    socket.on('connect_error', () => setSyncStatus('Reconnecting...'));
    socket.on('disconnect', () => setSyncStatus('Disconnected...'));
    socket.on('reconnect', () => {
      setSyncStatus('Reconnected');
      socket.emit('join-session', { sessionId: id });
    });
    socket.on('error', ({ message }) => setSyncStatus(`Error: ${message}`));

    // ── Global hooks for PlayerBar integration ─────────────────────────
    // Seek sync — only fires for host
    window.__sessionSeek = (time) => {
      if (isHostRef.current || user.role === 'admin') {
        socket.emit('playback-update', { sessionId: id, currentPosition: time });
      }
    };

    // Song change via next/prev buttons — only fires for host
    window.__sessionChangeSong = (songId) => {
      if (isHostRef.current || user.role === 'admin') {
        console.log('[Session] PlayerBar next/prev -> change-song:', songId);
        socket.emit('change-song', { sessionId: id, songId });
      }
    };

    return () => {
      window.__sessionSeek = null;
      window.__sessionChangeSong = null;
      socket.emit('leave-session', { sessionId: id });
      socket.disconnect();
    };
  }, [id, token]);

  useEffect(() => {
    const load = async () => {
      try {
        const [sessRes, songsRes] = await Promise.all([
          api.get(`/sessions/${id}`),
          api.get('/songs?limit=100'),
        ]);
        setSession(sessRes.data.session);
        setMembers(sessRes.data.members);
        setSongs(songsRes.data.songs);
        const hostStatus = sessRes.data.session.host_id === user.id;
        setIsHost(hostStatus);
        isHostRef.current = hostStatus;
      } catch (err) {
        navigate('/sync');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addSystemMsg = (text) => {
    setMessages(m => [...m, {
      id: Date.now(), system: true, message: text, createdAt: new Date().toISOString()
    }]);
  };

  const handlePlayPause = () => {
    if (!isHostRef.current && user.role !== 'admin') return;
    const next = !isPlaying;
    setIsPlaying(next);
    socketRef.current?.emit('playback-update', { sessionId: id, isPlaying: next });
  };

  const handleChangeSong = (song) => {
    if (!isHostRef.current && user.role !== 'admin') return;
    socketRef.current?.emit('change-song', { sessionId: id, songId: song.id });
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socketRef.current?.emit('chat-message', { sessionId: id, message: chatInput.trim() });
    setChatInput('');
  };

  const handleLeave = async () => {
    await api.post(`/sessions/${id}/leave`).catch(() => {});
    setCurrentSong(null);
    setIsPlaying(false);
    navigate('/sync');
  };

  const handleEnd = async () => {
    if (!window.confirm('End this session for everyone?')) return;
    socketRef.current?.emit('end-session', { sessionId: id });
    await api.delete(`/sessions/${id}`).catch(() => {});
    setCurrentSong(null);
    setIsPlaying(false);
    navigate('/sync');
  };

  const copyText = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const formatTime = (ts) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;

  if (sessionEnded) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', gap: 16,
        background: 'var(--bg)',
      }}>
        <div style={{ fontSize: 64 }}>🎵</div>
        <h2 className="font-display" style={{ fontSize: 24, color: 'var(--purple-light)' }}>
          Session Ended
        </h2>
        <p className="text-muted">The host ended this session. Redirecting you...</p>
        <div className="spinner" style={{ marginTop: 16 }} />
      </div>
    );
  }

  return (
    <div className="session-room">
      {/* Header */}
      <div className="session-room-header" style={{
        background: 'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, var(--bg2) 60%)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div>
          <div className="flex items-center" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)',
              animation: 'pulse 2s infinite', flexShrink: 0,
            }} />
            <h1 className="font-display" style={{ fontSize: 20, margin: 0 }}>{session?.name}</h1>
            {isHost && (
              <span style={{
                background: 'var(--purple-dim)', color: 'var(--purple-light)',
                borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 700,
              }}>HOST</span>
            )}
            {session?.code && (
              <span onClick={() => copyText(session.code, 'code')} style={{
                background: 'rgba(255,255,255,0.05)', color: 'var(--muted)',
                borderRadius: 6, padding: '3px 12px', fontSize: 13,
                letterSpacing: 5, fontWeight: 800, cursor: 'pointer',
                border: '1px solid var(--border)',
              }}>
                {session.code} {copied === 'code' ? '✓' : ''}
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            Hosted by {session?.host_name} · {members.length} listening
          </p>
        </div>
        <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm"
            onClick={() => copyText(session?.code || '', 'code')} style={{ fontSize: 12 }}>
            {copied === 'code' ? '✓ Copied' : 'Copy Code'}
          </button>
          <button className="btn btn-ghost btn-sm"
            onClick={() => copyText(window.location.href, 'link')} style={{ fontSize: 12 }}>
            {copied === 'link' ? '✓ Copied' : 'Copy Link'}
          </button>
          {(isHost || user.role === 'admin') && (
            <button className="btn btn-danger btn-sm" onClick={handleEnd} style={{ fontSize: 12 }}>
              End Session
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={handleLeave} style={{ fontSize: 12 }}>
            Leave
          </button>
        </div>
      </div>

      <div className="session-room-body">
        {/* Now Playing */}
        <div className="session-now-playing" style={{ position: 'relative', overflow: 'hidden' }}>
          {currentSong?.cover_url && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 0,
              backgroundImage: `url(${currentSong.cover_url})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
              filter: 'blur(40px) brightness(0.15)',
              transform: 'scale(1.2)',
            }} />
          )}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {currentSong ? (
              <>
                <img
                  src={currentSong.cover_url ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(currentSong.title)}&background=7c3aed&color=fff&size=200`}
                  alt={currentSong.title}
                  style={{
                    width: 200, height: 200, borderRadius: 16, objectFit: 'cover',
                    marginBottom: 24,
                    boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
                  }}
                />
                <h2 className="font-display" style={{
                  fontSize: 24, marginBottom: 4, textAlign: 'center',
                  textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                }}>
                  {currentSong.title}
                </h2>
                <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
                  {currentSong.artist || 'Unknown Artist'}
                </p>
                {(isHost || user.role === 'admin') ? (
                  <button onClick={handlePlayPause} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: isPlaying ? 'rgba(239,68,68,0.15)' : 'var(--purple)',
                    border: `1px solid ${isPlaying ? 'rgba(239,68,68,0.4)' : 'transparent'}`,
                    color: isPlaying ? '#fca5a5' : '#fff',
                    borderRadius: 10, padding: '10px 24px',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                    {isPlaying ? '⏸ Pause for Everyone' : '▶ Play for Everyone'}
                  </button>
                ) : (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    background: isPlaying ? 'rgba(6,214,160,0.1)' : 'rgba(107,114,128,0.1)',
                    border: `1px solid ${isPlaying ? 'rgba(6,214,160,0.3)' : 'rgba(107,114,128,0.2)'}`,
                    borderRadius: 10, padding: '10px 20px',
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: isPlaying ? 'var(--accent)' : 'var(--muted)',
                      animation: isPlaying ? 'pulse 1s infinite' : 'none', flexShrink: 0,
                    }} />
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: isPlaying ? 'var(--accent)' : 'var(--muted)', margin: 0 }}>
                        {syncStatus}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>Host controls playback</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.4 }}>🎵</div>
                <p style={{ color: 'var(--muted)', marginBottom: 8 }}>
                  {isHost ? 'Pick a song from the Queue to start' : 'Waiting for host to start playing...'}
                </p>
                <p style={{ fontSize: 12, color: 'rgba(107,114,128,0.6)' }}>{syncStatus}</p>
              </div>
            )}
          </div>
        </div>

        {/* Side Panel */}
        <div className="session-panel" style={{ background: 'var(--bg2)' }}>
          <div className="panel-tabs" style={{ padding: '0 4px' }}>
            {['queue', 'chat', 'members'].map(tab => (
              <button key={tab}
                className={`panel-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)} style={{ fontSize: 12 }}>
                {tab === 'queue' ? `Queue (${songs.length})`
                  : tab === 'chat' ? `Chat (${messages.filter(m => !m.system).length})`
                  : `Members (${members.length})`}
              </button>
            ))}
          </div>

          {activeTab === 'queue' && (
            <div className="panel-content">
              {!isHost && user.role !== 'admin' && (
                <div style={{
                  padding: '8px 12px', fontSize: 11, color: 'var(--muted)',
                  background: 'rgba(124,58,237,0.05)', borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ opacity: 0.6 }}>🔒</span> Only the host can select songs
                </div>
              )}
              {songs.map(song => (
                <div key={song.id}
                  onClick={() => handleChangeSong(song)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px',
                    cursor: (isHost || user.role === 'admin') ? 'pointer' : 'default',
                    background: currentSong?.id === song.id ? 'rgba(124,58,237,0.12)' : 'transparent',
                    borderLeft: currentSong?.id === song.id ? '2px solid var(--purple)' : '2px solid transparent',
                    transition: 'all 0.15s',
                    opacity: (!isHost && user.role !== 'admin') ? 0.65 : 1,
                  }}>
                  <img
                    src={song.cover_url ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(song.title)}&background=7c3aed&color=fff&size=40`}
                    alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <p style={{
                      fontSize: 13, fontWeight: currentSong?.id === song.id ? 700 : 500,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: currentSong?.id === song.id ? 'var(--purple-light)' : 'var(--text)', margin: 0,
                    }}>{song.title}</p>
                    <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>{song.artist || 'Unknown'}</p>
                  </div>
                  {currentSong?.id === song.id && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: 'var(--accent)',
                      background: 'rgba(6,214,160,0.1)', borderRadius: 4, padding: '2px 6px',
                    }}>
                      {isPlaying ? 'NOW' : 'PAUSED'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="panel-chat">
              <div className="chat-messages">
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                    <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>💬</div>
                    <p style={{ fontSize: 12 }}>No messages yet</p>
                  </div>
                )}
                {messages.map(msg => (
                  <div key={msg.id} style={{ marginBottom: 8 }}>
                    {msg.system ? (
                      <p style={{
                        fontSize: 11, color: 'var(--muted)', textAlign: 'center',
                        fontStyle: 'italic', margin: '4px 0',
                      }}>{msg.message}</p>
                    ) : (
                      <div style={{
                        background: msg.userId === user.id ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.04)',
                        borderRadius: 8, padding: '8px 10px',
                        borderLeft: msg.userId === user.id ? '2px solid var(--purple)' : '2px solid transparent',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: msg.userId === user.id ? 'var(--purple-light)' : 'var(--accent)',
                          }}>
                            {msg.userId === user.id ? 'You' : msg.userName}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>
                        <p style={{ fontSize: 13, margin: 0, lineHeight: 1.4, wordBreak: 'break-word' }}>
                          {msg.message}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form className="chat-input-row" onSubmit={handleSendChat}
                style={{ padding: 10, borderTop: '1px solid var(--border)', gap: 8 }}>
                <input className="input" style={{ flex: 1, fontSize: 13, borderRadius: 8 }}
                  placeholder="Message..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)} />
                <button type="submit" className="btn btn-primary btn-sm" style={{ borderRadius: 8, flexShrink: 0 }}>
                  Send
                </button>
              </form>
            </div>
          )}

          {activeTab === 'members' && (
            <div className="panel-content">
              {members.map(m => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8,
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: session?.host_id === m.id
                      ? 'linear-gradient(135deg, var(--purple), var(--purple-light))'
                      : 'var(--bg3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: '#fff',
                    flexShrink: 0, border: '1px solid var(--border)',
                  }}>
                    {m.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{m.name}</p>
                    {session?.host_id === m.id && (
                      <span style={{ fontSize: 10, color: 'var(--purple-light)', fontWeight: 700 }}>HOST</span>
                    )}
                  </div>
                  {session?.host_id === m.id && (
                    <div style={{ marginLeft: 'auto', fontSize: 14 }}>🎧</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SessionRoom;