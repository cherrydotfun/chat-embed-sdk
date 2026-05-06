'use strict';

/**
 * wallet-only example — server.js (production)
 *
 * authMode: wallet-only
 *
 * In dev (`bun run dev`) the Vite server on the same port handles routing
 * AND exposes the same /config.json + /cherry-embed.js endpoints via the
 * `wallet-only-demo-endpoints` plugin in vite.config.ts. This file kicks
 * in only AFTER `bun run build` writes the SPA into `./dist/` — at which
 * point `node server.js` serves the built bundle next to those two
 * endpoints, with an SPA-history fallback so deep links resolve.
 *
 * The server has NO auth role. It does NOT call /api/embed-token, does
 * NOT hold appSecret, does NOT see the wallet signature. The browser
 * talks directly to the Cherry API once the iframe boots.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.PORT) || 3000;
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

const DIST = path.join(__dirname, 'dist');
const SDK_BUNDLE = path.join(__dirname, '..', '..', 'dist', 'index.global.js');

if (!fs.existsSync(DIST)) {
  console.error('[wallet-only] FATAL: dist/ not found.');
  console.error('[wallet-only] Run `bun run build` from chat-embed-sdk/example/wallet-only/ first.');
  console.error('[wallet-only] (For local development use `bun run dev` instead.)');
  process.exit(1);
}

if (!fs.existsSync(SDK_BUNDLE)) {
  console.error('[wallet-only] FATAL: chat-embed-sdk IIFE bundle not found at', SDK_BUNDLE);
  console.error('[wallet-only] Run `bun run build` from chat-embed-sdk/ first.');
  process.exit(1);
}

const app = express();

// Public app config — only safe-to-expose values.
app.get('/config.json', (_req, res) => {
  res.json({
    appId: APP_ID,
    embedUrl: CHERRY_EMBED_URL,
    roomId: ROOM_ID || null,
  });
});

// Embed SDK IIFE bundle — proxied from the local SDK build so the demo
// works without a CDN. Production deploys can point at https://cdn.cherry.fun
// instead by editing index.html.
app.get('/cherry-embed.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.sendFile(SDK_BUNDLE);
});

// Static assets from the Vite build.
app.use(express.static(DIST, { extensions: ['html'] }));

// SPA history fallback — any non-asset GET resolves to index.html so
// future client-side routing keeps working.
app.get('*', (req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, () => {
  console.log('────────────────────────────────────────────────────');
  console.log('  Cherry Embed example — wallet-only (themable demo)');
  console.log('────────────────────────────────────────────────────');
  console.log(`  http://localhost:${PORT}`);
  console.log(`  APP_ID:           ${APP_ID}`);
  console.log(`  CHERRY_EMBED_URL: ${CHERRY_EMBED_URL}`);
  console.log('────────────────────────────────────────────────────');
  console.log('  No host backend is involved in auth.');
  console.log('  This server only serves /dist + /config.json + /cherry-embed.js.');
  console.log('────────────────────────────────────────────────────');
});
