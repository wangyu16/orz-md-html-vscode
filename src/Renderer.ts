import * as vscode from 'vscode';
import { ThemeManager } from './ThemeManager';
import { embedMarkdown } from './util/mdHtmlFormat';

const ORZ_MD_PREVIEW_ID = 'yuwang26.orz-md-preview';

type OrzMdPreviewApi = {
    renderMarkdownHtml(markdown: string): string;
};

let _apiPromise: Promise<OrzMdPreviewApi | undefined> | undefined;

function getApi(): Promise<OrzMdPreviewApi | undefined> {
    if (!_apiPromise) {
        _apiPromise = (async () => {
            const ext = vscode.extensions.getExtension<OrzMdPreviewApi>(ORZ_MD_PREVIEW_ID);
            if (!ext) {
                vscode.window.showErrorMessage(
                    `Orz Markdown: The required extension "${ORZ_MD_PREVIEW_ID}" is not installed.`
                );
                return undefined;
            }
            return await ext.activate();
        })();
    }
    return _apiPromise;
}

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

// Converts selected HTML to Markdown on copy, so pasting elsewhere preserves the source format.
// Special cases: KaTeX (annotation element), Mermaid (data-source), SMILES (data-smiles), hljs code blocks.
const COPY_HANDLER_JS = `
(function() {
    function getKatexLatex(el) {
        var ann = el.querySelector('annotation[encoding="application/x-tex"]');
        return ann ? ann.textContent.trim() : null;
    }

    function nodeToMd(node) {
        if (node.nodeType === 3) {
            return node.textContent;
        }
        if (node.nodeType !== 1) { return ''; }

        var tag = node.tagName.toLowerCase();

        // KaTeX display math  (<span class="katex-display">)
        if (tag === 'span' && node.classList.contains('katex-display')) {
            var latex = getKatexLatex(node);
            return latex ? ('\\n$$\\n' + latex + '\\n$$\\n') : '';
        }
        // KaTeX inline math (<span class="katex">)
        if (tag === 'span' && node.classList.contains('katex')) {
            var latex = getKatexLatex(node);
            return latex ? ('$' + latex + '$') : '';
        }
        // Skip internal KaTeX / MathML nodes (already handled above)
        if (tag === 'span' && node.classList.contains('katex-mathml')) { return ''; }
        if (tag === 'span' && node.classList.contains('katex-html')) { return ''; }
        if (tag === 'math') { return ''; }

        // Mermaid diagram: {{mermaid\\n...\\n}} → <div class="mermaid" data-source="...">
        if (node.classList.contains('mermaid')) {
            var src = node.getAttribute('data-source');
            return src ? ('\\n{{mermaid\\n' + src.trim() + '\\n}}\\n') : '';
        }
        // SMILES container div: {{smiles ...}} → <div class="smiles-render"><canvas data-smiles="...">
        if (node.classList.contains('smiles-render')) {
            var c = node.querySelector('canvas[data-smiles]');
            return c ? ('\\n{{smiles ' + c.getAttribute('data-smiles') + '}}\\n') : '';
        }
        // SMILES canvas (direct hit)
        if (tag === 'canvas' && node.getAttribute('data-smiles')) {
            return '\\n{{smiles ' + node.getAttribute('data-smiles') + '}}\\n';
        }
        // YouTube embed: {{youtube VIDEO_ID}} → <div class="youtube-embed"><iframe src="...embed/ID...">
        if (node.classList.contains('youtube-embed')) {
            var ifr = node.querySelector('iframe');
            if (ifr) {
                var ytm = (ifr.getAttribute('src') || '').match(/youtube\\.com\\/embed\\/([^?&\\/]+)/);
                if (ytm) { return '\\n{{youtube ' + ytm[1] + '}}\\n'; }
            }
            return '';
        }
        // QR code: original URL is not stored in the SVG output, suppress garbled content
        if (node.classList.contains('qrcode')) { return ''; }
        // YAML metadata: {{yaml\\ncontent\\n}} → script type="application/yaml" block
        if (tag === 'script' && node.getAttribute('type') === 'application/yaml') {
            return '\\n{{yaml\\n' + node.textContent.trim() + '\\n}}\\n';
        }
        // Spoil container: ::: spoil Title → <details class="spoil"><summary>Title</summary>...
        if (tag === 'details' && node.classList.contains('spoil')) {
            var sum = node.querySelector(':scope > summary');
            var spoilTitle = sum ? sum.textContent.trim() : '';
            var bodyNodes = Array.prototype.slice.call(node.childNodes).filter(function(n) {
                return !(n.tagName && n.tagName.toLowerCase() === 'summary');
            });
            var spoilBody = bodyNodes.map(nodeToMd).join('');
            return '\\n::: spoil ' + spoilTitle + '\\n' + spoilBody.trim() + '\\n:::' + '\\n';
        }

        var children = Array.prototype.slice.call(node.childNodes);
        var inner = children.map(nodeToMd).join('');

        switch (tag) {
            case 'h1': return '\\n# '  + inner.trim() + '\\n';
            case 'h2': return '\\n## ' + inner.trim() + '\\n';
            case 'h3': return '\\n### '+ inner.trim() + '\\n';
            case 'h4': return '\\n#### '+ inner.trim() + '\\n';
            case 'h5': return '\\n##### '+ inner.trim() + '\\n';
            case 'h6': return '\\n###### '+ inner.trim() + '\\n';
            case 'p':  return '\\n' + inner.trim() + '\\n';
            case 'strong': case 'b':  return '**' + inner + '**';
            case 'em':     case 'i':  return '*'  + inner + '*';
            case 's': case 'del':     return '~~' + inner + '~~';
            case 'mark':              return '==' + inner + '==';
            case 'ins':               return '++' + inner + '++';
            case 'sub':               return '~'  + inner + '~';
            case 'sup':               return '^'  + inner + '^';
            case 'br': return '\\n';
            case 'hr': return '\\n---\\n';
            case 'a': {
                var href = node.getAttribute('href') || '';
                return '[' + inner + '](' + href + ')';
            }
            case 'img': {
                var alt = node.getAttribute('alt') || '';
                var src = node.getAttribute('src') || '';
                return '![' + alt + '](' + src + ')';
            }
            case 'code': {
                if (node.closest('pre')) { return node.textContent || ''; }
                return '\`' + inner + '\`';
            }
            case 'pre': {
                var codeEl = node.querySelector('code');
                var lang = '';
                var text = '';
                if (codeEl) {
                    var m = codeEl.className.match(/language-([^\\s]+)/);
                    if (m) { lang = m[1]; }
                    text = codeEl.textContent || '';
                } else {
                    text = node.textContent || '';
                }
                return '\\n\`\`\`' + lang + '\\n' + text + '\\n\`\`\`\\n';
            }
            case 'blockquote': {
                return '\\n' + inner.trim().split('\\n').map(function(l) { return '> ' + l; }).join('\\n') + '\\n';
            }
            case 'ul': return '\\n' + inner + '\\n';
            case 'ol': return '\\n' + inner + '\\n';
            case 'li': {
                var parent = node.parentElement;
                var isOl = parent && parent.tagName.toLowerCase() === 'ol';
                var idx = isOl ? (Array.prototype.indexOf.call(parent.children, node) + 1) : 0;
                var prefix = isOl ? (idx + '. ') : '- ';
                var cb = node.querySelector('input[type="checkbox"]');
                if (cb) { prefix += cb.checked ? '[x] ' : '[ ] '; }
                // Split into non-empty lines; indent nested list lines by 2 spaces.
                var lines = inner.trim().split('\\n').filter(function(l) { return l.trim() !== ''; });
                var first = lines[0] || '';
                var rest  = lines.slice(1).map(function(l) { return '  ' + l; });
                return prefix + [first].concat(rest).join('\\n') + '\\n';
            }
            case 'table': {
                var rows = Array.prototype.slice.call(node.querySelectorAll('tr'));
                if (!rows.length) { return inner; }
                var lines = rows.map(function(row) {
                    var cells = Array.prototype.slice.call(row.querySelectorAll('th,td'));
                    return '| ' + cells.map(function(c) { return c.textContent.trim().replace(/\\|/g, '\\\\|'); }).join(' | ') + ' |';
                });
                var ncols = rows[0].querySelectorAll('th,td').length;
                lines.splice(1, 0, '| ' + Array(ncols).fill('---').join(' | ') + ' |');
                return '\\n' + lines.join('\\n') + '\\n';
            }
            case 'span': {
                // space plugin: {{space N}} → <span style="...width:Nrem"></span> (empty span)
                if (!inner) {
                    var spM = (node.getAttribute('style') || '').match(/width:\\s*([\\d.]+)rem/);
                    if (spM) { return '{{space ' + spM[1] + '}}'; }
                }
                // colored-span plugin: {{span[color] text}} → <span class="color">text</span>
                if (node.classList.length === 1 && node.classList[0].indexOf('-') === -1) {
                    return '{{span[' + node.classList[0] + '] ' + inner + '}}';
                }
                return inner;
            }
            case 'iframe': {
                // YouTube iframe selected directly (without the youtube-embed wrapper)
                var ytm2 = (node.getAttribute('src') || '').match(/youtube\\.com\\/embed\\/([^?&\\/]+)/);
                if (ytm2) { return '\\n{{youtube ' + ytm2[1] + '}}\\n'; }
                return '';
            }
            case 'script': case 'style': return '';
            case 'div': {
                var dcls = node.classList;
                // JS-generated tabs navigation bar — not part of markdown source
                if (dcls.contains('tabs-bar')) { return ''; }
                // Semantic containers
                if (dcls.contains('success') || dcls.contains('info') || dcls.contains('warning') || dcls.contains('danger')) {
                    var scname = ['success','info','warning','danger'].filter(function(n) { return dcls.contains(n); })[0];
                    return '\\n::: ' + scname + '\\n' + inner.trim() + '\\n:::' + '\\n';
                }
                // Layout containers
                if (dcls.contains('left') || dcls.contains('right') || dcls.contains('center')) {
                    var lcname = dcls.contains('left') ? 'left' : dcls.contains('right') ? 'right' : 'center';
                    return '\\n::: ' + lcname + '\\n' + inner.trim() + '\\n:::' + '\\n';
                }
                // Tabs outer: :::: tabs (tab panel children use ::: tab Label)
                if (dcls.contains('tabs')) { return '\\n:::: tabs\\n' + inner.trim() + '\\n::::' + '\\n'; }
                // Single tab panel: ::: tab Label
                if (dcls.contains('tab')) {
                    var tlabel = node.getAttribute('data-label') || '';
                    return '\\n::: tab ' + tlabel + '\\n' + inner.trim() + '\\n:::' + '\\n';
                }
                // Cols outer: :::: cols
                if (dcls.contains('cols')) { return '\\n:::: cols\\n' + inner.trim() + '\\n::::' + '\\n'; }
                // Single col panel: ::: col
                if (dcls.contains('col')) { return '\\n::: col\\n' + inner.trim() + '\\n:::' + '\\n'; }
                return inner;
            }
            default: return inner;
        }
    }

    // Walk up from a node to find the nearest meaningful markdown block or special element.
    // Returns the element itself if it is one, otherwise walks up through parents.
    function findMdAncestor(node) {
        var el = (node.nodeType === 3) ? node.parentElement : node;
        while (el && el !== document.body) {
            var tag = el.tagName ? el.tagName.toLowerCase() : '';
            var cls = el.classList;
            if (cls) {
                if (cls.contains('katex-display')) { return el; }
                if (cls.contains('mermaid'))       { return el; }
                if (cls.contains('smiles-render')) { return el; }
                if (cls.contains('youtube-embed')) { return el; }
                if (cls.contains('qrcode'))        { return el; }
                if (cls.contains('katex')) {
                    // Prefer the outer katex-display wrapper when present
                    var p = el.parentElement;
                    return (p && p.classList && p.classList.contains('katex-display')) ? p : el;
                }
            }
            if (tag === 'canvas' && el.getAttribute('data-smiles')) { return el; }
            // markdown-it-container blocks
            if (tag === 'details' && cls && cls.contains('spoil')) { return el; }
            if (tag === 'div' && cls && (
                cls.contains('success') || cls.contains('info') || cls.contains('warning') || cls.contains('danger') ||
                cls.contains('left') || cls.contains('right') || cls.contains('center') ||
                cls.contains('tabs') || cls.contains('tab') || cls.contains('cols') || cls.contains('col')
            )) { return el; }
            if (['h1','h2','h3','h4','h5','h6','pre','p','blockquote','ul','ol','li','table','hr'].indexOf(tag) >= 0) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }

    // Returns true for block elements whose outer tag carries essential markdown meaning
    // and would be lost if cloneContents() were used on an intra-element selection.
    function isStructuralBlock(el) {
        if (!el) { return false; }
        var tag = el.tagName ? el.tagName.toLowerCase() : '';
        var cls = el.classList;
        if (cls && (cls.contains('katex') || cls.contains('katex-display') || cls.contains('mermaid') ||
                    cls.contains('smiles-render') || cls.contains('youtube-embed') ||
                    cls.contains('qrcode'))) { return true; }
        if (tag === 'canvas' && el.getAttribute('data-smiles')) { return true; }
        if (tag === 'details' && cls && cls.contains('spoil')) { return true; }
        if (tag === 'div' && cls && (
            cls.contains('success') || cls.contains('info') || cls.contains('warning') || cls.contains('danger') ||
            cls.contains('left') || cls.contains('right') || cls.contains('center') ||
            cls.contains('tabs') || cls.contains('tab') || cls.contains('cols') || cls.contains('col')
        )) { return true; }
        return ['h1','h2','h3','h4','h5','h6','pre','table','li'].indexOf(tag) >= 0;
    }

    document.addEventListener('copy', function(e) {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed) { return; }
        try {
            var range = sel.getRangeAt(0);
            var cac   = range.commonAncestorContainer;
            var wrapper = document.createElement('div');

            // Always check whether the common ancestor sits inside a structural block
            // (heading, pre, katex, mermaid, …). When it does, the outer tag carries the
            // markdown meaning and cloneContents() would strip it, so clone the whole element.
            // findMdAncestor handles both text nodes and element nodes.
            var block = findMdAncestor(cac);
            if (isStructuralBlock(block)) {
                if (block.tagName && block.tagName.toLowerCase() === 'li') {
                    // Cloning a li out of its parent loses the ul/ol context that nodeToMd needs.
                    // Re-wrap it in the correct list type so isOl detection works.
                    var listType = (block.parentElement && block.parentElement.tagName.toLowerCase() === 'ol') ? 'ol' : 'ul';
                    var listWrap = document.createElement(listType);
                    listWrap.appendChild(block.cloneNode(true));
                    wrapper.appendChild(listWrap);
                } else {
                    wrapper.appendChild(block.cloneNode(true));
                }
            } else {
                // Multi-block or plain-paragraph selection — cloneContents() preserves inline
                // wrappers (strong/em/…) and block tags when the cac is their parent.
                wrapper.appendChild(range.cloneContents());
            }

            var md = nodeToMd(wrapper).replace(/\\n{3,}/g, '\\n\\n').trim();
            if (md) {
                e.preventDefault();
                e.clipboardData.setData('text/plain', md);
            }
        } catch (err) {
            // fall back to default browser copy
        }
    });
})();
`;
export async function renderMarkdownHtml(markdown: string): Promise<string> {
    const api = await getApi();
    if (!api) {
        return `<div style="color:red;padding:10px">Render error: orz-md-preview extension not available</div>`;
    }
    try {
        return api.renderMarkdownHtml(markdown);
    } catch (e) {
        return `<div style="color:red;padding:10px">Render error: ${e}</div>`;
    }
}

export async function renderForPreview(
    markdown: string,
    themeManager: ThemeManager,
    vendorBaseUri: string,
    filePath?: string
): Promise<string> {
    const theme = themeManager.activeTheme;
    const fontScale = themeManager.fontScale;
    const css = themeManager.loadThemeCss();
    const mdHtml = await renderMarkdownHtml(markdown);

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

export async function renderForOutput(
    markdown: string,
    themeManager: ThemeManager,
    filePath?: string
): Promise<string> {
    const theme = themeManager.activeTheme;
    const css = themeManager.loadThemeCss();

    let mdHtml = '';
    const api = await getApi();
    if (!api) {
        mdHtml = `<div style="color: red;">Markdown Render Error: orz-md-preview extension not available</div>`;
    } else {
        try {
            mdHtml = api.renderMarkdownHtml(markdown);
        } catch (e) {
            mdHtml = `<div style="color: red;">Markdown Render Error</div>`;
        }
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
    <link rel="stylesheet" href="custom.css">
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
    <script>${COPY_HANDLER_JS}</script>
</body>
</html>`;

    // Embed the markdown source block into the valid HTML document
    return embedMarkdown(finalHtml, markdown);
}
