const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { auth, adminOnly } = require('../middleware/auth');
const authCtrl = require('../controllers/authController');
const songsCtrl = require('../controllers/songsController');
const sessionsCtrl = require('../controllers/sessionsController');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, try again later' },
});

const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { error: 'Too many OTP requests, wait a minute' },
});

// ── Auth ──────────────────────────────────────────────────────────────────
router.post('/auth/register',        authLimiter, authCtrl.register);
router.post('/auth/verify-otp',      authLimiter, authCtrl.verifyOTP);
router.post('/auth/resend-otp',      otpLimiter,  authCtrl.resendOTP);
router.post('/auth/login',           authLimiter, authCtrl.login);
router.post('/auth/forgot-password', otpLimiter,  authCtrl.forgotPassword);
router.post('/auth/reset-password',  authLimiter, authCtrl.resetPassword);
router.get( '/auth/me',              auth,        authCtrl.getMe);

// ── Songs ─────────────────────────────────────────────────────────────────
router.get(   '/songs',          auth,                         songsCtrl.getSongs);
router.get(   '/songs/:id',      auth,                         songsCtrl.getSongById);
router.post(  '/songs',          auth, adminOnly, songsCtrl.uploadMiddleware, songsCtrl.uploadSong);
router.delete('/songs/:id',      auth, adminOnly,              songsCtrl.deleteSong);
router.post(  '/songs/:id/play', auth,                         songsCtrl.incrementPlay);

// ── Sessions ──────────────────────────────────────────────────────────────
router.get(   '/sessions',           auth, sessionsCtrl.getSessions);
router.post(  '/sessions',           auth, sessionsCtrl.createSession);
router.get(   '/sessions/:id',       auth, sessionsCtrl.getSession);
router.post(  '/sessions/:id/join',  auth, sessionsCtrl.joinSession);
router.post(  '/sessions/:id/leave', auth, sessionsCtrl.leaveSession);
router.delete('/sessions/:id',       auth, sessionsCtrl.endSession);

// ── Admin ─────────────────────────────────────────────────────────────────
router.get(   '/admin/stats',     auth, adminOnly, sessionsCtrl.getStats);
router.get(   '/admin/users',     auth, adminOnly, sessionsCtrl.getAllUsers);
router.delete('/admin/users/:id', auth, adminOnly, sessionsCtrl.deleteUser);

module.exports = router;