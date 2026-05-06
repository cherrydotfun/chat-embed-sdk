import type { ThemePreset } from './types';

/**
 * Four starter themes. Each preset is a complete EmbedTheme — the demo
 * reaches `cherry` by sending `{}` so the iframe falls through to its
 * built-in defaults (which already match prod chat.cherry.fun).
 *
 * The constructor on the right of the page lets visitors tweak any field
 * after picking a preset; the override layer lives in React state and is
 * wiped on reload.
 */
export const PRESETS: ThemePreset[] = [
  {
    id: 'cherry',
    label: 'Cherry',
    blurb: 'Default brand — pink/purple gradient, dark surface.',
    swatches: ['#ff1493', '#4a1d56'],
    theme: {
      mode: 'dark',
      // Empty payload reverts the iframe to its built-in defaults.
    },
  },
  {
    id: 'light-fun',
    label: 'Light Fun',
    blurb: 'Sunny coral on warm cream — playful but not loud.',
    swatches: ['#fb7185', '#fbbf24'],
    theme: {
      mode: 'light',
      primaryColor: '#fb7185',
      // Accent kept warm so the primary→accent gradient is no longer used
      // anywhere visible (own bubble + send button are now solid, see
      // ownBubbleColor / sendButtonColor below). Old #06b6d4 cyan turned
      // own bubbles into a coral→cyan rainbow that read as kitsch.
      accentColor: '#fbbf24',
      backgroundColor: '#fff7ed',
      surfaceColor: '#ffedd5',
      borderColor: 'rgba(124, 45, 18, 0.12)',
      textColor: '#7c2d12',
      textSecondaryColor: 'rgba(124, 45, 18, 0.62)',
      linkColor: '#0891b2',
      mentionColor: '#ea580c',
      incomingBubbleColor: '#ffe4e6',
      incomingBubbleBorderColor: '#fecdd3',
      // Solid coral instead of the gradient — no more rainbow on own bubbles.
      ownBubbleColor: '#fb7185',
      // Dark brown reads with high contrast on coral and stays consistent
      // with the rest of the warm-light palette. White on coral was tech-
      // nically passable but visually pale next to the dark text used on
      // every other surface.
      ownBubbleTextColor: '#7c2d12',
      headerColor: '#fed7aa',
      headerTextColor: '#7c2d12',
      inputColor: '#fff7ed',
      inputTextColor: '#7c2d12',
      sendButtonColor: '#fb7185',
      // Slightly darker than incoming bubble so token cards / link previews
      // sit visibly on top instead of melting into the message surface.
      embedCardColor: '#fbcfe8',
      // Cream — pinned message items + reply menu sit cleanly on a warm
      // off-white instead of competing with the peach header.
      messageActionsColor: '#fff7ed',
      messageActionsTextColor: '#78350f',
      tooltipColor: '#7c2d12',
      tooltipTextColor: '#fff7ed',
      emojiPickerColor: '#fff7ed',
      avatarHoverColor: 'rgba(251, 113, 133, 0.18)',
      loaderColor: '#fb7185',
      // Quote / token-card / reaction-passive — clean white card lifted
      // off the coral bubble. Pink-on-coral previously felt muddy; pure
      // white reads as a deliberate inset and lets the dark-brown text
      // sit on a neutral surface.
      messageOwnAccentColor: '#ffffff',
      // Reply bar stripe + own-active reaction — dark brown matches the
      // body text, gives a calm marker without bringing a third hue.
      messageOwnAccentSoftColor: '#7c2d12',
      // Same recipe on the other side — white card on the light-pink
      // incoming bubble, dark stripe.
      messageOtherAccentColor: '#ffffff',
      messageOtherAccentSoftColor: '#7c2d12',
      iconButtonColor: '#9a3412',
      iconButtonHoverColor: '#7c2d12',
      modalOverlayColor: 'rgba(124, 45, 18, 0.45)',
      dangerColor: '#dc2626',
      // Warm orange — replaces the default amber so the GM 👋 N counter
      // contrasts the peach header. Solid fill (was 0.15-alpha tint) makes
      // it visible at a glance.
      gmColor: '#ea580c',
      // MOD / OWNER chips share the mention orange so role tags read as
      // distinctive without bringing in an unrelated hue.
      roleBadgeColor: '#ea580c',
      fontFamily: 'Poppins',
      fontSize: 'md',
    },
  },
  {
    id: 'light-restrained',
    label: 'Light Restrained',
    blurb: 'Quiet slate on warm white. No neon.',
    swatches: ['#475569', '#e4e4e7'],
    theme: {
      mode: 'light',
      primaryColor: '#475569',
      accentColor: '#64748b',
      backgroundColor: '#fafafa',
      surfaceColor: '#f4f4f5',
      borderColor: 'rgba(24, 24, 27, 0.1)',
      textColor: '#18181b',
      textSecondaryColor: 'rgba(24, 24, 27, 0.55)',
      linkColor: '#0369a1',
      mentionColor: '#6d28d9',
      incomingBubbleColor: '#e4e4e7',
      incomingBubbleBorderColor: '#d4d4d8',
      // Light slate — keeps the bubble in the same tonal family as the
      // rest of the light theme. The previous #1f2937 (slate-800) was
      // jet-black on cream, which clashed and made dark global text
      // unreadable when frontend modules used `--text-primary` directly.
      ownBubbleColor: '#cbd5e1',
      // Dark slate text — matches global textColor so the same value
      // works for both inherited and explicit-coloured children.
      ownBubbleTextColor: '#0f172a',
      headerColor: '#e4e4e7',
      headerTextColor: '#18181b',
      inputColor: '#f4f4f5',
      inputTextColor: '#18181b',
      // Send button stays dark slate as a deliberate accent button —
      // distinct from the chat surface, white icon reads cleanly on it.
      sendButtonColor: '#1f2937',
      // Distinct from the incoming bubble (#e4e4e7) — link/token-card
      // previews should sit visibly on top of the message instead of
      // melting into it. zinc-300 is one shade darker.
      embedCardColor: '#d4d4d8',
      messageActionsColor: '#e4e4e7',
      messageActionsTextColor: '#18181b',
      tooltipColor: '#1f2937',
      tooltipTextColor: '#fafafa',
      emojiPickerColor: '#f4f4f5',
      avatarHoverColor: 'rgba(24, 24, 27, 0.06)',
      loaderColor: '#475569',
      // Reply quote / token-card on own bubble — light slate-200 card
      // sitting on the slate-300 bubble, so the quote reads as a calm
      // lift, not a heavy block. (Slate-400 here was too dark.)
      messageOwnAccentColor: '#e2e8f0',
      // Reply bar stripe + reaction passive — slate-400 mid tone, gives
      // a visible marker without dominating the quote.
      messageOwnAccentSoftColor: '#94a3b8',
      // Other-side equivalents: gray-300 quote (just a hair darker than
      // the incoming bubble #e4e4e7) + slate-500 bar.
      messageOtherAccentColor: '#d1d5db',
      messageOtherAccentSoftColor: '#71717a',
      iconButtonColor: '#71717a',
      iconButtonHoverColor: '#27272a',
      modalOverlayColor: 'rgba(24, 24, 27, 0.55)',
      dangerColor: '#b91c1c',
      // Slate-700 — default would inherit `mentionColor` (#6d28d9 violet),
      // which is too saturated against an otherwise neutral palette.
      roleBadgeColor: '#475569',
      // Default amber (#FFB800) reads as bright orange on a slate-neutral
      // light surface — looks like a stray warning chip. Slate matches.
      gmColor: '#475569',
      fontFamily: 'Inter',
      fontSize: 'md',
    },
  },
  {
    id: 'dark-restrained',
    label: 'Dark Restrained',
    blurb: 'Charcoal monochrome, minimal saturation.',
    swatches: ['#27272a', '#a1a1aa'],
    theme: {
      mode: 'dark',
      primaryColor: '#e4e4e7',
      accentColor: '#a1a1aa',
      backgroundColor: '#09090b',
      surfaceColor: '#18181b',
      borderColor: 'rgba(255, 255, 255, 0.08)',
      textColor: '#fafafa',
      textSecondaryColor: 'rgba(250, 250, 250, 0.55)',
      linkColor: '#a1a1aa',
      mentionColor: '#d4d4d8',
      incomingBubbleColor: '#27272a',
      incomingBubbleBorderColor: '#3f3f46',
      // Own bubble = zinc-600. Per-side accents below are deliberately
      // darker (msg-own-accent) and lighter (msg-own-accent-soft) than
      // the bubble — anything close to #52525b would melt into it and
      // hide reply quotes / token cards / reaction badges.
      ownBubbleColor: '#52525b',
      ownBubbleTextColor: '#fafafa',
      headerColor: '#18181b',
      headerTextColor: '#fafafa',
      inputColor: '#18181b',
      inputTextColor: '#fafafa',
      sendButtonColor: '#fafafa',
      // The white send button needs a dark icon — default is white.
      sendButtonTextColor: '#09090b',
      // zinc-600 — clearly lighter than the incoming bubble (#27272a) so
      // token cards / link previews don't melt into other-side messages.
      // (zinc-700 #3f3f46 was too close to the bubble; lift one step.)
      embedCardColor: '#52525b',
      messageActionsColor: '#27272a',
      messageActionsTextColor: '#fafafa',
      tooltipColor: '#09090b',
      tooltipTextColor: '#fafafa',
      emojiPickerColor: '#18181b',
      avatarHoverColor: 'rgba(255, 255, 255, 0.08)',
      loaderColor: '#fafafa',
      // Darker than ownBubble (#52525b) — reply quote + token-card on
      // own messages now visibly recess.
      messageOwnAccentColor: '#27272a',
      // Lighter than ownBubble — reaction badges on own messages stand
      // off the bubble surface.
      messageOwnAccentSoftColor: '#a1a1aa',
      messageOtherAccentColor: '#52525b',
      messageOtherAccentSoftColor: '#71717a',
      iconButtonColor: '#a1a1aa',
      iconButtonHoverColor: '#fafafa',
      modalOverlayColor: 'rgba(0, 0, 0, 0.7)',
      dangerColor: '#f87171',
      // Solid zinc-700 — default would inherit `mentionColor` (#d4d4d8,
      // near-white) and the white chip text would disappear on it.
      roleBadgeColor: '#3f3f46',
      fontFamily: 'Inter',
      fontSize: 'md',
    },
  },
];

export const PRESET_BY_ID: Record<string, ThemePreset> = Object.fromEntries(
  PRESETS.map((p) => [p.id, p]),
);

export const DEFAULT_PRESET_ID = 'cherry' as const;
