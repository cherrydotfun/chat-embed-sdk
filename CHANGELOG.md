# Changelog

All notable changes to `@cherrydotfun/chat-embed-sdk` are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## 0.2.0

### Added

- **Host-provided identity** — the embed can render display names and avatars
  supplied by YOUR app instead of the wallet's Cherry identity (`.sol` domain or
  shortened address), so an integration's chat shows its own users. Visual and
  scoped to one running embed: Cherry persists nothing, the wallet stays the
  author of every message, and the Cherry app is unaffected.
  - Config handlers answered by the host page: `resolveUsers` (batch, ≤50
    wallets per call), `searchUsers` (@mention autocomplete over your
    directory), `getUser` (reserved for the profile view).
  - Methods: `setUserProfiles(users)` to push names/avatars into a running chat
    (a rename is invisible otherwise; fields are merged, so pushing a name
    alone keeps the avatar), `invalidateUserProfiles(ids?)` to re-ask your
    resolver (a refresh, not a forget: the name on screen stays while the fresh
    answer is in flight), `setIdentityToken(token)` for the profile endpoint's
    `Authorization` header (memory only, never persisted).
  - Config fields: `userProfiles` (known at mount, no round-trip on first
    paint) and `identityToken`.
  - Types: `EmbedUserProfile`, `EmbedUserProfileWithId`, `EmbedUserSearchParams`,
    `EmbedUserSearchResult`, `ResolveUsersHandler`, `SearchUsersHandler`,
    `GetUserHandler`; `BridgeRequestMethod` gains `users.resolve` /
    `users.search` / `users.get`.

  Requires "Who your users appear as" to be enabled for the embed at
  portal.cherry.fun. Alternatively, configure a profile endpoint there and the
  widget calls your backend directly — no host-page handlers needed. Registering
  nothing keeps the previous behaviour exactly.

## 0.1.6

### Added

- `EmbedTheme.gradients?: 'on' | 'off'` — toggle the brand gradient fills on the
  own bubble and send button. The derivation engine defaults to a **flat** fill;
  pass `'on'` to restore the curated primary→accent sweep, or `'off'` to pin a
  flat solid everywhere. Honoured by the embed's `setTheme` sanitizer. Optional
  and additive — existing integrations are unaffected.

## 0.1.5 and earlier

See the git history for changes prior to the changelog.
