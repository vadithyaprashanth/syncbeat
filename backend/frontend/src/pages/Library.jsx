import React, { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';
import SongCard from '../components/Player/SongCard';
import { useAuth } from '../context/AuthContext';

const Library = ({ currentSong, setCurrentSong, isPlaying, setIsPlaying, setQueue }) => {
  const { isAdmin } = useAuth();
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 24;

  const fetchSongs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/songs', { params: { search, page, limit: LIMIT } });
      setSongs(res.data.songs);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { fetchSongs(); }, [fetchSongs]);

  // debounce search
  useEffect(() => { setPage(1); }, [search]);

  const playSong = (song) => {
    setCurrentSong(song);
    setIsPlaying(true);
    setQueue(songs);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this song permanently?')) return;
    try {
      await api.delete(`/songs/${id}`);
      setSongs(s => s.filter(x => x.id !== id));
      setTotal(t => t - 1);
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="page-wrap">
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Library</h1>
        <span className="text-muted" style={{ fontSize: 13 }}>{total} songs</span>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 24, maxWidth: 360 }}>
        <input
          className="input"
          type="search"
          placeholder="🔍  Search songs, artists, albums…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center" style={{ padding: 60 }}><div className="spinner" /></div>
      ) : songs.length === 0 ? (
        <div className="empty-state">
          <p>{search ? `No results for "${search}"` : 'No songs yet.'}</p>
        </div>
      ) : (
        <>
          <div className="songs-grid">
            {songs.map(song => (
              <SongCard
                key={song.id}
                song={song}
                isActive={currentSong?.id === song.id}
                isPlaying={isPlaying}
                onPlay={() => playSong(song)}
                isAdmin={isAdmin}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span className="text-muted" style={{ fontSize: 13 }}>Page {page} of {totalPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Library;
