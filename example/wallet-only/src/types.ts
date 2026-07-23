/**
 * Local copy of the SDK's `EmbedTheme` shape so the demo doesn't have to
 * pull the full SDK package (the bundle is loaded as a global IIFE via
 * <script src="/cherry-embed.js">). Keep this in sync with
 * `chat-embed-sdk/src/types.ts`.
 */
export interface EmbedTheme {
  mode?: 'dark' | 'light';

  /**
   * Curated brand gradients on the own bubble + send button. Post-v4 the
   * derivation default is FLAT, so `gradients: 'on'` must be sent explicitly
   * to restore the sweep; `'off'` pins a flat solid fill. Honoured by the
   * embed's setTheme sanitizer.
   */
  gradients?: 'on' | 'off';

  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  borderColor?: string;

  textColor?: string;
  textSecondaryColor?: string;
  linkColor?: string;
  linkColorOwn?: string;
  /** @deprecated alias for linkColor */
  mentionColor?: string;

  incomingBubbleColor?: string;
  incomingBubbleBorderColor?: string;
  ownBubbleColor?: string;
  ownBubbleTextColor?: string;

  headerColor?: string;
  headerTextColor?: string;

  inputColor?: string;
  inputTextColor?: string;
  sendButtonColor?: string;
  sendButtonTextColor?: string;

  ownEmbedBgColor?: string;
  otherEmbedBgColor?: string;
  /** @deprecated alias for otherEmbedBgColor */
  embedCardColor?: string;

  messageActionsColor?: string;
  messageActionsTextColor?: string;
  tooltipColor?: string;
  tooltipTextColor?: string;
  emojiPickerColor?: string;
  avatarHoverColor?: string;
  loaderColor?: string;

  messageOwnAccentColor?: string;
  messageOwnAccentSoftColor?: string;
  messageOtherAccentColor?: string;
  messageOtherAccentSoftColor?: string;

  iconButtonColor?: string;
  iconButtonHoverColor?: string;

  modalOverlayColor?: string;
  dangerColor?: string;

  gmColor?: string;
  roleBadgeColor?: string;

  fontFamily?: string;
  fontSize?: 'sm' | 'md' | 'lg';
}

/**
 * Host-controllable layout of the embed chrome. Mirrors the SDK's `EmbedLayout`
 * but exposes ONLY the fields the embed's `sanitizeLayoutParams` honours today
 * — the deprecated toggles (showAvatars / showTimestamps / showReactions /
 * maxHeight) are dropped by the sanitizer, so the demo does not surface them.
 */
export interface EmbedLayout {
  /** Show the room header bar. */
  showHeader?: boolean;
  /** Override the header title (stripped of <>&", capped at 120 chars). Empty → room default. */
  headerTitle?: string;
  /** Show the member-count row nested in the header. */
  showMemberCount?: boolean;
  /** Show the message composer. */
  showInput?: boolean;
}

export type PresetId = 'cherry' | 'peach' | 'linen' | 'onyx' | 'solflare' | 'jupiter';

/**
 * How the chat surface mounts inside the host page. Each value maps to a
 * concrete `CherryEmbedConfig` that the demo passes to `new CherryEmbed`
 * — see DemoChat.tsx for the runtime translation.
 *
 *   inline       — fills the container, no widget chrome.
 *   floating     — `position: floating-right` + `collapsed: true`. The demo
 *                  renders a launcher button; clicking it calls
 *                  `chat.toggle()` so the iframe slides in from the corner.
 *   collapsible  — inline mount that the host hides/shows in place. A small
 *                  bubble sits in the corner of the chat-frame; clicking it
 *                  reveals the iframe (no fixed-position floating).
 *   resizable    — inline mount inside a container with `resize: both`,
 *                  letting the user drag the bottom-right corner. Also
 *                  draggable via the handle on top of the panel.
 */
export type DisplayMode = 'inline' | 'floating' | 'collapsible' | 'resizable';

export interface DisplayModeOption {
  id: DisplayMode;
  label: string;
  blurb: string;
}

export interface ThemePreset {
  id: PresetId;
  label: string;
  /** Short blurb shown under the preset name in the picker. */
  blurb: string;
  /** Two swatches used for the preset card preview tile. */
  swatches: [string, string];
  theme: EmbedTheme;
}

/**
 * Bundle for the `<CherryEmbed>` config — values that drive the iframe
 * (appId / embedUrl / roomId) come from `/config.json` at runtime so the
 * same demo runs against local Vite, stage, and prod without rebuilds.
 */
export interface DemoConfig {
  appId: string;
  embedUrl: string;
  roomId: string | null;
  /**
   * Cherry messaging-server origin (e.g. https://chat.cherry.fun). Not
   * read by the wallet-only demo today — the iframe handles every API
   * call from its own origin — but exposed here for forward-compat with
   * future host-page features (server-side discovery, status checks,
   * etc.) so the deploy `.env` can supply it without code churn.
   */
  apiUrl?: string | null;
}
