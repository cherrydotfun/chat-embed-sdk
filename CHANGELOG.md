# Changelog

All notable changes to `@cherrydotfun/chat-embed-sdk` are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## 0.1.6

### Added

- `EmbedTheme.gradients?: 'on' | 'off'` — toggle the brand gradient fills on the
  own bubble and send button. The derivation engine defaults to a **flat** fill;
  pass `'on'` to restore the curated primary→accent sweep, or `'off'` to pin a
  flat solid everywhere. Honoured by the embed's `setTheme` sanitizer. Optional
  and additive — existing integrations are unaffected.

## 0.1.5 and earlier

See the git history for changes prior to the changelog.
