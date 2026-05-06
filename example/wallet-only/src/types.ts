/**
 * Local copy of the SDK's `EmbedTheme` shape so the demo doesn't have to
 * pull the full SDK package (the bundle is loaded as a global IIFE via
 * <script src="/cherry-embed.js">). Keep this in sync with
 * `chat-embed-sdk/src/types.ts`.
 */
export interface EmbedTheme {
  mode?: 'dark' | 'light';

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

export type PresetId = 'cherry' | 'warm' | 'light-restrained' | 'dark-restrained';

/**
 * How the chat surface mounts inside the host page. Each value maps to a
 * concrete `CherryEmbedConfig` that the demo passes to `new CherryEmbed`
 * — see DemoChat.tsx for the runtime translation.
 *
 *   inline      — fills the container, no widget chrome.
 *   floating    — `position: floating-right` + `collapsed: true`. The demo
 *                 renders a launcher button; clicking it calls
 *                 `chat.toggle()` so the iframe slides in from the corner.
 *   resizable   — inline mount inside a container with `resize: both`,
 *                 letting the user drag the bottom-right corner.
 */
export type DisplayMode = 'inline' | 'floating' | 'resizable';

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
