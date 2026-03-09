import { md } from 'orz-markdown';
import * as path from 'path';
import { ThemeManager } from './ThemeManager';
import { embedMarkdown } from './util/mdHtmlFormat';

const TABS_JS = `
(function () {
  function initTabs() {
    document.querySelectorAll('.tabs').forEach(function (tabs) {
      tabs.setAttribute('data-js', '1');
      var panels = tabs.querySelectorAll(':scope > .tab');
      if (!panels.length) return;

      var bar = document.createElement('div');
      bar.className = 'tabs-bar';
      panels.forEach(function (panel, i) {
        var label = panel.getAttribute('data-label') || 'Tab ' + (i + 1);
        var btn   = document.createElement('button');
        btn.className   = 'tabs-bar-btn' + (i === 0 ? ' active' : '');
        btn.textContent = label;
        btn.addEventListener('click', function () {
          tabs.querySelectorAll('.tabs-bar-btn').forEach(function (b) { b.classList.remove('active'); });
          panels.forEach(function (p) { p.classList.remove('active'); });
          btn.classList.add('active');
          panel.classList.add('active');
        });
        bar.appendChild(btn);
      });
      tabs.insertBefore(bar, tabs.firstChild);

      panels[0].classList.add('active');
    });
  }
  window._orzTabsInit = initTabs;
  initTabs();
})();
`;

// Helper for rendering SMILES and Mermaid in preview mode without themes JS (since preview doesn't use the menu)
const RENDER_JS = `
(function() {
    var applyVersion = 0;
    function renderSmiles(requestId) {
        if (typeof SmilesDrawer === 'undefined') return;
        Array.prototype.slice.call(document.querySelectorAll('canvas[data-smiles]')).forEach(function (canvas, i) {
        if (requestId !== applyVersion) return;
        var smiles = canvas.getAttribute('data-smiles');
        if (!smiles) return;
        var freshCanvas = canvas.cloneNode(false);
        freshCanvas.width = canvas.width;
        freshCanvas.height = canvas.height;
        if (canvas.id) {
            freshCanvas.id = canvas.id;
        } else {
            freshCanvas.id = 'smiles-canvas-' + i;
        }
        canvas.replaceWith(freshCanvas);
        var drawer = new SmilesDrawer.Drawer({ width: freshCanvas.width, height: freshCanvas.height });
        SmilesDrawer.parse(smiles, function (tree) {
            if (requestId !== applyVersion || !freshCanvas.isConnected) return;
            var isDark = document.documentElement.getAttribute('data-ui-scheme') === 'dark';
            drawer.draw(tree, freshCanvas, isDark ? 'dark' : 'light', false);
        }, function (err) {
            console.error('SMILES parse error:', err);
        });
        });
    }

    async function renderMermaids(requestId) {
        if (typeof mermaid === 'undefined') return;
        var isDark = document.documentElement.getAttribute('data-ui-scheme') === 'dark';
        mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });
        var mermaidNodes = Array.prototype.slice.call(document.querySelectorAll('.mermaid'));
        for (var i = 0; i < mermaidNodes.length; i += 1) {
            if (requestId !== applyVersion) return;
            var node = mermaidNodes[i];

            if (!node.hasAttribute('data-source')) {
                node.setAttribute('data-source', (node.textContent || '').trim());
            }

            var source = node.getAttribute('data-source') || '';
            if (!source.trim()) continue;
            try {
                var result = await mermaid.render('mermaid-preview-' + i + '-' + Date.now(), source);
                if (requestId !== applyVersion) return;
                node.innerHTML = result.svg;
                if (typeof result.bindFunctions === 'function') {
                    result.bindFunctions(node);
                }
            } catch (err) {
                console.error('Mermaid render error:', err);
            }
        }
    }

    function runRender() {
        applyVersion++;
        var v = applyVersion;
        renderMermaids(v).then(function() { renderSmiles(v); });
    }
    window._orzRenderInit = runRender;
    runRender();
})();
`;

// Handles postMessage({ type: 'update', html }) from the extension host,
// patching the content in-place so the scroll position is preserved.
const MESSAGE_HANDLER_JS = `
(function() {
    window.addEventListener('message', function(event) {
        var msg = event.data;
        if (msg.type !== 'update') { return; }
        var scrollY = window.scrollY;
        var body = document.querySelector('.markdown-body');
        if (!body) { return; }
        body.innerHTML = msg.html;
        if (typeof hljs !== 'undefined') {
            body.querySelectorAll('pre code').forEach(function(b) { hljs.highlightElement(b); });
        }
        if (typeof window._orzTabsInit === 'function') { window._orzTabsInit(); }
        if (typeof window._orzRenderInit === 'function') { window._orzRenderInit(); }
        window.scrollTo(0, scrollY);
    });
})();
`;

/** Renders markdown to an HTML fragment (no outer page shell). Used for incremental preview updates. */
export function renderMarkdownHtml(markdown: string, filePath?: string): string {
    const env = filePath ? { markdownBasePath: path.dirname(filePath) } : {};
    try {
        return md.render(markdown, env);
    } catch (e) {
        return `<div style="color:red;padding:10px">Render error: ${e}</div>`;
    }
}

export function renderForPreview(
    markdown: string,
    themeManager: ThemeManager,
    vendorBaseUri: string,
    filePath?: string
): string {
    const theme = themeManager.activeTheme;
    const fontScale = themeManager.fontScale;
    const css = themeManager.loadThemeCss();
    const mdHtml = renderMarkdownHtml(markdown, filePath);

    return `<!DOCTYPE html>
<html lang="en" data-ui-scheme="${theme.colorScheme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview</title>
    <link rel="stylesheet" href="${vendorBaseUri}/katex/katex.min.css">
    <link rel="stylesheet" href="${vendorBaseUri}/highlight/${theme.colorScheme === 'dark' ? 'atom-one-dark.min.css' : 'github.min.css'}">
    <style id="${theme.styleId}">
${css}
    </style>
    <style>
        :root { --font-scale: ${fontScale}; }
        html, body { background: ${theme.previewBg}; }
    </style>
</head>
<body>
    <article class="markdown-body" style="font-size: calc(1em * var(--font-scale, 1));">
${mdHtml}
    </article>
    <script src="${vendorBaseUri}/highlight/highlight.min.js"></script>
    <script>if (typeof hljs !== 'undefined') hljs.highlightAll();</script>
    <script src="${vendorBaseUri}/mermaid/mermaid.min.js"></script>
    <script src="${vendorBaseUri}/smiles-drawer/smiles-drawer.min.js"></script>
    <script>${TABS_JS}</script>
    <script>${RENDER_JS}</script>
    <script>${MESSAGE_HANDLER_JS}</script>
    <script>(function(){try{var a=acquireVsCodeApi();a.setState({realPath:${JSON.stringify(filePath ?? '')}});}catch(e){}})();</script>
</body>
</html>`;
}

export function renderForOutput(
    markdown: string,
    themeManager: ThemeManager,
    filePath?: string
): string {
    const theme = themeManager.activeTheme;
    const css = themeManager.loadThemeCss();

    const env = filePath ? { markdownBasePath: path.dirname(filePath) } : {};
    let mdHtml = '';
    try {
        mdHtml = md.render(markdown, env);
    } catch (e) {
        mdHtml = `<div style="color: red;">Markdown Render Error</div>`;
    }

    let finalHtml = `<!DOCTYPE html>
<html lang="en" data-ui-scheme="${theme.colorScheme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="orz-md-theme-index" content="${themeManager.activeThemeIndex}">
    <title>Document</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.35/dist/katex.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${theme.colorScheme === 'dark' ? 'atom-one-dark.min.css' : 'github.min.css'}">
    <style id="${theme.styleId}">
${css}
    </style>
</head>
<body>
    <article class="markdown-body">
${mdHtml}
    </article>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
    <script>if (typeof hljs !== 'undefined') hljs.highlightAll();</script>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
    <script src="https://unpkg.com/smiles-drawer@1.0.10/dist/smiles-drawer.min.js"></script>
    <script>${TABS_JS}</script>
    <script>${RENDER_JS}</script>
</body>
</html>`;

    // Embed the markdown source block into the valid HTML document
    return embedMarkdown(finalHtml, markdown);
}
