import type { EmbedTheme } from '../types';

interface ThemeEditorProps {
  /** Effective theme: preset merged with current overrides — drives the field values shown. */
  effective: EmbedTheme;
  /** True iff the user has any overrides on top of the active preset. */
  hasOverrides: boolean;
  onFieldChange: <K extends keyof EmbedTheme>(field: K, value: EmbedTheme[K] | undefined) => void;
  onResetOverrides: () => void;
}

/**
 * Expand `#abc` to `#aabbcc` so a hex shorthand still drives the color
 * picker (which only accepts long-form hex). Returns the input untouched
 * if it isn't shorthand.
 */
function expandHex(value: string): string {
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    return (
      '#' +
      value
        .slice(1)
        .split('')
        .map((c) => c + c)
        .join('')
    );
  }
  return value;
}

/**
 * Best-effort parse of an arbitrary CSS colour into a six-char hex so the
 * native colour picker has something to show. Returns null if we can't
 * project the value into the picker (rgba with alpha, hsl, named colour),
 * in which case the caller renders a neutral swatch and lets the user
 * keep editing the text input.
 */
function toHexForPicker(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) return expandHex(trimmed);
  if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) return trimmed.slice(0, 7);
  const m = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const r = Math.min(255, +m[1]);
    const g = Math.min(255, +m[2]);
    const b = Math.min(255, +m[3]);
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
  return null;
}

/**
 * Generic-free colour row. The `field` is just a string — the parent's
 * `onChange` already handles every theme key, so narrowing here would only
 * fight the union type of EmbedTheme (which mixes string and boolean).
 */
interface ColorFieldProps {
  label: string;
  field: string;
  value: string | undefined;
  onChange: (field: string, value: string | undefined) => void;
  /** Hint shown under the label. */
  hint?: string;
}

function ColorField({
  label,
  field,
  value,
  onChange,
  hint,
}: ColorFieldProps) {
  const hex = toHexForPicker(value) ?? '#000000';
  return (
    <label className="field">
      <span className="field-label">
        <span className="field-label-row">
          {label}
          <code className="field-key" title={`chat.setTheme({ ${field}: '...' })`}>
            {field}
          </code>
        </span>
        {hint ? <span className="field-hint">{hint}</span> : null}
      </span>
      <span className="field-control">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(field, e.target.value)}
          aria-label={`${label} colour picker`}
        />
        <input
          type="text"
          className="field-text"
          value={value ?? ''}
          placeholder="default"
          onChange={(e) => {
            const next = e.target.value.trim();
            onChange(field, next || undefined);
          }}
          aria-label={`${label} value`}
          spellCheck={false}
        />
      </span>
    </label>
  );
}

const FONTS = [
  'Outfit',
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Poppins',
  'Nunito',
  'Source Sans Pro',
  'Montserrat',
  'system-ui',
  'sans-serif',
  'monospace',
];

export function ThemeEditor({
  effective,
  hasOverrides,
  onFieldChange,
  onResetOverrides,
}: ThemeEditorProps) {
  // Helper so the callsites below stay readable. Casts `field` back to
  // keyof EmbedTheme inside the onChange so the parent handler stays
  // strongly typed — only the field/value pair flowing through ColorField
  // is loose, and the surrounding sanitiser in the iframe still rejects
  // any unknown key on its way to the DOM.
  const c = (
    label: string,
    field: keyof EmbedTheme,
    hint?: string,
  ) => (
    <ColorField
      label={label}
      field={field}
      value={effective[field] as string | undefined}
      onChange={(f, v) =>
        onFieldChange(f as keyof EmbedTheme, v as EmbedTheme[keyof EmbedTheme] | undefined)
      }
      hint={hint}
    />
  );

  return (
    <section className="editor">
      <div className="section-header">
        <h2>Customise</h2>
        <p>
          Each field below is a key on the <code>EmbedTheme</code> object you
          pass to <code>chat.setTheme(...)</code>. Hover the small monospace
          tag next to a label to see the exact key &amp; usage.
        </p>
        <pre className="editor-snippet">
          <code>{`chat.setTheme({
  primaryColor: '#fb7185',
  ownBubbleColor: '#fb7185',
  ownBubbleTextColor: '#7c2d12',
  // …any other key shown below
})`}</code>
        </pre>
        <button
          type="button"
          className="reset-button"
          onClick={onResetOverrides}
          disabled={!hasOverrides}
        >
          Reset to preset
        </button>
      </div>

      <details className="editor-group" open>
        <summary>Foundation</summary>
        <div className="editor-fields">
          <label className="field">
            <span className="field-label">Mode</span>
            <span className="field-control field-control-segmented">
              {(['dark', 'light'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`segmented${effective.mode === m ? ' segmented-active' : ''}`}
                  onClick={() => onFieldChange('mode', m)}
                >
                  {m}
                </button>
              ))}
            </span>
          </label>
          {c('Primary', 'primaryColor', 'Drives gradients & accents')}
          {c('Accent', 'accentColor', 'Secondary brand hue')}
        </div>
      </details>

      <details className="editor-group" open>
        <summary>Background &amp; Text</summary>
        <div className="editor-fields">
          {c('Page background', 'backgroundColor')}
          {c('Surface', 'surfaceColor', 'Header & input default')}
          {c('Border', 'borderColor')}
          {c('Text', 'textColor')}
          {c('Text secondary', 'textSecondaryColor')}
          {c('Link', 'linkColor')}
          {c('Mention', 'mentionColor')}
        </div>
      </details>

      <details className="editor-group" open>
        <summary>Header</summary>
        <div className="editor-fields">
          {c('Header background', 'headerColor')}
          {c('Header text', 'headerTextColor')}
        </div>
      </details>

      <details className="editor-group">
        <summary>Bubbles</summary>
        <div className="editor-fields">
          {c('Incoming bubble', 'incomingBubbleColor')}
          {c('Incoming bubble border', 'incomingBubbleBorderColor')}
          {c('Own bubble', 'ownBubbleColor', 'Solid colour overrides the gradient')}
          {c('Own bubble text', 'ownBubbleTextColor')}
        </div>
      </details>

      <details className="editor-group">
        <summary>Input &amp; Send</summary>
        <div className="editor-fields">
          {c('Input background', 'inputColor')}
          {c('Input text', 'inputTextColor')}
          {c('Send button', 'sendButtonColor', 'Solid colour overrides the gradient')}
          {c('Icon button', 'iconButtonColor', 'Emoji / GIF / attach icons')}
          {c('Icon button hover', 'iconButtonHoverColor')}
        </div>
      </details>

      <details className="editor-group" open>
        <summary>Embeds &amp; per-side accents</summary>
        <div className="editor-fields">
          {c('Other-side embed background', 'embedCardColor', 'Token cards, X / link previews on incoming messages')}
          {c('Own message accent', 'messageOwnAccentColor', 'Reply quote + token-card bg on own bubbles')}
          {c('Own accent (soft)', 'messageOwnAccentSoftColor', 'Reply bar stripe + reaction passive on own')}
          {c('Other message accent', 'messageOtherAccentColor', 'Reply quote bg on incoming bubbles')}
          {c('Other accent (soft)', 'messageOtherAccentSoftColor', 'Reply bar stripe on incoming')}
        </div>
      </details>

      <details className="editor-group">
        <summary>Floating UI &amp; loaders</summary>
        <div className="editor-fields">
          {c('Message actions menu', 'messageActionsColor')}
          {c('Message actions text', 'messageActionsTextColor')}
          {c('Tooltip', 'tooltipColor')}
          {c('Tooltip text', 'tooltipTextColor')}
          {c('Emoji picker', 'emojiPickerColor')}
          {c('Avatar hover', 'avatarHoverColor', 'rgba accepted')}
          {c('Loader', 'loaderColor')}
        </div>
      </details>

      <details className="editor-group">
        <summary>Modals &amp; danger</summary>
        <div className="editor-fields">
          {c('Modal overlay', 'modalOverlayColor', 'rgba(0,0,0,0.6) etc.')}
          {c('Danger / error', 'dangerColor')}
        </div>
      </details>

      <details className="editor-group">
        <summary>Typography</summary>
        <div className="editor-fields">
          <label className="field">
            <span className="field-label">Font family</span>
            <span className="field-control">
              <select
                value={effective.fontFamily ?? ''}
                onChange={(e) =>
                  onFieldChange('fontFamily', e.target.value || undefined)
                }
              >
                <option value="">default</option>
                {FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label className="field">
            <span className="field-label">Font size</span>
            <span className="field-control field-control-segmented">
              {(['sm', 'md', 'lg'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`segmented${effective.fontSize === s ? ' segmented-active' : ''}`}
                  onClick={() => onFieldChange('fontSize', s)}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </span>
          </label>
        </div>
      </details>

    </section>
  );
}
