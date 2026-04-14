'use strict';

// Load .env if present (optional — falls back to process.env)
try {
  require('fs').readFileSync('.env', 'utf8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
} catch (_) {
  // .env not found — rely on actual process.env
}

const express = require('express');
const jwt = require('jsonwebtoken');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());

// ---- Config ----
const APP_ID = process.env.CHERRY_APP_ID || '';
const APP_SECRET = process.env.CHERRY_APP_SECRET || '';
const ROOM_ID = process.env.CHERRY_ROOM_ID || '';
const CHERRY_EMBED_URL = process.env.CHERRY_EMBED_URL || 'http://localhost:3001';
const PORT = parseInt(process.env.PORT || '8080', 10);

// ---- In-memory session store (use Redis/DB in production) ----
// Key variants:
//   "nonce:<hex>"        -> { createdAt: number }
//   "<sessionToken>"     -> walletAddress string
const sessions = new Map();

// ---- Static files ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- Serve the embed SDK IIFE bundle ----
app.get('/cherry-embed.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.global.js'));
});

// ---- GET /api/config — public config for the frontend ----
app.get('/api/config', (req, res) => {
  res.json({
    appId: APP_ID,
    roomId: ROOM_ID,
    embedUrl: CHERRY_EMBED_URL,
    configured: !!(APP_ID && APP_SECRET && ROOM_ID),
  });
});

// ---- POST /api/auth/challenge — issue a nonce for wallet signing ----
app.post('/api/auth/challenge', (req, res) => {
  const nonce = crypto.randomBytes(32).toString('hex');
  const nonceKey = `nonce:${nonce}`;
  sessions.set(nonceKey, { createdAt: Date.now() });
  // Auto-expire after 5 minutes
  setTimeout(() => sessions.delete(nonceKey), 5 * 60 * 1000);
  res.json({ nonce });
});

// ---- POST /api/auth/verify — verify Solana wallet signature ----
app.post('/api/auth/verify', (req, res) => {
  const { walletAddress, signature, nonce } = req.body;

  if (!walletAddress || !signature || !nonce) {
    return res.status(400).json({ error: 'Missing required fields: walletAddress, signature, nonce' });
  }

  // Verify the nonce exists and has not been consumed yet
  const nonceKey = `nonce:${nonce}`;
  if (!sessions.has(nonceKey)) {
    return res.status(401).json({ error: 'Invalid or expired nonce' });
  }
  sessions.delete(nonceKey);

  // The frontend signs exactly this message
  const message = `Sign in to Cherry Embed Example\nNonce: ${nonce}`;
  const messageBytes = new TextEncoder().encode(message);

  try {
    // bs58 v5 exports are CJS-compatible but may be wrapped
    const decode = bs58.default ? bs58.default.decode : bs58.decode;
    const signatureBytes = decode(signature);
    const publicKeyBytes = decode(walletAddress);

    const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } catch (err) {
    console.error('Signature verification error:', err);
    return res.status(401).json({ error: 'Signature verification failed' });
  }

  // Issue a session token
  const sessionToken = crypto.randomBytes(32).toString('hex');
  sessions.set(sessionToken, walletAddress);

  res.json({ sessionToken, walletAddress });
});

// ---- GET /api/embed-token — generate Cherry embed JWT for authenticated user ----
app.get('/api/embed-token', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const sessionToken = authHeader.slice(7);
  const walletAddress = sessions.get(sessionToken);
  if (!walletAddress) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  if (!APP_SECRET) {
    return res.status(500).json({ error: 'CHERRY_APP_SECRET is not configured — see .env.example' });
  }

  if (!APP_ID) {
    return res.status(500).json({ error: 'CHERRY_APP_ID is not configured — see .env.example' });
  }

  // Sign the embed token exactly as Cherry server expects:
  //   sub  = walletAddress (valid Solana public key)
  //   app_id = APP_ID
  //   jti  = unique UUID (replay protection via Redis on server side)
  //   exp  = 5 minutes
  //   alg  = HS256
  const embedToken = jwt.sign(
    {
      sub: walletAddress,
      app_id: APP_ID,
    },
    APP_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '5m',
      jwtid: crypto.randomUUID(),
    },
  );

  res.json({ embedToken, walletAddress });
});

// ---- POST /api/auth/logout ----
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    sessions.delete(authHeader.slice(7));
  }
  res.json({ ok: true });
});

// ---- Start ----
app.listen(PORT, () => {
  console.log(`\nCherry Embed Example running at http://localhost:${PORT}\n`);
  console.log('Configuration:');
  console.log(`  App ID:    ${APP_ID || '(not set)'}`);
  console.log(`  Room ID:   ${ROOM_ID || '(not set)'}`);
  console.log(`  Embed URL: ${CHERRY_EMBED_URL}`);

  if (!APP_ID || !APP_SECRET || !ROOM_ID) {
    console.log('\nWARNING: One or more required env vars are missing.');
    console.log('  cp .env.example .env  # then fill in your values and restart\n');
  }
});
