'use strict';

/**
 * wallet-only example — server.js
 *
 * authMode: wallet-only
 *
 * Despite the name "wallet-only" referring to the absence of a host BACKEND
 * for auth purposes, this minimal HTTP server exists for ONE reason only:
 * to serve the static HTML and expose APP_ID / CHERRY_EMBED_URL from the
 * shared root `.env` file (so all three examples read config from the same
 * place — no hardcoded APP_ID in HTML).
 *
 * This server has NO auth role. It does NOT call /api/embed-token, does NOT
 * hold appSecret, does NOT see the wallet signature. The browser talks
 * directly to the Cherry API. You can replace this with any static file
 * server (nginx, S3, Vercel, GitHub Pages) — just inject APP_ID and
 * CHERRY_EMBED_URL via your build pipeline instead of /config.json.
 *
 * Flow:
 *   browser                Cherry server
 *     │                          │
 *     │ GET /config.json (here)  │
 *     │ ◄── { appId, embedUrl }  │
 *     │                          │
 *     │ Phantom.connect()        │
 *     │                          │
 *     │ CherryEmbed({ appId, walletAddress })
 *     │ ── iframe loads ───────► │
 *     │ ◄── signChallenge ────── │
 *     │ Phantom.signMessage      │
 *     │ ── signature ──────────► │
 *     │ ◄── Cherry JWT ────────  │
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
// This example targets a wallet-only embed app. Prefer a dedicated env var
// so it doesn't collide with the shared APP_ID used by the app-trusted /
// app-trusted+wallet examples.
const APP_ID =
  process.env.APP_WALLETLESS_ID ||
  process.env.APP_ID ||
  process.env.CHERRY_APP_ID;
const CHERRY_EMBED_URL = process.env.CHERRY_EMBED_URL || 'https://embed.cherry.fun';
const ROOM_ID = process.env.ROOM_ID || process.env.CHERRY_ROOM_ID || '';

if (!APP_ID) {
  console.error('[wallet-only] FATAL: APP_ID is not set in ../.env');
  console.error('[wallet-only] Copy .env.example to .env and fill in your Cherry App ID.');
  process.exit(1);
}

const app = express();

// Public config endpoint — only safe-to-expose values.
// APP_SECRET is never read here (wallet-only does not need it).
app.get('/config.json', (req, res) => {
  res.json({
    appId: APP_ID,
    embedUrl: CHERRY_EMBED_URL,
    roomId: ROOM_ID || null,
  });
});

// Serve the embed SDK IIFE bundle from the local build.
app.get('/cherry-embed.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'dist', 'index.global.js'));
});

// Static files — the only "real" job of this server.
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log('────────────────────────────────────────────────────');
  console.log('  Cherry Embed example — wallet-only');
  console.log('────────────────────────────────────────────────────');
  console.log(`  http://localhost:${PORT}`);
  console.log(`  APP_ID:           ${APP_ID}`);
  console.log(`  CHERRY_EMBED_URL: ${CHERRY_EMBED_URL}`);
  console.log('────────────────────────────────────────────────────');
  console.log('  No host backend is involved in auth.');
  console.log('  This server only serves static HTML + /config.json.');
  console.log('────────────────────────────────────────────────────');
});
