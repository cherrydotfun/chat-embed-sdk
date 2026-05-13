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
 * `displayMode` selects one of four mount strategies:
 *   - inline:      iframe fills the container.
 *   - floating:    SDK floats the iframe in the viewport corner; we render
 *                  a launcher button that calls `chat.toggle()`.
 *   - collapsible: inline mount that the host hides/shows in place. A small
 *                  bubble in the corner of the chat-frame toggles
 *                  visibility — same iframe, different chrome.
 *   - resizable:   inline mount inside a container with `resize: both`,
 *                  with a draggable handle on top so the panel can be
 *                  repositioned within the chat-frame.
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
  // Collapsible mode starts closed so visitors land on the bubble-only
  // state — that's the "feature" the mode is showing off; the iframe is
  // mounted under the hood and revealed on click.
  const [collapsibleOpen, setCollapsibleOpen] = useState(false);
  /**
   * Translation offset for resizable mode. The drag handle on top of the
   * panel updates this; the wrapper applies it via `transform: translate`
   * so flex layout under it stays untouched. Reset on every mode switch.
   */
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStateRef = useRef<{
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // Mount / unmount whenever the SDK's mount-time config changes.
  // displayMode flips `position` + `collapsed` so it joins the deps.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    setFloatingOpen(false);
    setCollapsibleOpen(false);
    setDragOffset({ x: 0, y: 0 });

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

  const toggleCollapsible = useCallback(() => {
    setCollapsibleOpen((o) => !o);
  }, []);

  // Drag handlers for the resizable-mode handle. Pointer events + capture
  // so we still get move/up after the cursor leaves the handle bounds.
  const onDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStateRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        offsetX: dragOffset.x,
        offsetY: dragOffset.y,
      };
    },
    [dragOffset],
  );
  const onDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStateRef.current;
    if (!start) return;
    setDragOffset({
      x: start.offsetX + (e.clientX - start.pointerX),
      y: start.offsetY + (e.clientY - start.pointerY),
    });
  }, []);
  const onDragEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragStateRef.current = null;
  }, []);

  /**
   * Theme-driven launcher style — used by both the floating launcher and
   * the collapsible bubble so they always belong to the active palette.
   * Priority:
   *   1. an explicit own-bubble fill (solid colour the user picked),
   *   2. the primary→accent gradient the bubbles use by default,
   *   3. fallback to Cherry's pink→purple gradient (CSS default).
   * The closed-state pulse uses the primary as its halo colour so the
   * ring picks up the same hue.
   */
  const launcherStyle = useMemo<React.CSSProperties>(() => {
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
  }, [theme.ownBubbleColor, theme.ownBubbleTextColor, theme.primaryColor, theme.accentColor]);

  const containerClassName = useMemo(() => {
    const parts = ['demo-chat-container', `demo-chat-${displayMode}`];
    if (displayMode === 'collapsible') {
      parts.push(
        collapsibleOpen
          ? 'demo-chat-collapsible-open'
          : 'demo-chat-collapsible-closed',
      );
    }
    return parts.join(' ');
  }, [displayMode, collapsibleOpen]);

  const containerEl = (
    <div ref={containerRef} className={containerClassName} />
  );

  return (
    <>
      {/* Collapsible tab renders FIRST so it's the left flex sibling of
       * the iframe container — that way it never overlays the chat
       * surface, regardless of open/closed state. */}
      {displayMode === 'collapsible' && (
        <button
          type="button"
          className={`demo-chat-collapsible-tab${collapsibleOpen ? ' demo-chat-collapsible-tab-open' : ''}`}
          onClick={toggleCollapsible}
          aria-label={collapsibleOpen ? 'Collapse chat' : 'Expand chat'}
          title={collapsibleOpen ? 'Collapse chat' : 'Expand chat'}
          style={collapsibleOpen ? undefined : launcherStyle}
        >
          <span className="demo-chat-collapsible-tab-icon" aria-hidden="true">
            {collapsibleOpen ? (
              /* chevron-left for the open state — collapse direction */
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 4 L6 8 L10 12" />
              </svg>
            ) : (
              /* chat-bubble icon — the closed-state affordance */
              <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 5 a2 2 0 0 1 2-2 h10 a2 2 0 0 1 2 2 v7 a2 2 0 0 1 -2 2 h-5 l-3 3 v-3 h-2 a2 2 0 0 1 -2 -2 z" />
              </svg>
            )}
          </span>
          {!collapsibleOpen && (
            <span className="demo-chat-collapsible-tab-chevron" aria-hidden="true">
              {/* Chevron-right under the bubble icon — points in the
               * direction the chat will slide on click. */}
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4 L10 8 L6 12" />
              </svg>
            </span>
          )}
        </button>
      )}

      {displayMode === 'resizable' ? (
        // <section> (not <div>) is deliberate: React's reconciler reuses
        // DOM nodes across same-tag conditional branches, and the inline
        // `width`/`height` written by the browser's `resize: both` corner
        // grip would otherwise leak onto the next mode's container —
        // squashing inline mode to whatever size the user dragged here.
        // Different tag → guaranteed unmount on mode switch.
        <section
          className="demo-chat-stage demo-chat-stage-resizable"
          style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
        >
          <div
            className="demo-chat-drag-handle"
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            role="button"
            aria-label="Drag to reposition the chat panel"
            title="Drag to reposition"
          >
            <span className="demo-chat-drag-grip" aria-hidden="true">
              <span />
              <span />
            </span>
            <span className="demo-chat-drag-label">Drag</span>
          </div>
          {containerEl}
        </section>
      ) : (
        containerEl
      )}

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

      {displayMode === 'collapsible' && !collapsibleOpen && (
        <div className="demo-chat-collapsible-hint">
          <strong>Collapsible mode</strong>
          <span>
            The widget is mounted in place. Click the tab on the left
            to slide the chat in.
          </span>
        </div>
      )}
    </>
  );
}
