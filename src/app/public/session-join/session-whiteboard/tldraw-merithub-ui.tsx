import { memo, useCallback, useState, type ReactElement, type ReactNode } from 'react';
import {
  DefaultColorStyle,
  DefaultSizeStyle,
  GeoShapeGeoStyle,
  useEditor,
  useValue,
  type TLDefaultColorStyle,
  type TLDefaultSizeStyle,
  type TLGeoShapeGeoStyle,
  type TLUiComponents
} from '@tldraw/tldraw';

const DRAWING_COLORS: { id: TLDefaultColorStyle; hex: string }[] = [
  { id: 'black', hex: '#1e1e1e' },
  { id: 'grey', hex: '#9ca3af' },
  { id: 'red', hex: '#e03131' },
  { id: 'orange', hex: '#f76707' },
  { id: 'yellow', hex: '#fab005' },
  { id: 'green', hex: '#2f9e44' },
  { id: 'blue', hex: '#1971c2' },
  { id: 'violet', hex: '#7950f2' }
];

const SIZE_OPTIONS: { id: TLDefaultSizeStyle; label: string }[] = [
  { id: 's', label: 'S' },
  { id: 'm', label: 'M' },
  { id: 'l', label: 'L' },
  { id: 'xl', label: 'XL' }
];

function MhIcon({ children }: { children: ReactNode }): ReactElement {
  return (
    <svg className="mh-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      {children}
    </svg>
  );
}

function MhToolBtn({
  title,
  active = false,
  disabled = false,
  onClick,
  children
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      className={`mh-tool-btn${active ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function useBoardEditor() {
  return useEditor();
}

function selectTool(editor: ReturnType<typeof useEditor>, toolId: string): void {
  editor.setCurrentTool(toolId);
}

function selectGeoTool(editor: ReturnType<typeof useEditor>, geo: TLGeoShapeGeoStyle): void {
  editor.run(() => {
    editor.setStyleForNextShapes(GeoShapeGeoStyle, geo);
    editor.setCurrentTool('geo');
  });
}

function insertMediaFiles(editor: ReturnType<typeof useEditor>): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,video/*';
  input.multiple = true;
  input.onchange = () => {
    const files = input.files ? Array.from(input.files) : [];
    if (!files.length) return;
    editor.markHistoryStoppingPoint('insert media');
    editor.putExternalContent({
      type: 'files',
      files,
      point: editor.getViewportPageBounds().center
    });
  };
  input.click();
}

function MeritHubToolbarInner(): ReactElement {
  const editor = useBoardEditor();
  const [insertOpen, setInsertOpen] = useState(false);

  const currentTool = useValue('mh-tool', () => editor.getCurrentToolId(), [editor]);
  const currentGeo = useValue('mh-geo', () => editor.getStyleForNextShape(GeoShapeGeoStyle), [editor]);
  const canUndo = useValue('mh-undo', () => editor.canUndo(), [editor]);
  const canRedo = useValue('mh-redo', () => editor.canRedo(), [editor]);

  const isTool = useCallback(
    (toolId: string, geo?: TLGeoShapeGeoStyle) => {
      if (geo) return currentTool === 'geo' && currentGeo === geo;
      return currentTool === toolId;
    },
    [currentGeo, currentTool]
  );

  const runTool = useCallback(
    (toolId: string) => {
      selectTool(editor, toolId);
      setInsertOpen(false);
    },
    [editor]
  );

  const runGeo = useCallback(
    (geo: TLGeoShapeGeoStyle) => {
      selectGeoTool(editor, geo);
      setInsertOpen(false);
    },
    [editor]
  );

  return (
    <div className="mh-toolbar-inner">
      <MhToolBtn title="Select (V)" active={isTool('select')} onClick={() => runTool('select')}>
        <MhIcon>
          <path
            d="M4 4l7 16 2.5-6.5L20 11 4 4z"
            fill="currentColor"
            stroke="none"
          />
        </MhIcon>
      </MhToolBtn>

      <MhToolBtn title="Draw (D)" active={isTool('draw')} onClick={() => runTool('draw')}>
        <MhIcon>
          <path
            d="M3 21l3-1 11-11-2-2L4 18l-1 3z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          <path d="M14 5l2 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </MhIcon>
      </MhToolBtn>

      <MhToolBtn title="Highlighter" active={isTool('highlight')} onClick={() => runTool('highlight')}>
        <MhIcon>
          <rect x="4" y="14" width="12" height="4" rx="1" fill="currentColor" opacity="0.35" />
          <path
            d="M6 14l8-8 2 2-8 8H6v-2z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
        </MhIcon>
      </MhToolBtn>

      <MhToolBtn
        title="Ellipse (O)"
        active={isTool('geo', 'ellipse')}
        onClick={() => runGeo('ellipse')}
      >
        <MhIcon>
          <ellipse cx="12" cy="12" rx="7" ry="5" fill="none" stroke="currentColor" strokeWidth="1.75" />
        </MhIcon>
      </MhToolBtn>

      <MhToolBtn title="Text (T)" active={isTool('text')} onClick={() => runTool('text')}>
        <MhIcon>
          <path
            d="M7 5h10M12 5v14M9 19h6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </MhIcon>
      </MhToolBtn>

      <div className="mh-insert-wrap">
        <MhToolBtn title="Insert" active={insertOpen} onClick={() => setInsertOpen((open) => !open)}>
          <MhIcon>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </MhIcon>
        </MhToolBtn>

        {insertOpen ? (
          <div className="mh-insert-menu" role="menu" aria-label="Insert tools">
            <button type="button" className="mh-insert-item" onClick={() => insertMediaFiles(editor)}>
              Image / video
            </button>
            <button type="button" className="mh-insert-item" onClick={() => runTool('line')}>
              Line
            </button>
            <button type="button" className="mh-insert-item" onClick={() => runTool('arrow')}>
              Arrow
            </button>
            <button type="button" className="mh-insert-item" onClick={() => runGeo('rectangle')}>
              Rectangle
            </button>
            <button type="button" className="mh-insert-item" onClick={() => runGeo('triangle')}>
              Triangle
            </button>
            <button type="button" className="mh-insert-item" onClick={() => runGeo('diamond')}>
              Diamond
            </button>
            <button type="button" className="mh-insert-item" onClick={() => runTool('note')}>
              Sticky note
            </button>
            <button type="button" className="mh-insert-item" onClick={() => runTool('frame')}>
              Frame
            </button>
          </div>
        ) : null}
      </div>

      <MhToolBtn title="Eraser (E)" active={isTool('eraser')} onClick={() => runTool('eraser')}>
        <MhIcon>
          <path
            d="M5 19h9l8-8a2.8 2.8 0 0 0 0-4l-1-1a2.8 2.8 0 0 0-4 0L5 19z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
        </MhIcon>
      </MhToolBtn>

      <MhToolBtn title="Undo" disabled={!canUndo} onClick={() => editor.undo()}>
        <MhIcon>
          <path
            d="M9 7H5v4M5 11c2-3 5-4 8-4 4 0 7 3 7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </MhIcon>
      </MhToolBtn>

      <MhToolBtn title="Redo" disabled={!canRedo} onClick={() => editor.redo()}>
        <MhIcon>
          <path
            d="M15 7h4v4M19 11c-2-3-5-4-8-4-4 0-7 3-7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </MhIcon>
      </MhToolBtn>

      <MhToolBtn title="Laser pointer" active={isTool('laser')} onClick={() => runTool('laser')}>
        <MhIcon>
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
          <path
            d="M12 3v3M12 18v3M3 12h3M18 12h3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </MhIcon>
      </MhToolBtn>

      <MhToolBtn title="Hand (H)" active={isTool('hand')} onClick={() => runTool('hand')}>
        <MhIcon>
          <path
            d="M8 11V8a1.5 1.5 0 0 1 3 0v6M11 8V6.5A1.5 1.5 0 0 1 14 6v8M14 9V7.5A1.5 1.5 0 0 1 17 7.5V14a5 5 0 0 1-5 5h-1a4 4 0 0 1-4-4v-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </MhIcon>
      </MhToolBtn>
    </div>
  );
}

function MeritHubStylePanelInner(): ReactElement {
  const editor = useBoardEditor();

  const color = useValue('mh-color', () => editor.getStyleForNextShape(DefaultColorStyle), [editor]);
  const size = useValue('mh-size', () => editor.getStyleForNextShape(DefaultSizeStyle), [editor]);

  return (
    <div className="mh-style-panel-inner">
      <div className="mh-style-row" role="group" aria-label="Stroke color">
        {DRAWING_COLORS.map(({ id, hex }) => (
          <button
            key={id}
            type="button"
            className={`mh-color-swatch${color === id ? ' is-active' : ''}`}
            title={id}
            aria-label={id}
            aria-pressed={color === id}
            style={{ backgroundColor: hex }}
            onClick={() => editor.setStyleForNextShapes(DefaultColorStyle, id)}
          />
        ))}
      </div>
      <div className="mh-style-row mh-size-row" role="group" aria-label="Stroke size">
        {SIZE_OPTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`mh-size-btn${size === id ? ' is-active' : ''}`}
            aria-pressed={size === id}
            onClick={() => editor.setStyleForNextShapes(DefaultSizeStyle, id)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MeritHubNavigationPanelInner(): ReactElement {
  const editor = useBoardEditor();
  const zoom = useValue('mh-zoom', () => Math.round(editor.getZoomLevel() * 100), [editor]);

  return (
    <div className="mh-nav-panel-inner">
      <button type="button" className="mh-nav-btn" title="Zoom out" aria-label="Zoom out" onClick={() => editor.zoomOut()}>
        −
      </button>
      <span className="mh-zoom-label">{zoom}%</span>
      <button type="button" className="mh-nav-btn" title="Zoom in" aria-label="Zoom in" onClick={() => editor.zoomIn()}>
        +
      </button>
      <button
        type="button"
        className="mh-nav-btn mh-nav-fit"
        title="Reset zoom"
        aria-label="Reset zoom"
        onClick={() => editor.resetZoom()}
      >
        Fit
      </button>
    </div>
  );
}

export const MeritHubFloatingToolbar = memo(function MeritHubFloatingToolbar(): ReactElement {
  return (
    <div className="merithub-toolbar" data-testid="merithub.toolbar">
      <MeritHubToolbarInner />
    </div>
  );
});

export const MeritHubStylePanel = memo(function MeritHubStylePanel(): ReactElement {
  return (
    <div className="merithub-style-panel">
      <MeritHubStylePanelInner />
    </div>
  );
});

export const MeritHubNavigationPanel = memo(function MeritHubNavigationPanel(): ReactElement {
  return (
    <div className="merithub-nav-panel">
      <MeritHubNavigationPanelInner />
    </div>
  );
});

export const meritHubUiComponents: TLUiComponents = {
  Toolbar: null,
  StylePanel: null,
  NavigationPanel: null,
  MenuPanel: null,
  SharePanel: null,
  PageMenu: null,
  HelperButtons: null,
  DebugPanel: null,
  DebugMenu: null,
  FollowingIndicator: null,
  TopPanel: null
};
