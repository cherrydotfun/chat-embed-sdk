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

The **Chat users** card lists every wallet the chat has asked about, one row
each. Placeholders show what the backend answers; type over them to set a name
or an avatar URL by hand. Edits are kept in `localStorage`, so they survive a
reload and win inside `resolveUsers` — otherwise the next resolve would quietly
undo them.

| Try this | Expected |
|---|---|
| Type a name in a row → **Apply** | That sender is renamed **immediately**, everywhere in the open chat — no reload, and their avatar stays put (pushed fields are merged, not swapped in wholesale). This is the one that matters: a rename in your app is invisible otherwise, since the iframe only asks about wallets it hasn't resolved yet. |
| Paste an image URL → **Apply** | The avatar changes too. It must be an absolute `http(s)` URL — the row warns about `data:`/`blob:`, which the embed refuses. |
| Clear one field → **Apply** | Only that field is dropped; the other survives. Clearing **both** is the same as pushing `null`: the chat falls back to the person's Cherry identity. |
| **Reset** | Your edit is forgotten and the backend is asked again. The name **stays on screen** while that happens — invalidating means "refresh this", not "forget them". |
| **Add** a wallet by hand | Useful for a wallet that hasn't spoken yet, so it never came through `resolveUsers`. |
| Type `@` and a name from **Your app's directory** in the composer | The dropdown lists your users — `users.search` appears in the log. Cherry's own search only knows sol domains and wallets, so this is the difference between "@Alice finds nothing" and "@Alice finds Alice". |
| Pick a suggestion and send | The message contains `@Anouk_Almeida`. Spaces become underscores on purpose: the mention grammar stops at the first space, so an untouched name would be cut in half. The wallet rides along invisibly, so the mention still routes. |

## 5. Test the HTTP transport

So far the **page** answered. In HTTP mode the iframe calls your backend
directly and never asks the page — the path that matters for mobile WebViews,
where the host page is a thin shim.

Paste the URL the status card shows — `http://localhost:3000/identity`, port per
your `.env` — into **Profile endpoint** for the embed, save, reload the bench.

You then see:

- **http endpoint: answering (iframe → endpoint)** in the status card. Only a hit
  carrying `X-Cherry-App-Id` flips it: that header is present when the iframe
  called, absent when the page did;
- `http resolve` lines in the log instead of `backend resolve`;
- the same names and avatars as before — same contract, different transport;
- the **Chat users** panel still fills in, because the endpoint reports the
  wallets it was asked about back to the page. Edits and answer modes are
  mirrored to the backend, so they work here too.

### Locally vs. against stage

Locally both sides are `http`, so nothing else is needed: run the bench, the
embed dev server (`localhost:3002`), the API and the realtime service, and point
**Profile endpoint** at `http://localhost:<bench port>/identity`. CORS is already
allowed for `localhost:3002`.

Against a **stage/production** embed the iframe is served over `https`, and a
request to `http://localhost` is blocked as mixed content. Expose the bench over
https first, e.g.

```bash
cloudflared tunnel --url http://localhost:3000
```

and use the tunnel's `https://…/identity` as the endpoint. The bench allows the
embed origin from `CHERRY_EMBED_URL` automatically. The request carries no
cookies (`credentials: 'omit'`) — pass a bearer token with
`chat.setIdentityToken(token)` if your endpoint needs auth.

## 6. Answer modes: seeing Cherry's own identities, and the sanitizer probe

The **What this app answers** card switches what the bench replies with. The mode
outranks hand-typed profiles — a diagnostic must not be swallowed by an edit made
earlier — and is mirrored to the backend, so it applies in HTTP mode too.

| Mode | Bench answers | Chat shows |
|---|---|---|
| **Normal** | your edits, else the demo directory | your app's names and avatars |
| **I know nobody** | `null` for every wallet | **Cherry's own identity** — a `.sol` domain, or a shortened address |
| **Hostile profiles** | one deliberately dangerous profile | a flattened, truncated name and a generated identicon |

**"I know nobody" is how you see the fallback.** The demo directory answers for
*any* wallet, so in Normal mode the Cherry identity never appears — there is
always a host name to render. Switching to this mode is the only way to see it
without turning the feature off in the portal. (Per-person: clear both fields in
that user's row and press **Apply** — that pushes `null` for them alone.)

For the hostile probe, the chat must show:

- one line, not two (a name cannot fake a message row);
- text in the normal reading direction (a bidi override cannot rewrite the row
  around it);
- a name truncated with `…`, not 400 characters;
- no lookalike padding (zero-width characters stripped, so a name cannot
  impersonate an existing member);
- the generated identicon, because `javascript:` is not an image URL.

If any of that renders raw, it is a bug in the embed's sanitizer — not in this
page.

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
