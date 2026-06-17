
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

  const socketRef = useRef(null);
  const chatEndRef = useRef(null);
  const isHostRef = useRef(false);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  useEffect(() => {
    const socket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000', {
      auth: { token },
      transports: ['websocket', 'polling'],
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

      if (data.currentSong && data.currentSong.cloudinary_url) {
        setSyncStatus(`Syncing: ${data.currentSong.title}`);
        // Force new object reference so PlayerBar detects change
        setCurrentSong({ ...data.currentSong, _ts: Date.now() });
        setIsPlaying(data.is_playing || false);
        if (data.current_position > 2 && setSeekTo) {
          setTimeout(() => setSeekTo(data.current_position), 1000);
        }
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
      if (ip !== undefined) {
        setSyncStatus(ip ? 'Playing' : 'Paused');
        setIsPlaying(ip);
      }
      if (currentPosition !== undefined && setSeekTo) setSeekTo(currentPosition);
    });

    socket.on('song-changed', ({ song, changedBy }) => {
      setSyncStatus(`Now playing: ${song.title}`);
      // Force new object so PlayerBar always detects it as a new song
      setCurrentSong({ ...song, _ts: Date.now() });
      setTimeout(() => setIsPlaying(true), 200);
      if (changedBy !== user.name) addSystemMsg(`Now playing: ${song.title}`);
    });

    socket.on('chat-message', (msg) => {
      setMessages(m => [...m, msg]);
    });

    socket.on('disconnect', () => setSyncStatus('Disconnected - reconnecting...'));
    socket.on('error', ({ message }) => setSyncStatus(`Error: ${message}`));

    return () => {
      socket.emit('leave-session', { sessionId: id });
      socket.disconnect();
    };
  }, [id, token]);

  useEffect(() => {
    const load = async () => {
      try {
        const [sessRes, songsRes] = await Promise.all([
          api.get(`/sessions/${id}`),
          api.get('/songs?limit=50'),
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

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;

  return (
    <div className="session-room">
      <div className="session-room-header">
        <div>
          <div className="flex items-center gap-1" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div className="session-live-dot" />
            <h1 className="font-display" style={{ fontSize: 20 }}>{session?.name}</h1>
            {isHost && <span className="badge badge-purple">HOST</span>}
            {session?.code && (
              <span onClick={() => copyText(session.code, 'code')} style={{
                background: 'var(--purple-dim)', color: 'var(--purple-light)',
                borderRadius: 6, padding: '2px 12px', fontSize: 14,
                letterSpacing: 4, fontWeight: 900, cursor: 'pointer',
              }}>
                {session.code} {copied === 'code' ? '✓' : ''}
              </span>
            )}
          </div>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
            Hosted by {session?.host_name} · {members.length} listening
          </p>
        </div>
        <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => copyText(session?.code || '', 'code')}>
            {copied === 'code' ? 'Copied!' : 'Copy Code'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => copyText(window.location.href, 'link')}>
            {copied === 'link' ? 'Copied!' : 'Copy Link'}
          </button>
          {(isHost || user.role === 'admin') && (
            <button className="btn btn-danger btn-sm" onClick={handleEnd}>End Session</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={handleLeave}>Leave</button>
        </div>
      </div>

      <div className="session-room-body">
        <div className="session-now-playing">
          {currentSong ? (
            <>
              <img
                src={currentSong.cover_url ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(currentSong.title)}&background=7c3aed&color=fff&size=200`}
                alt={currentSong.title} className="now-playing-cover"
              />
              <h2 className="font-display" style={{ fontSize: 22, marginBottom: 4 }}>
                {currentSong.title}
              </h2>
              <p className="text-muted">{currentSong.artist || 'Unknown Artist'}</p>

              {(isHost || user.role === 'admin') ? (
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handlePlayPause}>
                  {isPlaying ? 'Pause for Everyone' : 'Play for Everyone'}
                </button>
              ) : (
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: isPlaying ? 'rgba(6,214,160,0.1)' : 'rgba(124,58,237,0.1)',
                    border: `1px solid ${isPlaying ? 'var(--accent)' : 'var(--purple)'}`,
                    borderRadius: 8, padding: '8px 16px',
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: isPlaying ? 'var(--accent)' : 'var(--muted)',
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: isPlaying ? 'var(--accent)' : 'var(--muted)' }}>
                      {syncStatus}
                    </span>
                  </div>
                  <p className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>
                    Host controls playback for everyone
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <div style={{ fontSize: 48 }}>🎵</div>
              <p style={{ marginBottom: 8 }}>
                {isHost ? 'Select a song from Queue to start' : 'Waiting for host to start playing...'}
              </p>
              {!isHost && (
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>{syncStatus}</p>
              )}
            </div>
          )}
        </div>

        <div className="session-panel">
          <div className="panel-tabs">
            {['queue', 'chat', 'members'].map(tab => (
              <button key={tab} className={`panel-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}>
                {tab === 'queue' ? 'Queue'
                  : tab === 'chat' ? `Chat (${messages.filter(m => !m.system).length})`
                  : `Members (${members.length})`}
              </button>
            ))}
          </div>

          {activeTab === 'queue' && (
            <div className="panel-content">
              {!isHost && user.role !== 'admin' && (
                <p style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
                  Only the host can select songs
                </p>
              )}
              {songs.map(song => (
                <div key={song.id}
                  className={`queue-item ${currentSong?.id === song.id ? 'active' : ''} ${!isHost && user.role !== 'admin' ? 'disabled' : ''}`}
                  onClick={() => handleChangeSong(song)}>
                  <img src={song.cover_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(song.title)}&background=7c3aed&color=fff&size=40`}
                    alt="" className="queue-cover" />
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--muted)' }}>{song.artist || 'Unknown'}</p>
                  </div>
                  {currentSong?.id === song.id && (
                    <span style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 700 }}>
                      {isPlaying ? 'PLAYING' : 'PAUSED'}
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
                  <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>No messages yet.</p>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className={`chat-msg ${msg.system ? 'system' : ''}`}>
                    {msg.system ? <p className="system-msg">{msg.message}</p> : (
                      <div style={{ width: '100%' }}>
                        <div className="flex justify-between items-center" style={{ marginBottom: 2 }}>
                          <span className="chat-author" style={{ color: msg.userId === user.id ? 'var(--accent)' : 'var(--purple-light)' }}>
                            {msg.userId === user.id ? 'You' : msg.userName}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--muted)' }}>{formatTime(msg.createdAt)}</span>
                        </div>
                        <span className="chat-text">{msg.message}</span>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form className="chat-input-row" onSubmit={handleSendChat}>
                <input className="input" style={{ flex: 1, fontSize: 13 }} placeholder="Type a message..."
                  value={chatInput} onChange={e => setChatInput(e.target.value)} />
                <button type="submit" className="btn btn-primary btn-sm">Send</button>
              </form>
            </div>
          )}

          {activeTab === 'members' && (
            <div className="panel-content">
              {members.map(m => (
                <div key={m.id} className="member-item">
                  <div className="user-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
                    {m.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</p>
                    {session?.host_id === m.id && <span className="badge badge-purple" style={{ fontSize: 10 }}>HOST</span>}
                  </div>
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