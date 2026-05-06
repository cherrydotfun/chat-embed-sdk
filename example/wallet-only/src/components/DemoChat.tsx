import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DemoConfig, DisplayMode, EmbedTheme } from '../types';
import { getSdk, type ChatHandle } from '../cherryGlobal';

interface DemoChatProps {
  config: DemoConfig;
  theme: EmbedTheme;
  /**
   * Counter that the host bumps whenever the iframe should clear its
   * theme state before applying the next setTheme — preset switches and
   * the Reset button both bump it. Per-field colour-picker edits do not.
   */
  resetTrigger: number;
  displayMode: DisplayMode;
}

/**
 * Mounts the Cherry chat iframe and pushes theme updates to it on every
 * change — no debounce, so colour-picker drags update the iframe
 * frame-by-frame.
 *
 * `displayMode` selects one of three mount strategies:
 *   - inline:    iframe fills the container.
 *   - floating:  SDK floats the iframe in the viewport corner; we render
 *                a launcher button that calls `chat.toggle()`.
 *   - resizable: inline mount inside a container with `resize: both`.
 *
 * Switching mode triggers a remount because `position` / `collapsed`
 * live in the SDK's mount-time config — they are not runtime commands.
 */
export function DemoChat({ config, theme, resetTrigger, displayMode }: DemoChatProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<ChatHandle | null>(null);
  // Stash the latest theme so the inline mount(theme: ...) below picks up
  // the most recent value instead of the one captured at first render.
  const themeRef = useRef<EmbedTheme>(theme);
  themeRef.current = theme;
  // Track the last reset trigger we honoured so we know when the host
  // wants a fresh slate.
  const prevTriggerRef = useRef<number>(resetTrigger);
  const [floatingOpen, setFloatingOpen] = useState(false);

  // Mount / unmount whenever the SDK's mount-time config changes.
  // displayMode flips `position` + `collapsed` so it joins the deps.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    setFloatingOpen(false);

    (async () => {
      try {
        const sdk = getSdk();
        const chat = new sdk.CherryEmbed({
          appId: config.appId,
          container,
          embedUrl: config.embedUrl,
          roomId: config.roomId ?? undefined,
          theme: themeRef.current,
          position: displayMode === 'floating' ? 'floating-right' : 'inline',
          collapsed: displayMode === 'floating',
        });
        await chat.mount();
        if (cancelled) {
          chat.destroy();
          return;
        }
        chatRef.current = chat;
        chat.on('error', (err) => console.warn('[demo:chat] error', err));
        chat.on('authStateChange', (ok) =>
          console.log('[demo:chat] authState =', ok),
        );
        // Floating: SDK pins the iframe at the maximum z-index so it sits
        // above the host page. In the demo we want our launcher button to
        // sit ABOVE the iframe so users can close it — knock the iframe
        // down to a sane value and bump the launcher above it via CSS.
        if (displayMode === 'floating') {
          const iframe = container.querySelector('iframe');
          if (iframe) iframe.style.zIndex = '999998';
        }
      } catch (err) {
        console.error('[demo:chat] mount failed', err);
      }
    })();

    return () => {
      cancelled = true;
      chatRef.current?.destroy();
      chatRef.current = null;
    };
  }, [config.appId, config.embedUrl, config.roomId, displayMode]);

  // Push theme updates synchronously on every change. Reset first when
  // the host bumped the trigger — otherwise leftover fields from the
  // previous palette would bleed into the new one (the iframe merges
  // setTheme into prev state).
  useEffect(() => {
    const handle = chatRef.current;
    if (!handle) return;
    try {
      if (resetTrigger !== prevTriggerRef.current) {
        handle.resetTheme();
        prevTriggerRef.current = resetTrigger;
      }
      handle.setTheme(theme);
    } catch (err) {
      console.warn('[demo:chat] setTheme failed', err);
    }
  }, [theme, resetTrigger]);

  const toggleFloating = useCallback(() => {
    const handle = chatRef.current;
    if (!handle) return;
    handle.toggle();
    setFloatingOpen((o) => !o);
  }, []);

  /**
   * The launcher's background tracks the active theme so it always
   * "belongs" to the palette behind it. Priority:
   *   1. an explicit own-bubble fill (solid colour the user picked),
   *   2. the primary→accent gradient the bubbles use by default,
   *   3. fallback to Cherry's pink→purple gradient (CSS default).
   * The closed-state pulse uses the primary as its halo colour so the
   * ring picks up the same hue.
   */
  const launcherStyle = useMemo<React.CSSProperties>(() => {
    if (displayMode !== 'floating') return {};
    const style: React.CSSProperties & Record<string, string> = {};
    if (theme.ownBubbleColor) {
      style.background = theme.ownBubbleColor;
    } else if (theme.primaryColor && theme.accentColor) {
      style.background = `linear-gradient(135deg, ${theme.primaryColor} 0%, ${theme.accentColor} 100%)`;
    }
    if (theme.ownBubbleTextColor) style.color = theme.ownBubbleTextColor;
    if (theme.primaryColor) {
      // Custom property consumed by the keyframes for the attention pulse.
      style['--launcher-pulse'] = theme.primaryColor;
    }
    return style;
  }, [displayMode, theme.ownBubbleColor, theme.ownBubbleTextColor, theme.primaryColor, theme.accentColor]);

  return (
    <>
      <div
        ref={containerRef}
        className={`demo-chat-container demo-chat-${displayMode}`}
      />
      {displayMode === 'floating' && (
        <>
          <button
            type="button"
            className={`demo-chat-launcher${floatingOpen ? ' demo-chat-launcher-open' : ''}`}
            onClick={toggleFloating}
            aria-label={floatingOpen ? 'Close chat' : 'Open chat'}
            style={launcherStyle}
          >
            {floatingOpen ? '×' : '💬'}
          </button>
          {!floatingOpen && (
            <div className="demo-chat-floating-hint">
              <strong>Floating mode</strong>
              <span>
                The widget mounts hidden in the corner. Click the bubble
                in the bottom-right to open it.
              </span>
            </div>
          )}
        </>
      )}
    </>
  );
}
