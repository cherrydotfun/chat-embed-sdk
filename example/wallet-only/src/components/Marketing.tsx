import type { EmbedLayout, EmbedTheme } from '../types';

const LOGO = `${import.meta.env.BASE_URL}cherry-logo.png`;

interface MarketingProps {
  /** Current working theme — its seeds are reflected in the copyable snippet. */
  theme: Partial<EmbedTheme>;
  /** Current layout — non-default flags are reflected in the snippet. */
  layout: EmbedLayout;
}

/** The seed keys a real integration would actually pass (not the full palette). */
const SNIPPET_SEEDS: (keyof EmbedTheme)[] = [
  'mode',
  'primaryColor',
  'backgroundColor',
  'accentColor',
  'incomingBubbleColor',
];

/**
 * Surface colours worth showing next to the seeds: they are what a host passes
 * to take a ground see-through, so they belong in the copy-paste snippet even
 * though the rest of the granular palette does not.
 */
const SNIPPET_SURFACES: (keyof EmbedTheme)[] = ['headerColor', 'inputColor'];

/** Numeric (px) keys — emitted bare, no quotes. */
const SNIPPET_BLURS: (keyof EmbedTheme)[] = ['backgroundBlur', 'headerBlur', 'inputBlur'];

/** Entry count past which the theme object reads better broken over lines. */
const THEME_INLINE_MAX = 4;

function buildSnippet(
  theme: Partial<EmbedTheme>,
  layout: EmbedLayout,
): { code: string; shown: number; total: number } {
  const themeEntries: string[] = [];
  for (const k of [...SNIPPET_SEEDS, ...SNIPPET_SURFACES]) {
    const v = theme[k];
    if (typeof v === 'string' && v) themeEntries.push(`${k}: '${v}'`);
  }
  if (theme.gradients === 'on') themeEntries.push(`gradients: 'on'`);
  for (const k of SNIPPET_BLURS) {
    const v = theme[k];
    // Only real, non-zero amounts — a 0 blur is the same as not passing one.
    const n = typeof v === 'number' ? v : typeof v === 'string' && v ? Number(v) : NaN;
    if (Number.isFinite(n) && n > 0) themeEntries.push(`${k}: ${Math.round(n)}`);
  }
  const themeInline = !themeEntries.length
    ? `{ mode: 'dark' }`
    : themeEntries.length <= THEME_INLINE_MAX
      ? `{ ${themeEntries.join(', ')} }`
      : `{\n      ${themeEntries.join(',\n      ')},\n    }`;

  const layoutEntries: string[] = [];
  if (layout.showHeader === false) layoutEntries.push('showHeader: false');
  if (layout.showMemberCount === false) layoutEntries.push('showMemberCount: false');
  if (layout.showInput === false) layoutEntries.push('showInput: false');
  const ht = (layout.headerTitle ?? '').trim();
  if (ht) layoutEntries.push(`headerTitle: '${ht.replace(/'/g, "\\'")}'`);
  const layoutLine = layoutEntries.length ? `\n    layout: { ${layoutEntries.join(', ')} },` : '';

  const total = (Object.keys(theme) as (keyof EmbedTheme)[]).filter((k) => {
    const v = theme[k];
    return v !== undefined && v !== '';
  }).length;

  const code = `<script src="https://cdn.jsdelivr.net/npm/@cherrydotfun/chat-embed-sdk@0.1.7/dist/index.global.js"></script>
<div id="cherry-chat" style="height: 600px"></div>
<script>
  new window.CherryEmbedSDK.CherryEmbed({
    appId: 'your-app-id',
    container: '#cherry-chat',
    roomId: 'your-room-id',                   // optional
    theme: ${themeInline},${layoutLine}
  }).mount();
</script>`;

  return { code, shown: themeEntries.length, total };
}

/**
 * Restrained, portal-style hero: what it is in one line, no marketing glitter.
 * The live theme + layout constructor below is the real story of the page — and
 * the integration snippet reflects the current seeds and non-default layout.
 */
export function Marketing({ theme, layout }: MarketingProps) {
  const { code, shown, total } = buildSnippet(theme, layout);
  // The snippet is the SEED-shaped integration a host would really write; a
  // preset additionally pins granular slots. Say so out loud rather than let the
  // snippet read as "everything the preview is running on".
  const hidden = Math.max(0, total - shown);
  return (
    <section className="marketing">
      <div className="marketing-eyebrow">
        <span className="brand-mark">
          <img src={LOGO} alt="" aria-hidden="true" />
          Cherry <em>Embed</em>
        </span>
        <a
          className="marketing-eyebrow-link"
          href="https://github.com/cherrydotfun/chat-embed-sdk"
          target="_blank"
          rel="noreferrer"
          aria-label="View source on GitHub"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span>GitHub</span>
        </a>
      </div>

      <h1 className="marketing-title">Drop-in wallet-native chat for any site</h1>
      <p className="marketing-lede">
        One <code>&lt;script&gt;</code> tag and a <code>div</code>. The iframe handles wallet
        connect, signing, and the full chat surface. Theme it live below — pass 2–4 brand
        colours and the engine derives the rest.
      </p>

      <details className="snippet">
        <summary>Integration snippet</summary>
        <pre>
          <code>{code}</code>
        </pre>
        <p className="snippet-foot">
          Reflects the current seeds, surfaces &amp; layout.{' '}
          {hidden > 0 && (
            <>
              The live preview is sending <b>{hidden}</b> further key{hidden === 1 ? '' : 's'} the
              snippet leaves out (granular palette + typography) — <b>Copy theme</b> in the editor
              gives the exact object.{' '}
            </>
          )}
          Full SDK reference &amp; types on{' '}
          <a
            className="snippet-link"
            href="https://github.com/cherrydotfun/chat-embed-sdk"
            target="_blank"
            rel="noreferrer"
          >
            github.com/cherrydotfun/chat-embed-sdk
          </a>
          .
        </p>
      </details>
    </section>
  );
}
