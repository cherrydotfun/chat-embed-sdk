# @cherrydotfun/chat-embed-sdk

Embed Cherry Chat rooms into any website: a lightweight iframe widget with wallet-based auth, full theming, and real-time messaging. Works with any bundler or straight from a `<script>` tag.

## Live demo

Try it: **[cherry.fun/chat-embed-example](https://cherry.fun/chat-embed-example/)** — theme presets, display modes (inline / floating / collapsible / resizable), and a live theme editor, all embedded into a real Cherry chat room. Its "Show the integration snippet" button gives you copy-paste code.

![Cherry Embed wallet-only demo — theme editor on the left, live chat on the right](docs/demo.png)

Full documentation lives at **[portal.cherry.fun/docs](https://portal.cherry.fun/docs)**.

## Install

```bash
npm install @cherrydotfun/chat-embed-sdk
```

Or, for a plain HTML site, load the package from npm via jsDelivr (the bundle exposes `window.CherryEmbedSDK`):

```html
<script src="https://cdn.jsdelivr.net/npm/@cherrydotfun/chat-embed-sdk@0.1.5/dist/index.global.js"></script>
```

## Before you start

You need a Cherry **embed**, created self-serve at [portal.cherry.fun](https://portal.cherry.fun):

1. Sign in with your Solana wallet (SIWS — no email/password, nothing goes onchain).
2. Create a **Project**, then open **Chat embeds** → **New embed**.
3. Copy the **embed ID** (your `appId`), add your site's origin under **Allowed origins**, and make sure the embed is **enabled**.

An embed only loads on allow-listed origins while enabled — add `http://localhost:3000` (or your dev origin) before testing locally.

## Quickstart (no backend)

The default **wallet-only** mode needs nothing but an `appId` and a public room. The iframe owns the entire wallet flow: visitors click "Connect wallet", sign a challenge, and chat — no token endpoint, no host wallet integration.

```ts
import { CherryEmbed } from '@cherrydotfun/chat-embed-sdk';

const chat = new CherryEmbed({
  appId: 'YOUR_EMBED_ID',
  container: '#cherry-chat',
  roomId: 'YOUR_ROOM_ID',
  theme: { mode: 'dark', primaryColor: '#FF5BA8' },
});

await chat.mount();
```

```html
<div id="cherry-chat" style="height: 600px"></div>
```

Prefer a floating panel instead of an inline one? Omit `container` and set a position:

```ts
const chat = new CherryEmbed({
  appId: 'YOUR_EMBED_ID',
  roomId: 'YOUR_ROOM_ID',
  position: 'floating-right',
});
await chat.mount();
```

Pass `collapsed: true` to start hidden and wire your own control to `chat.toggle()` / `chat.show()` — or let the SDK render the launcher for you with `chatBubble` (below).

### Built-in launcher bubble

`chatBubble: true` adds a round launcher button next to the floating panel: it opens and closes the widget on click, takes its fill from your `theme` (and restyles on every `setTheme()` / `resetTheme()`), and repositions itself whenever visibility changes — including when *you* call `show()` / `hide()` / `toggle()`.

Defaults to **off**, so existing integrations keep rendering their own launcher. It only applies to `floating-right` / `floating-left` and is silently ignored for inline embeds. Its labels are English-only (`Open chat` / `Close chat`) — leave it off if you need localised labels. `destroy()` removes it.

Pair it with `collapsed: true` so the widget starts closed behind the button:

```ts
const chat = new CherryEmbed({
  appId: 'YOUR_EMBED_ID',
  roomId: 'YOUR_ROOM_ID',
  position: 'floating-right',
  chatBubble: true,
  collapsed: true,
});
await chat.mount();
```

If `mount()` rejects (the iframe never reported ready within 30s) the button is left in place — call `chat.destroy()` to tear it down.

The button carries the unread badge for you, in the shape the [unread-indicators docs](https://portal.cherry.fun/docs/embed/unread-indicators) recommend: one badge in the top-right corner, never two side by side. It is Cherry pink (`#ff1493`) out of the box and adopts the embed engine's resolved mention colours once the iframe reports them — no config key recolours it directly. `chatBubbleBadge` picks how loud it is:

| Value | Unread messages | Mentions |
| --- | --- | --- |
| `'dot'` *(default)* | bare 12px dot | one `@` pill, no number |
| `'count'` | the number | `@ N`, capped at `99+` |
| `'off'` | nothing | nothing |

In `'count'` mode the number is always the unread-message tally and `@` is a bare mention flag — the mention count itself is never shown, the way Telegram paints the same pair.

It follows the `unreadState` event on its own — no wiring needed — hides itself at zero, and clears whenever the viewer changes: on sign-out, on `signOut()`, and on a `setToken()` / `setWalletAddress()` that switches accounts. The badge is ringed in white so it stays legible over a busy icon; set `--cherry-bubble-badge-ring` to your page background to match a dark page.

## Authenticating your own users

If you run a backend and want chat identity tied to your users, use **app-trusted + wallet** auth: your backend signs a short-lived `embedToken` (HMAC, using the app secret from your embed's settings), and the user confirms wallet ownership with one signature. See [Authentication](https://portal.cherry.fun/docs/embed/authentication) for the full flow, and [`example/app-trusted+wallet/`](./example/app-trusted%2Bwallet/) for a complete runnable token server.

```ts
const chat = new CherryEmbed({
  appId: 'YOUR_EMBED_ID',
  container: '#cherry-chat',
  token,          // minted by your backend
  walletAddress,  // the user's connected wallet
  signChallengeHandler: async (message) => {
    // message: Uint8Array — sign it with the user's wallet, return Uint8Array
    return await wallet.signMessage(message);
  },
});
await chat.mount();
```

## Unread indicators

The embed reports unread and mention counts to your page, where nothing of your own is drawn until you ask for it (inside the chat the "@" badge is already on). Render them wherever they belong, typically as a dot on the chat icon that opens the chat:

```ts
chat.on('unreadState', ({ total }) => {
  chatIcon.classList.toggle('has-unread', total.unread > 0);
  chatIcon.classList.toggle('has-mention', total.mentions > 0);
});

// Nothing is emitted for a signed-out viewer — clear the dot yourself.
chat.on('authStateChange', (signedIn) => {
  if (!signedIn) chatIcon.classList.remove('has-unread', 'has-mention');
});
```

`unreadState` fires once with a full snapshot after the user's session loads, then again on every change. `mentions` counts everything that addressed the viewer: @-mentions, replies to their messages, **and reactions on those messages** — the same signal that drives the in-chat "@" badge. So a bare 👍 on the user's message lights up a mention dot; that's the intended behaviour, not a bug to report.

`rooms` describes the room this embed renders and nothing else — the iframe never reports the visitor's other chats — so it holds 0 or 1 entries today, `total` mirroring the one entry; the array shape is future-proof for list mode. Emission is held until the room join resolves, so you never catch a half-built snapshot mid-join; `rooms` comes back empty only when there is no `roomId` to join or the join failed. Read `total`, or index defensively (`rooms[0]?.unread`), rather than assuming `rooms[0]` exists.

Prefer pulling over subscribing? The SDK keeps the latest snapshot:

```ts
chat.getUnreadState();        // UnreadState | null — null until the first event
chat.getUnreadCount();        // unread messages across every reported room
chat.getUnreadCount(roomId);  // unread messages in one room
chat.refreshUnreadState();    // ask the iframe to re-emit unreadState
```

Both getters are synchronous cache reads, so poll them as often as your UI repaints. `refreshUnreadState()` is different: it crosses the bridge and answers asynchronously through the `unreadState` event, so keep it to a coarse interval (seconds, not frames) — the iframe already pushes on every change, and subscribing beats polling.

Counters only accrue while the chat isn't being read: hidden through `hide()`, mounted `collapsed`, or scrolled up into history. The SDK reports visibility to the iframe on `show()` / `hide()` / `toggle()` and right after mount, so a widget you hide with your own CSS instead of `hide()` still counts as open and keeps marking messages read. Nothing is emitted before sign-in — a preview-mode visitor has no unread state — nor after `chat.signOut()`, which drops the cached snapshot back to `null` for exactly that reason. Account switches drop it as well: `setToken()` and a `setWalletAddress()` with a different wallet reset the cache to `null`, so the previous user's counts never linger on your indicator while the new session loads.

The two numbers clear on different boundaries, which matters when you decide what your dot means. On reopen the chat first freezes an "Unread messages" divider above everything that arrived while the widget was away, then marks those messages read, so `total.unread` drops back to 0. That reset is conditional: it runs only once the viewport actually settles at the tail, so a jump that parks the view on the divider instead of the bottom defers it until the user returns to the newest message. `mentions` keeps its own boundary: it survives the reopen and only comes down as the user steps through the in-chat "@" badge. So a mention dot driven by `total.mentions` will outlive the click that opened the chat — that's deliberate, since a mention is worth seeing even after a glance at the room.

One caveat for hand-rolled integrations: the iframe only starts emitting events — `unreadState` and the legacy `unreadCount` alike — once the host has sent it at least one command. `mount()` always does, so this only bites if you drive the iframe with your own `postMessage` instead of the SDK.

The in-chat "@" badge is part of the chat itself and is always on for a signed-in viewer, so a host-rendered dot sits alongside it rather than replacing it.

Drawing the indicator itself is yours, but the sizes, the pink and the single `@ N` pill are worth copying rather than inventing: Cherry recommends a badge recipe for hand-rolled indicators in [Unread indicators](https://portal.cherry.fun/docs/embed/unread-indicators), copy-paste HTML included.

## Documentation

The portal docs are the source of truth for the SDK surface:

- [Installation](https://portal.cherry.fun/docs/embed/installation)
- [Configuration](https://portal.cherry.fun/docs/embed/configuration) — every option `CherryEmbed` accepts
- [Authentication](https://portal.cherry.fun/docs/embed/authentication) — wallet-only vs. backend-signed tokens
- [Display modes](https://portal.cherry.fun/docs/embed/display-modes) — inline, floating, collapsed
- [Theming](https://portal.cherry.fun/docs/embed/theming) — presets and the full theme reference
- [API reference](https://portal.cherry.fun/docs/embed/api-reference) — methods, events, types
- [Guides](https://portal.cherry.fun/docs/guides/public-chat) — public chat, authenticated chat, room-per-entity

## Mobile (React Native / Flutter)

The SDK is browser-only (`document`/`iframe`/`window.postMessage`), so it can't run directly in a mobile runtime. Run it inside a WebView (`react-native-webview` or `webview_flutter`) on a small host page, and bridge wallet signing to the native layer (Mobile Wallet Adapter on Android / deeplink on iOS) — there's no `window.phantom` in a mobile WebView. Don't point the WebView straight at `embed.cherry.fun`: the bridge rejects when `window.parent === window`, so the embed must be nested in an iframe on a host page. One host page serves both platforms (it auto-detects the bridge).

Full guide: [`docs/react-native.md`](./docs/react-native.md). Runnable code (hosted + bundled host page): [`example/react-native/`](./example/react-native/) · [`example/flutter/`](./example/flutter/).

## Examples

- [`example/wallet-only/`](./example/wallet-only/) — static host, no backend; the live demo above runs this app
- [`example/app-trusted+wallet/`](./example/app-trusted%2Bwallet/) — Express token server + host-page wallet signing
- [`example/app-trusted/`](./example/app-trusted/) — Express token server only, zero signature, no wallet. `authMode: app-trusted` is self-serve: pick it in your embed's auth mode at portal.cherry.fun.
- [`example/react-native/`](./example/react-native/) — React Native WebView integration with native wallet signing
- [`example/flutter/`](./example/flutter/) — Flutter WebView integration (MWA + Phantom deeplink)

## Development

```bash
npm install
npm run build      # tsup → dist/ (ESM, CJS, IIFE global build)
npm test           # vitest
npm run typecheck  # tsc --noEmit
```

## Support

- **Documentation:** https://portal.cherry.fun/docs
- **GitHub issues:** https://github.com/cherrydotfun/chat-embed-sdk/issues
- **Cherry team:** reach out via [portal.cherry.fun](https://portal.cherry.fun)

## License

MIT — see [LICENSE](./LICENSE).
