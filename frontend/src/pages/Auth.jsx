import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import './Auth.css';

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Handle Google OAuth callback
  useEffect(() => {
    const token = searchParams.get('token');
    const userParam = searchParams.get('user');
    const err = searchParams.get('error');

    if (err) {
      setError('Google sign in failed. Please try again.');
      return;
    }

    if (token && userParam) {
      try {
        const user = JSON.parse(decodeURIComponent(userParam));
        login(user, token);
        navigate('/');
      } catch (e) {
        setError('Login failed. Please try again.');
      }
    }
  }, [searchParams]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email: form.email, password: form.password });
      login(res.data.user, res.data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword)
      return setError('Passwords do not match');
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        name: form.name,
        email: form.email,
        password: form.password,
      });
      login(res.data.user, res.data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    const backendURL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';
    window.location.href = `${backendURL}/api/auth/google`;
  };

  return (
    <div className="auth-page">
      <div className="auth-bg" />
      <div className="auth-card">
        <div className="auth-logo">
          <h1>SyncBeat</h1>
          <p>Listen Together in Perfect Sync</p>
        </div>

        {error && <div className="auth-msg error">{error}</div>}

        {/* Google Sign In Button */}
        <button className="google-btn" onClick={handleGoogleLogin}>
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

        <div className="auth-divider">
          <span>or</span>
        </div>

        {mode === 'login' && (
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="input-group">
              <label>Email</label>
              <input className="input" type="email" placeholder="you@example.com" value={form.email} onChange={setField('email')} required />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input className="input" type="password" placeholder="Your password" value={form.password} onChange={setField('password')} required />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <div className="auth-links">
              <button type="button" onClick={() => { setMode('register'); setError(''); }}>
                Create account
              </button>
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="input-group">
              <label>Name</label>
              <input className="input" type="text" placeholder="Your name" value={form.name} onChange={setField('name')} required />
            </div>
            <div className="input-group">
              <label>Email</label>
              <input className="input" type="email" placeholder="you@example.com" value={form.email} onChange={setField('email')} required />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input className="input" type="password" placeholder="Min 6 characters" value={form.password} onChange={setField('password')} required />
            </div>
            <div className="input-group">
              <label>Confirm Password</label>
              <input className="input" type="password" placeholder="Repeat password" value={form.confirmPassword} onChange={setField('confirmPassword')} required />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? 'Creating...' : 'Create Account'}
            </button>
            <div className="auth-links">
              <button type="button" onClick={() => { setMode('login'); setError(''); }}>
                Back to login
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default Auth;