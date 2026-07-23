/**
 * Theme-engine metadata for the constructor UI. Ported (not copied) from the
 * embed's theme-lab: the seed model, the host-param → `--cherry-*` var map used
 * to read engine-derived values back out of the `themeApplied` event, the
 * Advanced granular groups, and the sanitizer mirror that flags invalid input.
 *
 * The var names match EmbedShell THEME_COLOR_KEYS + useEmbedTheme's emission.
 */
import type { EmbedTheme } from './types';

export type ThemeKey = keyof EmbedTheme;

/** The 2-4 honest seeds the engine derives the full palette from. */
export const SEED_KEYS = ['primaryColor', 'backgroundColor', 'accentColor'] as const;

/** Basic-section colour seeds (the "3+1" contract). */
export interface SeedField {
  k: Extract<ThemeKey, string>;
  label: string;
  hint: string;
}
export const SEED_FIELDS: SeedField[] = [
  { k: 'primaryColor', label: 'Primary', hint: 'Brand CTA → own bubble + send button' },
  { k: 'backgroundColor', label: 'Background', hint: 'Content surface → page + neutral surfaces + inks' },
  { k: 'accentColor', label: 'Accent', hint: 'Secondary highlight → links + mentions + gradient' },
  {
    k: 'incomingBubbleColor',
    label: 'Incoming bubble',
    hint: 'Optional 4th — only when the brand wants its own received-message colour',
  },
];

/** Advanced granular groups — every remaining settable colour, by role. */
export interface GranularField {
  k: Extract<ThemeKey, string>;
  label: string;
  hint?: string;
}
export interface GranularGroup {
  title: string;
  params: GranularField[];
}
export const GRANULAR_GROUPS: GranularGroup[] = [
  {
    title: 'Surface & border',
    params: [
      { k: 'surfaceColor', label: 'Surface', hint: 'Header & input fallback tone' },
      { k: 'borderColor', label: 'Border' },
    ],
  },
  {
    title: 'Text & links',
    params: [
      { k: 'textColor', label: 'Text' },
      { k: 'textSecondaryColor', label: 'Text secondary' },
      { k: 'linkColor', label: 'Links (incoming)', hint: 'Links / @mentions / $tickers on incoming bubbles' },
      { k: 'linkColorOwn', label: 'Links (own)', hint: 'Same, on own bubbles' },
    ],
  },
  {
    title: 'Header',
    params: [
      { k: 'headerColor', label: 'Header background' },
      { k: 'headerTextColor', label: 'Header text' },
    ],
  },
  {
    title: 'Bubbles',
    params: [
      { k: 'incomingBubbleBorderColor', label: 'Incoming bubble border' },
      { k: 'ownBubbleColor', label: 'Own bubble', hint: 'Solid fill overrides the gradient' },
      { k: 'ownBubbleTextColor', label: 'Own bubble text' },
    ],
  },
  {
    title: 'Input & send',
    params: [
      { k: 'inputColor', label: 'Input background' },
      { k: 'inputTextColor', label: 'Input text' },
      { k: 'sendButtonColor', label: 'Send button', hint: 'Solid fill overrides the gradient' },
      { k: 'sendButtonTextColor', label: 'Send icon' },
    ],
  },
  {
    title: 'Embed cards & per-side accents',
    params: [
      { k: 'ownEmbedBgColor', label: 'Own embed card', hint: 'Token / link / group / reply-quote on own bubbles' },
      { k: 'otherEmbedBgColor', label: 'Other embed card', hint: 'Same on incoming messages' },
      { k: 'messageOwnAccentColor', label: 'Own accent', hint: 'Inline reaction (own active)' },
      { k: 'messageOwnAccentSoftColor', label: 'Own accent (soft)', hint: 'Reply-bar stripe + reaction passive on own' },
      { k: 'messageOtherAccentColor', label: 'Other accent', hint: 'Inline reaction (other active)' },
      { k: 'messageOtherAccentSoftColor', label: 'Other accent (soft)', hint: 'Reply-bar stripe on incoming' },
    ],
  },
  {
    title: 'Toolbar icons',
    params: [
      { k: 'iconButtonColor', label: 'Icon button', hint: 'Emoji / GIF / attach glyphs' },
      { k: 'iconButtonHoverColor', label: 'Icon button hover' },
    ],
  },
  {
    title: 'Floating UI & loaders',
    params: [
      { k: 'messageActionsColor', label: 'Message actions menu' },
      { k: 'messageActionsTextColor', label: 'Message actions text' },
      { k: 'tooltipColor', label: 'Tooltip' },
      { k: 'tooltipTextColor', label: 'Tooltip text' },
      { k: 'emojiPickerColor', label: 'Emoji picker' },
      { k: 'avatarHoverColor', label: 'Avatar hover', hint: 'rgba accepted' },
      { k: 'loaderColor', label: 'Loader' },
    ],
  },
  {
    title: 'Overlay & branded',
    params: [
      { k: 'modalOverlayColor', label: 'Modal overlay', hint: 'rgba(0,0,0,0.6) etc.' },
      { k: 'dangerColor', label: 'Danger / error' },
      { k: 'gmColor', label: 'GM badge' },
      { k: 'roleBadgeColor', label: 'Role badge' },
    ],
  },
];

/** Fonts the embed's sanitizer accepts (must match ALLOWED_FONTS). Inter is
 *  the product default; Outfit stays selectable. */
export const SAFE_FONTS = [
  'Inter',
  'Outfit',
  'Geist',
  'FK Grotesk',
  'Roboto',
  'Open Sans',
  'Lato',
  'Poppins',
  'Nunito',
  'Source Sans Pro',
  'Montserrat',
  'system-ui',
  'sans-serif',
  'monospace',
];

/**
 * Host-param → the `--cherry-*` var it drives. Lets the Advanced panel prefill
 * each field with its engine-derived value read back from `themeApplied`, and
 * promote any of them to an explicit override.
 */
export const PARAM_TO_VAR: Partial<Record<Extract<ThemeKey, string>, string>> = {
  primaryColor: '--cherry-primary',
  accentColor: '--cherry-accent',
  backgroundColor: '--cherry-bg',
  surfaceColor: '--cherry-surface',
  borderColor: '--cherry-border',
  textColor: '--cherry-text',
  textSecondaryColor: '--cherry-text-secondary',
  headerColor: '--cherry-header-bg',
  headerTextColor: '--cherry-header-text',
  inputColor: '--cherry-input-bg',
  inputTextColor: '--cherry-input-text',
  sendButtonColor: '--cherry-send-bg',
  sendButtonTextColor: '--cherry-send-text',
  linkColor: '--cherry-link-color',
  linkColorOwn: '--cherry-link-own',
  mentionColor: '--cherry-mention-color',
  incomingBubbleColor: '--cherry-incoming-bubble-bg',
  incomingBubbleBorderColor: '--cherry-incoming-bubble-border',
  ownBubbleColor: '--cherry-own-bubble-bg',
  ownBubbleTextColor: '--cherry-own-bubble-text',
  messageOwnAccentColor: '--cherry-msg-own-accent',
  messageOwnAccentSoftColor: '--cherry-msg-own-accent-soft',
  messageOtherAccentColor: '--cherry-msg-other-accent',
  messageOtherAccentSoftColor: '--cherry-msg-other-accent-soft',
  ownEmbedBgColor: '--cherry-own-embed-bg',
  otherEmbedBgColor: '--cherry-other-embed-bg',
  embedCardColor: '--cherry-embed-card-bg',
  messageActionsColor: '--cherry-msg-actions-bg',
  tooltipColor: '--cherry-tooltip-bg',
  tooltipTextColor: '--cherry-tooltip-text',
  emojiPickerColor: '--cherry-emoji-picker-bg',
  avatarHoverColor: '--cherry-avatar-hover-bg',
  loaderColor: '--cherry-loader-color',
  iconButtonColor: '--cherry-icon-button',
  iconButtonHoverColor: '--cherry-icon-button-hover',
  modalOverlayColor: '--cherry-modal-overlay',
  dangerColor: '--cherry-danger',
  gmColor: '--cherry-gm-color',
  roleBadgeColor: '--cherry-role-badge',
};

/**
 * Mirror of the embed's `isSafeCssColor` sanitizer — a value the embed would
 * drop is flagged invalid in the UI (red border) and kept out of the payload.
 */
const MAX_LEN = 64;
export function isSafeCssColor(v: string): boolean {
  if (typeof v !== 'string' || v.length === 0) return false;
  if (v.length > MAX_LEN) return false;
  if (/[\x00-\x1F\x7F]/.test(v)) return false;
  if (/expression\s*\(/i.test(v)) return false;
  if (/url\s*\(/i.test(v)) return false;
  if (/attr\s*\(/i.test(v)) return false;
  if (/var\s*\(/i.test(v)) return false;
  if (/calc\s*\(/i.test(v)) return false;
  if (/\/\*|\*\//.test(v)) return false;
  if (/<|>|&|\\|;|\{|\}/.test(v)) return false;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) return true;
  if (/^(rgb|hsl)a?\(\s*[\d.,%\s/]+\)$/i.test(v)) return true;
  return false;
}

/** Best-effort projection of any CSS colour onto a `#rrggbb` for the native
 *  swatch. Returns null when it can't (rgba w/ alpha, gradients, hsl). */
export function toHexForPicker(value: string | undefined | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return '#' + v.slice(1).split('').map((c) => c + c).join('');
  }
  if (/^#[0-9a-fA-F]{8}$/.test(v)) return v.slice(0, 7);
  const m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const hex = (n: number) => Math.min(255, +n).toString(16).padStart(2, '0');
    return `#${hex(+m[1])}${hex(+m[2])}${hex(+m[3])}`;
  }
  return null;
}
