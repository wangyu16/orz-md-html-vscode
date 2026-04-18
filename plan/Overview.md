Goal: Create a vs code extension editing and previewing files with dual extension names '*.md.html'.

Requirements:
- '*.md.html' files are valid html web pages that can be opened in any browswer.
- markdown source is embeded in the '*.md.html' file as an invisible script block.
- stylesheet and necessary script packages are included in the '*.md.html' files that the web pages are portable and self-contained. 
- the extension initiates or opens a '*.md.html' file in a split view. On the left, the markdown source is extracted and opened as a virtual file; on the right, the html page is previewed. Both open and close simultaneously. when vs code is closed and reopened, do not try to open the non-existing virtual file. Either open both correctly, or avoid opening. 
- Use a customized markdown parser.  Install the newly created parser module directly from GitHub: `npm install git+https://github.com/wangyu16/orz-markdown.git`. The markdown parser has templates and special plugins included. To use them properly, expecially for SMILES to chemical structures, mermaid, highlight.js, see the example render script in 'plan/render.ts.example'. 
- Provide icons for users to select a theme, change relative font sizes. (only for editing)
- For the output '*.md.html' file, do not provide theme selection. Only the theme selected by the editor will be injected to the web page.
- When an empty or uninitialized `*.md.html` file is opened, the extension silently injects the full HTML framework (theme CSS, CDN scripts, embedded markdown block) into the file on disk before presenting the editor. No error is shown; the editor opens with an empty markdown document and a blank preview.

Remaining problems:
- when the preview is closed while the editing panel is still open, there is no way to re-open the preview without closing the editing panel and select the file again. - solved
- when vs code is closed and reopened, the previously opening files will be reopened, but the virtual markdown sources cannot be opened correctly and leaving error message. -solved
- When editing, the preview always scroll to the top and down to the editing point. need to keep the position stable when editing. - solved

---

## Key Concepts (Architecture Decisions)

### File Format
Markdown source is stored in a hidden `<script type="text/markdown" id="md-source">` block at the end of `<body>`. This block is not rendered by browsers. The extension extracts it on open and re-embeds it on save.

### Auto-Initialization
If `readFile()` is called for a `*.md.html` file whose content is empty or lacks the embedded markdown block, the extension immediately calls `Renderer.renderForOutput("", selectedTheme)` and writes the resulting skeleton HTML to disk. The virtual editor then opens with empty markdown content and the preview shows a blank page. This is silent and requires no user action.

### Virtual File System (mdhtml: scheme)
The extension registers a VS Code `FileSystemProvider` under the `mdhtml:` URI scheme. When a `*.md.html` file is opened:
- `mdhtml:/path/to/doc.md` is derived from the real file path.
- `readFile()` extracts the embedded markdown from the `*.md.html` file. If the file is empty or uninitialized, it auto-initializes first (see above).
- `writeFile()` receives updated markdown, re-renders it to full HTML, and writes the `*.md.html` file to disk.
- The virtual URI is opened in the left editor pane as a fully editable text document (VS Code native text editor, language: markdown).
- The raw `*.md.html` editor is closed immediately after the virtual pair is opened.

### Split View Lifecycle (SessionManager)
A `SessionManager` maintains a registry (`Map<realFilePath, Session>`) to pair each virtual markdown editor with its corresponding preview webview. Both sides open and close together. On VS Code restart, if the `*.md.html` file still exists on disk, the virtual FS restores it cleanly. If it does not exist, `readFile()` throws `FileNotFound` and VS Code handles it gracefully — no dangling virtual editors.

### Render Modes (Renderer)
Two distinct output modes using the `orz-markdown` parser (`npm install git+https://github.com/wangyu16/orz-markdown.git`):
- **Preview mode**: Single selected theme CSS inlined, font-scale CSS variable injected, all libraries loaded from the extension's bundled local copies (offline-safe, respects VS Code webview CSP).
- **Output mode**: Single selected theme CSS inlined, all CDN library references (KaTeX, Mermaid, highlight.js, SmilesDrawer) — portable, self-contained, no interactive theme switcher, no font scale.

### Theme & Font Controls (EditorControls)
Status bar items appear when a `mdhtml:` editor is active:
- **Theme button**: shows active theme name; click opens `showQuickPick` with all 10 themes.
- **A+ / A− buttons**: bump font scale ±10% in the preview webview only.
Theme selection and font scale are persisted in `ExtensionContext.workspaceState`. Theme selection determines which theme CSS is baked into the saved `*.md.html`.

### CDN vs Bundled
- **Output `*.md.html`**: CDN-only (same as `render.ts.example`) — requires internet to fully render in a browser.
- **Webview preview inside VS Code**: Bundled vendor copies under `media/vendor/` — works offline, no CSP issues.

### Live Preview
The right-pane webview re-renders the markdown on every document change event, debounced at ~400 ms.