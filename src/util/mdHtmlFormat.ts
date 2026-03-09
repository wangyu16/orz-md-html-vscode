/** Extracts the raw markdown from a *.md.html file's embedded script block.
 *  Returns null if the block is not found (file may not yet be initialized). */
export function extractMarkdown(htmlContent: string): string | null {
    const regex = /<script\s+type="text\/markdown"\s+id="md-source">([\s\S]*?)<\/script>/;
    const match = regex.exec(htmlContent);
    if (match) {
        return match[1].replace(/<\\\/script>/g, '</script>').trim();
    }
    return null;
}

/** Extracts the saved theme index from the orz-md-theme-index meta tag.
 *  Returns null if the tag is absent (e.g. file was not yet saved by this extension). */
export function extractThemeIndex(htmlContent: string): number | null {
    const match = /<meta\s+name="orz-md-theme-index"\s+content="(\d+)"/.exec(htmlContent);
    if (!match) { return null; }
    const idx = parseInt(match[1], 10);
    return isNaN(idx) ? null : idx;
}

/** Replaces (or inserts) the embedded markdown block in a full HTML string. */
export function embedMarkdown(htmlContent: string, markdown: string): string {
    const safeMarkdown = markdown.replace(/<\/script>/g, '<\\/script>');
    const block = `\n  <script type="text/markdown" id="md-source">\n${safeMarkdown}\n  </script>\n`;
    const regex = /<script\s+type="text\/markdown"\s+id="md-source">[\s\S]*?<\/script>/;

    if (regex.test(htmlContent)) {
        return htmlContent.replace(regex, block.trim());
    }

    const bodyEndIndex = htmlContent.lastIndexOf('</body>');
    if (bodyEndIndex !== -1) {
        return htmlContent.slice(0, bodyEndIndex) + block + htmlContent.slice(bodyEndIndex);
    }

    return htmlContent + block;
}
