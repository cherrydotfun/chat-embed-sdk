# wallet-only example — themable demo

A live demo of [`@cherrydotfun/chat-embed-sdk`](../../) running in
`authMode: wallet-only` — no backend, no token signing, no Phantom code on
the host page. The iframe handles wallet connect and signature itself.

This page also doubles as a **theme playground**:

- Four built-in presets (Cherry / Light Fun / Light Restrained / Dark
  Restrained).
- A live constructor for every individual colour, font, and shape token
  exposed by `EmbedTheme`.
- Edits travel the postMessage bridge in ~50 ms — no reload, nothing
  persisted.

## Local development

```bash
# 1. Build the SDK (one-time, or after editing chat-embed-sdk/src/)
cd chat-embed-sdk
bun install
bun run build

# 2. Install demo deps
cd example/wallet-only
bun install

# 3. Run the Vite dev server
bun run dev
```

Open <http://localhost:8088>. The Vite middleware serves both the SPA and
the same `/config.json` + `/cherry-embed.js` endpoints that production
does, so the demo is self-contained — you do not need to run `node
server.js` in dev.

## Production build / deploy

```bash
cd chat-embed-sdk/example/wallet-only
bun run build      # writes ./dist/
node server.js     # serves dist/ + /config.json + /cherry-embed.js on $PORT
```

`server.js` is a static-only Express that does not see `APP_SECRET`,
never calls Cherry, and never participates in auth. Replace it with any
static host (nginx, S3, Vercel) that can also expose `/config.json` and
`/cherry-embed.js`.

## Configuration

`APP_ID` and `CHERRY_EMBED_URL` come from the **shared root .env**
(`chat-embed-sdk/example/.env`) — same file the other examples use.

```ini
APP_ID=your_app_id_here
CHERRY_EMBED_URL=https://embed.cherry.fun   # or http://localhost:3002 for local Cherry
ROOM_ID=                                    # optional — preselect a room
PORT=8088                                    # demo HTTP port
```

`APP_SECRET` is **not used** here.

## Files

- `index.html` — Vite entry. Loads `/cherry-embed.js` from the same origin.
- `src/main.tsx`, `src/App.tsx` — SPA root + state management.
- `src/components/Marketing.tsx` — sales copy + integration snippet.
- `src/components/ThemeSwitcher.tsx` — four preset cards.
- `src/components/ThemeEditor.tsx` — collapsible per-token constructor.
- `src/components/DemoChat.tsx` — wraps `CherryEmbedSDK.CherryEmbed`,
  pushes theme changes via debounced `setTheme(...)`.
- `src/presets.ts` — the four starter themes.
- `vite.config.ts` — dev middleware exposing `/config.json` and
  `/cherry-embed.js`.
- `server.js` — production server (post-build).

## Limitations

- Public rooms only — wallet-only does not support gated rooms with
  per-user access lists (the embed app's `allowedRoomIds` setting applies
  globally for all users).
- Cherry JWT is short-lived (~15 min); the user signs again per session.
- No per-user customisation from host (rate limits, role hints, etc.).
- All theme overrides are in-memory: a refresh wipes them.
