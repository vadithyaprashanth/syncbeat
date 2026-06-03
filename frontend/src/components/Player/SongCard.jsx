import React from 'react';
import './SongCard.css';

const SongCard = ({ song, isPlaying, isActive, onPlay, onDelete, isAdmin }) => {
  const cover = song.cover_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(song.title)}&background=7c3aed&color=fff&size=200`;

  return (
    <div className={`song-card ${isActive ? 'active' : ''}`}>
      <div className="song-cover-wrap" onClick={onPlay}>
        <img src={cover} alt={song.title} className="song-cover" />
        <div className="song-overlay">
          <button className="play-btn">{isActive && isPlaying ? '⏸' : '▶'}</button>
        </div>
        {isActive && isPlaying && (
          <div className="playing-bars">
            <span /><span /><span /><span />
          </div>
        )}
      </div>
      <div className="song-info">
        <p className="song-title" title={song.title}>{song.title}</p>
        <p className="song-artist" title={song.artist}>{song.artist || 'Unknown Artist'}</p>
      </div>
      {isAdmin && (
        <button className="song-delete-btn" onClick={(e) => { e.stopPropagation(); onDelete(song.id); }} title="Delete">🗑</button>
      )}
    </div>
  );
};

export default SongCard;
