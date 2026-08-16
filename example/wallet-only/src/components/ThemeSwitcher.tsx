import type { PresetId } from '../types';
import { PRESETS } from '../presets';

interface ThemeSwitcherProps {
  selected: PresetId;
  onSelect: (id: PresetId) => void;
}

export function ThemeSwitcher({ selected, onSelect }: ThemeSwitcherProps) {
  return (
    <section className="card switcher">
      <div className="section-header">
        <div className="sh-title">
          <h2>Presets</h2>
        </div>
        <p>Curated starting palettes. One click applies the whole theme.</p>
      </div>
      <div className="switcher-grid">
        {PRESETS.map((preset) => {
          const isActive = preset.id === selected;
          return (
            <button
              key={preset.id}
              type="button"
              className={`preset-card${isActive ? ' preset-card-active' : ''}`}
              onClick={() => onSelect(preset.id)}
              aria-pressed={isActive}
            >
              <div
                className="preset-swatches"
                aria-hidden="true"
                style={{
                  background: `linear-gradient(135deg, ${preset.swatches[0]} 0%, ${preset.swatches[1]} 100%)`,
                }}
              />
              <div className="preset-label">{preset.label}</div>
              <div className="preset-blurb">{preset.blurb}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
