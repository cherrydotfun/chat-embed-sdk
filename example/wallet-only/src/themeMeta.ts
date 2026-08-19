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

/* ── Surfaces: how each of the three grounds is painted ─────────────────── */

/**
 * How a surface is painted. Derived PURELY from the value sitting on the theme
 * object, so the control is a view on the field — never a second source of truth.
 *
 * Every label is either the literal that goes on the wire or the honest umbrella
 * for "no key at all" — nothing in the segmented control is a metaphor:
 *
 *   default     — labelled `auto`: key absent, the engine decides the tone.
 *   solid       — an opaque colour; painted verbatim.
 *   alpha       — a colour carrying an alpha channel (`rgba()` / `#RRGGBBAA`);
 *                 the surface is see-through and its RGB channels still anchor
 *                 the engine's derivation.
 *   transparent — the bare `transparent` keyword, sent verbatim; fully
 *                 see-through, and the engine synthesizes a brand-toned anchor
 *                 because the value carries no colour of its own.
 */
export type SurfaceMode = 'default' | 'solid' | 'alpha' | 'transparent';

export const SURFACE_MODES: readonly { v: SurfaceMode; label: string }[] = [
  { v: 'default', label: 'auto' },
  { v: 'solid', label: 'solid' },
  { v: 'alpha', label: 'alpha' },
  { v: 'transparent', label: 'transparent' },
] as const;

/** True when the surface is painted opaque — a blur behind it has nothing to sample. */
export function isOpaqueMode(mode: SurfaceMode): boolean {
  return mode === 'default' || mode === 'solid';
}

export interface SurfaceField {
  /** Colour key that paints the surface. */
  k: Extract<ThemeKey, string>;
  /** Companion blur key that frosts whatever shows through it. */
  blurKey: Extract<ThemeKey, string>;
  label: string;
  /** What the surface is (concept, not key names). */
  hint: string;
  /** What the blur frosts — shown on the blur slider. */
  blurHint: string;
}

/**
 * The three surfaces that can be made see-through, each with the blur that
 * frosts what shows through it. Background is also a derivation seed (it has a
 * row in the seed list above); this section is about how it is PAINTED.
 */
export const SURFACE_FIELDS: SurfaceField[] = [
  {
    k: 'backgroundColor',
    blurKey: 'backgroundBlur',
    label: 'Background',
    hint: 'The widget ground — go see-through and the host page shows through the whole chat',
    blurHint: 'Frosts the host page behind the widget (applied by the SDK to the iframe itself)',
  },
  {
    k: 'headerColor',
    blurKey: 'headerBlur',
    label: 'Header',
    hint: 'The bar above the transcript',
    blurHint: 'Frosts the transcript scrolling under the header',
  },
  {
    k: 'inputColor',
    blurKey: 'inputBlur',
    label: 'Composer',
    hint: 'The message input strip',
    blurHint: 'Frosts the transcript scrolling under the composer',
  },
];

/** Hard cap on a blur radius (px) — mirrors the embed's own clamp. */
export const MAX_BLUR_PX = 40;

/**
 * Ceiling for the alpha slider. A surface at alpha 1 IS solid, and letting the
 * slider reach it would flip the row's mode out from under the user's cursor
 * mid-drag.
 */
export const MAX_SURFACE_ALPHA = 0.95;

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
  // The bare keyword — the canonical way to hand a surface fully see-through.
  if (/^transparent$/i.test(v.trim())) return true;
  // 4- and 8-digit hex carry an alpha channel (the tinted see-through form).
  if (/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) return true;
  if (/^(rgb|hsl)a?\(\s*[\d.,%\s/]+\)$/i.test(v)) return true;
  return false;
}

/** Best-effort projection of any CSS colour onto a `#rrggbb` for the native
 *  swatch. Returns null when it can't (the bare keyword, gradients, hsl). */
export function toHexForPicker(value: string | undefined | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3,4}$/.test(v)) {
    // #RGB / #RGBA → expand, then drop any alpha nibble.
    const full = '#' + v.slice(1).split('').map((c) => c + c).join('');
    return full.slice(0, 7);
  }
  if (/^#[0-9a-fA-F]{8}$/.test(v)) return v.slice(0, 7);
  const m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const hex = (n: number) => Math.min(255, +n).toString(16).padStart(2, '0');
    return `#${hex(+m[1])}${hex(+m[2])}${hex(+m[3])}`;
  }
  return null;
}

/* ── Value-form helpers for the surface controls ───────────────────────────
 * Mirrors of the embed's own readers, so the demo classifies a value exactly
 * the way the engine will. */

/** True for the bare see-through keyword (case/space-insensitive). */
export function isBareTransparent(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'transparent';
}

/**
 * Alpha channel (0..1) of any value the embed accepts. The bare keyword → 0;
 * #RGBA / #RRGGBBAA → the trailing nibble/byte; rgba()/hsla() → the 4th
 * component (fraction or %); everything else (incl. unparseable) → 1.
 */
export function colorAlpha(value: string | undefined | null): number {
  if (typeof value !== 'string') return 1;
  const v = value.trim().toLowerCase();
  if (v === '') return 1;
  if (v === 'transparent') return 0;
  if (v.startsWith('#')) {
    let h = v.slice(1);
    if (h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length === 8) {
      const a = parseInt(h.slice(6, 8), 16);
      return isNaN(a) ? 1 : a / 255;
    }
    return 1;
  }
  const fn = v.match(/^(?:rgba?|hsla?)\s*\(([^)]*)\)$/i);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 4) {
      const a = parts[3];
      const n = a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a);
      return isNaN(n) ? 1 : Math.min(1, Math.max(0, n));
    }
  }
  return 1;
}

/** Classify a surface value into the mode its control should show. */
export function surfaceMode(value: string | undefined): SurfaceMode {
  if (value === undefined || value === '') return 'default';
  if (isBareTransparent(value)) return 'transparent';
  return colorAlpha(value) < 1 ? 'alpha' : 'solid';
}

/**
 * Compose a see-through fill from an opaque base + an alpha. Emits `rgba(...)`
 * rather than 8-digit hex: it is the self-documenting form in the integration
 * snippet, and the embed accepts both.
 */
export function withAlpha(baseHex: string, alpha: number): string {
  const hex = toHexForPicker(baseHex) ?? '#000000';
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // 2 decimals keeps the emitted string clean and the round-trip stable.
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 100) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Mirror of the embed's blur sanitizer: a finite integer clamped 0–40, or null
 * when the value is absent / empty / non-numeric.
 */
export function toBlurPx(value: unknown): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value.trim())
        : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_BLUR_PX, Math.max(0, Math.round(n)));
}
