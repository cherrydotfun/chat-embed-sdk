import type { DisplayMode, DisplayModeOption } from '../types';

const MODES: DisplayModeOption[] = [
  {
    id: 'inline',
    label: 'Inline',
    blurb: 'Fills its container — drop into any layout.',
  },
  {
    id: 'floating',
    label: 'Floating bubble',
    blurb: 'Launcher in the corner, click to open / close.',
  },
  {
    id: 'resizable',
    label: 'Resizable',
    blurb: 'Inline + drag the bottom-right corner to size.',
  },
];

interface DisplayModeSelectorProps {
  selected: DisplayMode;
  onSelect: (id: DisplayMode) => void;
}

/**
 * Three concrete mount strategies for the chat iframe. Switching reuses
 * the same SDK config surface (`position`, `collapsed`, `chat.toggle()`)
 * so people can see the off-the-shelf options without reading the docs.
 */
export function DisplayModeSelector({ selected, onSelect }: DisplayModeSelectorProps) {
  return (
    <section className="switcher">
      <div className="section-header">
        <h2>Display mode</h2>
        <p>How the widget mounts on the host page.</p>
      </div>
      <div className="switcher-grid">
        {MODES.map((mode) => {
          const isActive = mode.id === selected;
          return (
            <button
              key={mode.id}
              type="button"
              className={`preset-card${isActive ? ' preset-card-active' : ''}`}
              onClick={() => onSelect(mode.id)}
              aria-pressed={isActive}
            >
              <div className={`mode-glyph mode-glyph-${mode.id}`} aria-hidden="true">
                <ModeIcon mode={mode.id} />
              </div>
              <div className="preset-label">{mode.label}</div>
              <div className="preset-blurb">{mode.blurb}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ModeIcon({ mode }: { mode: DisplayMode }) {
  if (mode === 'inline') {
    return (
      <svg width="32" height="20" viewBox="0 0 32 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="1" y="1" width="30" height="18" rx="2" />
      </svg>
    );
  }
  if (mode === 'floating') {
    return (
      <svg width="32" height="20" viewBox="0 0 32 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="1" y="1" width="30" height="18" rx="2" opacity="0.35" />
        <circle cx="25" cy="14" r="4" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  // resizable
  return (
    <svg width="32" height="20" viewBox="0 0 32 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="1" y="1" width="30" height="18" rx="2" />
      <path d="M22 18 L30 18 L30 10" strokeLinecap="round" />
    </svg>
  );
}
