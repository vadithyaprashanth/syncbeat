import React, { useEffect, useRef, useState } from 'react';
import api from '../../utils/api';
import './PlayerBar.css';

const fmt = (s) => {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const PlayerBar = ({ song, isPlaying, setIsPlaying, onNext, onPrev, seekTo }) => {
  const audioRef = useRef(null);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const playCountedRef = useRef(false);
  const loadedUrlRef = useRef(null);
  const shouldPlayRef = useRef(false);

  const tryPlay = () => {
    if (!audioRef.current) return;
    audioRef.current.play()
      .then(() => console.log('[PlayerBar] play() succeeded'))
      .catch(e => console.warn('[PlayerBar] play() failed:', e.message));
  };

  // ── Load song whenever URL changes ───────────────────────────────────
  useEffect(() => {
    if (!song?.cloudinary_url || !audioRef.current) return;
    if (loadedUrlRef.current === song.cloudinary_url) return; // already loaded

    console.log('[PlayerBar] Loading new URL:', song.cloudinary_url);
    loadedUrlRef.current = song.cloudinary_url;
    shouldPlayRef.current = isPlaying;
    playCountedRef.current = false;

    audioRef.current.pause();
    audioRef.current.src = song.cloudinary_url;
    audioRef.current.load();
    setCurrent(0);
    setDuration(0);
  }, [song?.cloudinary_url]);

  // ── Play/pause when isPlaying changes ────────────────────────────────
  useEffect(() => {
    if (!audioRef.current || !song) return;
    shouldPlayRef.current = isPlaying;

    // If audio src not loaded yet, set it now
    if (song.cloudinary_url && audioRef.current.src !== song.cloudinary_url &&
        !audioRef.current.src.includes(song.cloudinary_url.split('/').pop())) {
      console.log('[PlayerBar] Setting src from isPlaying effect');
      audioRef.current.src = song.cloudinary_url;
      audioRef.current.load();
      loadedUrlRef.current = song.cloudinary_url;
      if (isPlaying) {
        // wait for canplay
        return;
      }
    }

    if (isPlaying) {
      tryPlay();
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  // ── Seek ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (seekTo !== null && seekTo !== undefined && seekTo > 0 && audioRef.current) {
      audioRef.current.currentTime = seekTo;
    }
  }, [seekTo]);

  // ── Volume ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const handleCanPlay = () => {
    console.log('[PlayerBar] canplay. shouldPlay:', shouldPlayRef.current);
    if (shouldPlayRef.current) tryPlay();
  };

  const handleTimeUpdate = () => {
    const t = audioRef.current?.currentTime || 0;
    setCurrent(t);
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
        onCanPlay={handleCanPlay}
        onEnded={onNext}
        onError={(e) => console.error('[PlayerBar] Audio error:', audioRef.current?.error)}
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
          <button className="ctrl-btn" onClick={onPrev}>⏮</button>
          <button className="ctrl-btn play" onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button className="ctrl-btn" onClick={onNext}>⏭</button>
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
          {muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
        </button>
        <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
          onChange={(e) => { setVolume(parseFloat(e.target.value)); setMuted(false); }}
          className="volume-slider" />
      </div>
    </div>
  );
};

export default PlayerBar;