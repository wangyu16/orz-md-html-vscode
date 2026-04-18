import * as vscode from 'vscode';
import * as path from 'path';
import { ThemeManager } from './ThemeManager';
import { renderForPreview, renderMarkdownHtml } from './Renderer';
import { debounce } from './util/debounce';

export class PreviewPanel {
    static readonly viewType = 'orz-md-preview';
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private readonly ctx: vscode.ExtensionContext,
        public readonly realPath: string,
        private readonly themeManager: ThemeManager,
        existingPanel?: vscode.WebviewPanel
    ) {
        if (existingPanel) {
            this._panel = existingPanel;
        } else {
            const docFolder = vscode.Uri.file(path.dirname(realPath));
            const roots: vscode.Uri[] = [vscode.Uri.file(ctx.extensionPath), docFolder];
            for (const wf of vscode.workspace.workspaceFolders ?? []) {
                roots.push(wf.uri);
            }
            this._panel = vscode.window.createWebviewPanel(
                PreviewPanel.viewType,
                'orz-md Preview',
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: roots
                }
            );
        }

        this._panel.title = `Preview ${vscode.Uri.file(realPath).fsPath.split(/[\\/]/).pop()}`;

        // Persist real path to state for view restore
        this._getHtmlForWebview('').then(html => { this._panel.webview.html = html; });

        // Wire Theme and font scale changes — both trigger a full re-render
        this.themeManager.onThemeChanged(() => this.update(this._lastKnownMarkdown));
        this.themeManager.onFontScaleChanged(() => this.update(this._lastKnownMarkdown));

        // When webview is explicitly destroyed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    private _lastKnownMarkdown = '';
    private _lastThemeStyleId = '';
    private _lastFontScale = -1;

    private _vendorBaseUri(): string {
        return this._panel.webview.asWebviewUri(vscode.Uri.file(this.ctx.extensionPath + '/media/vendor')).toString();
    }

    private _toWebviewUri(src: string): string {
        if (!src || /^(https?:|data:|vscode-webview:|#)/.test(src)) { return src; }
        try {
            const base = path.dirname(this.realPath);
            const abs = path.isAbsolute(src) ? src : path.join(base, src);
            return this._panel.webview.asWebviewUri(vscode.Uri.file(abs)).toString();
        } catch { return src; }
    }

    private async _getHtmlForWebview(markdown: string): Promise<string> {
        return renderForPreview(markdown, this.themeManager, this._vendorBaseUri(), this.realPath,
            src => this._toWebviewUri(src));
    }

    private _updateDebounced = debounce(async (markdown: string) => {
        this._lastKnownMarkdown = markdown;
        const themeStyleId = this.themeManager.activeTheme.styleId;
        const fontScale = this.themeManager.fontScale;
        if (themeStyleId !== this._lastThemeStyleId || fontScale !== this._lastFontScale) {
            // Theme or font scale changed — full reload required to update embedded CSS
            this._lastThemeStyleId = themeStyleId;
            this._lastFontScale = fontScale;
            this._panel.webview.html = await this._getHtmlForWebview(markdown);
        } else {
            // Content-only change — patch the DOM via postMessage to preserve scroll position
            let html = await renderMarkdownHtml(markdown);
            html = html.replace(/(<img\b[^>]*?\bsrc=")([^"]*?)(")/gi,
                (_, pre, src, post) => pre + this._toWebviewUri(src) + post);
            this._panel.webview.postMessage({ type: 'update', html });
        }
    }, 400);

    public update(markdown: string) {
        this._updateDebounced(markdown);
    }

    public onDidDispose(callback: () => void) {
        this._panel.onDidDispose(callback);
    }

    public dispose() {
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
