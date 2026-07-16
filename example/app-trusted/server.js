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

// Bind to loopback by default: this demo server mints tokens for whatever
// identity its mock session holds, so it must not be reachable from the LAN
// unless the operator explicitly opts in. Override with HOST=0.0.0.0 only if
// you understand that anyone who can reach the port can request a token.
const HOST = process.env.HOST || '127.0.0.1';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ---- DEMO_SESSION_SWITCH: opt-in flag for the identity-switch route ----
//
// The /api/session/switch route below lets an unauthenticated caller choose
// which wallet this server signs embedTokens for. That is a deliberate
// testing affordance, not a pattern to copy — so it is OFF unless explicitly
// enabled, and it can never be enabled under NODE_ENV=production.
//
// When the flag is off the route is NOT REGISTERED AT ALL (requests 404),
// rather than registered-and-refusing. A route that does not exist cannot be
// re-enabled by a config mistake.
const DEMO_SESSION_SWITCH_REQUESTED = process.env.DEMO_SESSION_SWITCH === 'true';
const DEMO_SESSION_SWITCH_ENABLED = DEMO_SESSION_SWITCH_REQUESTED && !IS_PRODUCTION;

// ---- Static files ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- Serve the embed SDK IIFE bundle ----
app.get('/cherry-embed.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'dist', 'index.global.js'));
});

// ============================================================
// vvv DELETE EVERYTHING BETWEEN THIS BANNER AND THE MATCHING vvv
// vvv "END OF DEMO-ONLY SESSION MOCK" BANNER BEFORE SHIPPING. vvv
// ============================================================
//
// Mock "authenticated session"
//
// In app-trusted mode Cherry has NO independent way to verify the user —
// it trusts whatever `sub` the embedToken carries. The strength of this
// mode is therefore only as strong as this session lookup. A real backend
// reads `req.session.user` / `req.user` here (populated by your own login
// middleware — cookie session, OAuth, SIWS, whatever you already run).
//
// A real backend derives the wallet from its OWN authenticated session and
// has NO client-triggerable identity switch of any kind. Users change
// identity by logging out and back in through your real auth flow — never by
// POSTing a wallet address at your server.
//
// The demo users, the process-global `activeSessionUserId`, and the
// /api/session/switch route below exist PURELY so this example can show
// `chat.setToken()` forcing a re-exchange after an account switch, as
// described in the SDK docs. Replace all of it with real session middleware
// before shipping.
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
    // Lets the demo frontend hide the identity-switch controls when the
    // route they call does not exist. Purely cosmetic — the real gate is
    // that the route is never registered (see below).
    demoSessionSwitch: DEMO_SESSION_SWITCH_ENABLED,
  });
});

// ---- GET /api/session ----
// Exposes the mock session so the frontend can show "who is logged in"
// without ever needing a request body to determine identity.
app.get('/api/session', (req, res) => {
  const user = getSessionUser();
  res.json({ userId: user.id, walletAddress: user.walletAddress });
});

// ---- POST /api/session/switch ----  (DEMO_SESSION_SWITCH=true only)
//
// DEMO ONLY — flips which mock user is "logged in" so you can watch a
// setToken() re-exchange happen, and accepts `{ walletAddress }` to log the
// mock session in as an ARBITRARY wallet (handy for exercising a specific
// wallet's room membership, rate limits, or moderation role).
//
// READ THIS BEFORE COPYING ANYTHING FROM THIS FILE:
// This route lets an unauthenticated caller decide which wallet the next
// /api/embed-token is signed for, with the REAL app secret. That is the
// exact identity-injection hole that the comments around getSessionUser()
// warn about — it is present here on purpose, as a local testing tool, and
// it must never exist in a production backend in any form.
//
// Three things keep it from being inherited by accident:
//   1. it is only registered when DEMO_SESSION_SWITCH=true (otherwise the
//      path 404s — the handler is never attached to the app);
//   2. it is never registered when NODE_ENV=production, flag or not;
//   3. the server binds to 127.0.0.1 by default, so it is not reachable
//      from the network.
// None of those are a substitute for deleting this route before shipping.
const BASE58_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

if (DEMO_SESSION_SWITCH_ENABLED) {
  app.post('/api/session/switch', (req, res) => {
    const { userId, walletAddress } = req.body || {};

    if (walletAddress !== undefined) {
      if (typeof walletAddress !== 'string' || !BASE58_WALLET_RE.test(walletAddress.trim())) {
        return res.status(400).json({
          error: 'walletAddress must be a base58 Solana public key (32-44 chars)',
        });
      }
      const custom = { id: 'custom', walletAddress: walletAddress.trim() };
      DEMO_USERS.custom = custom;
      activeSessionUserId = 'custom';
      return res.json({ userId: custom.id, walletAddress: custom.walletAddress });
    }

    if (!DEMO_USERS[userId]) {
      return res.status(400).json({ error: `Unknown demo user "${userId}"` });
    }
    activeSessionUserId = userId;
    res.json({ userId: DEMO_USERS[userId].id, walletAddress: DEMO_USERS[userId].walletAddress });
  });
}

// ============================================================
// ^^^ END OF DEMO-ONLY SESSION MOCK — everything from the banner ^^^
// ^^^ above down to here is replaced by real session middleware.  ^^^
// ============================================================

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
app.listen(PORT, HOST, () => {
  console.log(`\nCherry Embed — app-trusted example`);
  console.log(`Running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n`);
  console.log('Config:');
  console.log(`  APP_ID:    ${APP_ID || '(not set — check .env)'}`);
  console.log(`  Embed URL: ${CHERRY_EMBED_URL}`);
  console.log(`  Bind:      ${HOST}:${PORT}${HOST === '127.0.0.1' ? ' (loopback only)' : ''}`);

  if (!APP_ID || !APP_SECRET) {
    console.log('\nWARNING: APP_ID or APP_SECRET not set.');
    console.log('  cd example && cp .env.example .env  # then fill in and restart\n');
  }

  if (DEMO_SESSION_SWITCH_ENABLED) {
    console.log('\n**************************************************************');
    console.log('  DEMO identity switch ENABLED — /api/session/switch can mint');
    console.log('  a token for ANY wallet. Never enable this in production.');
    console.log('  (unset DEMO_SESSION_SWITCH to remove the route entirely)');
    console.log('**************************************************************\n');
  }

  if (DEMO_SESSION_SWITCH_REQUESTED && IS_PRODUCTION) {
    console.log('\nWARNING: DEMO_SESSION_SWITCH=true was IGNORED because');
    console.log('  NODE_ENV=production. /api/session/switch is not registered.\n');
  }

  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.log(`\nWARNING: bound to ${HOST} — this demo server is reachable`);
    console.log('  beyond this machine. It mints embedTokens with your real');
    console.log('  app secret and has no auth of its own.\n');
  }
});
