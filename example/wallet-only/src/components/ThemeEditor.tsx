import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EmbedTheme } from '../types';
import {
  GRANULAR_GROUPS,
  PARAM_TO_VAR,
  SAFE_FONTS,
  SEED_FIELDS,
  SEED_KEYS,
  isSafeCssColor,
  toHexForPicker,
} from '../themeMeta';

interface ThemeEditorProps {
  /** The working theme — a flat field model; this is what the iframe receives. */
  effective: Partial<EmbedTheme>;
  /** Full effective `--cherry-*` map read back from the `themeApplied` event. */
  derivedVars: Record<string, string> | null;
  /** True when the theme differs from the active preset (enables Reset). */
  isDirty: boolean;
  /** True when a seed was edited but the preset still pins granular slots. */
  showPinnedHint: boolean;
  onFieldChange: <K extends keyof EmbedTheme>(field: K, value: EmbedTheme[K] | undefined) => void;
  onResetToPreset: () => void;
  onClearGranular: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/* ── ℹ click-tooltip (holds long explainers off the page) ──────────────── */
function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <span className="info-wrap" ref={wrapRef}>
      <button
        type="button"
        className="info-tip"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        i
      </button>
      <span className="info-pop" hidden={!open} role="tooltip">
        {children}
      </span>
    </span>
  );
}

/* ── Segmented control ─────────────────────────────────────────────────── */
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { v: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
}) {
  return (
    <span className="segmented">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          className={value === o.v ? 'on' : undefined}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/* ── One colour row (seed or granular) ─────────────────────────────────── */
interface ColorRowProps {
  fieldKey: string;
  label: string;
  hint?: string;
  /** Explicit value on the theme object (sent to the iframe). */
  value: string | undefined;
  /** Engine-derived value read back from themeApplied (shown grayed when no explicit value). */
  derivedVal: string | undefined;
  isSeed?: boolean;
  onChange: (field: string, value: string | undefined) => void;
}
function ColorRow({ fieldKey, label, hint, value, derivedVal, isSeed, onChange }: ColorRowProps) {
  const hasValue = value !== undefined && value !== '';
  const isDerived = !hasValue && !!derivedVal;

  const display = hasValue ? value! : isDerived ? derivedVal! : '';
  const invalid = hasValue && !isSafeCssColor(value!);
  const hex = toHexForPicker(display) ?? '#808080';

  const textClass = `${!isSeed && isDerived ? ' derived' : ''}${invalid ? ' invalid' : ''}`.trim();

  return (
    <div className="row">
      <span className="pname">
        <span className="pname-label" title={hint}>
          {label}
        </span>
        <code className="pname-key" title={`chat.setTheme({ ${fieldKey}: '…' })`}>
          {fieldKey}
        </code>
      </span>
      <input
        type="text"
        className={textClass || undefined}
        value={display}
        placeholder={isSeed ? 'default' : '(derived)'}
        spellCheck={false}
        aria-label={`${label} value`}
        onChange={(e) => onChange(fieldKey, e.target.value.trim() || undefined)}
      />
      <input
        type="color"
        value={hex}
        aria-label={`${label} colour picker`}
        onChange={(e) => onChange(fieldKey, e.target.value)}
      />
      {hasValue ? (
        <button
          type="button"
          className="reset-btn"
          title="Clear — hand this value back to the engine (⟲ to derived)"
          aria-label={`Clear ${label}`}
          onClick={() => onChange(fieldKey, undefined)}
        >
          ⟲
        </button>
      ) : (
        <span className="reset-spacer" aria-hidden="true" />
      )}
    </div>
  );
}

export function ThemeEditor({
  effective,
  derivedVars,
  isDirty,
  showPinnedHint,
  onFieldChange,
  onResetToPreset,
  onClearGranular,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ThemeEditorProps) {
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';

  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    const json = JSON.stringify(effective, null, 2);
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(json).then(done, done);
    else done();
  }, [effective]);

  const change = useCallback(
    (field: string, value: string | undefined) =>
      onFieldChange(field as keyof EmbedTheme, value as EmbedTheme[keyof EmbedTheme] | undefined),
    [onFieldChange],
  );

  const rowFor = (fieldKey: string, label: string, hint?: string, isSeed?: boolean) => {
    const varName = PARAM_TO_VAR[fieldKey as keyof typeof PARAM_TO_VAR];
    return (
      <ColorRow
        key={fieldKey}
        fieldKey={fieldKey}
        label={label}
        hint={hint}
        isSeed={isSeed}
        value={effective[fieldKey as keyof EmbedTheme] as string | undefined}
        derivedVal={varName && derivedVars ? derivedVars[varName] : undefined}
        onChange={change}
      />
    );
  };

  // ── Live payload summary + engine badge ──────────────────────────────
  const { engineOn, seedChips, totalKeys } = useMemo(() => {
    const keys = (Object.keys(effective) as (keyof EmbedTheme)[]).filter((k) => {
      const v = effective[k];
      return v !== undefined && v !== '';
    });
    const seedLabels: Record<string, string> = {
      primaryColor: 'primary',
      backgroundColor: 'bg',
      accentColor: 'accent',
    };
    const present = SEED_KEYS.filter((k) => {
      const v = effective[k];
      return typeof v === 'string' && isSafeCssColor(v);
    });
    return {
      engineOn: present.length > 0,
      seedChips: present.map((k) => seedLabels[k]),
      totalKeys: keys.length,
    };
  }, [effective]);

  const computedRows = useMemo(() => {
    if (!derivedVars) return [];
    return Object.keys(derivedVars)
      .sort()
      .map((name) => ({ name, value: derivedVars[name] }));
  }, [derivedVars]);

  return (
    <section className="card editor">
      <div className="section-header">
        <div className="sh-title">
          <h2>Theme</h2>
          <InfoTip label="How theming works">
            Pass a few honest brand colours as <b>seeds</b> and the engine derives the whole
            palette (surfaces, chrome, both bubbles, links, reactions) with contrast guarantees.
            Any seed engages the engine. <b>Advanced</b> reads every derived value back from the
            live <code>themeApplied</code> event — edit one to promote it to an explicit override,
            or ⟲ to hand it back to the engine.
          </InfoTip>
        </div>
        <p>Seeds drive the palette. Every derived value is customisable below.</p>
      </div>

      {/* ── Basic: the 2-4 seeds (primary editing surface) ──────────────── */}
      <div className="sg-title">Basic — seeds</div>
      <div className="row">
        <span className="pname">
          <span className="pname-label">Mode</span>
          <code className="pname-key">mode</code>
        </span>
        <span style={{ gridColumn: '2 / span 3', justifySelf: 'end' }}>
          <Segmented
            options={
              [
                { v: 'dark', label: 'dark' },
                { v: 'light', label: 'light' },
              ] as const
            }
            value={effective.mode}
            onChange={(v) => onFieldChange('mode', v)}
          />
        </span>
      </div>
      <div className="row">
        <span className="pname">
          <span className="pname-label">Gradients</span>
          <code className="pname-key">gradients</code>
        </span>
        <span style={{ gridColumn: '2 / span 3', justifySelf: 'end' }}>
          <Segmented
            options={
              [
                { v: 'off', label: 'flat' },
                { v: 'on', label: 'gradient' },
              ] as const
            }
            value={effective.gradients ?? 'off'}
            onChange={(v) => onFieldChange('gradients', v)}
          />
        </span>
      </div>
      {SEED_FIELDS.map((s) => rowFor(s.k, s.label, s.hint, true))}

      {/* Preset pins the granular palette → editing a seed can't re-derive the
       * pinned slots. Surface Clear granular in context (never auto-clear). */}
      {showPinnedHint && (
        <div className="seed-pinned-hint" role="note">
          <span>
            This preset pins the full palette, so the engine can’t re-derive the slots below from
            your seeds.
          </span>
          <button type="button" className="btn btn-sm" onClick={onClearGranular}>
            Clear granular
          </button>
        </div>
      )}

      {/* ── Live payload summary ────────────────────────────────────────── */}
      <div className="payload-chip">
        <span className={`engine-badge ${engineOn ? 'on' : 'off'}`}>
          {engineOn ? `engine: ON (${seedChips.join('+')})` : 'engine: OFF'}
        </span>
        <span className="pc-label">sending</span>
        <span className="pc-keys">
          {seedChips.map((c) => (
            <span key={c} className="pchip seed">
              {c}
            </span>
          ))}
          <span className="pchip">{totalKeys} keys</span>
        </span>
      </div>

      <div className="editor-toolbar">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={copy}
          aria-label="Copy the current theme object as JSON"
        >
          {copied ? 'Copied ✓' : 'Copy theme'}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={onClearGranular}
          title="Drop every granular colour, keep the seeds — the engine re-derives the palette"
        >
          Clear granular
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={onResetToPreset}
          disabled={!isDirty}
        >
          Reset to preset
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={onUndo}
          disabled={!canUndo}
          title={`Undo (${mod}+Z)`}
          aria-label="Undo"
        >
          ↶
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={onRedo}
          disabled={!canRedo}
          title={`Redo (${mod}+Shift+Z)`}
          aria-label="Redo"
        >
          ↷
        </button>
      </div>

      {/* ── Typography ──────────────────────────────────────────────────── */}
      <div className="sg-title">Typography</div>
      <div className="row">
        <span className="pname">
          <span className="pname-label">Font family</span>
          <code className="pname-key">fontFamily</code>
        </span>
        <span style={{ gridColumn: '2 / span 3', justifySelf: 'end' }}>
          <select
            value={effective.fontFamily ?? ''}
            onChange={(e) => onFieldChange('fontFamily', e.target.value || undefined)}
            aria-label="Font family"
          >
            <option value="">default (Inter)</option>
            {SAFE_FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </span>
      </div>
      <div className="row">
        <span className="pname">
          <span className="pname-label">Font size</span>
          <code className="pname-key">fontSize</code>
        </span>
        <span style={{ gridColumn: '2 / span 3', justifySelf: 'end' }}>
          <Segmented
            options={
              [
                { v: 'sm', label: 'sm' },
                { v: 'md', label: 'md' },
                { v: 'lg', label: 'lg' },
              ] as const
            }
            value={effective.fontSize}
            onChange={(v) => onFieldChange('fontSize', v)}
          />
        </span>
      </div>

      {/* ── Advanced: derived palette, promote any value to explicit ────── */}
      <details className="editor-group">
        <summary>
          Advanced — derived palette
          <span className="summary-hint">grayed = engine-derived (not sent); edit to override</span>
        </summary>
        <div className="editor-group-body">
          {GRANULAR_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="sg-title">{g.title}</div>
              {g.params.map((p) => rowFor(p.k, p.label, p.hint))}
            </div>
          ))}
        </div>
      </details>

      {/* ── All computed vars (read-only) ───────────────────────────────── */}
      <details className="editor-group">
        <summary>
          Computed vars
          <span className="summary-hint">read-only — the embed's full effective --cherry-* map</span>
        </summary>
        <div className="editor-group-body">
          {computedRows.length === 0 ? (
            <p className="cv-empty">
              Waiting for the chat to mount — the engine hands the full applied palette back over
              the <code>themeApplied</code> event.
            </p>
          ) : (
            <div className="cv-list">
              {computedRows.map((r) => {
                const swatch = toHexForPicker(r.value);
                return (
                  <div className="cv-row" key={r.name}>
                    <span
                      className="cv-swatch"
                      style={{ background: swatch ? r.value : 'transparent' }}
                    />
                    <span className="cv-name">{r.name}</span>
                    <span className="cv-val">{r.value}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
