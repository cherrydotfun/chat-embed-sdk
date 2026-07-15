'use strict';

/**
 * app-trusted example — server.js
 *
 * authMode: app-trusted (pure, zero-signature)
 *
 * This mode is NOT self-serve — it is assigned by Cherry admins on request
 * (see README.md). The host backend is the SOLE source of trust: it issues
 * an embedToken asserting the user's walletAddress, and Cherry accepts it
 * with no independent proof of wallet ownership. There is no wallet
 * connect, no signChallenge, no wallet popup anywhere in this flow.
 *
 * Flow:
 *   browser              host backend             Cherry server
 *     |                       |                         |
 *     | -- GET / ------------>|                         |
 *     | <-- page (HTML) ------|                         |
 *     | -- POST /api/embed-token --------------------->  |
 *     |    (no walletAddress in the body — the backend   |
 *     |     derives it from its own session, see below)  |
 *     | <-- { embedToken } ---|                         |
 *     |                       |                         |
 *     | -- CherryEmbed({ token: embedToken }) --------> |
 *     |    iframe loads, exchanges embedToken for a      |
 *     |    Cherry JWT server-to-server                   |
 *     | <-- Cherry JWT (5-15 min, auto-refreshed) ------ |
 *     |    chat session begins — no wallet popup ever    |
 *
 * This example is intentionally self-contained.
 * Self-containedness is more important than DRY for example code.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());

// Prefer a dedicated env var so the examples can share a single .env.
const APP_ID =
  process.env.APP_TRUSTED_ID ||
  process.env.APP_ID ||
  process.env.CHERRY_APP_ID ||
  '';
const APP_SECRET =
  process.env.APP_TRUSTED_SECRET ||
  process.env.APP_SECRET ||
  process.env.CHERRY_APP_SECRET ||
  '';
const CHERRY_EMBED_URL = process.env.CHERRY_EMBED_URL || 'https://embed.cherry.fun';
const ROOM_ID = process.env.ROOM_ID || process.env.CHERRY_ROOM_ID || '';
const PORT = parseInt(process.env.PORT || '3000', 10);

// ---- Static files ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- Serve the embed SDK IIFE bundle ----
app.get('/cherry-embed.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'dist', 'index.global.js'));
});

// ============================================================
// Mock "authenticated session"
//
// In app-trusted mode Cherry has NO independent way to verify the user —
// it trusts whatever `sub` the embedToken carries. The strength of this
// mode is therefore only as strong as this session lookup. A real backend
// reads `req.session.user` / `req.user` here (populated by your own login
// middleware — cookie session, OAuth, SIWS, whatever you already run).
//
// There is no client-facing "log in as any wallet" endpoint in production.
// The two demo users and the /api/session/switch endpoint below exist
// PURELY so this example can show `chat.setToken()` forcing a re-exchange
// after an account switch, as described in the SDK docs. Delete all of
// this and wire real session middleware before shipping.
// ============================================================
const DEMO_USERS = {
  alice: { id: 'alice', walletAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' },
  bob: { id: 'bob', walletAddress: 'Bob1nQwXK4tV3sJmR6yD8cW1eF7gH2iJ5kL9mN3oPqRs' },
};
let activeSessionUserId = 'alice'; // stand-in for a signed session cookie

function getSessionUser() {
  // DEMO ONLY. In production: return req.session.user (or equivalent).
  // Never let the client choose which identity this returns.
  return DEMO_USERS[activeSessionUserId];
}

// ---- GET /api/config ----
app.get('/api/config', (req, res) => {
  res.json({
    appId: APP_ID,
    embedUrl: CHERRY_EMBED_URL,
    roomId: ROOM_ID || null,
    configured: !!(APP_ID && APP_SECRET),
  });
});

// ---- GET /api/session ----
// Exposes the mock session so the frontend can show "who is logged in"
// without ever needing a request body to determine identity.
app.get('/api/session', (req, res) => {
  const user = getSessionUser();
  res.json({ userId: user.id, walletAddress: user.walletAddress });
});

// ---- POST /api/session/switch ----
// DEMO ONLY — flips which mock user is "logged in" so you can watch a
// setToken() re-exchange happen. A real backend has no equivalent
// client-triggerable endpoint; users switch identity by logging out and
// back in through your real auth flow, not by POSTing a user id.
app.post('/api/session/switch', (req, res) => {
  const { userId } = req.body || {};
  if (!DEMO_USERS[userId]) {
    return res.status(400).json({ error: `Unknown demo user "${userId}"` });
  }
  activeSessionUserId = userId;
  res.json({ userId: DEMO_USERS[userId].id, walletAddress: DEMO_USERS[userId].walletAddress });
});

// ---- POST /api/embed-token ----
//
// `sub` comes from getSessionUser() — the host's own authenticated
// session — NEVER from the request body. Cherry has no independent way to
// check that this sub is honest in app-trusted mode: if a client could
// inject an arbitrary walletAddress here, it could mint a valid embedToken
// for ANY wallet and inherit that wallet's room access, rate-limit budget,
// and message history. This is the single most important line in this
// file — get it wrong and app-trusted stops being trustworthy.
app.post('/api/embed-token', (req, res) => {
  const user = getSessionUser();

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
      sub: user.walletAddress,
      app_id: APP_ID,
    },
    APP_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '5m',
      jwtid: crypto.randomUUID(),
    },
  );

  res.json({ embedToken, userId: user.id });
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
