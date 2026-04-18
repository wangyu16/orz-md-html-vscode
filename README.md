# Orz Markdown-HTML Editor

Orz Markdown-HTML Editor is a VS Code extension for working with `.md.html` files: single HTML files that stay editable as markdown. On disk, each file is a browser-openable HTML document. In VS Code, the extension extracts the embedded markdown into a dedicated editor and keeps a live preview beside it.

The format is designed for open documentation workflows where writing, publishing, sharing, and adaptation all matter. A `.md.html` page is easy to edit as plain markdown, easy to distribute as one file, and easy to repurpose because the original markdown source stays embedded in the HTML.

This extension depends on [yuwang26.orz-md-preview](https://marketplace.visualstudio.com/items?itemName=yuwang26.orz-md-preview), which provides the Orz Markdown parser, theme CSS, and rendering support.

## Why `.md.html`

A `.md.html` document gives you both representations at once:

- The physical file is valid HTML that can be opened directly in a browser.
- The markdown source is stored inside `<script type="text/markdown" id="md-source">...</script>`.
- The extension edits the markdown view, then regenerates the rendered HTML on save.
- The saved page keeps enough source structure to stay maintainable after sharing or publishing.

That makes the format useful for portable notes, project docs, teaching material, lab writeups, static-site style page collections, and any workflow where the same document needs to be both editable source and deliverable web page.

## What The Extension Does

- Opens `.md.html` files as a split workspace: markdown editor on the left, rendered preview on the right.
- Auto-initializes empty or uninitialized `.md.html` files into a valid document shell.
- Preserves preview scroll position during normal typing by patching only the rendered DOM.
- Restores open editor and preview sessions across VS Code restart when the real file still exists.
- Lets you reopen the preview panel without closing the editor.
- Lets you toggle between the markdown editor and the raw HTML source file.
- Applies one of 10 built-in themes and bakes the selected theme into the saved file.
- Adjusts preview font size from 50% to 300% for editing comfort.
- Keeps preview rendering offline-safe inside VS Code by using bundled vendor assets.
- Emits a browser-openable output file that also links `custom.css` from the same folder for collection-wide overrides.
- Converts copied rendered selections back into markdown where possible, which helps reuse content in other documents.

## Important Behavior

The project intentionally separates preview behavior from saved-output behavior.

- Inside VS Code, the preview uses bundled copies of KaTeX, Mermaid, highlight.js, and SmilesDrawer, so preview works offline.
- On disk, the saved `.md.html` file inlines the selected theme CSS but loads rendering libraries from CDN URLs.
- Because of that, the saved file opens directly in any browser without a server, but advanced rendered features such as math, diagrams, highlighting, and SMILES still depend on network access unless those CDN assets are already cached.
- The optional `custom.css` hook exists only in the saved output, not in the VS Code preview.
- Preview font scaling is an editor convenience only. It is stored in workspace state and is not baked into the output HTML.

## Installation

Install the packaged extension with VS Code or from the command line:

```bash
code --install-extension orz-md-html-1.0.0.vsix
```

The extension declares `yuwang26.orz-md-preview` as a dependency. If that dependency is missing, rendering and theme loading will fail until it is installed.

## Usage

### Create a new file

1. Open the command palette.
2. Run `Orz Markdown: New File`.
3. Pick a location and name. If needed, `.md.html` is appended automatically.

The extension creates an empty file, initializes it on first open, and launches the markdown editor plus preview.

### Open an existing file

Open any `.md.html` file normally from Explorer or `File > Open`. The extension intercepts the raw HTML open, closes that view, and reopens the file as the markdown editor plus preview pair.

### Save

Save normally with `Ctrl+S` or `Cmd+S`. The extension re-renders the full HTML document and embeds the current markdown source back into the file.

### Reopen the preview

If the preview panel is closed while the editor remains open, use the title-bar preview button or run `Orz Markdown: Open Preview`.

### Toggle raw HTML

Use `Orz Markdown: Toggle Source View` when you want to inspect or edit the physical `.md.html` file directly. Running it again returns to the markdown editor workflow.

## Editor Controls

When an `.md.html` markdown editor is active, these controls appear in the editor title bar:

| Button | Command | Description |
|--------|---------|-------------|
| `$(open-preview)` | Open Preview | Re-open the preview panel for the current file |
| `A-` | Decrease Font Size | Reduce preview font scale by 10% |
| `A+` | Increase Font Size | Increase preview font scale by 10% |
| `$(symbol-color)` | Select Theme | Switch the active theme |
| `$(file-code)` | Toggle Source View | Switch between markdown editing and raw HTML |

Font scale is stored per workspace. Theme selection is restored from the saved file when you reopen it.

## Themes

| Index | Name | Scheme |
|-------|------|--------|
| 0 | Dark Elegant I | Dark |
| 1 | Dark Elegant II | Dark |
| 2 | Light Neat I | Light |
| 3 | Light Neat II | Light |
| 4 | Beige Decent I | Light |
| 5 | Beige Decent II | Light |
| 6 | Light Academic I | Light |
| 7 | Light Academic II | Light |
| 8 | Light Playful I | Light |
| 9 | Light Playful II | Light |

The selected theme is written into the output file through the `orz-md-theme-index` meta tag and used again when the file is reopened in VS Code.

## `custom.css`

If you place a `custom.css` file in the same directory as one or more `.md.html` pages, each saved page will load it with:

```html
<link rel="stylesheet" href="custom.css">
```

This is useful for collection-wide adjustments such as typography, spacing, container widths, or shared site branding.

Use this when you want a folder of `.md.html` files to behave like a lightweight static site with a common style layer.

## Supported Markdown

The extension uses the Orz Markdown parser from `yuwang26.orz-md-preview`, so syntax support follows that project. Common use cases include:

- Standard markdown blocks and inline formatting
- KaTeX math
- Syntax-highlighted fenced code blocks
- Mermaid diagrams
- SMILES chemistry blocks
- Tabs and container blocks
- Footnotes, task lists, emoji, QR codes, image sizing, and heading anchors

This README intentionally stays focused on the `.md.html` workflow. For parser syntax details, refer to the Orz Markdown parser and preview project documentation.

## File Model

The extension treats the embedded markdown block as the source of truth. The rendered `<article class="markdown-body">` content is generated output.

In practice that means:

- manual edits to the generated article can be overwritten on save,
- the markdown source block is what matters for long-term maintenance,
- empty files and files missing the markdown block are repaired automatically when opened through the extension.

## Development

Build the extension:

```bash
npm run compile
```

Run the format tests:

```bash
npm test
```

## License

MIT. See [LICENSE](LICENSE).
