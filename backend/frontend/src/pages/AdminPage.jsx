import React, { useEffect, useState } from 'react';
import api from '../utils/api';

const AdminPage = () => {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState('stats'); // stats | users | upload
  const [loading, setLoading] = useState(true);
  const [uploadForm, setUploadForm] = useState({ title: '', artist: '', album: '' });
  const [audioFile, setAudioFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [uploadErr, setUploadErr] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/admin/stats'),
      api.get('/admin/users'),
    ]).then(([s, u]) => {
      setStats(s.data);
      setUsers(u.data.users);
    }).finally(() => setLoading(false));
  }, []);

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Delete this user?')) return;
    try {
      await api.delete(`/admin/users/${id}`);
      setUsers(u => u.filter(x => x.id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setUploadMsg(''); setUploadErr('');
    if (!audioFile) return setUploadErr('Audio file required');
    if (!uploadForm.title) return setUploadErr('Title required');

    setUploading(true);
    const fd = new FormData();
    fd.append('audio', audioFile);
    if (coverFile) fd.append('cover', coverFile);
    fd.append('title', uploadForm.title);
    fd.append('artist', uploadForm.artist);
    fd.append('album', uploadForm.album);

    try {
      await api.post('/songs', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setUploadMsg('Song uploaded successfully!');
      setUploadForm({ title: '', artist: '', album: '' });
      setAudioFile(null); setCoverFile(null);
      e.target.reset();
    } catch (err) {
      setUploadErr(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;

  return (
    <div className="page-wrap">
      <h1 className="page-title">⚙️ Admin Panel</h1>

      {/* Tabs */}
      <div className="admin-tabs">
        {['stats', 'upload', 'users'].map(t => (
          <button key={t} className={`panel-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'stats' ? '📊 Stats' : t === 'upload' ? '⬆ Upload Song' : `👥 Users (${users.length})`}
          </button>
        ))}
      </div>

      {/* Stats */}
      {tab === 'stats' && stats && (
        <div className="stats-grid">
          {[
            { label: 'Total Users', value: stats.totalUsers, icon: '👥' },
            { label: 'Total Songs', value: stats.totalSongs, icon: '🎵' },
            { label: 'Active Sessions', value: stats.activeSessions, icon: '🔄' },
            { label: 'Total Plays', value: stats.totalPlays, icon: '▶' },
          ].map(({ label, value, icon }) => (
            <div key={label} className="stat-card">
              <div className="stat-icon">{icon}</div>
              <div className="stat-value">{value.toLocaleString()}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Upload */}
      {tab === 'upload' && (
        <div className="card" style={{ maxWidth: 560 }}>
          <h2 className="font-display" style={{ fontSize: 18, marginBottom: 20 }}>Upload New Song</h2>
          {uploadMsg && <div className="auth-msg success" style={{ marginBottom: 16 }}>✓ {uploadMsg}</div>}
          {uploadErr && <div className="auth-msg error" style={{ marginBottom: 16 }}>⚠ {uploadErr}</div>}
          <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="input-group">
              <label>Title *</label>
              <input className="input" placeholder="Song title" value={uploadForm.title} onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))} required />
            </div>
            <div className="input-group">
              <label>Artist</label>
              <input className="input" placeholder="Artist name" value={uploadForm.artist} onChange={e => setUploadForm(f => ({ ...f, artist: e.target.value }))} />
            </div>
            <div className="input-group">
              <label>Album</label>
              <input className="input" placeholder="Album name" value={uploadForm.album} onChange={e => setUploadForm(f => ({ ...f, album: e.target.value }))} />
            </div>
            <div className="input-group">
              <label>Audio File * (MP3, WAV, FLAC – max 50MB)</label>
              <input type="file" className="input" accept="audio/*" onChange={e => setAudioFile(e.target.files[0])} required />
            </div>
            <div className="input-group">
              <label>Cover Image (JPG, PNG – max 5MB)</label>
              <input type="file" className="input" accept="image/*" onChange={e => setCoverFile(e.target.files[0])} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={uploading}>
              {uploading ? 'Uploading to Cloudinary…' : '⬆ Upload Song'}
            </button>
          </form>
        </div>
      )}

      {/* Users */}
      {tab === 'users' && (
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Verified</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{u.email}</td>
                  <td><span className={`badge ${u.role === 'admin' ? 'badge-purple' : 'badge-green'}`}>{u.role}</span></td>
                  <td>{u.is_verified ? '✅' : '❌'}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    {u.role !== 'admin' && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(u.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminPage;
