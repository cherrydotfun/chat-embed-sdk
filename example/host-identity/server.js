'use strict';

/**
 * host-identity example — server.js
 *
 * A test bench for HOST-PROVIDED IDENTITY: the chat renders YOUR app's display
 * names and avatars instead of the wallet identity Cherry would otherwise show
 * (a `.sol` domain, or a shortened address).
 *
 * It exercises BOTH transports of the same contract:
 *
 *   bridge — the host PAGE answers `resolveUsers` / `searchUsers` over
 *            postMessage. Needs nothing but this page; see public/index.html.
 *   http   — the iframe calls a profile endpoint DIRECTLY. That endpoint is
 *            this file (`/identity/*` below), and its URL is configured per
 *            embed in the portal — never sent from the page, so a script on
 *            your site cannot repoint identity resolution.
 *
 * Everything here is VISUAL: Cherry stores none of these names, the wallet
 * stays the author of every message, and the Cherry app is unaffected.
 *
 * Flow:
 *   browser                 host backend (this file)      Cherry embed iframe
 *     |                            |                              |
 *     | -- GET / ----------------->|                              |
 *     | <-- page ------------------|                              |
 *     | -- CherryEmbed({ resolveUsers, searchUsers }) ----------> |
 *     |                            |                              |
 *     |                            | <-- POST /identity/resolve --| (http mode)
 *     |                            | --- { users } -------------> |
 *     |    or, in bridge mode, the iframe asks the PAGE instead   |
 *
 * This example is intentionally self-contained.
 * Self-containedness is more important than DRY for example code.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());

const APP_ID =
  process.env.HOST_IDENTITY_ID ||
  process.env.APP_ID ||
  process.env.CHERRY_APP_ID ||
  '';
// Only needed for app-trusted / app-trusted+wallet embeds. A wallet-only embed
// runs this example with no secret at all.
const APP_SECRET =
  process.env.HOST_IDENTITY_SECRET ||
  process.env.APP_SECRET ||
  process.env.CHERRY_APP_SECRET ||
  '';
const CHERRY_EMBED_URL = process.env.CHERRY_EMBED_URL || 'https://embed.cherry.fun';
const ROOM_ID = process.env.ROOM_ID || process.env.CHERRY_ROOM_ID || '';
const PORT = parseInt(process.env.PORT || '3000', 10);

// Loopback by default — same reasoning as the other examples: this server
// mints tokens for whatever its mock session holds.
const HOST = process.env.HOST || '127.0.0.1';

// ---- Static files + the SDK bundle ----
app.use(express.static(path.join(__dirname, 'public')));
app.get('/cherry-embed.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'dist', 'index.global.js'));
});

// ============================================================
// vvv DEMO-ONLY USER DIRECTORY vvv
//
// Stands in for the table your app already has: users, their display names,
// their avatars, and the wallet each one signs in with. A real integration
// queries its own database here.
//
// The demo maps ANY wallet to a stable fake user (hashed → a fixed roster), so
// the bench is useful in a room full of strangers: every participant shows up
// under an "app" name, which is exactly what the feature does for a real
// integration where every participant IS one of its users.
// ============================================================

const FIRST_NAMES = [
  'Alice', 'Bruno', 'Carmen', 'Dmitri', 'Elena', 'Farid', 'Greta', 'Hugo',
  'Ines', 'Jonas', 'Kira', 'Lars', 'Maya', 'Nils', 'Olive', 'Piotr',
];
const LAST_NAMES = [
  'Rivera', 'Okafor', 'Sandberg', 'Duarte', 'Novak', 'Haddad', 'Lindqvist', 'Mensah',
];
const ROLES = ['trader', 'builder', 'analyst', 'degen', 'lurker', 'mod'];

/** Stable 32-bit hash so a wallet always maps to the same fake user. */
function hash(value) {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (Math.imul(h, 31) + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * The profile this "app" holds for a wallet.
 *
 * `avatarUrl` points back at this server (see /avatars below) rather than at a
 * CDN: the bench must work offline, and it doubles as proof that an ordinary
 * cross-origin image URL is all the embed needs.
 */
function profileFor(walletAddress, origin) {
  const h = hash(walletAddress);
  const first = FIRST_NAMES[h % FIRST_NAMES.length];
  const last = LAST_NAMES[(h >> 4) % LAST_NAMES.length];
  const role = ROLES[(h >> 8) % ROLES.length];
  return {
    displayName: `${first} ${last}`,
    avatarUrl: `${origin}/avatars/${encodeURIComponent(walletAddress)}.svg`,
    // Not part of the contract — carried here only so the page can show what a
    // richer directory row looks like next to what the embed actually uses.
    role,
  };
}

/** Origin this request came in on, so avatar URLs work on any host/port. */
function originOf(req) {
  return `${req.protocol}://${req.get('host')}`;
}

// ---- Avatars: deterministic SVG, no external dependency ----
app.get('/avatars/:seed.svg', (req, res) => {
  const h = hash(req.params.seed);
  const hue = h % 360;
  const initials = `${FIRST_NAMES[h % FIRST_NAMES.length][0]}${
    LAST_NAMES[(h >> 4) % LAST_NAMES.length][0]
  }`;
  res.type('image/svg+xml').send(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
       <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0%" stop-color="hsl(${hue} 70% 55%)"/>
         <stop offset="100%" stop-color="hsl(${(hue + 60) % 360} 70% 45%)"/>
       </linearGradient></defs>
       <rect width="96" height="96" rx="48" fill="url(#g)"/>
       <text x="48" y="60" font-family="sans-serif" font-size="34" font-weight="700"
             fill="#fff" text-anchor="middle">${initials}</text>
     </svg>`,
  );
});

// ============================================================
// ^^^ END OF DEMO-ONLY USER DIRECTORY ^^^
// ============================================================

// ---- HTTP transport: the profile endpoint ----
//
// Configure its base URL per embed in the portal ("Profile endpoint"):
//   http://localhost:3000/identity
//
// CORS matters: the caller is the IFRAME (embed.cherry.fun), not your page.
// `credentials` stays off — the embed sends no cookies, deliberately, so it
// can never be walked into replaying a visitor's ambient session at you. Pass
// a bearer token with `chat.setIdentityToken()` if the endpoint needs auth.
const identity = express.Router();
identity.use(
  cors({
    origin: [CHERRY_EMBED_URL, 'http://localhost:3002', 'http://127.0.0.1:3002'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Cherry-App-Id'],
    credentials: false,
  }),
);

/** Log every hit so the page can show what the iframe actually asked for. */
const httpLog = [];
function note(entry) {
  httpLog.push({ at: new Date().toISOString(), ...entry });
  if (httpLog.length > 100) httpLog.shift();
}

// POST /identity/resolve — { ids } -> { users: { [id]: profile | null } }
identity.post('/resolve', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const origin = originOf(req);
  const users = {};
  for (const id of ids) {
    if (typeof id !== 'string' || !id) continue;
    // A real backend returns null for wallets it doesn't know — the chat then
    // falls back to the Cherry identity for that person instead of asking again.
    users[id] = profileFor(id, origin);
  }
  note({ op: 'resolve', count: ids.length, appId: req.get('X-Cherry-App-Id') || null });
  res.json({ users });
});

// GET /identity/search?query&cursor&limit -> { users: [...], nextCursor? }
identity.get('/search', (req, res) => {
  const query = String(req.query.query || '').toLowerCase();
  const limit = Math.min(parseInt(String(req.query.limit || '10'), 10) || 10, 50);
  const origin = originOf(req);

  // The demo directory is generated, so "search" walks a fixed roster of
  // wallets. A real one runs a prefix query against its users table.
  const roster = demoRoster(origin);
  const matches = roster.filter((u) => u.displayName.toLowerCase().includes(query));
  note({ op: 'search', query, matched: matches.length });
  res.json({ users: matches.slice(0, limit) });
});

// GET /identity/users/:id -> profile | null
identity.get('/users/:id', (req, res) => {
  note({ op: 'get', id: req.params.id });
  res.json(profileFor(req.params.id, originOf(req)));
});

app.use('/identity', identity);

/** What the page shows as "your app's directory" — also the search corpus. */
function demoRoster(origin) {
  // Deterministic pseudo-wallets: base58-ish, stable across restarts.
  return Array.from({ length: 24 }, (_, i) => {
    const seed = crypto.createHash('sha256').update(`cherry-demo-${i}`).digest('hex');
    const wallet = `Demo${seed.slice(0, 40)}`;
    return { id: wallet, ...profileFor(wallet, origin) };
  });
}

// ---- Page bootstrap ----
app.get('/api/config', (req, res) => {
  res.json({
    appId: APP_ID,
    roomId: ROOM_ID,
    embedUrl: CHERRY_EMBED_URL,
    hasSecret: !!APP_SECRET,
    resolverUrl: `${originOf(req)}/identity`,
    directory: demoRoster(originOf(req)),
  });
});

/** Recent hits on the HTTP transport, so the page can prove which one ran. */
app.get('/api/identity-log', (req, res) => res.json({ entries: httpLog.slice(-30) }));

// ---- Optional: embedToken for app-trusted / app-trusted+wallet embeds ----
//
// DEMO ONLY: a real backend derives the wallet from its OWN authenticated
// session and never accepts one from the client. It is accepted here so the
// bench can be pointed at any wallet you want to look at.
app.post('/api/embed-token', (req, res) => {
  if (!APP_SECRET || !APP_ID) {
    return res.status(400).json({
      error:
        'No APP_SECRET configured. Use a wallet-only embed for this example, ' +
        'or fill in APP_ID/APP_SECRET in example/.env.',
    });
  }
  const walletAddress = String(req.body?.walletAddress || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    return res.status(400).json({ error: 'walletAddress must be a base58 Solana public key' });
  }
  const embedToken = jwt.sign({ sub: walletAddress, app_id: APP_ID }, APP_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
    jwtid: crypto.randomUUID(),
  });
  res.json({ embedToken });
});

app.listen(PORT, HOST, () => {
  console.log(`\n  Cherry host-identity bench → http://${HOST}:${PORT}\n`);
  if (!APP_ID) console.log('  ! APP_ID is empty — set it in example/.env\n');
  if (!ROOM_ID) console.log('  ! ROOM_ID is empty — set it in example/.env\n');
  console.log(`  Profile endpoint (paste into the portal): http://${HOST}:${PORT}/identity\n`);
});
