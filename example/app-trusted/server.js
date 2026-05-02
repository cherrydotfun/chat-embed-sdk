'use strict';

/**
 * app-trusted example — server.js
 *
 * authMode: app-trusted (zero-signature)
 *
 * The host backend is the sole source of trust. No wallet signature is needed.
 * The host already knows who the user is (via its own auth session, OAuth, etc.)
 * and simply asserts a walletAddress in the embedToken.
 *
 * Flow:
 *   browser          host backend             Cherry server
 *     │                   │                        │
 *     │ POST /api/embed-token { walletAddress }     │
 *     │ ──────────────────►│                        │
 *     │ ◄── { embedToken } │                        │
 *     │                    │                        │
 *     │ CherryEmbed({ token: embedToken })          │
 *     │ ── iframe loads ──────────────────────────► │
 *     │ ── POST /api/embed/auth { embedToken } ───► │
 *     │ ◄── Cherry JWT ────────────────────────────  │
 *     │ (chat session begins, no wallet popup)      │
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());

// Accept both short and CHERRY_-prefixed names for backwards compat with older .env files
const APP_ID = process.env.APP_ID || process.env.CHERRY_APP_ID || '';
const APP_SECRET = process.env.APP_SECRET || process.env.CHERRY_APP_SECRET || '';
const CHERRY_EMBED_URL = process.env.CHERRY_EMBED_URL || 'https://embed.cherry.fun';
const ROOM_ID = process.env.ROOM_ID || process.env.CHERRY_ROOM_ID || '';
const PORT = parseInt(process.env.PORT || '3000', 10);

// ---- Static files ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- Serve the embed SDK IIFE bundle ----
// The bundle is built into cherry-embed-sdk/dist/index.global.js
app.get('/cherry-embed.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'dist', 'index.global.js'));
});

// ---- GET /api/config — public runtime config for the frontend ----
app.get('/api/config', (req, res) => {
  res.json({
    appId: APP_ID,
    embedUrl: CHERRY_EMBED_URL,
    roomId: ROOM_ID || null,
    configured: !!(APP_ID && APP_SECRET),
  });
});

// ---- POST /api/embed-token — issue a Cherry embedToken ----
//
// In a real integration this endpoint sits behind your own auth middleware
// (session cookie, JWT, OAuth token, etc.). Here we receive walletAddress
// from the request body to keep the example self-contained.
//
// SECURITY NOTE: in production, NEVER trust the walletAddress from the
// request body directly. Always derive it from your authenticated session.
// The comment below marks where you would replace the body parameter with
// a session lookup.
app.post('/api/embed-token', (req, res) => {
  // In a real app: const walletAddress = req.session.walletAddress;
  // Here the frontend passes it for demo purposes — see index.html comment.
  const walletAddress = req.body.walletAddress;

  if (!walletAddress || typeof walletAddress !== 'string') {
    return res.status(400).json({ error: 'walletAddress is required' });
  }

  if (!APP_SECRET) {
    return res.status(500).json({
      error: 'APP_SECRET is not configured — copy .env.example to .env and fill in your values',
    });
  }

  if (!APP_ID) {
    return res.status(500).json({
      error: 'APP_ID is not configured — copy .env.example to .env and fill in your values',
    });
  }

  // Sign the embedToken exactly as Cherry server expects:
  //   sub     = walletAddress (valid Solana public key)
  //   app_id  = APP_ID
  //   jti     = unique UUID (replay protection via Redis on Cherry server)
  //   exp     = 5 minutes
  //   alg     = HS256
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

  res.json({ embedToken });
});

// ---- Start ----
app.listen(PORT, () => {
  console.log(`\nCherry Embed — app-trusted example`);
  console.log(`Running at http://localhost:${PORT}\n`);
  console.log('Config:');
  console.log(`  APP_ID:    ${APP_ID || '(not set — check .env)'}`);
  console.log(`  Embed URL: ${CHERRY_EMBED_URL}`);

  if (!APP_ID || !APP_SECRET) {
    console.log('\nWARNING: APP_ID or APP_SECRET not set.');
    console.log('  cd example && cp .env.example .env  # then fill in and restart\n');
  }
});
