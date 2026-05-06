import { useCallback, useEffect, useMemo, useState } from 'react';
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

export default function App() {
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<PresetId>(DEFAULT_PRESET_ID);
  const [overrides, setOverrides] = useState<Partial<EmbedTheme>>({});
  // Bumps every time we want the iframe to clear its theme state before
  // applying the next setTheme — preset switches and the Reset button
  // both bump it. Per-field edits do not.
  const [resetTrigger, setResetTrigger] = useState(0);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('inline');

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
    },
    [],
  );

  const handleResetOverrides = useCallback(() => {
    setOverrides({});
    setResetTrigger((n) => n + 1);
  }, []);

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
