import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import './Auth.css';

const Auth = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    newPassword: '',
  });
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef([]);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const clearMessages = () => { setError(''); setSuccess(''); };
  const otpValue = otp.join('');

  const handleOtpChange = (idx, val) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[idx] = val.slice(-1);
    setOtp(next);
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const handleOtpKey = (idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email: form.email, password: form.password });
      login(res.data.user, res.data.token);
      navigate('/');
    } catch (err) {
      if (err.response?.data?.needsVerification) {
        setPendingEmail(err.response.data.email);
        setMode('verify');
        setError('Please verify your email first.');
      } else {
        setError(err.response?.data?.error || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    clearMessages();
    if (form.password !== form.confirmPassword) return setError('Passwords do not match');
    setLoading(true);
    try {
      await api.post('/auth/register', { name: form.name, email: form.email, password: form.password });
      setPendingEmail(form.email);
      setMode('verify');
      setSuccess('Account created! Check your email for the OTP.');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    clearMessages();
    if (otpValue.length < 6) return setError('Enter the full 6-digit OTP');
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', { email: pendingEmail, otp: otpValue });
      login(res.data.user, res.data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    clearMessages();
    try {
      await api.post('/auth/resend-otp', { email: pendingEmail });
      setSuccess('OTP resent successfully!');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend OTP');
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: form.email });
      setPendingEmail(form.email);
      setOtp(['', '', '', '', '', '']);
      setMode('reset');
      setSuccess('OTP sent to your email.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    clearMessages();
    if (otpValue.length < 6) return setError('Enter the full 6-digit OTP');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { email: pendingEmail, otp: otpValue, newPassword: form.newPassword });
      setSuccess('Password reset successfully! Please log in.');
      setMode('login');
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed');
    } finally {
      setLoading(false);
    }
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
        {success && <div className="auth-msg success">{success}</div>}

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
              <button type="button" onClick={() => { setMode('forgot'); clearMessages(); }}>Forgot password?</button>
              <button type="button" onClick={() => { setMode('register'); clearMessages(); }}>Create account</button>
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
              <button type="button" onClick={() => { setMode('login'); clearMessages(); }}>Back to login</button>
            </div>
          </form>
        )}

        {mode === 'verify' && (
          <form className="auth-form" onSubmit={handleVerifyOTP}>
            <p className="auth-subtitle">Enter the 6-digit code sent to <strong>{pendingEmail}</strong></p>
            <div className="otp-inputs">
              {otp.map((d, i) => (
                <input
                  key={i}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  ref={(el) => (otpRefs.current[i] = el)}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKey(i, e)}
                />
              ))}
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={loading || otpValue.length < 6}>
              {loading ? 'Verifying...' : 'Verify Email'}
            </button>
            <div className="auth-links">
              <button type="button" onClick={handleResendOTP}>Resend OTP</button>
              <button type="button" onClick={() => setMode('login')}>Back</button>
            </div>
          </form>
        )}

        {mode === 'forgot' && (
          <form className="auth-form" onSubmit={handleForgot}>
            <p className="auth-subtitle">Enter your email to receive a reset OTP</p>
            <div className="input-group">
              <label>Email</label>
              <input className="input" type="email" placeholder="you@example.com" value={form.email} onChange={setField('email')} required />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
            <div className="auth-links">
              <button type="button" onClick={() => setMode('login')}>Back to login</button>
            </div>
          </form>
        )}

        {mode === 'reset' && (
          <form className="auth-form" onSubmit={handleReset}>
            <p className="auth-subtitle">Enter the OTP sent to <strong>{pendingEmail}</strong> and your new password</p>
            <div className="otp-inputs">
              {otp.map((d, i) => (
                <input
                  key={i}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  ref={(el) => (otpRefs.current[i] = el)}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKey(i, e)}
                />
              ))}
            </div>
            <div className="input-group">
              <label>New Password</label>
              <input className="input" type="password" placeholder="Min 6 characters" value={form.newPassword} onChange={setField('newPassword')} required />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
            <div className="auth-links">
              <button type="button" onClick={() => setMode('login')}>Back</button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};

export default Auth;