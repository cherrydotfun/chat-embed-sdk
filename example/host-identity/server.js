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

// Which wallet this bench signs in as, for app-trusted embeds. A real backend
// takes this from its own session — see the banner on /api/embed-token.
const DEMO_VIEWER_WALLET = process.env.DEMO_VIEWER_WALLET || '';

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

// Two DISJOINT name pools, and this split matters for the bench's credibility.
//
// With one small pool, a chat participant and a directory row kept landing on
// the same name — 16 × 8 = 128 combinations across ~27 shown people means a
// collision ~95% of the time — and the tester reasonably reads that as "the
// overlay fell back to the wrong user". Members draw from one pool, the
// searchable directory from the other, so a name can never appear in both.
const MEMBER_FIRST = [
  'Alice', 'Bruno', 'Carmen', 'Dmitri', 'Elena', 'Farid', 'Greta', 'Hugo',
  'Ines', 'Jonas', 'Kira', 'Lars', 'Maya', 'Nils', 'Olive', 'Piotr',
];
const MEMBER_LAST = [
  'Rivera', 'Okafor', 'Sandberg', 'Duarte', 'Novak', 'Haddad', 'Lindqvist', 'Mensah',
  'Ferrand', 'Bakker', 'Costa', 'Ilves', 'Marchetti', 'Sorensen', 'Varga', 'Whitlock',
];
const DIR_FIRST = [
  'Anouk', 'Bodhi', 'Csilla', 'Davide', 'Esme', 'Fabio', 'Gunnar', 'Hedda',
  'Ivar', 'Juno', 'Katla', 'Leif', 'Mira', 'Nuno', 'Orla', 'Pavel',
];
const DIR_LAST = [
  'Almeida', 'Berglund', 'Cardoso', 'Dvorak', 'Eriksen', 'Fontaine', 'Gruber', 'Halonen',
  'Iversen', 'Janssen', 'Kovacs', 'Laurent', 'Moreau', 'Nagy', 'Olsen', 'Petrov',
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
function profileFor(walletAddress, origin, pool) {
  const { first: firstNames, last: lastNames } = pool ?? {
    first: MEMBER_FIRST,
    last: MEMBER_LAST,
  };
  const h = hash(walletAddress);
  const first = firstNames[h % firstNames.length];
  const last = lastNames[(h >> 4) % lastNames.length];
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
  const dir = req.query.dir === '1';
  const firstNames = dir ? DIR_FIRST : MEMBER_FIRST;
  const lastNames = dir ? DIR_LAST : MEMBER_LAST;
  const h = hash(req.params.seed);
  const hue = h % 360;
  const initials = `${firstNames[h % firstNames.length][0]}${
    lastNames[(h >> 4) % lastNames.length][0]
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

// ============================================================
// Bench state — hostile mode and hand-typed profiles.
//
// It lives HERE, not only in the page, because in HTTP mode the iframe never
// asks the page: it calls /identity/resolve directly. State kept only in the
// browser would silently do nothing as soon as a Profile endpoint is configured.
// ============================================================

/** The single hostile payload, shared with the page's bridge handler. */
const HOSTILE_PROFILE = {
  displayName:
    '\u202E' +                        // right-to-left override
    'admin\nmoderator' +              // fake second line
    '\u200B\u200B\u200B' +            // zero-width padding
    '\t tail ' +
    'x'.repeat(400),                  // way past the length cap
  avatarUrl: 'javascript:alert(1)',   // must never reach an <img>
  isAdmin: true,                      // unknown field, must be dropped
};

/**
 * Which answers this "app" gives:
 *
 *   'normal'  — hand-typed profile, else the demo directory
 *   'unknown' — null for every wallet: the app claims to know nobody, so the
 *               chat falls back to Cherry's own identity (a .sol domain or a
 *               shortened address). This is the ONLY way to see that fallback
 *               without turning the feature off in the portal — the demo
 *               directory answers for ANY wallet, so 'normal' never yields it.
 *   'hostile' — the sanitizer probe
 */
const bench = { mode: 'normal', overrides: new Map() };
const BENCH_MODES = ['normal', 'unknown', 'hostile'];

/**
 * POST /api/bench/state — the page mirrors its controls here.
 *
 * `hostile` toggles the probe. `overrides` is a full replacement map of
 * hand-typed profiles (`null` for a wallet means "I don't know this person").
 */
app.post('/api/bench/state', (req, res) => {
  if (BENCH_MODES.includes(req.body?.mode)) bench.mode = req.body.mode;
  if (req.body?.overrides && typeof req.body.overrides === 'object') {
    bench.overrides = new Map(Object.entries(req.body.overrides));
  }
  res.json({ mode: bench.mode, overrides: bench.overrides.size });
});

/**
 * What this "app" answers for a wallet, in priority order:
 *   mode probe  →  hand-typed profile  →  directory row  →  generated member
 *
 * The mode wins over a hand-typed name on purpose: it is a diagnostic, and an
 * edit made ten minutes ago silently swallowing it is how the probe looks
 * broken.
 */
function answerFor(wallet, origin, roster) {
  if (bench.mode === 'hostile') return HOSTILE_PROFILE;
  if (bench.mode === 'unknown') return null;
  if (bench.overrides.has(wallet)) return bench.overrides.get(wallet);
  return roster.get(wallet) ?? profileFor(wallet, origin);
}

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
  const roster = new Map(demoRoster(origin).map((u) => [u.id, u]));
  const users = {};
  for (const id of ids) {
    if (typeof id !== 'string' || !id) continue;
    // A real backend returns null for wallets it doesn't know — the chat then
    // falls back to the Cherry identity for that person instead of asking again.
    // Directory wallets answer with their DIRECTORY identity, so someone picked
    // from @mention autocomplete doesn't get renamed on the next resolve.
    users[id] = answerFor(id, origin, roster);
  }
  note({
    op: 'resolve',
    count: ids.length,
    // Present only when the IFRAME called us — the page's own fetch has no such
    // header. That is what tells the two transports apart.
    appId: req.get('X-Cherry-App-Id') || null,
    mode: bench.mode,
  });
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
  const origin = originOf(req);
  // A directory row asked for by id keeps its directory name; anything else is
  // a chat member.
  const row = demoRoster(origin).find((u) => u.id === req.params.id);
  res.json(row ?? profileFor(req.params.id, origin));
});

app.use('/identity', identity);

/**
 * base58 encoder (Bitcoin alphabet), so demo wallets are shaped like REAL ones.
 *
 * This matters more than it looks: the composer attaches the picked wallet to a
 * mention as an invisible tag, and the readers only recognise that tag when the
 * address is valid base58 (no 0, O, I, l). A hex-ish "wallet" makes the tag
 * render as visible junk next to the name — a bug in the bench, not in Cherry.
 */
function base58(buffer) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt('0x' + buffer.toString('hex'));
  let out = '';
  while (num > 0n) {
    out = ALPHABET[Number(num % 58n)] + out;
    num /= 58n;
  }
  for (const byte of buffer) {
    if (byte === 0) out = '1' + out;
    else break;
  }
  return out;
}

/** What the page shows as "your app's directory" — also the search corpus. */
function demoRoster(origin) {
  // Deterministic pseudo-wallets, stable across restarts: 32 bytes → base58,
  // i.e. the same shape and charset as a Solana public key.
  //
  // Names are de-duplicated: two rows reading "Maya Duarte" in the same list
  // would make the bench look like it mixed two users up.
  const seen = new Set();
  const rows = [];
  for (let i = 0; rows.length < 24 && i < 500; i++) {
    const wallet = base58(crypto.createHash('sha256').update(`cherry-demo-${i}`).digest());
    const profile = profileFor(wallet, origin, { first: DIR_FIRST, last: DIR_LAST });
    if (seen.has(profile.displayName)) continue;
    seen.add(profile.displayName);
    rows.push({ id: wallet, ...profile, avatarUrl: `${profile.avatarUrl}?dir=1` });
  }
  return rows;
}

// ---- Page bootstrap ----
app.get('/api/config', (req, res) => {
  res.json({
    appId: APP_ID,
    roomId: ROOM_ID,
    embedUrl: CHERRY_EMBED_URL,
    hasSecret: !!APP_SECRET,
    // DEMO ONLY — a real backend never tells the browser whose session it is
    // about to vouch for; it just signs for the user it already authenticated.
    viewerWallet: DEMO_VIEWER_WALLET,
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
