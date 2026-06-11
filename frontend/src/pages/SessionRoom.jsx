import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const SessionRoom = ({ setCurrentSong, setIsPlaying, isPlaying, currentSong }) => {
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
  const [copied, setCopied] = useState(false);

  const socketRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const socket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.emit('join-session', { sessionId: id });

    socket.on('session-state', (data) => {
      setSession(data);
      setIsHost(data.host_id === user.id);
      if (data.chatHistory?.length > 0) {
        setMessages(data.chatHistory.map(m => ({
          id: m.id, userId: m.user_id, userName: m.user_name,
          message: m.message, createdAt: m.created_at,
        })));
      }
      // Sync current song if session has one playing
      if (data.current_song_id && data.current_song_url) {
        setCurrentSong({
          id: data.current_song_id,
          title: data.current_song_title,
          artist: data.current_song_artist,
          cover_url: data.current_song_cover,
          cloudinary_url: data.current_song_url,
        });
        setIsPlaying(data.is_playing);
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

    socket.on('playback-sync', ({ isPlaying: ip, currentPosition, songId }) => {
      if (ip !== undefined) setIsPlaying(ip);
    });

    socket.on('song-changed', ({ song }) => {
      setCurrentSong(song);
      setIsPlaying(true);
      addSystemMsg(`Now playing: ${song.title}`);
    });

    socket.on('chat-message', (msg) => {
      setMessages(m => [...m, msg]);
    });

    socket.on('error', ({ message }) => console.error('Socket error:', message));

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
        setIsHost(sessRes.data.session.host_id === user.id);
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
    setMessages(m => [...m, { id: Date.now(), system: true, message: text, createdAt: new Date().toISOString() }]);
  };

  const handlePlayPause = () => {
    if (!isHost && user.role !== 'admin') return;
    const next = !isPlaying;
    setIsPlaying(next);
    socketRef.current?.emit('playback-update', { sessionId: id, isPlaying: next });
  };

  const handleChangeSong = (song) => {
    if (!isHost && user.role !== 'admin') return;
    socketRef.current?.emit('change-song', { sessionId: id, songId: song.id });
    setCurrentSong(song);
    setIsPlaying(true);
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socketRef.current?.emit('chat-message', { sessionId: id, message: chatInput.trim() });
    setChatInput('');
  };

  const handleLeave = async () => {
    await api.post(`/sessions/${id}/leave`).catch(() => {});
    navigate('/sync');
  };

  const handleEnd = async () => {
    if (!window.confirm('End this session for everyone?')) return;
    await api.delete(`/sessions/${id}`).catch(() => {});
    navigate('/sync');
  };

  const copyCode = () => {
    if (session?.code) {
      navigator.clipboard.writeText(session.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;

  return (
    <div className="session-room">
      <div className="session-room-header">
        <div>
          <div className="flex items-center gap-1" style={{ flexWrap: 'wrap' }}>
            <div className="session-live-dot" />
            <h1 className="font-display" style={{ fontSize: 20 }}>{session?.name}</h1>
            {isHost && <span className="badge badge-purple">HOST</span>}
            {session?.code && (
              <span
                style={{ fontSize: 13, color: 'var(--muted)', cursor: 'pointer', letterSpacing: 2, fontWeight: 700 }}
                onClick={copyCode}
                title="Click to copy code"
              >
                Code: {session.code} {copied ? '(Copied!)' : ''}
              </span>
            )}
          </div>
          <p className="text-muted" style={{ fontSize: 13 }}>
            Hosted by {session?.host_name} · {members.length} listening
          </p>
        </div>
        <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={copyLink}>Copy Invite Link</button>
          <button className="btn btn-ghost btn-sm" onClick={copyCode}>Copy Code</button>
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
                src={currentSong.cover_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentSong.title)}&background=7c3aed&color=fff&size=200`}
                alt={currentSong.title}
                className="now-playing-cover"
              />
              <h2 className="font-display" style={{ fontSize: 22, marginBottom: 4 }}>{currentSong.title}</h2>
              <p className="text-muted">{currentSong.artist || 'Unknown Artist'}</p>
              {(isHost || user.role === 'admin') ? (
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handlePlayPause}>
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
              ) : (
                <p className="text-muted" style={{ fontSize: 12, marginTop: 12 }}>
                  Only the host controls playback
                </p>
              )}
            </>
          ) : (
            <div className="empty-state">
              <div style={{ fontSize: 48 }}>🎵</div>
              <p>{isHost ? 'Pick a song from the queue to start' : 'Waiting for host to play a song...'}</p>
            </div>
          )}
        </div>

        <div className="session-panel">
          <div className="panel-tabs">
            {['queue', 'chat', 'members'].map(tab => (
              <button key={tab} className={`panel-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                {tab === 'queue' ? 'Queue' : tab === 'chat' ? `Chat (${messages.filter(m => !m.system).length})` : `Members (${members.length})`}
              </button>
            ))}
          </div>

          {activeTab === 'queue' && (
            <div className="panel-content">
              {!isHost && user.role !== 'admin' && (
                <p style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                  Only the host can change songs
                </p>
              )}
              {songs.length === 0 ? (
                <p className="text-muted" style={{ padding: 16, fontSize: 13 }}>No songs in library.</p>
              ) : songs.map(song => (
                <div
                  key={song.id}
                  className={`queue-item ${currentSong?.id === song.id ? 'active' : ''} ${!isHost && user.role !== 'admin' ? 'disabled' : ''}`}
                  onClick={() => handleChangeSong(song)}
                >
                  <img
                    src={song.cover_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(song.title)}&background=7c3aed&color=fff&size=40`}
                    alt="" className="queue-cover"
                  />
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--muted)' }}>{song.artist || 'Unknown'}</p>
                  </div>
                  {currentSong?.id === song.id && <span style={{ color: 'var(--purple-light)', fontSize: 12 }}>Playing</span>}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="panel-chat">
              <div className="chat-messages">
                {messages.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
                    No messages yet. Say something!
                  </p>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className={`chat-msg ${msg.system ? 'system' : ''}`}>
                    {msg.system ? (
                      <p className="system-msg">{msg.message}</p>
                    ) : (
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