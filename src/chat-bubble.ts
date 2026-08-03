import { FLOATING_GUTTER_PX, FLOATING_HEIGHT_PX, MAX_Z_INDEX } from './iframe';
import type { ChatBubbleBadgeMode, EmbedTheme } from './types';

/** Launcher diameter. Fixed — the floating card's own geometry is not a scale factor. */
const BUBBLE_SIZE_PX = 56;
/** Gap between the card's top edge and the open-pose launcher. */
const BUBBLE_GAP_PX = 8;
/** Keeps the launcher plus a top gutter on screen when the card fills a short viewport. */
const BUBBLE_TOP_CLAMP_PX = BUBBLE_SIZE_PX + 16;
/** Brand pink — fill fallback for themes carrying no seed colour. */
const BRAND_PRIMARY = '#ff5ba8';

// ── Unread badge ────────────────────────────────────────────────────────────
// Cherry-recommended sizing: the docs' 12px dot at its literal size, and the
// counter pill at ~40% of this 56px launcher.
/** Bare dot — `'dot'` mode with no mentions outstanding. */
const BADGE_DOT_PX = 12;
/** Pill height, and its min-width — the width grows with the number. */
const BADGE_PILL_PX = 18;
/**
 * Horizontal breathing room, the docs' own value. Paired with the 18px
 * min-width it leaves a single digit in an exact 18x18 circle and only widens
 * the pill from two digits up.
 */
const BADGE_PAD_PX = 5;
/** The pill's original corner offset. */
const BADGE_CORNER_PX = -2;
/**
 * Canonical centre, 7px in from the bubble's corner — where the 18px pill at
 * -2px already sat. Every state centres on it, so swapping dot ↔ pill cannot
 * make the badge jump.
 */
const BADGE_ANCHOR_PX = BADGE_CORNER_PX + BADGE_PILL_PX / 2;
/** Scaled with the pill from the docs' 10px on a 16px pill. */
const BADGE_FONT_PX = 11;
/**
 * Fallbacks behind whatever `theme.fontFamily` asks for. Hosts that already
 * load Inter (portal, cherry.fun) get it; bare hosts land on the system UI
 * face. The SDK never fetches a font — a badge is not worth a network request.
 */
const BADGE_FONT_FALLBACK = 'Inter, system-ui, sans-serif';

/**
 * Badge font follows the embed's own `theme.fontFamily`, so the launcher reads
 * as part of the chat it opens. The host page may not have that face loaded —
 * the iframe is what fetches fonts — but the fallbacks cover rendering and the
 * ascent is measured against whatever actually resolves, so the baseline shift
 * stays right either way.
 */
function badgeFont(theme?: EmbedTheme): string {
  const family = theme?.fontFamily?.trim();
  // Quote a bare multi-word family; leave ready-made stacks and quoted names be.
  const head = family && /\s/.test(family) && !/[",]/.test(family) ? `"${family}"` : family;
  const stack = head ? `${head}, ${BADGE_FONT_FALLBACK}` : BADGE_FONT_FALLBACK;
  return `600 ${BADGE_FONT_PX}px/1 ${stack}`;
}
/** Lone-`@` pill: the glyph carries the badge by itself, like the dot does. */
const AT_GLYPH_PX = 11;
/**
 * Beside digits. The SVG inks its whole box while an 11px digit inks only its
 * ~8px cap height, so a same-sized glyph towers over the number — the font's
 * own `@` used to harmonise itself and the SVG lost that. This box inks ~93%
 * of its height, putting 10px at ~9.3px of ink: about 15% over the digits'
 * cap, which is the proportion a real `@` carries by spanning above the cap
 * and below the baseline.
 */
const AT_GLYPH_ROW_PX = 10;
/**
 * The digits' true ink height above the baseline in the font the host actually
 * resolved — Inter, system-ui or whatever else wins the stack. Falls back to
 * the ratio where canvas or the metric is missing.
 */
function measureDigitAscent(font: string): number {
  const fallback = DIGIT_HEIGHT_RATIO * BADGE_FONT_PX;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return fallback;
    ctx.font = font;
    const ascent = ctx.measureText('1').actualBoundingBoxAscent;
    return typeof ascent === 'number' && ascent > 0 ? ascent : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Digit height as a share of font size — measured 0.69-0.74 across DejaVu
 * Sans/Serif, Ubuntu, Ubuntu Sans and Hack. Stable, unlike the ascent/descent
 * split, which is why the row hangs off the baseline instead of centring line
 * boxes. Deliberately NOT the CSS `cap` unit: that is capital-letter height,
 * and these faces draw lining figures shorter than caps, which parks the glyph
 * above the digits it is supposed to sit level with.
 */
const DIGIT_HEIGHT_RATIO = 0.7;
/** Cherry pink, the pink the chat itself uses. */
const BADGE_PINK = '#ff1493';
/**
 * Ring in the page background. The SDK cannot know the host's backdrop, so it
 * reads `--cherry-bubble-badge-ring` and falls back to the docs' white.
 */
const BADGE_RING = 'var(--cherry-bubble-badge-ring, #ffffff)';

// ── Badge motion ────────────────────────────────────────────────────────────
/** Spring-pop approximation — a touch of overshoot on the way in. */
const BADGE_EASING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
/** Dot ↔ pill morph, and the first-appearance pop. */
const BADGE_MORPH_MS = 180;
/** Glyph landing, once the pill has room for it. */
const BADGE_POP_MS = 150;
/** Lets the pill finish growing before the glyph lands on it. */
const BADGE_POP_DELAY_MS = 70;
/**
 * Geometry, not `transform: scale` — scaling the container would fatten the
 * 2px ring with it. Every property shares one duration so the centre-anchored
 * offsets stay in lockstep with the size and the centre never drifts.
 */
const BADGE_TRANSITION = ['min-width', 'width', 'height', 'top', 'right', 'padding']
  .map((prop) => `${prop} ${BADGE_MORPH_MS}ms ${BADGE_EASING}`)
  .join(', ');

const ICON_SLOT = 'data-cherry-icon';
/** Marks a badge built under `prefers-reduced-motion` — every swap stays instant. */
const BADGE_STATIC_SLOT = 'data-cherry-badge-static';
const BADGE_SLOT = 'data-cherry-badge';
const BADGE_ROW_SLOT = 'data-cherry-badge-row';
/** Measured digit ascent, stashed at creation so the formatter can read it back. */
const BADGE_ASCENT_SLOT = 'data-cherry-badge-ascent';
const BADGE_AT_SLOT = 'data-cherry-badge-at';
const BADGE_NUM_SLOT = 'data-cherry-badge-n';

const CHAT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';

/**
 * At-sign as geometry, not type: system-ui's `@` hangs low and left of its box
 * at 600 11px, which no amount of flex centring corrects. Ink spans 1–23 on
 * both axes of the 24 viewBox, so centring the box centres the glyph.
 */
const AT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" role="img">' +
  '<title>mention</title><circle cx="12" cy="12" r="4"/>' +
  '<path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>';

const CLOSE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

/**
 * Open pose: lifted just clear of the card's top edge, then clamped so the
 * launcher never walks off a short viewport. `vh`, not `dvh` — it has to track
 * the card, and the card caps itself with `calc(100vh - 40px)`.
 */
function openBottom(): string {
  const cap = `100vh - ${FLOATING_GUTTER_PX * 2}px`;
  const lift = FLOATING_GUTTER_PX + BUBBLE_GAP_PX;
  return `min(min(${FLOATING_HEIGHT_PX}px, ${cap}) + ${lift}px, 100vh - ${BUBBLE_TOP_CLAMP_PX}px)`;
}

/** One pending pop-restore per badge, so a re-pop can cancel the old one. */
const pendingRestore = new WeakMap<HTMLElement, number>();

/** Not every host ships matchMedia (jsdom, older embeds) — absent reads as "animate". */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Transition an element that was just revealed: a hidden element has no start
 * value to animate from, so set the start styles, force a reflow to flush them,
 * then set the end styles.
 */
function popIn(el: HTMLElement, scaleFrom: number, durationMs: number, delayMs: number): void {
  el.style.transition = 'none';
  el.style.opacity = '0';
  el.style.transform = `scale(${scaleFrom})`;
  void el.offsetWidth;
  const ease = `${durationMs}ms ${BADGE_EASING} ${delayMs}ms`;
  el.style.transition = `opacity ${ease}, transform ${ease}`;
  el.style.opacity = '1';
  el.style.transform = 'scale(1)';
}

/** WCAG relative luminance of a #RGB / #RRGGBB colour; null for anything else. */
function hexLuminance(value: string): number | null {
  const raw = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())?.[1];
  if (!raw) return null;
  const hex = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw;
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i * 2, i * 2 + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** `ownBubbleColor` wins only when it is a plain colour — a gradient there is the bubble's, not ours. */
function bubbleFill(theme?: EmbedTheme): string {
  const own = theme?.ownBubbleColor;
  if (own && !own.includes('gradient')) return own;
  if (theme?.primaryColor) {
    return `linear-gradient(135deg, ${theme.primaryColor} 0%, ${theme.accentColor ?? theme.primaryColor} 100%)`;
  }
  return BRAND_PRIMARY;
}

/** Icon ink: explicit override, else contrast against the flat fill hex. */
function bubbleInk(theme?: EmbedTheme): string {
  if (theme?.ownBubbleTextColor) return theme.ownBubbleTextColor;
  const own = theme?.ownBubbleColor;
  const flat = own && !own.includes('gradient') ? own : theme?.primaryColor ?? BRAND_PRIMARY;
  const luminance = hexLuminance(flat);
  if (luminance === null) return '#ffffff';
  return luminance > 0.5 ? '#111111' : '#ffffff';
}

export function createBubble(config: {
  position: 'floating-right' | 'floating-left';
  container: HTMLElement;
  badge: ChatBubbleBadgeMode;
}): HTMLButtonElement {
  const bubble = document.createElement('button');
  bubble.type = 'button';

  bubble.style.position = 'fixed';
  // Horizontal side follows the card; the vertical pose is setBubblePose's.
  bubble.style[config.position === 'floating-right' ? 'right' : 'left'] = `${FLOATING_GUTTER_PX}px`;
  bubble.style.width = `${BUBBLE_SIZE_PX}px`;
  bubble.style.height = `${BUBBLE_SIZE_PX}px`;
  bubble.style.display = 'flex';
  bubble.style.alignItems = 'center';
  bubble.style.justifyContent = 'center';
  bubble.style.padding = '0';
  bubble.style.border = 'none';
  bubble.style.borderRadius = '50%';
  bubble.style.cursor = 'pointer';
  bubble.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.28)';
  bubble.style.zIndex = String(MAX_Z_INDEX);
  bubble.style.transition = 'transform 0.2s, bottom 0.2s';

  // The icon lives in its own slot so a pose swap cannot wipe the badge.
  const icon = document.createElement('span');
  icon.setAttribute(ICON_SLOT, '');
  icon.style.display = 'flex';
  bubble.appendChild(icon);
  if (config.badge !== 'off') bubble.appendChild(createBadge());

  config.container.appendChild(bubble);
  return bubble;
}

/** One badge, top-right: the dot, the unread count, or `@` plus that count. Never two. */
function createBadge(): HTMLElement {
  const badge = document.createElement('span');
  badge.setAttribute(BADGE_SLOT, '');
  badge.setAttribute('role', 'status'); // announce count changes
  badge.hidden = true;
  badge.style.position = 'absolute';
  // Size, padding and the centre-anchored offsets are the mode's call.
  badge.style.display = 'none'; // [hidden] loses to display:flex, so drive it directly
  badge.style.alignItems = 'center';
  badge.style.justifyContent = 'center';
  badge.style.boxSizing = 'border-box';
  badge.style.borderRadius = '999px';
  // Read once per bubble: a live listener would outlive the badge for no gain.
  // Seeded here; styleBubbleFont re-measures whenever the theme font changes.
  badge.setAttribute(BADGE_ASCENT_SLOT, String(measureDigitAscent(badgeFont())));
  if (prefersReducedMotion()) badge.setAttribute(BADGE_STATIC_SLOT, '');
  else badge.style.transition = BADGE_TRANSITION;
  badge.style.background = BADGE_PINK;
  badge.style.color = '#fff';
  badge.style.font = badgeFont();
  badge.style.boxShadow = `0 0 0 2px ${BADGE_RING}`;

  // Inner row so the glyph/digit pair can hang off a shared baseline while the
  // badge keeps centring the pair as a group.
  const row = document.createElement('span');
  row.setAttribute(BADGE_ROW_SLOT, '');
  row.style.display = 'flex';
  row.style.gap = '3px';

  const at = document.createElement('span');
  at.setAttribute(BADGE_AT_SLOT, '');
  at.innerHTML = AT_ICON;
  at.style.display = 'none'; // mention state only
  // No line box of its own, so its baseline is exactly the glyph's bottom edge.
  at.style.lineHeight = '0';

  const num = document.createElement('span');
  num.setAttribute(BADGE_NUM_SLOT, '');
  num.style.display = 'none'; // nothing to number yet
  num.style.lineHeight = '1';

  row.appendChild(at);
  row.appendChild(num);
  badge.appendChild(row);
  return badge;
}

/**
 * The single place deciding badge text. The number is always the unread-message
 * count and `@` is a bare mention flag — the mention tally itself is never
 * shown, which is how Telegram paints the same pair. In `'dot'` mode nothing is
 * numbered: unread is a bare dot, a mention upgrades it to a lone `@`. Hidden
 * only when both counters are zero — that is also the signed-out clear.
 * `'off'` never built a badge, so this no-ops.
 */
export function setBubbleBadge(
  bubble: HTMLButtonElement,
  unread: number,
  mentions: number,
  mode: ChatBubbleBadgeMode,
): void {
  const badge = bubble.querySelector<HTMLElement>(`[${BADGE_SLOT}]`);
  if (!badge) return;
  const mention = mentions > 0;
  const counted = mode === 'count';
  const numbered = counted && unread > 0; // the only state carrying digits
  const bare = !counted && !mention; // a dot carries no glyph at all
  const empty = unread === 0 && mentions === 0;
  const animate = !badge.hasAttribute(BADGE_STATIC_SLOT);

  const at = badge.querySelector<HTMLElement>(`[${BADGE_AT_SLOT}]`);
  const num = badge.querySelector<HTMLElement>(`[${BADGE_NUM_SLOT}]`);
  // Sampled before the swap — only a hidden→shown slot has a pop to play.
  const appearing = badge.hidden && !empty;
  const atAppearing = at?.style.display === 'none';
  const numAppearing = num?.style.display === 'none';

  badge.hidden = empty;
  badge.style.display = empty ? 'none' : 'flex';

  const size = bare ? BADGE_DOT_PX : BADGE_PILL_PX;
  badge.style.minWidth = `${size}px`;
  badge.style.height = `${size}px`;
  // Centre-anchored, not corner-anchored. A numbered pill keeps this right edge
  // and grows leftward, so only its height feeds the vertical centre.
  const inset = BADGE_ANCHOR_PX - size / 2;
  badge.style.top = `${inset}px`;
  badge.style.right = `${inset}px`;
  // Only digits need room to grow; a lone dot or `@` stays a circle.
  badge.style.padding = numbered ? `0 ${BADGE_PAD_PX}px` : '0';

  // Beside digits the pair hangs off one baseline — centring line boxes instead
  // would move the digits' ink by however a given font splits ascent/descent.
  const row = badge.querySelector<HTMLElement>(`[${BADGE_ROW_SLOT}]`);
  if (row) row.style.alignItems = numbered ? 'baseline' : 'center';

  if (at) {
    at.style.display = mention ? 'block' : 'none';
    const glyph = at.querySelector('svg');
    if (glyph) {
      const px = numbered ? AT_GLYPH_ROW_PX : AT_GLYPH_PX;
      glyph.setAttribute('width', String(px));
      glyph.setAttribute('height', String(px));
      glyph.style.display = 'block';
      // Baseline-aligned, the glyph's bottom sits ON the digits' baseline, so
      // its centre is baseline - px/2 while their ink centres on ascent/2 above
      // it. Drop it by the difference. Rounded: the raw division trails float
      // noise into the CSS, and 0.01px is already below a device pixel.
      const ascent =
        parseFloat(badge.getAttribute(BADGE_ASCENT_SLOT) ?? '') || DIGIT_HEIGHT_RATIO * BADGE_FONT_PX;
      const shift = Math.round((px / 2 - ascent / 2) * 100) / 100;
      glyph.style.transform = numbered ? `translateY(${shift}px)` : '';
    }
  }

  // Always the unread tally — a mention count is never rendered. Taken out of
  // layout when there is nothing to show: an empty flex item still claims the
  // 3px gap, which pushes a lone `@` off-centre.
  if (num) {
    num.style.display = numbered ? 'block' : 'none';
    num.textContent = numbered ? (unread > 99 ? '99+' : String(unread)) : '';
  }

  // Any in-flight restore belongs to a pop this run supersedes. Cancelling it
  // first is what stops an interleaving from landing on a stale end state.
  const stale = pendingRestore.get(badge);
  if (stale !== undefined) {
    clearTimeout(stale);
    pendingRestore.delete(badge);
  }
  if (!animate || empty) {
    // Unconditional and last: whatever a cancelled pop left behind, a badge
    // that is not mid-pop is fully opaque and unscaled.
    badge.style.opacity = '';
    badge.style.transform = '';
    return;
  }
  if (appearing) {
    // Coming from nothing: scale the whole badge so the ring pops in with it,
    // then hand the element back to the geometry transition.
    popIn(badge, 0.5, BADGE_MORPH_MS, 0);
    pendingRestore.set(
      badge,
      window.setTimeout(() => {
        pendingRestore.delete(badge);
        badge.style.opacity = '';
        badge.style.transform = '';
        badge.style.transition = BADGE_TRANSITION;
      }, BADGE_MORPH_MS),
    );
    return; // that pop already scaled the glyphs — no second one on top
  }
  // Not appearing: any earlier pop is over as far as this state is concerned.
  badge.style.opacity = '';
  badge.style.transform = '';
  if (at && mention && atAppearing) popIn(at, 0.6, BADGE_POP_MS, BADGE_POP_DELAY_MS);
  if (num && numbered && numAppearing) popIn(num, 0.6, BADGE_POP_MS, BADGE_POP_DELAY_MS);
}

/** Pose follows actual panel visibility, whoever changed it. */
export function setBubblePose(bubble: HTMLButtonElement, open: boolean): void {
  // Icon slot only — the badge is a sibling and must survive the swap.
  const icon = bubble.querySelector<HTMLElement>(`[${ICON_SLOT}]`);
  if (icon) icon.innerHTML = open ? CLOSE_ICON : CHAT_ICON;
  bubble.setAttribute('aria-label', open ? 'Close chat' : 'Open chat');
  bubble.setAttribute('aria-expanded', String(open));
  if (open) {
    bubble.style.bottom = openBottom();
  } else {
    // Fallback first — an unsupported env() is dropped, leaving the plain gutter.
    bubble.style.bottom = `${FLOATING_GUTTER_PX}px`;
    bubble.style.bottom = `max(${FLOATING_GUTTER_PX}px, env(safe-area-inset-bottom))`;
  }
}

/**
 * Re-derive the badge font from the theme and re-measure the digits' ascent —
 * the stashed value is font-specific, so a font change invalidates it.
 * Called at mount and on every setTheme / resetTheme.
 */
export function styleBubbleFont(bubble: HTMLButtonElement, theme?: EmbedTheme): void {
  const badge = bubble.querySelector<HTMLElement>(`[${BADGE_SLOT}]`);
  if (!badge) return;
  const font = badgeFont(theme);
  badge.style.font = font;
  badge.setAttribute(BADGE_ASCENT_SLOT, String(measureDigitAscent(font)));
}

/** Re-derive fill + icon ink. Called at mount and on every setTheme / resetTheme. */
export function styleBubbleFill(bubble: HTMLButtonElement, theme?: EmbedTheme): void {
  bubble.style.background = bubbleFill(theme);
  bubble.style.color = bubbleInk(theme);
}
