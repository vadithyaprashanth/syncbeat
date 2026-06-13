import React, { useEffect, useRef, useState } from 'react';
import api from '../../utils/api';
import './PlayerBar.css';

const fmt = (s) => {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const PlayerBar = ({ song, isPlaying, setIsPlaying, onNext, onPrev, seekTo, onTimeUpdate }) => {
  const audioRef = useRef(null);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const playCountedRef = useRef(false);
  const prevSongRef = useRef(null);

  // Load new song when it changes
  useEffect(() => {
    if (!audioRef.current || !song) return;
    if (prevSongRef.current !== song.id) {
      prevSongRef.current = song.id;
      audioRef.current.src = song.cloudinary_url;
      audioRef.current.load();
      setCurrent(0);
      playCountedRef.current = false;
      if (isPlaying) {
        audioRef.current.play().catch(e => console.warn('Autoplay blocked:', e));
      }
    }
  }, [song]);

  // Handle play/pause changes
  useEffect(() => {
    if (!audioRef.current || !song) return;
    if (isPlaying) {
      audioRef.current.play().catch(e => console.warn('Play failed:', e));
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  // Handle external seek (from sync)
  useEffect(() => {
    if (!audioRef.current || seekTo === undefined || seekTo === null) return;
    audioRef.current.currentTime = seekTo;
  }, [seekTo]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const handleTimeUpdate = () => {
    const t = audioRef.current?.currentTime || 0;
    setCurrent(t);
    if (onTimeUpdate) onTimeUpdate(t);
    if (t > 30 && !playCountedRef.current && song) {
      playCountedRef.current = true;
      api.post(`/songs/${song.id}/play`).catch(() => {});
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = pct * duration;
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrent(t);
  };

  if (!song) return null;

  const cover = song.cover_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(song.title)}&background=7c3aed&color=fff&size=80`;

  return (
    <div className="player-bar">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={onNext}
        onCanPlay={() => {
          if (isPlaying) audioRef.current?.play().catch(() => {});
        }}
      />

      <div className="player-info">
        <img src={cover} alt={song.title} className="player-cover" />
        <div>
          <p className="player-title">{song.title}</p>
          <p className="player-artist">{song.artist || 'Unknown'}</p>
        </div>
      </div>

      <div className="player-controls">
        <div className="player-buttons">
          <button className="ctrl-btn" onClick={onPrev}>prev</button>
          <button className="ctrl-btn play" onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? 'II' : '▶'}
          </button>
          <button className="ctrl-btn" onClick={onNext}>next</button>
        </div>
        <div className="player-seek">
          <span className="time">{fmt(current)}</span>
          <div className="progress-bar" onClick={handleSeek}>
            <div className="progress-bar-fill"
              style={{ width: duration ? `${(current / duration) * 100}%` : '0%' }} />
          </div>
          <span className="time">{fmt(duration)}</span>
        </div>
      </div>

      <div className="player-volume">
        <button className="ctrl-btn" onClick={() => setMuted(!muted)}>
          {muted || volume === 0 ? 'mute' : 'vol'}
        </button>
        <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
          onChange={(e) => { setVolume(parseFloat(e.target.value)); setMuted(false); }}
          className="volume-slider" />
      </div>
    </div>
  );
};

export default PlayerBar;