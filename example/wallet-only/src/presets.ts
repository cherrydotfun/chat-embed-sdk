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
    /**
     * Every field here matches the iframe's built-in default exactly —
     * filling them out so the editor surfaces the actual hex values
     * (instead of leaving inputs blank with a placeholder). `ownBubbleColor`
     * + `sendButtonColor` stay UNSET on purpose so the iframe falls back
     * to its primary→accent gradient — set them to flatten into a solid
     * tile.
     */
    theme: {
      mode: 'dark',
      primaryColor: '#ff1493',
      accentColor: '#c026d3',
      backgroundColor: '#0a0a0f',
      surfaceColor: '#12111a',
      borderColor: 'rgba(255, 255, 255, 0.08)',
      textColor: '#ffffff',
      textSecondaryColor: 'rgba(255, 255, 255, 0.5)',
      linkColor: '#ff1493',
      linkColorOwn: 'rgb(255, 232, 243)',
      incomingBubbleColor: '#4a1d56',
      incomingBubbleBorderColor: '#6b2d7b',
      ownBubbleTextColor: '#ffffff',
      headerColor: '#12111a',
      headerTextColor: '#ffffff',
      inputColor: '#12111a',
      inputTextColor: '#ffffff',
      sendButtonTextColor: '#ffffff',
      ownEmbedBgColor: '#ff4dad',
      otherEmbedBgColor: '#5d3068',
      messageActionsColor: '#1a1923',
      messageActionsTextColor: '#ffffff',
      tooltipColor: '#0a0a0f',
      tooltipTextColor: '#ffffff',
      emojiPickerColor: '#1a1923',
      avatarHoverColor: 'rgba(255, 255, 255, 0.06)',
      loaderColor: '#ff1493',
      messageOwnAccentColor: '#f54dbb',
      messageOwnAccentSoftColor: '#ffb3eb',
      messageOtherAccentColor: '#6b307d',
      messageOtherAccentSoftColor: '#d6a6e3',
      iconButtonColor: '#7a7c85',
      iconButtonHoverColor: '#d4d4d8',
      modalOverlayColor: 'rgba(0, 0, 0, 0.6)',
      dangerColor: '#ef4444',
      gmColor: '#FFB800',
      roleBadgeColor: '#ff1493',
      fontFamily: 'Outfit',
      fontSize: 'md',
    },
  },
  {
    id: 'peach',
    label: 'Peach',
    blurb: 'Dusty rose on cream — soft, romantic, low-saturation.',
    swatches: ['#D97886', '#F2DDE0'],
    theme: {
      mode: 'light',
      primaryColor: '#D97886',
      accentColor: '#C96877',
      backgroundColor: '#FBF6F4',
      surfaceColor: '#F5E6E2',
      borderColor: 'rgba(124, 45, 18, 0.12)',
      textColor: '#4A1B26',
      textSecondaryColor: 'rgba(74, 27, 38, 0.6)',
      linkColor: '#9E4E5C',
      linkColorOwn: '#FBE7EA',
      incomingBubbleColor: '#F2DDE0',
      incomingBubbleBorderColor: '#E7CCD1',
      ownBubbleColor: '#D97886',
      ownBubbleTextColor: '#FBF6F4',
      headerColor: '#F5E6E2',
      headerTextColor: '#4A1B26',
      inputColor: '#FBF6F4',
      inputTextColor: '#4A1B26',
      sendButtonColor: '#D97886',
      // Embed cards (token / link / group / reply quote) — one tone per
      // side, slightly darker than the bubble so the card visibly sits
      // on top of the bubble while staying in the same hue family.
      ownEmbedBgColor: '#C96877',
      otherEmbedBgColor: '#E7CCD1',
      messageActionsColor: '#FBF6F4',
      messageActionsTextColor: '#4A1B26',
      tooltipColor: '#4A1B26',
      tooltipTextColor: '#FBF6F4',
      emojiPickerColor: '#FBF6F4',
      avatarHoverColor: 'rgba(217, 120, 134, 0.18)',
      loaderColor: '#D97886',
      // Inline reactions (4 slots — own/other × active/passive). The
      // hex values come straight from the user's reaction-grid spec.
      messageOwnAccentSoftColor: '#9E4E5C',  // own active on own bubble
      messageOwnAccentColor:     '#F1C5CB',  // other active on own bubble (passive)
      messageOtherAccentSoftColor: '#B95A69', // own active on other bubble
      messageOtherAccentColor:     '#F1E3DF', // other active on other bubble (passive)
      iconButtonColor: '#9A3412',
      iconButtonHoverColor: '#4A1B26',
      modalOverlayColor: 'rgba(74, 27, 38, 0.45)',
      dangerColor: '#B91C1C',
      gmColor: '#9E4E5C',
      roleBadgeColor: '#9E4E5C',
      fontFamily: 'Outfit',
      fontSize: 'md',
    },
  },
  {
    id: 'linen',
    label: 'Linen',
    blurb: 'Quiet slate on warm white. No neon.',
    swatches: ['#475569', '#e4e4e7'],
    theme: {
      mode: 'light',
      primaryColor: '#475569',
      accentColor: '#64748b',
      backgroundColor: '#8c96ab',
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
      fontFamily: 'Outfit',
      fontSize: 'md',
    },
  },
  {
    id: 'onyx',
    label: 'Onyx',
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
      fontFamily: 'Outfit',
      fontSize: 'md',
    },
  },
  {
    id: 'solflare',
    label: 'Solflare',
    blurb: 'Golden yellow on near-black — solid-yellow own bubbles, gray incoming, no gradients.',
    swatches: ['#F4D60E', '#1C1C1F'],
    theme: {
      mode: 'dark',
      primaryColor: '#F4D60E',
      accentColor: '#F4D60E',
      backgroundColor: '#0A0A0B',
      surfaceColor: '#171719',
      borderColor: 'rgba(255, 255, 255, 0.07)',
      textColor: '#EAEAEA',
      textSecondaryColor: 'rgba(234, 234, 234, 0.5)',
      linkColor: '#F4D60E',
      linkColorOwn: '#0A0A0B',
      // Incoming = flat dark gray, like the wallet's asset cards. No colour.
      incomingBubbleColor: '#1C1C1F',
      incomingBubbleBorderColor: '#2A2A2E',
      // Own = SOLID Solflare yellow with black text. No gradient.
      ownBubbleColor: '#F4D60E',
      ownBubbleTextColor: '#0A0A0B',
      headerColor: '#0F0F10',
      headerTextColor: '#EAEAEA',
      inputColor: '#171719',
      inputTextColor: '#EAEAEA',
      // Solid yellow send button (no gradient), black icon.
      sendButtonColor: '#F4D60E',
      sendButtonTextColor: '#0A0A0B',
      ownEmbedBgColor: '#D8BE0A',
      otherEmbedBgColor: '#26262A',
      messageActionsColor: '#171719',
      messageActionsTextColor: '#EAEAEA',
      tooltipColor: '#0A0A0B',
      tooltipTextColor: '#EAEAEA',
      emojiPickerColor: '#171719',
      avatarHoverColor: 'rgba(255, 255, 255, 0.06)',
      loaderColor: '#F4D60E',
      // On the yellow own bubble — keep accents dark so they read.
      messageOwnAccentColor: '#1A1702',
      messageOwnAccentSoftColor: '#9A8606',
      // On the gray incoming bubble — neutral gray accents.
      messageOtherAccentColor: '#3A3A40',
      messageOtherAccentSoftColor: '#5A5A62',
      iconButtonColor: '#8A8A90',
      iconButtonHoverColor: '#F4D60E',
      modalOverlayColor: 'rgba(0, 0, 0, 0.65)',
      dangerColor: '#FF5C5C',
      gmColor: '#F4D60E',
      roleBadgeColor: '#33333A',
      fontFamily: 'FK Grotesk',
      fontSize: 'md',
    },
  },
  {
    id: 'jupiter',
    label: 'Jupiter',
    blurb: 'Onchain lime on deep navy — solid lime CTAs, Inter type.',
    swatches: ['#C7F284', '#1C2936'],
    theme: {
      mode: 'dark',
      primaryColor: '#C7F284',
      accentColor: '#5BD2BC',
      backgroundColor: '#0B1117',
      surfaceColor: '#162430',
      borderColor: 'rgba(255, 255, 255, 0.08)',
      textColor: '#F8FAFC',
      textSecondaryColor: 'rgba(144, 161, 185, 0.9)',
      linkColor: '#C7F284',
      linkColorOwn: '#14361E',
      incomingBubbleColor: '#1C2936',
      incomingBubbleBorderColor: '#2C3E4F',
      // Jupiter's primary CTAs are SOLID lime with dark text — pin the own
      // bubble + send button to flat lime instead of the default gradient.
      ownBubbleColor: '#C7F284',
      ownBubbleTextColor: '#0B1117',
      headerColor: '#162430',
      headerTextColor: '#F8FAFC',
      inputColor: '#162430',
      inputTextColor: '#F8FAFC',
      sendButtonColor: '#C7F284',
      sendButtonTextColor: '#0B1117',
      ownEmbedBgColor: '#A9D96B',
      otherEmbedBgColor: '#243646',
      messageActionsColor: '#1C2936',
      messageActionsTextColor: '#F8FAFC',
      tooltipColor: '#0A0E13',
      tooltipTextColor: '#F8FAFC',
      emojiPickerColor: '#162430',
      avatarHoverColor: 'rgba(255, 255, 255, 0.06)',
      loaderColor: '#C7F284',
      messageOwnAccentColor: '#3F5F23',
      messageOwnAccentSoftColor: '#6B9B3A',
      messageOtherAccentColor: '#2C3E4F',
      messageOtherAccentSoftColor: '#5BD2BC',
      iconButtonColor: '#90A1B9',
      iconButtonHoverColor: '#C7F284',
      modalOverlayColor: 'rgba(0, 0, 0, 0.7)',
      dangerColor: '#FF6B6B',
      gmColor: '#C7F284',
      roleBadgeColor: '#5BD2BC',
      fontFamily: 'Inter',
      fontSize: 'md',
    },
  },
];

export const PRESET_BY_ID: Record<string, ThemePreset> = Object.fromEntries(
  PRESETS.map((p) => [p.id, p]),
);

export const DEFAULT_PRESET_ID = 'cherry' as const;
