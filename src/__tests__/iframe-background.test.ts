/**
 * Unit tests for the iframe ELEMENT background ground (`applyIframeBackground`
 * + `isOpaqueColor` in `iframe.ts`).
 *
 * jsdom normalises assigned colours (`#abc` → `rgb(170, 187, 204)`), so
 * assertions compare against a probe element fed the same input.
 */

import { describe, it, expect } from 'vitest';
import { applyIframeBackground, isOpaqueColor } from '../iframe';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// The default ground in `iframe.ts`
const DEFAULT_BACKGROUND = '#0a0a0f';

function createIframe(): HTMLIFrameElement {
  return document.createElement('iframe');
}

// What jsdom stores after assigning `value` to `style.backgroundColor`
function normalized(value: string): string {
  const probe = document.createElement('div');
  probe.style.backgroundColor = value;
  return probe.style.backgroundColor;
}

// ---------------------------------------------------------------------------
// isOpaqueColor
// ---------------------------------------------------------------------------

describe('isOpaqueColor', () => {
  it.each([
    // The one keyword that is see-through by name.
    { input: 'transparent', expected: false },
    // #rgb / #rrggbb carry no alpha channel at all.
    { input: '#abc', expected: true },
    // #rgba — the 4th nibble is the alpha.
    { input: '#abcf', expected: true },
    { input: '#abc0', expected: false },
    // #rrggbbaa — the last byte is the alpha.
    { input: '#aabbccff', expected: true },
    { input: '#aabbcc00', expected: false },
    // Legacy comma syntax: alpha is the 4th component.
    { input: 'rgba(255, 0, 0, 0.5)', expected: false },
    // Modern slash syntax, percentage alpha.
    { input: 'hsl(200 50% 50% / 50%)', expected: false },
    // Three components, no alpha at all → fully opaque.
    { input: 'rgb(255, 0, 0)', expected: true },
    // Named colours are unparseable here and fall through to the safe answer.
    { input: 'red', expected: true },
    // So does anything else, including the empty string.
    { input: '', expected: true },
  ])('$input → opaque: $expected', ({ input, expected }) => {
    expect(isOpaqueColor(input)).toBe(expected);
  });

  it('ignores surrounding whitespace and letter case', () => {
    expect(isOpaqueColor('  TRANSPARENT  ')).toBe(false);
    expect(isOpaqueColor('  #AABBCC00  ')).toBe(false);
    expect(isOpaqueColor('  #AABBCCFF  ')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyIframeBackground — opaque theme background
// ---------------------------------------------------------------------------

describe('applyIframeBackground — opaque background', () => {
  it('paints an opaque hex background on the iframe element', () => {
    const iframe = createIframe();

    applyIframeBackground(iframe, '#ff8800');

    expect(iframe.style.backgroundColor).toBe(normalized('#ff8800'));
  });

  it('paints an opaque named colour', () => {
    const iframe = createIframe();

    applyIframeBackground(iframe, 'red');

    expect(iframe.style.backgroundColor).toBe(normalized('red'));
  });

  it('paints a fully opaque #rrggbbaa background', () => {
    const iframe = createIframe();

    applyIframeBackground(iframe, '#112233ff');

    expect(iframe.style.backgroundColor).toBe(normalized('#112233ff'));
  });

  it('replaces a previously painted background', () => {
    const iframe = createIframe();

    applyIframeBackground(iframe, '#ff8800');
    applyIframeBackground(iframe, '#123456');

    expect(iframe.style.backgroundColor).toBe(normalized('#123456'));
  });
});

// ---------------------------------------------------------------------------
// applyIframeBackground — see-through theme background
// ---------------------------------------------------------------------------

describe('applyIframeBackground — see-through background', () => {
  it.each(['transparent', 'rgba(255, 0, 0, 0.5)', '#abc0', '#aabbcc00'])(
    'leaves the iframe unpainted for %s',
    (backgroundColor) => {
      const iframe = createIframe();

      applyIframeBackground(iframe, backgroundColor);

      expect(iframe.style.backgroundColor).toBe('');
    },
  );

  it('clears a background that was already painted', () => {
    const iframe = createIframe();
    applyIframeBackground(iframe, '#ff8800');

    applyIframeBackground(iframe, 'transparent');

    // Switching to a see-through theme must not leave an opaque slab behind
    // the widget, so the earlier ground is removed rather than kept.
    expect(iframe.style.backgroundColor).toBe('');
  });

  it('repaints when switching back from see-through to opaque', () => {
    const iframe = createIframe();
    applyIframeBackground(iframe, 'transparent');

    applyIframeBackground(iframe, '#123456');

    expect(iframe.style.backgroundColor).toBe(normalized('#123456'));
  });
});

// ---------------------------------------------------------------------------
// applyIframeBackground — unset theme background
// ---------------------------------------------------------------------------

describe('applyIframeBackground — unset background', () => {
  it('falls back to the default dark canvas when the theme sets none', () => {
    const iframe = createIframe();

    applyIframeBackground(iframe, undefined);

    expect(iframe.style.backgroundColor).toBe(normalized(DEFAULT_BACKGROUND));
  });

  it('treats an empty string as unset', () => {
    const iframe = createIframe();

    applyIframeBackground(iframe, '');

    expect(iframe.style.backgroundColor).toBe(normalized(DEFAULT_BACKGROUND));
  });

  it('treats a whitespace-only string as unset', () => {
    const iframe = createIframe();

    applyIframeBackground(iframe, '   ');

    expect(iframe.style.backgroundColor).toBe(normalized(DEFAULT_BACKGROUND));
  });

  it('restores the default over a previously painted background', () => {
    const iframe = createIframe();
    applyIframeBackground(iframe, '#ff8800');

    // The `resetTheme()` path: back to the built-in ground, not to bare glass.
    applyIframeBackground(iframe, undefined);

    expect(iframe.style.backgroundColor).toBe(normalized(DEFAULT_BACKGROUND));
    expect(iframe.style.backgroundColor).not.toBe('');
  });
});
