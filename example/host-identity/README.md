# Host identity — test bench

Proves that the chat renders **your app's** display names and avatars instead of
the wallet identity Cherry shows by default (a `.sol` domain, or a shortened
address), and that it does so safely.

One page, one small backend, both transports of the same contract:

| transport | who answers | configured where |
|---|---|---|
| **bridge** | this page, via `resolveUsers` / `searchUsers` | nothing to configure |
| **http** | this backend, at `/identity/*` | portal → your embed → **Profile endpoint** |

Everything is visual and scoped to one running widget: Cherry stores none of
these names, the wallet stays the author of every message, and the person's
identity in the Cherry app is unaffected.

## 1. Turn the feature on

At [portal.cherry.fun](https://portal.cherry.fun) → your Project → **Chat
embeds** → your embed → **General** → **"Who your users appear as"** → turn on
**"Show your app's names and avatars"**.

Without this switch the iframe never asks, and the bench shows plain Cherry
identities no matter what the page returns. Leave the **Profile endpoint** empty
for now — that is the HTTP transport, tested in step 5.

Also add the origin you'll open the bench on under **Allowed origins** —
`http://localhost:3000` unless you set `PORT` in `example/.env`. The embed
refuses to load on an origin that isn't listed.

## 2. Configure and run

```bash
cd chat-embed-sdk && npm run build      # if dist/ isn't built yet
cd example && npm install               # once, shared by all examples
cp .env.example .env                    # then fill in APP_ID and ROOM_ID
npm run start:host-identity
```

The server prints the URL to open (`http://127.0.0.1:3000` by default, or
whatever `PORT` says). A `wallet-only` embed needs nothing else; for an
`app-trusted` / `app-trusted+wallet` embed also set `APP_SECRET` in `.env`.

If the status card says **mount failed**, the embed itself never loaded — check
`APP_ID`, `ROOM_ID` and **Allowed origins** before looking at anything below.

## 3. What you should see

Post a message in the chat (or open a room that already has some) and check:

- **Every sender is labelled by this page**, e.g. `Alice Rivera` — not
  `something.sol` and not `7xKX…gAsU`. The same names appear on reply quotes,
  reaction tooltips and pinned messages, because they all read the same source.
- **Avatars are the coloured initials** served by this backend, not Cherry's
  generated identicons.
- **The call log** (right column) shows `users.resolve` with the wallets the
  iframe wanted, and how many profiles you answered with.
- **The first paint is never blank.** Cherry's own name shows for a moment and
  is replaced — a name must never wait on your backend.

If nothing is relabelled, the switch from step 1 is off — the status card says
so too.

## 4. Live changes, mentions, unknown users

| Try this | Expected |
|---|---|
| Paste a wallet in **Push a change** → `setUserProfiles()` | That sender is renamed **immediately**, everywhere in the open chat — no reload, and their avatar stays put (pushed fields are merged, not swapped in wholesale). This is the one that matters: a rename in your app is invisible otherwise, since the iframe only asks about wallets it hasn't resolved yet. |
| **invalidate(wallet)** | The name **stays on screen** while the chat re-asks (`users.resolve` in the log) and then updates. It deliberately does not blink back to the Cherry identity in between — invalidating means "refresh this", not "forget them". To forget someone, push `null` for their wallet. |
| Type `@` and a name from **Your app's directory** in the composer | The dropdown lists your users — `users.search` appears in the log. Cherry's own search only knows sol domains and wallets, so this is the difference between "@Alice finds nothing" and "@Alice finds Alice". |
| Pick a suggestion and send | The message contains `@Alice_Rivera`. Spaces become underscores on purpose: the mention grammar stops at the first space, so an untouched name would be cut in half. The wallet rides along invisibly, so the mention still routes. |
| Return `null` for a wallet (edit `resolveUsers` in `public/index.html`) | That person keeps their Cherry identity, and the chat stops asking about them. |

## 5. Test the HTTP transport

The page shows the exact URL to paste — `http://localhost:3000/identity`, port
per your `.env` — into **Profile endpoint** in the portal. Save, then reload the
bench.

Now the iframe calls this backend directly instead of the page. The **http
endpoint** status dot turns green and the log fills with `http resolve` /
`http search` lines coming from the server. Names and avatars should be
identical: same contract, different transport.

This is the path that matters for mobile WebViews, where the host page is a thin
shim and cannot host handlers. Note that the request carries no cookies
(`credentials: 'omit'`) — pass a bearer token with `chat.setIdentityToken(token)`
if your endpoint needs auth, and allow `https://embed.cherry.fun` in its CORS
config (this server already does).

## 6. Hostile profiles

Press **Serve hostile profiles**. The page then answers with a name that carries
a right-to-left override, an embedded newline, zero-width padding, 400
characters of tail, an unknown `isAdmin` field, and a `javascript:` avatar URL.

Expected — the chat must show:

- one line, not two (a name cannot fake a message row);
- text in the normal reading direction (a bidi override cannot rewrite the row
  around it);
- a name truncated with `…`, not 400 characters;
- no lookalike padding (zero-width characters stripped, so a name cannot
  impersonate an existing member);
- the generated identicon, because `javascript:` is not an image URL.

Press **Back to normal** to restore. If any of the above renders raw, that is a
bug in the embed's sanitizer — not in this page.

## Files

| | |
|---|---|
| `public/index.html` | The host page: handlers, controls, call log |
| `server.js` | Demo user directory, avatar SVGs, and the `/identity/*` profile endpoint |

The directory in `server.js` maps **any** wallet to a stable fake user, so the
bench stays useful in a room full of strangers. A real integration queries its
own users table and returns `null` for wallets it doesn't recognise.

Chat members and the searchable directory draw from two **disjoint** name pools,
so a participant's name is never also a row in the directory list — with one
shared pool the names collided constantly and read as "the overlay resolved the
wrong user".
