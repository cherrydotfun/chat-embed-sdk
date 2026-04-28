'use strict';

/**
 * Walletless Example Server
 *
 * Demonstrates opaque user ID (non-wallet) authentication.
 * Useful for SaaS apps, community forums, and non-Web3 services.
 */

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
  // .env not found
}

const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());

// ---- Config ----
const APP_ID = process.env.CHERRY_APP_ID || '';
const APP_SECRET = process.env.CHERRY_APP_SECRET || '';
const CHERRY_EMBED_URL = process.env.CHERRY_EMBED_URL || 'http://localhost:3001';
const PORT = parseInt(process.env.PORT || '8080', 10);

// ---- In-memory session store (use Redis/DB in production) ----
const sessions = new Map();

// ---- Static files ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- GET /api/config — public config for the frontend ----
app.get('/api/config', (req, res) => {
  res.json({
    appId: APP_ID,
    embedUrl: CHERRY_EMBED_URL,
    configured: !!(APP_ID && APP_SECRET),
  });
});

// ---- POST /api/auth/login — user "logs in" with email ----
// In a real app, you'd verify email/password, validate session, etc.
app.post('/api/auth/login', (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  // Create stable user ID from email (deterministic hash)
  // In production, use your internal user ID instead
  const userId = crypto.createHash('sha256').update(email).digest('hex').slice(0, 20);

  // Issue a session token
  const sessionToken = crypto.randomBytes(32).toString('hex');
  sessions.set(sessionToken, { email, userId });

  // Auto-expire session after 24 hours
  setTimeout(() => sessions.delete(sessionToken), 24 * 60 * 60 * 1000);

  res.json({ sessionToken, userId, email });
});

// ---- GET /api/embed-token — generate Cherry embed JWT with opaque user ID ----
// This is called after user login. Token includes opaque user ID, not wallet address.
app.get('/api/embed-token', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const sessionToken = authHeader.slice(7);
  const session = sessions.get(sessionToken);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  if (!APP_SECRET) {
    return res.status(500).json({ error: 'CHERRY_APP_SECRET is not configured' });
  }

  if (!APP_ID) {
    return res.status(500).json({ error: 'CHERRY_APP_ID is not configured' });
  }

  // For walletless mode, use opaque user ID as 'sub' (NOT a wallet address)
  const embedToken = jwt.sign(
    {
      sub: session.userId, // Opaque ID (hash of email, or your internal user ID)
      app_id: APP_ID,
    },
    APP_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '5m',
      jwtid: crypto.randomUUID(),
    },
  );

  res.json({ embedToken, userId: session.userId, email: session.email });
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
  console.log(`\nCherry Embed Walletless Example running at http://localhost:${PORT}\n`);
  console.log('Configuration:');
  console.log(`  App ID:    ${APP_ID || '(not set)'}`);
  console.log(`  Embed URL: ${CHERRY_EMBED_URL}`);

  if (!APP_ID || !APP_SECRET) {
    console.log('\nWARNING: One or more required env vars are missing.');
    console.log('  cp .env.example .env  # then fill in your values and restart\n');
  }

  console.log('Mode: Walletless (opaque user ID authentication)');
  console.log('  - No wallet required');
  console.log('  - Users identified by email hash or internal ID');
  console.log('  - Public group chat only (no E2E direct messages)');
  console.log('  - Ideal for SaaS, forums, internal tools\n');
});
