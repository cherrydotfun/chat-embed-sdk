export interface EmbedTheme {
  mode?: 'dark' | 'light';

  /**
   * Curated brand gradients on the own bubble + send button. The derivation
   * default is FLAT, so `'on'` must be sent explicitly to restore the sweep;
   * `'off'` pins a flat solid fill. Honoured by the embed's setTheme sanitizer.
   */
  gradients?: 'on' | 'off';

  // ── Core palette (drive most derived colours) ─────────────────────────
  primaryColor?: string;
  accentColor?: string;
  /** Page / chat-area background. */
  backgroundColor?: string;
  /** Surface tone used as a fallback for header / input when not overridden. */
  surfaceColor?: string;
  /** Border colour. When unset, derived from textColor opacity. */
  borderColor?: string;

  // ── Text ──────────────────────────────────────────────────────────────
  textColor?: string;
  textSecondaryColor?: string;
  /**
   * Colour for every clickable glyph inside an INCOMING bubble — links,
   * @mentions, $tickers, handle buttons. One uniform tone per side.
   */
  linkColor?: string;
  /** Same as `linkColor` but for clickable text inside an OWN bubble. */
  linkColorOwn?: string;
  /** @deprecated alias for `linkColor`; back-compat fallback. */
  mentionColor?: string;

  // ── Bubbles ───────────────────────────────────────────────────────────
  /**
   * Background colour for incoming message bubbles. Defaults to the brand
   * purple used by chat.cherry.fun (#4a1d56). Override to recolour received
   * messages without touching the surface (header / input) palette.
   */
  incomingBubbleColor?: string;
  /** Border colour for incoming bubbles. Pairs with `incomingBubbleColor`. */
  incomingBubbleBorderColor?: string;
  /**
   * Solid background colour for own (outgoing) bubbles. When set, replaces
   * the default primary→accent gradient with a flat fill.
   */
  ownBubbleColor?: string;
  /** Text colour inside own bubbles. */
  ownBubbleTextColor?: string;

  // ── Header ────────────────────────────────────────────────────────────
  /** Header background. Falls back to surfaceColor when unset. */
  headerColor?: string;
  /** Header text colour. Falls back to textColor when unset. */
  headerTextColor?: string;

  // ── Input + Send button ───────────────────────────────────────────────
  /** Background colour for the message input field. Falls back to surface. */
  inputColor?: string;
  /** Text colour inside the input field. */
  inputTextColor?: string;
  /**
   * Solid background colour for the Send button. When set, replaces the
   * default primary→accent gradient with a flat fill.
   */
  sendButtonColor?: string;
  /**
   * Send-button icon colour (paper-plane). Defaults to white. Override
   * when the button background is too light for white to remain visible.
   */
  sendButtonTextColor?: string;

  // ── Embed-like cards (token / link / group preview / reply quote) ────
  /**
   * Background for every embed-like card on OWN messages — token cards,
   * link previews, group previews, and the reply-quote bubble. Defaults
   * to a one-shade variation of `ownBubbleColor` so the card sits
   * coherently with the surrounding bubble.
   */
  ownEmbedBgColor?: string;
  /** Same as above but for incoming messages — defaults to a shade of
   *  `incomingBubbleColor`. */
  otherEmbedBgColor?: string;
  /** @deprecated alias for `otherEmbedBgColor`; kept for back-compat. */
  embedCardColor?: string;

  // ── Floating UI ───────────────────────────────────────────────────────
  /** Background for the small reply/delete actions menu next to messages. */
  messageActionsColor?: string;
  messageActionsTextColor?: string;
  tooltipColor?: string;
  tooltipTextColor?: string;
  /** Emoji-picker panel background. */
  emojiPickerColor?: string;
  /** Avatar hover-overlay tint. */
  avatarHoverColor?: string;
  /** Loading spinner colour. Defaults to primary. */
  loaderColor?: string;

  // ── Per-side message accents ──────────────────────────────────────────
  /**
   * Accent for own (outgoing) message contextual surfaces — reply bars,
   * token-card backgrounds, inline reaction badges. Default `#f54dbb`.
   */
  messageOwnAccentColor?: string;
  /** Soft variant of the own-side accent (light pink). Default `#ffb3eb`. */
  messageOwnAccentSoftColor?: string;
  /**
   * Accent for incoming message contextual surfaces. Default `#6b307d`.
   */
  messageOtherAccentColor?: string;
  /** Soft variant of the other-side accent (light purple). Default `#d6a6e3`. */
  messageOtherAccentSoftColor?: string;

  // ── Input toolbar icons (GIF / emoji / attach) ────────────────────────
  iconButtonColor?: string;
  iconButtonHoverColor?: string;

  // ── Modal overlays + danger / error tone ──────────────────────────────
  /** Backdrop colour for modals (delete-confirm, send-image). */
  modalOverlayColor?: string;
  /** Danger / error red used by destructive actions and error states. */
  dangerColor?: string;

  /** Accent for the GM (👋) counter badge in the header. Default `#FFB800`. */
  gmColor?: string;
  /** Accent for moderation role chips (MOD / OWNER). Defaults to mention. */
  roleBadgeColor?: string;

  // ── Typography ────────────────────────────────────────────────────────
  fontFamily?: string;
  fontSize?: 'sm' | 'md' | 'lg';
}

export interface EmbedLayout {
  showHeader?: boolean;
  headerTitle?: string;
  showMemberCount?: boolean;
  /** @deprecated Ignored by the embed runtime (its layout sanitizer drops it). */
  showAvatars?: boolean;
  /** @deprecated Ignored by the embed runtime (its layout sanitizer drops it). */
  showTimestamps?: boolean;
  /** @deprecated Ignored by the embed runtime (its layout sanitizer drops it). */
  showReactions?: boolean;
  showInput?: boolean;
  /** @deprecated Ignored by the embed runtime; size the container element instead. */
  maxHeight?: string;
}

export type SignChallengeHandler = (message: Uint8Array) => Promise<Uint8Array>;

/**
 * Embed display mode.
 *
 * - `'single'` (default) — embed is locked to the `roomId` set at construction
 *   time; room navigation inside the iframe is disabled.
 * - `'external-controlled'` — the host drives room navigation via `setRoom()`;
 *   the iframe exposes a room-list UI but defers navigation decisions to the
 *   host. The iframe emits `roomChanged` events when the user selects a room.
 * - `'list'` — the iframe renders its full room-list UI and the user can
 *   navigate freely; the host receives `roomChanged` events but does not need
 *   to call `setRoom()` itself.
 *
 * NOTE: the embed runtime currently only implements `'single'`. Passing
 * `'external-controlled'` or `'list'` yields single-room behavior until the
 * runtime ships those modes.
 */
export type EmbedMode = 'single' | 'external-controlled' | 'list';

export interface CherryEmbedConfig {
  appId: string;
  /**
   * Mount target: a DOM element or CSS selector. Required for `inline`
   * embeds. Omit for `floating-right` / `floating-left` — the widget then
   * mounts to `document.body`.
   */
  container?: HTMLElement | string;
  token?: string;
  /** Optional wallet address. Forwarded to iframe on mount so it is
   *  available before the first `signChallenge` request arrives. */
  walletAddress?: string;
  roomId?: string;
  /**
   * Embed display mode. Controls whether the iframe shows a single room,
   * a list, or hands room navigation control to the host.
   * Defaults to `'single'`.
   */
  mode?: EmbedMode;
  theme?: EmbedTheme;
  layout?: EmbedLayout;
  position?: 'inline' | 'floating-right' | 'floating-left';
  collapsed?: boolean;
  embedUrl?: string;
  /**
   * Optional wallet signing callback registered during mount before initial
   * token / walletAddress commands are sent to the iframe.
   */
  signChallengeHandler?: SignChallengeHandler;
}

export type EmbedEventMap = {
  ready: void;
  unreadCount: number;
  message: { roomId: string; senderId: string; timestamp: number };
  authStateChange: boolean;
  /**
   * NOTE: not currently emitted by the embed runtime — the iframe
   * re-establishes sessions silently from a rotating refresh token when it
   * loads. Kept for forward compatibility.
   */
  tokenExpired: void;
  /**
   * NOTE: not currently emitted by the embed runtime. Kept for forward
   * compatibility.
   */
  error: { code: string; message: string };
  /**
   * Iframe requests host to initiate sign-in / wallet connect.
   * Emitted when the user clicks send/react in preview (read-only) mode,
   * or clicks an explicit "Connect wallet" CTA inside the iframe.
   * Host should respond by triggering wallet.connect and calling
   * chat.setWalletAddress(addr) (and chat.setToken(token) for
   * backend-token auth).
   */
  walletConnectRequested: void;
  /**
   * Iframe transitioned into preview-mode (room metadata + read-only messages,
   * no JWT yet). Useful for host UI to show a "Sign in" prompt nearby.
   */
  preview: { visible: boolean; gated: boolean };
  /**
   * Emitted by the iframe whenever the active room changes.
   *
   * In `'external-controlled'` mode the host drives navigation via
   * `setRoom()` and should listen to this event to keep its own state in
   * sync. In `'list'` mode the user navigates freely and the host can use
   * this event as a notification. In `'single'` mode this event is not
   * expected to fire unless the server overrides the mode.
   *
   * NOTE: not currently emitted by the embed runtime — only `'single'`
   * mode is implemented today, so this event never fires. Kept for
   * forward compatibility.
   */
  roomChanged: { roomId: string };
};

// Bridge protocol messages (host <-> iframe)
export interface BridgeMessage {
  type: 'cherry:cmd' | 'cherry:event' | 'cherry:request' | 'cherry:response';
}

export interface BridgeCommand extends BridgeMessage {
  type: 'cherry:cmd';
  method: string;
  params?: Record<string, unknown>;
}

export interface BridgeEvent extends BridgeMessage {
  type: 'cherry:event';
  event: string;
  data?: unknown;
}

// ---- Request/response (iframe→host direction) ----

/**
 * Concrete params for signChallenge requests sent by the iframe.
 * `message` is a base64-encoded byte array for the host wallet to sign.
 * Extends `Record<string, unknown>` so it is assignable to `BridgeRequest.params`.
 */
export interface SignChallengeParams extends Record<string, unknown> {
  message: string; // base64-encoded Uint8Array
}

/**
 * Successful signChallenge result returned to the iframe.
 * `signature` is the base64-encoded Ed25519 signature bytes.
 */
export interface SignChallengeResult {
  signature: string; // base64-encoded Uint8Array
}

/**
 * Typed request methods that the iframe may send to the host.
 * Extend this union when new request methods are added.
 */
export type BridgeRequestMethod = 'signChallenge';

export interface BridgeRequest extends BridgeMessage {
  type: 'cherry:request';
  /** Unique correlation id — the matching `cherry:response` must carry the same id. */
  id: string;
  method: BridgeRequestMethod;
  params?: Record<string, unknown>;
}

/** Specific shape for signChallenge requests. */
export interface SignChallengeRequest extends BridgeMessage {
  type: 'cherry:request';
  id: string;
  method: 'signChallenge';
  params: SignChallengeParams;
}

export interface BridgeResponse extends BridgeMessage {
  type: 'cherry:response';
  /** Must match the `id` of the originating `cherry:request`. */
  id: string;
  result?: unknown;
  error?: { code: string; message: string };
}

/** Specific shape for successful signChallenge responses. */
export interface SignChallengeResponse extends BridgeMessage {
  type: 'cherry:response';
  id: string;
  result: SignChallengeResult;
}

/** Type guard: narrows a BridgeRequest to a SignChallengeRequest. */
export function isSignChallengeRequest(req: BridgeRequest): req is SignChallengeRequest {
  return (
    req.method === 'signChallenge' &&
    req.params !== undefined &&
    typeof (req.params as Record<string, unknown>)['message'] === 'string'
  );
}
