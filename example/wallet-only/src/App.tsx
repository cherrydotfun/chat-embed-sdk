import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DemoConfig, DisplayMode, EmbedTheme, PresetId } from './types';
import { DEFAULT_PRESET_ID, PRESETS, PRESET_BY_ID } from './presets';
import { Marketing } from './components/Marketing';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { ThemeEditor } from './components/ThemeEditor';
import { DemoChat } from './components/DemoChat';
import { DisplayModeSelector } from './components/DisplayModeSelector';

/**
 * Merge preset + per-field overrides. Undefined values in `overrides`
 * fall through to the preset; explicit values win.
 */
function mergeTheme(
  base: EmbedTheme,
  overrides: Partial<EmbedTheme>,
): EmbedTheme {
  const out: EmbedTheme = { ...base };
  for (const k of Object.keys(overrides) as (keyof EmbedTheme)[]) {
    const v = overrides[k];
    if (v === undefined) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Cap on the undo/redo stack so a long colour-picker drag can't blow up memory. */
const HISTORY_CAP = 80;

/**
 * Window during which consecutive overrides updates collapse into a
 * single history entry — colour-picker drags fire onChange dozens of
 * times per second; without this each tick would consume one undo slot.
 */
const HISTORY_DEBOUNCE_MS = 250;

export default function App() {
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<PresetId>(DEFAULT_PRESET_ID);
  const [overrides, setOverrides] = useState<Partial<EmbedTheme>>({});
  const [history, setHistory] = useState<Partial<EmbedTheme>[]>([]);
  const [redoStack, setRedoStack] = useState<Partial<EmbedTheme>[]>([]);
  // Bumps every time we want the iframe to clear its theme state before
  // applying the next setTheme — preset switches and the Reset button
  // both bump it. Per-field edits do not.
  const [resetTrigger, setResetTrigger] = useState(0);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('inline');

  /**
   * Tracks the last overrides snapshot we considered "settled" — once a
   * debounce window passes without further edits we push it onto the
   * history stack. Used by the snapshot effect AND by undo/redo to
   * suppress self-fire (see them sets this ref before mutating overrides).
   */
  const lastSnapshotRef = useRef<Partial<EmbedTheme>>({});

  // Fetch the public app config exactly once. The endpoint comes from the
  // dev middleware in vite.config.ts; in production server.js exposes the
  // same shape from the shared root .env.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/config.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as DemoConfig;
        if (!body.appId) throw new Error('Missing appId in /config.json');
        setConfig(body);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[demo] failed to load /config.json', err);
        setConfigError(msg);
      }
    })();
  }, []);

  const preset = PRESET_BY_ID[selectedPreset] ?? PRESETS[0];
  const effective = useMemo(
    () => mergeTheme(preset.theme, overrides),
    [preset, overrides],
  );
  const hasOverrides = Object.keys(overrides).length > 0;

  const handleSelectPreset = useCallback((id: PresetId) => {
    setSelectedPreset(id);
    setOverrides({});
    // Reset undo state — preset switches are a clean slate, mid-flight
    // undo across palettes would land users on inconsistent colours.
    setHistory([]);
    setRedoStack([]);
    lastSnapshotRef.current = {};
    setResetTrigger((n) => n + 1);
  }, []);

  const handleFieldChange = useCallback(
    <K extends keyof EmbedTheme>(field: K, value: EmbedTheme[K] | undefined) => {
      setOverrides((prev) => {
        const next = { ...prev };
        if (value === undefined || value === '') {
          delete next[field];
        } else {
          next[field] = value;
        }
        return next;
      });
      // Any user-driven edit invalidates the redo stack — once the user
      // diverges, the previously-undone path is gone.
      setRedoStack([]);
    },
    [],
  );

  const handleResetOverrides = useCallback(() => {
    setOverrides({});
    setHistory([]);
    setRedoStack([]);
    lastSnapshotRef.current = {};
    setResetTrigger((n) => n + 1);
  }, []);

  // Debounced history snapshot: when overrides settles for HISTORY_DEBOUNCE_MS
  // without further changes, push the previously-settled snapshot onto
  // the history stack. This way colour-picker drags collapse into a
  // single undo step instead of dozens.
  useEffect(() => {
    if (overrides === lastSnapshotRef.current) return;
    const t = setTimeout(() => {
      setHistory((h) => {
        const prev = lastSnapshotRef.current;
        // Skip duplicate entries.
        const last = h[h.length - 1];
        if (last && shallowEqual(last, prev)) {
          lastSnapshotRef.current = overrides;
          return h;
        }
        const next = [...h, prev].slice(-HISTORY_CAP);
        lastSnapshotRef.current = overrides;
        return next;
      });
    }, HISTORY_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [overrides]);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setRedoStack((r) => [...r, lastSnapshotRef.current].slice(-HISTORY_CAP));
      lastSnapshotRef.current = prev;
      setOverrides(prev);
      return h.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const next = r[r.length - 1];
      setHistory((h) => [...h, lastSnapshotRef.current].slice(-HISTORY_CAP));
      lastSnapshotRef.current = next;
      setOverrides(next);
      return r.slice(0, -1);
    });
  }, []);

  // Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z OR Cmd/Ctrl+Y (redo).
  // Skip when the user is typing in an input/textarea so the browser's
  // own per-input undo keeps working.
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
        <Marketing />
        <DisplayModeSelector selected={displayMode} onSelect={setDisplayMode} />
        <ThemeSwitcher selected={selectedPreset} onSelect={handleSelectPreset} />
        <ThemeEditor
          effective={effective}
          hasOverrides={hasOverrides}
          onFieldChange={handleFieldChange}
          onResetOverrides={handleResetOverrides}
          canUndo={history.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={undo}
          onRedo={redo}
        />
      </aside>

      <main className="right-pane">
        <div className="chat-frame">
          {configError ? (
            <div className="chat-error">
              <h3>Could not load /config.json</h3>
              <p>{configError}</p>
              <p className="chat-error-hint">
                In dev: ensure <code>chat-embed-sdk/example/.env</code> sets{' '}
                <code>APP_ID</code> and <code>CHERRY_EMBED_URL</code>, then
                restart the Vite dev server.
              </p>
            </div>
          ) : config ? (
            <DemoChat
              config={config}
              theme={effective}
              resetTrigger={resetTrigger}
              displayMode={displayMode}
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
