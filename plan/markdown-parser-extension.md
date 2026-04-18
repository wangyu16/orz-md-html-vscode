# Orz Markdown Preview

A VS Code extension that previews `.md` files using the [orz-markdown](https://www.npmjs.com/package/orz-markdown) parser — a feature-rich `markdown-it` dialect with math, diagrams, chemistry structures, QR codes, custom containers, tab groups, and more.

## Features

- Live preview panel that updates as you type (debounced, scroll-preserving)
- 10 selectable themes with adjustable font scale
- Full extended markdown feature set powered by `orz-markdown`
- Extension API — other extensions can call the renderer directly

## Commands

All commands are available from the editor title bar when a Markdown file is open, and from the Command Palette under **Orz Markdown Preview**.

| Command | Description |
|---------|-------------|
| **Open Preview** | Open a side-by-side live preview panel |
| **Select Theme** | Pick from 10 bundled themes |
| **Increase Font Size** | Scale up preview font (×1.1 per click) |
| **Decrease Font Size** | Scale down preview font (×0.9 per click) |

The status bar shows the active theme name and font size controls whenever a Markdown file is focused.

## Themes

| Theme | Palette | Best for |
|-------|---------|----------|
| Dark Elegant I | Dark navy, Playfair + Inter | Code-heavy notes, dashboards |
| Dark Elegant II | Deep dark, Sora, teal accent | Technical docs, product showcases |
| Light Neat I | Light blue-tinted, Jakarta Sans | Developer references, wikis |
| Light Neat II | Warm off-white, Space Grotesk | Polished guides, mixed audience |
| Beige Decent I | Warm parchment, Playfair | Essays, editorial content |
| Beige Decent II | Soft beige, DM Sans + Lora | Long-form documentation |
| Light Academic I | Near-white Tufte serif, Crimson Pro | Research notes, math-heavy writing |
| Light Academic II | White, Merriweather + Fira | Reports, whitepapers, tutorials |
| Light Playful I | Notebook lines, Kalam | Workshops, onboarding |
| Light Playful II | Dot-grid, Chewy + Patrick Hand | Creative, children's content |

## Supported Markdown Syntax

All standard CommonMark Markdown is supported, plus:

### Built-in extensions

| Feature | Syntax |
|---------|--------|
| Math (KaTeX) | Inline `$E=mc^2$`, block `$$...$$`, chemistry `$\ce{H2O}$` |
| Highlighted text | `==mark==` |
| Subscript / superscript | `H~2~O`, `x^2^` |
| Inserted text | `++inserted++` |
| Task lists | `- [x] done`, `- [ ] todo` |
| Image sizing | `![alt](url =300x200)` |
| Footnotes | `[^1]` inline, `[^1]: text` definition |

### Containers

```markdown
::: info
Informational note.
:::

::: warning
Review before continuing.
:::

::: success
Operation succeeded.
:::

::: danger
Irreversible action.
:::

::: spoil Click to reveal
Hidden content.
:::
```

Layout containers: `::: left`, `::: right`, `::: center`

Multi-column layout:
```markdown
:::: cols
::: col
Column One
:::
::: col
Column Two
:::
::::
```

Tab groups:
```markdown
:::: tabs
::: tab Python
```python
print("Hello")
```
:::
::: tab JavaScript
```javascript
console.log("Hello");
```
:::
::::
```

### Custom plugins (`{{plugin}}` syntax)

| Plugin | Syntax | Description |
|--------|--------|-------------|
| Emoji | `{{emoji smile}}` | Inline emoji by name |
| Colored span | `{{span[red] text}}`, `{{span[success] OK}}` | Inline colored labels |
| Horizontal space | `{{space 2}}` | Inline whitespace (em units) |
| Table of contents | `{{toc}}`, `{{toc 2,3}}` | Auto-generated TOC |
| Attributes | `{{attrs[id="anchor"]}}` | Inject HTML attributes on preceding element |
| YouTube embed | `{{youtube VIDEO_ID}}` | Responsive 16:9 iframe |
| QR code | `{{qr https://example.com}}` | Inline SVG QR code |
| Mermaid diagram | `{{mermaid\n...\n}}` | Flowcharts, sequence diagrams, Gantt, ER |
| SMILES structure | `{{smiles C1=CC=CC=C1}}` | Chemical structure via SmilesDrawer |
| YAML metadata | `{{yaml\nkey: value\n}}` | Embedded invisible YAML metadata block |

Syntax highlighting is provided for all fenced code blocks via highlight.js.

## Extension API

Other VS Code extensions can use this extension's renderer to parse markdown to HTML:

```typescript
import type { OrzMdPreviewApi } from 'orz-md-preview/out/extension';

const ext = vscode.extensions.getExtension<OrzMdPreviewApi>('wangyu.orz-md-preview');
const api = await ext?.activate();
const html = api?.renderMarkdownHtml(markdownSource);
```

The returned `html` is a self-contained HTML fragment (no page shell) ready to be placed inside a `.markdown-body` container.

## Building from Source

```bash
npm install
npm run compile   # development build with source maps
npm run package   # production build (minified)
```

Requires Node.js and npm. The build bundles `src/extension.ts` and copies theme CSS and vendor libraries (KaTeX, highlight.js, Mermaid, SmilesDrawer) into `out/`.
