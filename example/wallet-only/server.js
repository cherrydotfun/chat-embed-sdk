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

import { config as dotenvConfig } from 'dotenv';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Best-effort load of the shared example/.env when running locally.
// In Docker the file isn't shipped — process.env is populated by the
// container `environment:` block, and dotenv silently no-ops on ENOENT.
dotenvConfig({ path: path.join(__dirname, '..', '.env') });

const PORT = Number(process.env.PORT) || 3000;
const APP_ID =
  process.env.APP_WALLETLESS_ID ||
  process.env.APP_ID ||
  process.env.CHERRY_APP_ID;
const CHERRY_EMBED_URL = process.env.CHERRY_EMBED_URL || 'https://embed.cherry.fun';
const CHERRY_API_URL = process.env.CHERRY_API_URL || '';
const ROOM_ID = process.env.ROOM_ID || process.env.CHERRY_ROOM_ID || '';

// Optional path-prefix mount for sub-path deploys (e.g. behind Traefik at
// `/chat-embed-example`). Empty/unset means root mount. Convention:
// no trailing slash. Must match the Vite `base` used at build time.
const BASE_PATH = (process.env.BASE_PATH ?? '').replace(/\/$/, '');

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
const router = express.Router();

// Public app config — only safe-to-expose values.
router.get('/config.json', (_req, res) => {
  res.json({
    appId: APP_ID,
    embedUrl: CHERRY_EMBED_URL,
    roomId: ROOM_ID || null,
    apiUrl: CHERRY_API_URL || null,
  });
});

// Embed SDK IIFE bundle — proxied from the local SDK build so the demo
// works without a CDN. Production deploys can point at https://cdn.cherry.fun
// instead by editing index.html.
router.get('/cherry-embed.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.sendFile(SDK_BUNDLE);
});

// Static assets from the Vite build.
router.use(express.static(DIST, { extensions: ['html'] }));

// SPA history fallback — any non-asset GET resolves to index.html so
// future client-side routing keeps working.
router.get('*', (req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(DIST, 'index.html'));
});

// Mount everything under BASE_PATH (or '/' if unset). Traefik passes the
// full path through (no strip-prefix), so the Vite build's BASE_URL and
// this Express mount must agree.
app.use(BASE_PATH || '/', router);

app.listen(PORT, () => {
  console.log('────────────────────────────────────────────────────');
  console.log('  Cherry Embed example — wallet-only (themable demo)');
  console.log('────────────────────────────────────────────────────');
  console.log(`  http://localhost:${PORT}${BASE_PATH || ''}`);
  console.log(`  APP_ID:           ${APP_ID}`);
  console.log(`  CHERRY_EMBED_URL: ${CHERRY_EMBED_URL}`);
  console.log(`  CHERRY_API_URL:   ${CHERRY_API_URL || '(unset)'}`);
  console.log(`  BASE_PATH:        ${BASE_PATH || '(root)'}`);
  console.log('────────────────────────────────────────────────────');
  console.log('  No host backend is involved in auth.');
  console.log('  This server only serves /dist + /config.json + /cherry-embed.js.');
  console.log('────────────────────────────────────────────────────');
});
