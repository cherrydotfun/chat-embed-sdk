# Changelog

All notable changes to `@cherrydotfun/chat-embed-sdk` are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- `unreadState` event — `rooms: [{ roomId, unread, mentions }]` plus totals, so
  hosts can render their own unread dot (`mentions` counts @-mentions, replies
  to the viewer and reactions on the viewer's messages — the same signal as the
  in-chat "@" badge). Scoped to the room the embed renders, never the viewer's
  other chats: 0 or 1 entries today, empty until the room join resolves; the
  array shape is future-proof for list mode. Emitted after the session loads
  and on every counter change; never in preview mode. The legacy `unreadCount`
  event is unchanged.
- `getUnreadState()`, `getUnreadCount(roomId?)` and `refreshUnreadState()` —
  synchronous reads of the cached snapshot, plus an on-demand re-emit for hosts
  that poll instead of subscribing. `signOut()` clears the cache — the runtime
  emits nothing for a signed-out viewer, so hosts should also reset their dot
  on `authStateChange(false)`. `setToken()` and a `setWalletAddress()` that
  changes wallet clear it too: those counts belong to the previous viewer until
  the new session emits its first snapshot.

### Changed

- `show()` / `hide()` / `toggle()` and the mount handshake now report widget
  visibility to the iframe. Hiding used to be CSS-only, so the chat kept
  auto-marking incoming messages read behind a closed widget and unread
  counters never grew; they now accrue while the widget is hidden or
  `collapsed`. `unread` resets when the widget is shown at the bottom of the
  conversation; `mentions` clears on its own boundary (the in-chat "@" badge)
  and therefore survives the reopen.

## 0.1.6

### Added

- `EmbedTheme.gradients?: 'on' | 'off'` — toggle the brand gradient fills on the
  own bubble and send button. The derivation engine defaults to a **flat** fill;
  pass `'on'` to restore the curated primary→accent sweep, or `'off'` to pin a
  flat solid everywhere. Honoured by the embed's `setTheme` sanitizer. Optional
  and additive — existing integrations are unaffected.

## 0.1.5 and earlier

See the git history for changes prior to the changelog.
