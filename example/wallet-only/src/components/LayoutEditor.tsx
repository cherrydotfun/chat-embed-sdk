import type { EmbedLayout } from '../types';

interface LayoutEditorProps {
  layout: EmbedLayout;
  onChange: <K extends keyof EmbedLayout>(field: K, value: EmbedLayout[K]) => void;
}

/** Two-button show/hide segmented control. */
function ShowHide({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className="segmented">
      <button type="button" className={on ? 'on' : undefined} onClick={() => onChange(true)}>
        show
      </button>
      <button type="button" className={!on ? 'on' : undefined} onClick={() => onChange(false)}>
        hide
      </button>
    </span>
  );
}

/**
 * Host-controllable embed chrome. Wired live through the SDK's `setLayout`
 * bridge command (a runtime merge on the iframe side — no remount). Only the
 * fields the embed's sanitizer honours are exposed; deprecated toggles are not.
 */
export function LayoutEditor({ layout, onChange }: LayoutEditorProps) {
  const showHeader = layout.showHeader !== false;
  const showMemberCount = layout.showMemberCount !== false;
  const showInput = layout.showInput !== false;

  return (
    <section className="card">
      <div className="section-header">
        <div className="sh-title">
          <h2>Layout</h2>
        </div>
        <p>Toggle the embed chrome. Applied live via setLayout.</p>
      </div>

      <div className="row">
        <span className="pname">
          <span className="pname-label">Header title</span>
          <code className="pname-key">headerTitle</code>
        </span>
        <span style={{ gridColumn: '2 / span 3', justifySelf: 'stretch' }}>
          <input
            type="text"
            className="layout-title-input"
            value={layout.headerTitle ?? ''}
            placeholder={showHeader ? '(room default)' : 'header hidden'}
            spellCheck={false}
            maxLength={120}
            aria-label="Header title"
            disabled={!showHeader}
            onChange={(e) => onChange('headerTitle', e.target.value)}
          />
        </span>
      </div>

      <div className="row">
        <span className="pname">
          <span className="pname-label">Show header</span>
          <code className="pname-key">showHeader</code>
        </span>
        <span style={{ gridColumn: '2 / span 3', justifySelf: 'end' }}>
          <ShowHide on={showHeader} onChange={(v) => onChange('showHeader', v)} />
        </span>
      </div>

      <div className="row">
        <span className="pname">
          <span className="pname-label">Show member count</span>
          <code className="pname-key">showMemberCount</code>
        </span>
        <span style={{ gridColumn: '2 / span 3', justifySelf: 'end' }}>
          <ShowHide on={showMemberCount} onChange={(v) => onChange('showMemberCount', v)} />
        </span>
      </div>

      <div className="row">
        <span className="pname">
          <span className="pname-label">Show message input</span>
          <code className="pname-key">showInput</code>
        </span>
        <span style={{ gridColumn: '2 / span 3', justifySelf: 'end' }}>
          <ShowHide on={showInput} onChange={(v) => onChange('showInput', v)} />
        </span>
      </div>
    </section>
  );
}
