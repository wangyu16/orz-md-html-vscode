# Implementation Blueprint

This document is the authoritative phase-by-phase plan for building the `orz-md-vscode` extension.
Each phase ends with explicit verification steps that must pass before the next phase begins.

---

## Project Structure (Target)

```
orz-md-vscode/
├── package.json
├── tsconfig.json
├── esbuild.mjs                        # build script
├── .vscodeignore
│
├── src/
│   ├── extension.ts                   # activate / deactivate
│   ├── MdHtmlFs.ts                    # FileSystemProvider (mdhtml: scheme)
│   ├── SessionManager.ts              # paired editor + webview lifecycle
│   ├── PreviewPanel.ts                # WebviewPanel (right pane)
│   ├── Renderer.ts                    # orz-markdown wrapper; preview & output modes
│   ├── ThemeManager.ts                # theme definitions + persisted state
│   ├── EditorControls.ts              # status bar: theme picker, A+/A−
│   └── util/
│       ├── debounce.ts
│       └── mdHtmlFormat.ts            # embed/extract markdown in *.md.html
│
└── media/
    ├── preview.css                    # webview chrome (scrollbar, body margin, etc.)
    └── vendor/                        # bundled offline copies for webview
        ├── katex/                     # katex.min.js + katex.min.css + fonts/
        ├── highlight/                 # highlight.min.js + atom-one-dark.min.css + github.min.css
        ├── mermaid/                   # mermaid.min.js
        └── smiles-drawer/             # smiles-drawer.min.js
```

---

## Phase 1 — Project Scaffold & Build System

**Goal:** A clean TypeScript extension project that compiles, installs, and activates in the Extension Development Host.

### Tasks

1. **`package.json`**
   - `name`: `orz-md-vscode`, `publisher`, `version: 0.0.1`, `engines.vscode: ^1.85.0`.
   - `activationEvents`: `["onLanguage:html", "workspaceContains:**/*.md.html"]` — or more precisely `onCustomEditor` if using that path; start with `*` for simplicity during development.
   - `contributes.languages`: register `mdhtml` language id associated with `*.md.html` glob so VS Code assigns language correctly.
   - `contributes.commands`: placeholder array (filled in later phases).
   - `main`: `./out/extension.js`.
   - `devDependencies`: `typescript`, `@types/vscode`, `esbuild`.
   - `dependencies`: `orz-markdown` (installed from GitHub — see below).

2. **Install `orz-markdown`**
   ```
   npm install git+https://github.com/wangyu16/orz-markdown.git
   ```

3. **`tsconfig.json`**
   - `target: ES2020`, `module: commonjs`, `outDir: ./out`, `strict: true`.
   - `lib: ["ES2020"]`, `sourceMap: true`.

4. **`esbuild.mjs`**
   - Bundle `src/extension.ts` → `out/extension.js` (CJS, no external `vscode`).
   - Watch mode flag for development.

5. **`src/extension.ts`** (stub)
   ```ts
   import * as vscode from 'vscode';
   export function activate(ctx: vscode.ExtensionContext) {
     console.log('orz-md-vscode activated');
   }
   export function deactivate() {}
   ```

6. **`.vscodeignore`**: exclude `src/`, `plan/`, `*.map`, `node_modules/` (except necessary runtime deps).

### Verification

- [ ] `npm run build` succeeds with no TypeScript errors.
- [ ] Press F5 in VS Code → Extension Development Host window opens.
- [ ] Open the Output panel (channel "orz-md-vscode") — "activated" log appears.
- [ ] No errors in the Extensions panel for the dev extension.

---

## Phase 2 — File Format: Embed/Extract Markdown

**Goal:** Define and implement the `*.md.html` file format. All subsequent phases depend on this contract.

### Format Specification

A `*.md.html` file has this structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>...</head>
<body>
  <article class="markdown-body">
    <!-- rendered HTML content -->
  </article>

  <!-- scripts: highlight.js, mermaid, smiles-drawer, theme JS -->

  <!-- MARKDOWN SOURCE — do not edit manually -->
  <script type="text/markdown" id="md-source">
Raw markdown content here.
  </script>
</body>
</html>
```

The `<script type="text/markdown">` tag is **never executed** by browsers (unknown MIME type). It is invisible to the reader and survives round-trips through any HTML-aware tool that doesn't strip unknown script types.

### Tasks

1. **`src/util/mdHtmlFormat.ts`**

   Implement and export:

   ```ts
   /** Extracts the raw markdown from a *.md.html file's embedded script block.
    *  Returns null if the block is not found (file may not yet be initialized). */
   export function extractMarkdown(htmlContent: string): string | null

   /** Replaces (or inserts) the embedded markdown block in a full HTML string. */
   export function embedMarkdown(htmlContent: string, markdown: string): string
   ```

   - `extractMarkdown`: regex match on `<script type="text/markdown" id="md-source">...</script>` (DOTALL). Returns `null` when the block is absent — this signals "uninitialized file" to the caller; it is not treated as an error.
   - `embedMarkdown`: if block exists, replace its inner content; if not, append the block before `</body>`.

2. **Unit test** (`src/util/mdHtmlFormat.test.ts` or inline `test/` folder):
   - Round-trip: embed then extract returns original markdown.
   - Extract from an empty file returns `null`.
   - Extract from a plain HTML file with no embedded block returns `null`.
   - Embed into a file that has no block appends correctly before `</body>`.
   - Markdown containing `</script>` is safely escaped (encode as `<\/script>`).

### Verification

- [ ] Unit tests pass (`npm test` or manual node execution).
- [ ] Round-trip test: a real `*.md.html` file from `render.ts.example` output can have markdown appended and re-extracted correctly.

---

## Phase 3 — Renderer

**Goal:** Produce correct HTML output in both preview and output modes from markdown input.

### Tasks

1. **`src/ThemeManager.ts`** (subset needed for Renderer)

   Define the `ThemeDefinition` type and `THEMES` array (10 themes, mirroring `render.ts.example`).
   Export `getTheme(index: number): ThemeDefinition`.

   ```ts
   export type ThemeDefinition = {
     styleId: string;
     name: string;
     file: string;             // CSS filename relative to themes/ in orz-markdown package
     colorScheme: 'dark' | 'light';
     mermaidTheme: 'dark' | 'default';
     smilesTheme: 'dark' | 'light';
   };
   ```

   Also export:
   - `loadThemeCss(theme: ThemeDefinition): string` — reads theme CSS from the `orz-markdown` package's `themes/` directory.
   - `getPersistedThemeIndex(ctx): number` / `setPersistedThemeIndex(ctx, i): void`.
   - `getPersistedFontScale(ctx): number` / `setPersistedFontScale(ctx, s): void`.

2. **`src/Renderer.ts`**

   ```ts
   import { md } from 'orz-markdown';
   ```

   Export:
   ```ts
   /** For the live preview webview. Uses bundled offline vendor libs. */
   export function renderForPreview(
     markdown: string,
     theme: ThemeDefinition,
     fontScale: number,
     vendorBaseUri: string,   // vscode-resource: base URI for media/vendor/
   ): string

   /** For the saved *.md.html output. Uses CDN links; no font scale; no theme UI. */
   export function renderForOutput(
     markdown: string,
     theme: ThemeDefinition,
   ): string
   ```

   **`renderForOutput`** structure (per `render.ts.example`):
   - `md.render(source)` → HTML body.
   - Single `<style id="${theme.styleId}">` block with theme CSS inlined.
   - CDN `<link>` tags for KaTeX, highlight.js (dark or light per theme).
   - CDN `<script>` tags for highlight.js, Mermaid, SmilesDrawer.
   - Tabs JS (from `render.ts.example` `TABS_JS`).
   - **No** theme switcher UI, **no** theme menu JS, **no** font scale.

   **`renderForPreview`** structure:
   - Same body HTML.
   - Same single theme CSS inlined.
   - `<link>` for KaTeX CSS from `vendorBaseUri`.
   - `<link>` for highlight.js CSS (dark/light) from `vendorBaseUri`.
   - `<script>` tags pointing to `vendorBaseUri` for all vendor JS.
   - A `<style>` injecting `--font-scale: ${fontScale};` on `:root`.
   - Tabs JS.
   - **No** theme switcher (theme is controlled from VS Code status bar).

3. **Manual smoke test**: write a small script that calls `renderForOutput` with a sample markdown string and writes the result to a `.html` file; open in a browser to verify rendering.

### Verification

- [ ] `renderForOutput` produces valid HTML with a single theme CSS block, CDN script tags, and the `<script type="text/markdown">` source block at the end.
- [ ] `renderForPreview` produces HTML with vendor-relative `<script src="...">` tags (no CDN).
- [ ] A SMILES code block, a Mermaid block, a math formula, a code block, and a tabs block all render correctly in the browser output.
- [ ] No `console.error` in the browser devtools for the output file.

---

## Phase 4 — Virtual FileSystem Provider

**Goal:** `mdhtml:` URIs act as editable, saveable documents backed by `*.md.html` files on disk.

### Tasks

1. **`src/MdHtmlFs.ts`** — implements `vscode.FileSystemProvider`

   Key methods:

   - **`readFile(uri)`**: read the real `.md.html` file from disk. Two initialization cases:
     1. **File is empty** (zero bytes or whitespace only): call `Renderer.renderForOutput("", currentTheme)` to produce a skeleton HTML, write it to disk synchronously, then return an empty buffer.
     2. **File has HTML content but no embedded markdown block** (`extractMarkdown()` returns `null`): call `embedMarkdown(existingHtml, "")` to insert an empty block, write back to disk, then return an empty buffer.
     3. **Normal case**: return the extracted markdown as a UTF-8 buffer.
     In all cases the real file on disk is valid `*.md.html` by the time the virtual editor opens. No error is surfaced to the user.
   - **`writeFile(uri, content)`**: receive updated markdown bytes, call `Renderer.renderForOutput(markdown, currentTheme)`, call `embedMarkdown(existingHtml, markdown)` — or build a full new HTML if the file doesn't exist yet — write to disk. Fire `_emitter.fire([{ type: FileChangeType.Changed, uri }])`.
   - **`stat(uri)`**: derive from real file `fs.stat`. Return a `FileStat` with `type: FileType.File`.
   - **`watch(uri)`**: use `fs.watch` or `vscode.workspace.createFileSystemWatcher` on the real `.md.html` path; propagate changes.
   - **`readDirectory`, `createDirectory`, `delete`, `rename`**: throw `FileSystemError.NoPermissions` — not used.

   URI derivation convention:
   ```
   real:   /home/user/docs/notes.md.html
   virtual: mdhtml:/home/user/docs/notes.md.html
   ```
   The scheme changes; path is identical. This makes the mapping trivial and deterministic — no state needed for the derivation itself.

   Current theme lookup: `MdHtmlFs` holds a reference to `ThemeManager` to get the active theme at write time.

2. **Register in `extension.ts`**:
   ```ts
   const mdHtmlFs = new MdHtmlFs(themeManager);
   ctx.subscriptions.push(
     vscode.workspace.registerFileSystemProvider('mdhtml', mdHtmlFs, {
       isCaseSensitive: true,
       isReadonly: false,
     })
   );
   ```

### Verification

- [ ] In the Extension Development Host, run the command `> Developer: Open File...` and enter `mdhtml:/path/to/existing/file.md.html` — the markdown content appears.
- [ ] Edit the content and save (`Ctrl+S`) — the real `*.md.html` file on disk is updated with re-rendered HTML while the embedded markdown block is updated.
- [ ] Open the updated `*.md.html` directly in a browser — it renders correctly with the saved theme.
- [ ] Delete the real `*.md.html` and try to open the virtual URI — VS Code shows a clean "file not found" error.
- [ ] Create an empty `*.md.html` file (e.g., `touch notes.md.html`) and open it — no error appears; the markdown editor opens blank and the preview shows an empty page; inspecting the file on disk shows it has been initialized with valid HTML.

---

## Phase 5 — Session Manager & Split View Lifecycle

**Goal:** Opening a `*.md.html` file automatically opens the markdown editor (left) and preview webview (right) together; closing one closes the other.

### Tasks

1. **`src/SessionManager.ts`**

   ```ts
   type Session = {
     realPath: string;
     virtualUri: vscode.Uri;
     previewPanel: PreviewPanel;
   };
   ```

   Methods:
   - **`open(realUri, ctx)`**: Check if a session already exists for this path (bring to front if so). Otherwise:
     1. Derive `virtualUri` from `realUri`.
     2. Open virtual URI as a text document: `vscode.window.showTextDocument(virtualDoc, { viewColumn: ViewColumn.One, preview: false })`.
     3. Construct `PreviewPanel` in `ViewColumn.Two`.
     4. Register session.
     5. Wire `previewPanel.onDispose` → call `close(realPath)`.
     6. Wire `workspace.onDidCloseTextDocument` for the virtual URI → call `close(realPath)`.
   - **`close(realPath)`**: dispose the `PreviewPanel` if still alive; remove session entry.
   - **`getSession(realPath)`**: returns the session or undefined.

2. **Intercept `*.md.html` opens in `extension.ts`**

   ```ts
   vscode.workspace.onDidOpenTextDocument(async (doc) => {
     if (!doc.fileName.endsWith('.md.html')) return;
     if (doc.uri.scheme === 'mdhtml') return;  // already virtual, ignore
     // Close the raw *.md.html text editor
     await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
     await sessionManager.open(doc.uri, ctx);
   }, null, ctx.subscriptions);
   ```

   Note: the timing of `closeActiveEditor` relative to `open()` requires care — open the virtual side first, then close the raw editor, to avoid a flash of unsaved changes prompts.

3. **VS Code session restore** — `WebviewPanelSerializer`

   In `extension.ts`, register:
   ```ts
   vscode.window.registerWebviewPanelSerializer('orz-md-preview', {
     async deserializeWebviewPanel(panel, state) {
       const realPath: string = state?.realPath;
       if (!realPath || !fs.existsSync(realPath)) {
         panel.dispose();
         return;
       }
       sessionManager.restoreFromPanel(panel, realPath, ctx);
     }
   });
   ```

   `PreviewPanel` must call `panel.title = ...` and persist `{ realPath }` in `getState()` at construction time.

### Verification

- [ ] Double-click a `*.md.html` file in the Explorer — two splits open: markdown editor left, preview webview right.
- [ ] Close the preview webview — the markdown editor also closes.
- [ ] Close the markdown editor — the preview webview also closes.
- [ ] Open the same file again from Explorer — a new session starts cleanly.
- [ ] With the session open, close VS Code. Reopen — both the markdown editor and preview webview restore (VS Code session restore).
- [ ] Delete the `*.md.html` and reopen VS Code — no dangling virtual editor is shown; VS Code shows a graceful error.

---

## Phase 6 — Live Preview WebviewPanel

**Goal:** The right-pane webview renders a live, updating HTML preview with bundled offline libraries.

### Tasks

1. **Download and place vendor libraries** under `media/vendor/`:
   - `katex@0.16.x`: `katex.min.js`, `katex.min.css`, `fonts/` directory.
   - `highlight.js@11.x`: `highlight.min.js`, `atom-one-dark.min.css`, `github.min.css`.
   - `mermaid@11.x`: `mermaid.min.js`.
   - `smiles-drawer@1.0.10`: `smiles-drawer.min.js`.

   These can be downloaded from the same CDN URLs used in the output HTML, then committed to the repo.

2. **`src/PreviewPanel.ts`**

   ```ts
   export class PreviewPanel {
     static readonly viewType = 'orz-md-preview';
     private readonly _panel: vscode.WebviewPanel;
     private _disposables: vscode.Disposable[] = [];

     constructor(
       ctx: vscode.ExtensionContext,
       realPath: string,
       themeManager: ThemeManager,
       existingPanel?: vscode.WebviewPanel,   // for restore
     )
   ```

   - Creates (or reuses) a `WebviewPanel` with `retainContextWhenHidden: true`.
   - Sets webview CSP: `default-src 'none'; script-src vscode-resource:; style-src vscode-resource: 'unsafe-inline'; img-src vscode-resource: data:; font-src vscode-resource:`.
   - Constructs `vendorBaseUri` via `panel.webview.asWebviewUri(Uri.file(ctx.extensionPath + '/media/vendor'))`.
   - Initial render: read virtual document content (via `MdHtmlFs.readFile` or `workspace.openTextDocument`) → `Renderer.renderForPreview(...)` → `panel.webview.html`.
   - Listens to `workspace.onDidChangeTextDocument` for the virtual URI: debounced ~400ms → re-render → update `panel.webview.html`.

   ```ts
   setFontScale(scale: number): void   // posts message { type: 'fontScale', value: scale }
   // webview JS handles the message by updating :root { --font-scale: ... }
   ```

3. **`media/preview.css`**: minimal body/scrollbar styles for the webview chrome.

4. **`src/util/debounce.ts`**: small generic debounce utility.

### Verification

- [ ] Open a `*.md.html` file — the preview renders immediately.
- [ ] Edit markdown in the left pane — preview updates within ~400–600ms.
- [ ] Edit a SMILES block — the chemical structure redraws in the preview.
- [ ] Edit a Mermaid block — the diagram updates.
- [ ] Inline math (`$...$`) renders via KaTeX.
- [ ] Code blocks have syntax highlighting.
- [ ] No network requests happen in the preview (check DevTools Network tab with DevTools opened via `Help > Toggle Developer Tools`).
- [ ] `retainContextWhenHidden` means switching tabs and back does not lose the webview content.

---

## Phase 7 — Theme Manager & Editor Controls

**Goal:** Status bar buttons for theme selection and font size; changes persist and affect both preview and output.

### Tasks

1. **Complete `src/ThemeManager.ts`**

   State managed:
   - `activeThemeIndex: number` (0–9), persisted in `workspaceState`.
   - `fontScale: number` (default `1.0`), persisted in `workspaceState`.

   Events:
   ```ts
   readonly onThemeChanged: vscode.Event<ThemeDefinition>
   readonly onFontScaleChanged: vscode.Event<number>
   ```

2. **Complete `src/EditorControls.ts`**

   Creates three `StatusBarItem` objects, visible only when a `mdhtml:` URI is the active editor:

   - **Theme status item** (left side, priority high):
     - Text: `◐ ${theme.name}`.
     - Tooltip: `Select theme`.
     - Command: registered command `orz-md.selectTheme` → `showQuickPick` of all 10 themes → calls `themeManager.setTheme(index)`.

   - **Font smaller** (`A−`): command `orz-md.fontSmaller` → `themeManager.setFontScale(current * 0.9)`.
   - **Font larger** (`A+`): command `orz-md.fontLarger` → `themeManager.setFontScale(current * 1.1)`.

   Show/hide based on `window.onDidChangeActiveTextEditor` — check if active editor URI scheme is `mdhtml`.

3. **Wire ThemeManager → PreviewPanel and MdHtmlFs**

   - `themeManager.onThemeChanged` → `previewPanel.update()` (re-render with new theme) + status bar text refresh.
   - `themeManager.onFontScaleChanged` → `previewPanel.setFontScale(scale)`.
   - `MdHtmlFs.writeFile` reads `themeManager.activeTheme` to bake into the saved output.

4. **Register all commands in `package.json`**:
   ```json
   "contributes": {
     "commands": [
       { "command": "orz-md.selectTheme", "title": "Select Theme", "category": "Orz Markdown" },
       { "command": "orz-md.fontLarger",  "title": "Increase Font Size", "category": "Orz Markdown" },
       { "command": "orz-md.fontSmaller", "title": "Decrease Font Size", "category": "Orz Markdown" }
     ]
   }
   ```

### Verification

- [ ] Status bar items appear only when a `mdhtml:` editor is active.
- [ ] Clicking the theme status bar item shows a quick pick with all 10 themes.
- [ ] Selecting a theme updates the preview immediately.
- [ ] `A+` / `A−` buttons change the preview's font size visually.
- [ ] Close and reopen VS Code — previously selected theme and font scale are restored from workspace state.
- [ ] Save the file (`Ctrl+S` on the virtual editor) — the output `*.md.html` has only the selected theme CSS, no theme switcher UI.
- [ ] Opening the saved `*.md.html` in Chrome — renders correctly with the baked theme.

---

## Phase 8 — New File Creation

**Goal:** Allow creating a new `*.md.html` file from scratch within the extension.

### Tasks

1. **Command `orz-md.newFile`**:
   - Prompt the user for a file path via `vscode.window.showSaveDialog` (filter: `*.md.html`).
   - Write an **empty** (zero-byte) file to that path on disk.
   - Open the file via `SessionManager.open(...)`.
   - The `MdHtmlFs.readFile()` auto-initialization logic (Phase 4) handles injecting the full skeleton HTML — no manual skeleton construction needed here.

2. **Register in `package.json`** under `contributes.commands` and optionally in the Explorer context menu (`contributes.menus.explorer/context`).

### Verification

- [ ] Run `> Orz Markdown: New File` from the command palette — a save dialog appears; after confirming a path, the split view opens with an empty markdown editor and blank preview.
- [ ] The new file on disk is valid HTML openable in a browser, with the currently selected theme applied.

---

## Phase 9 — Polish & Edge Cases

**Goal:** Robust, production-ready extension with good UX.

### Tasks

1. **File icon**: add a small icon for `*.md.html` files.
   - `contributes.iconThemes` or a custom icon contribution in `package.json`.

2. **Language association**: ensure `*.md.html` files do not accidentally activate other HTML extensions (e.g., Prettier HTML formatting). Add `"files.associations": { "*.md.html": "mdhtml" }` as a default workspace setting recommendation. The `mdhtml` language should have basic syntax highlighting — consider using `html` as the base grammar.

3. **Dirty indicator**: when the virtual `mdhtml:` document has unsaved changes, VS Code shows the standard dot in the tab. Confirm this works correctly and the save path (`Ctrl+S` on virtual doc → `writeFile` → on-disk update) has no race conditions.

4. **Large file performance**: `Renderer.renderForPreview` runs on every debounced keystroke. If the markdown is large (>50 KB), consider rendering only the visible portion or adding a longer debounce.

5. **Error display**: if `md.render()` throws (malformed input), catch and display an error message in the preview webview rather than crashing.

6. **Extension icon and README**: add `icon` field to `package.json` pointing to a `media/icon.png`. Write a brief README with usage instructions and feature list.

7. **`.vscodeignore`** audit: ensure `plan/`, `node_modules/`, `src/` (raw TS), test files are excluded from the VSIX package.

8. **VSIX packaging**: run `vsce package` and install the `.vsix` locally to test as an end-user would.

### Verification

- [ ] `*.md.html` files show a distinct icon in the Explorer.
- [ ] Saving when the markdown document is clean shows no "save" indicator (no unnecessary re-writes).
- [ ] A syntax error in the markdown (e.g., unclosed SMILES block) shows a graceful error in the preview, not an unhandled exception.
- [ ] `vsce package` produces a `.vsix` that installs and works correctly in a fresh VS Code window.
- [ ] End-to-end test: create a new file, write markdown with math, code, a Mermaid diagram, switch themes, save — the output HTML renders fully in Chrome.

---

## Dependency Reference

| Package | Purpose | Where used |
|---|---|---|
| `orz-markdown` (GitHub) | Markdown parser with plugins | `Renderer.ts` |
| `@types/vscode` | VS Code API types | dev only |
| `typescript` | TypeScript compiler | dev only |
| `esbuild` | Bundler | dev only |
| `katex` (vendored) | Math rendering | `media/vendor/` (webview only) |
| `highlight.js` (vendored) | Syntax highlighting | `media/vendor/` (webview only) |
| `mermaid` (vendored) | Diagram rendering | `media/vendor/` (webview only) |
| `smiles-drawer` (vendored) | Chemical structure rendering | `media/vendor/` (webview only) |

CDN equivalents of the vendored libraries are used in the output `*.md.html` files.

---

## Phase Completion Checklist

| Phase | Description | Done |
|---|---|---|
| 1 | Scaffold, build, activate | [ ] |
| 2 | File format: embed/extract markdown | [ ] |
| 3 | Renderer (preview + output modes) | [ ] |
| 4 | Virtual FileSystem Provider | [ ] |
| 5 | Session Manager + split view lifecycle | [ ] |
| 6 | Live preview WebviewPanel | [ ] |
| 7 | Theme Manager + Editor Controls | [ ] |
| 8 | New file creation command | [ ] |
| 9 | Polish, edge cases, packaging | [ ] |
