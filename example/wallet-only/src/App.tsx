import { useCallback, useEffect, useRef, useState } from 'react';
import type { DemoConfig, DisplayMode, EmbedLayout, EmbedTheme, PresetId } from './types';
import { DEFAULT_PRESET_ID, PRESETS, PRESET_BY_ID } from './presets';
import { Marketing } from './components/Marketing';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { ThemeEditor } from './components/ThemeEditor';
import { LayoutEditor } from './components/LayoutEditor';
import { DemoChat } from './components/DemoChat';
import { DisplayModeSelector } from './components/DisplayModeSelector';

/**
 * Keys that survive "Clear granular": the honest seeds + the non-colour
 * switches. Dropping everything else hands the whole palette back to the
 * derivation engine, so the Advanced fields fill with grayed derived values.
 */
const KEEP_ON_CLEAR: (keyof EmbedTheme)[] = [
  'mode',
  'gradients',
  'primaryColor',
  'backgroundColor',
  'accentColor',
  'incomingBubbleColor',
  'fontFamily',
  'fontSize',
];

/** Cap on the undo/redo stack so a long colour-picker drag can't blow up memory. */
const HISTORY_CAP = 80;

/**
 * Window during which consecutive theme updates collapse into a single history
 * entry — colour-picker drags fire onChange dozens of times per second.
 */
const HISTORY_DEBOUNCE_MS = 250;

export default function App() {
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<PresetId>(DEFAULT_PRESET_ID);
  /**
   * The working theme (a flat, theme-lab-style field model): a preset seeds it
   * with a full curated palette, and every field is then independently editable
   * or clearable. `effective === theme` — this IS what the iframe receives.
   */
  const [theme, setTheme] = useState<Partial<EmbedTheme>>(() => ({ ...PRESETS[0].theme }));
  const [history, setHistory] = useState<Partial<EmbedTheme>[]>([]);
  const [redoStack, setRedoStack] = useState<Partial<EmbedTheme>[]>([]);
  const [resetTrigger, setResetTrigger] = useState(0);
  /**
   * The full effective `--cherry-*` map the embed emits over the additive
   * `themeApplied` bridge event after every apply. The SDK bridge does NOT
   * forward it, so we read the raw `cherry:event` off the window ourselves
   * (scoped to the embed origin), exactly like the theme-lab. Drives the
   * Advanced "derived value" prefill + the read-only computed-vars dump.
   */
  const [derivedVars, setDerivedVars] = useState<Record<string, string> | null>(null);

  // Host-controllable embed chrome (EmbedLayout). Defaults match the embed's
  // all-shown baseline; pushed live via the SDK's setLayout bridge command.
  const [layout, setLayout] = useState<EmbedLayout>({
    showHeader: true,
    headerTitle: '',
    showMemberCount: true,
    showInput: true,
  });
  const handleLayoutChange = useCallback(
    <K extends keyof EmbedLayout>(field: K, value: EmbedLayout[K]) => {
      setLayout((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => {
    if (typeof window === 'undefined') return 'inline';
    return window.matchMedia('(max-width: 768px)').matches ? 'floating' : 'inline';
  });

  const [chatBelowHint, setChatBelowHint] = useState(false);
  const prevDisplayModeRef = useRef(displayMode);
  useEffect(() => {
    const prev = prevDisplayModeRef.current;
    prevDisplayModeRef.current = displayMode;
    if (prev === displayMode) return;
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 768px)').matches) return;
    if (prev !== 'floating' || displayMode === 'floating') return;

    const frame = document.querySelector('.chat-frame');
    if (frame) frame.scrollIntoView({ behavior: 'smooth', block: 'start' });

    setChatBelowHint(true);
    const t = setTimeout(() => setChatBelowHint(false), 2500);
    return () => clearTimeout(t);
  }, [displayMode]);

  const lastSnapshotRef = useRef<Partial<EmbedTheme>>(theme);

  // Fetch the public app config exactly once. Query overrides (`?appId=`,
  // `?roomId=`, `?embed=`) win over /config.json — handy for pointing the demo
  // at a local embed (http://localhost:3002) or a scratch room without editing
  // the shared .env.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}config.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as DemoConfig;

        const qp = new URLSearchParams(window.location.search);
        const merged: DemoConfig = {
          ...body,
          appId: qp.get('appId') || body.appId,
          roomId: qp.get('roomId') || body.roomId,
          embedUrl: qp.get('embed') || body.embedUrl,
        };
        if (!merged.appId) throw new Error('Missing appId in /config.json');
        setConfig(merged);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[demo] failed to load /config.json', err);
        setConfigError(msg);
      }
    })();
  }, []);

  // Read the engine's applied palette back off the bridge. Narrow + read-only:
  // only `themeApplied` from the embed origin is ingested; nothing is ever sent.
  useEffect(() => {
    if (!config) return;
    let embedOrigin: string;
    try {
      embedOrigin = new URL(config.embedUrl).origin;
    } catch {
      return;
    }
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== embedOrigin) return;
      const d = ev.data as
        | { type?: string; event?: string; data?: { vars?: Record<string, string> } }
        | undefined;
      if (!d || typeof d !== 'object') return;
      if (d.type !== 'cherry:event' || d.event !== 'themeApplied') return;
      const vars = d.data?.vars;
      if (vars && typeof vars === 'object') setDerivedVars(vars);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [config]);

  const preset = PRESET_BY_ID[selectedPreset] ?? PRESETS[0];
  const isDirty = !shallowEqual(theme, preset.theme);

  // A curated preset sets the full granular palette EXPLICITLY, so editing a
  // seed can't re-derive the pinned slots (explicit beats derivation) — the
  // Advanced rows legitimately stay put. When the user HAS changed a seed but
  // granular pins remain, prompt the existing Clear-granular affordance in
  // context (never auto-clear). `granularPinned` = there is something
  // Clear-granular would strip; `seedEdited` = a colour seed diverged from the
  // active preset.
  const SEED_COLOR_KEYS: (keyof EmbedTheme)[] = [
    'primaryColor',
    'backgroundColor',
    'accentColor',
    'incomingBubbleColor',
  ];
  const granularPinned = Object.keys(theme).some(
    (k) => !KEEP_ON_CLEAR.includes(k as keyof EmbedTheme),
  );
  const seedEdited = SEED_COLOR_KEYS.some((k) => theme[k] !== preset.theme[k]);
  const showPinnedHint = granularPinned && seedEdited;

  const applyPreset = useCallback((next: Partial<EmbedTheme>) => {
    setTheme(next);
    // A preset / reset is a clean slate: wipe undo history and force the iframe
    // to resetTheme before the next apply so no stale key lingers.
    setHistory([]);
    setRedoStack([]);
    lastSnapshotRef.current = next;
    setResetTrigger((n) => n + 1);
  }, []);

  const handleSelectPreset = useCallback(
    (id: PresetId) => {
      setSelectedPreset(id);
      applyPreset({ ...(PRESET_BY_ID[id] ?? PRESETS[0]).theme });
    },
    [applyPreset],
  );

  const handleResetToPreset = useCallback(() => {
    applyPreset({ ...preset.theme });
  }, [applyPreset, preset]);

  const handleClearGranular = useCallback(() => {
    setTheme((prev) => {
      const next: Partial<EmbedTheme> = {};
      for (const k of KEEP_ON_CLEAR) {
        if (prev[k] !== undefined) (next as Record<string, unknown>)[k] = prev[k];
      }
      return next;
    });
    setRedoStack([]);
  }, []);

  const handleFieldChange = useCallback(
    <K extends keyof EmbedTheme>(field: K, value: EmbedTheme[K] | undefined) => {
      setTheme((prev) => {
        const next = { ...prev };
        if (value === undefined || value === '') {
          delete next[field];
        } else {
          next[field] = value;
        }
        return next;
      });
      setRedoStack([]);
    },
    [],
  );

  // Debounced history snapshot: when `theme` settles, push the previous
  // settled snapshot so colour-picker drags collapse into one undo step.
  useEffect(() => {
    if (theme === lastSnapshotRef.current) return;
    const t = setTimeout(() => {
      setHistory((h) => {
        const prev = lastSnapshotRef.current;
        const last = h[h.length - 1];
        if (last && shallowEqual(last, prev)) {
          lastSnapshotRef.current = theme;
          return h;
        }
        const next = [...h, prev].slice(-HISTORY_CAP);
        lastSnapshotRef.current = theme;
        return next;
      });
    }, HISTORY_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [theme]);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setRedoStack((r) => [...r, lastSnapshotRef.current].slice(-HISTORY_CAP));
      lastSnapshotRef.current = prev;
      setTheme(prev);
      return h.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const next = r[r.length - 1];
      setHistory((h) => [...h, lastSnapshotRef.current].slice(-HISTORY_CAP));
      lastSnapshotRef.current = next;
      setTheme(next);
      return r.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      const target = (e.target as HTMLElement | null) ?? document.activeElement;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (target && (target as HTMLElement).isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      if ((k === 'z' && e.shiftKey) || k === 'y') redo();
      else if (k === 'z') undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return (
    <div className="page">
      <aside className="left-pane">
        <Marketing theme={theme} layout={layout} />
        <DisplayModeSelector selected={displayMode} onSelect={setDisplayMode} />
        <LayoutEditor layout={layout} onChange={handleLayoutChange} />
        <ThemeSwitcher selected={selectedPreset} onSelect={handleSelectPreset} />
        <ThemeEditor
          effective={theme}
          derivedVars={derivedVars}
          isDirty={isDirty}
          showPinnedHint={showPinnedHint}
          onFieldChange={handleFieldChange}
          onResetToPreset={handleResetToPreset}
          onClearGranular={handleClearGranular}
          canUndo={history.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={undo}
          onRedo={redo}
        />
      </aside>

      <main className="right-pane">
        <div className="chat-frame">
          {chatBelowHint && (
            <div className="chat-below-hint" role="status">
              Chat moved below ↓
            </div>
          )}
          {configError ? (
            <div className="chat-error">
              <h3>Could not load /config.json</h3>
              <p>{configError}</p>
              <p className="chat-error-hint">
                In dev: ensure <code>chat-embed-sdk/example/.env</code> sets <code>APP_ID</code>{' '}
                and <code>CHERRY_EMBED_URL</code>, then restart the Vite dev server.
              </p>
            </div>
          ) : config ? (
            <DemoChat
              config={config}
              theme={theme}
              resetTrigger={resetTrigger}
              displayMode={displayMode}
              layout={layout}
            />
          ) : (
            <div className="chat-loading">Loading config…</div>
          )}
        </div>
      </main>
    </div>
  );
}

function shallowEqual(a: Partial<EmbedTheme>, b: Partial<EmbedTheme>): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) {
      return false;
    }
  }
  return true;
}
