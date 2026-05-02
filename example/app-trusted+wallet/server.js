'use strict';

/**
 * app-trusted+wallet example — server.js
 *
 * authMode: app-trusted+wallet (host backend + wallet signature)
 *
 * The host backend issues an embedToken (HS256 with appSecret) that asserts the
 * walletAddress. The Cherry server additionally requires the user to prove
 * wallet ownership via an Ed25519 challenge-signature before issuing a
 * Cherry JWT. This is the recommended mode for public 3rd-party integrations.
 *
 * Flow:
 *   browser           host backend              Cherry server
 *     |                    |                         |
 *     | -- Phantom connect (frontend only) ----------|
 *     | -- POST /api/embed-token { walletAddress } ->|
 *     | <-- { embedToken } -------------------------|
 *     |                    |                         |
 *     | -- CherryEmbed({ token, walletAddress }) --> |
 *     |    Cherry sends signChallenge request via    |
 *     |    postMessage cherry:request                |
 *     | -- wallet.signMessage(challenge) ------------|
 *     |    SDK sends signature back to iframe        |
 *     | -- POST /api/embed/auth { embedToken, sig } >|
 *     | <-- Cherry JWT ----------------------------- |
 *
 * This file is intentionally a copy of app-trusted/server.js.
 * Self-containedness is more important than DRY for example code.
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
app.get('/cherry-embed.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'dist', 'index.global.js'));
});

// ---- GET /api/config ----
app.get('/api/config', (req, res) => {
  res.json({
    appId: APP_ID,
    embedUrl: CHERRY_EMBED_URL,
    roomId: ROOM_ID || null,
    configured: !!(APP_ID && APP_SECRET),
  });
});

// ---- POST /api/embed-token ----
//
// In a real integration: derive walletAddress from your authenticated session,
// NOT from the request body. The request body is used here for demo simplicity.
//
// In app-trusted+wallet mode the walletAddress in the embedToken is used by
// the Cherry server to generate the signChallenge message. The wallet signature
// then proves the user actually controls that address, providing a second layer
// of security on top of the appSecret.
app.post('/api/embed-token', (req, res) => {
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
  console.log(`\nCherry Embed — app-trusted+wallet example`);
  console.log(`Running at http://localhost:${PORT}\n`);
  console.log('Config:');
  console.log(`  APP_ID:    ${APP_ID || '(not set — check .env)'}`);
  console.log(`  Embed URL: ${CHERRY_EMBED_URL}`);

  if (!APP_ID || !APP_SECRET) {
    console.log('\nWARNING: APP_ID or APP_SECRET not set.');
    console.log('  cd example && cp .env.example .env  # then fill in and restart\n');
  }
});
