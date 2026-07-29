import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Layout/Sidebar';
import PlayerBar from './components/Player/PlayerBar';
import Home from './pages/Home';
import Library from './pages/Library';
import SyncPage from './pages/SyncPage';
import SessionRoom from './pages/SessionRoom';
import AdminPage from './pages/AdminPage';
import Auth from './pages/Auth';
import './App.css';
import './pages/pages.css';

// Suppress unhandled 401/403 promise errors
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.response?.status === 401 || e.reason?.response?.status === 403) {
    e.preventDefault();
  }
});

const ProtectedLayout = () => {
  const { user, loading } = useAuth();
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);
  const [seekTo, setSeekTo] = useState(null);

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/auth" replace />;

  const playerProps = {
    currentSong, setCurrentSong,
    isPlaying, setIsPlaying,
    queue, setQueue,
    setSeekTo,
  };

  const handleNext = () => {
    if (!queue.length || !currentSong) return;
    const idx = queue.findIndex(s => s.id === currentSong.id);
    const next = queue[(idx + 1) % queue.length];
    if (next) {
      setCurrentSong(next);
      setIsPlaying(true);
      // Sync to session members if host is in a room
      if (window.__sessionChangeSong) window.__sessionChangeSong(next.id);
    }
  };

  const handlePrev = () => {
    if (!queue.length || !currentSong) return;
    const idx = queue.findIndex(s => s.id === currentSong.id);
    const prev = queue[(idx - 1 + queue.length) % queue.length];
    if (prev) {
      setCurrentSong(prev);
      setIsPlaying(true);
      // Sync to session members if host is in a room
      if (window.__sessionChangeSong) window.__sessionChangeSong(prev.id);
    }
  };

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home {...playerProps} />} />
          <Route path="/library" element={<Library {...playerProps} />} />
          <Route path="/sync" element={<SyncPage />} />
          <Route path="/sync/:id" element={<SessionRoom {...playerProps} />} />
          <Route path="/admin" element={
            user.role === 'admin' ? <AdminPage /> : <Navigate to="/" replace />
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <PlayerBar
        song={currentSong}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        onNext={handleNext}
        onPrev={handlePrev}
        seekTo={seekTo}
      />
    </div>
  );
};

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthRoute />} />
        <Route path="/auth/callback" element={<AuthRoute />} />
        <Route path="/*" element={<ProtectedLayout />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

const AuthRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loader"><div className="spinner" /></div>;
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
};

export default App;