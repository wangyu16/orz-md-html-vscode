import * as vscode from 'vscode';
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
            this._panel = vscode.window.createWebviewPanel(
                PreviewPanel.viewType,
                'orz-md Preview',
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [vscode.Uri.file(ctx.extensionPath)]
                }
            );
        }

        this._panel.title = `Preview ${vscode.Uri.file(realPath).fsPath.split(/[\\/]/).pop()}`;

        // Persist real path to state for view restore
        this._panel.webview.html = this._getHtmlForWebview('');

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

    private _getHtmlForWebview(markdown: string) {
        return renderForPreview(markdown, this.themeManager, this._vendorBaseUri(), this.realPath);
    }

    private _updateDebounced = debounce((markdown: string) => {
        this._lastKnownMarkdown = markdown;
        const themeStyleId = this.themeManager.activeTheme.styleId;
        const fontScale = this.themeManager.fontScale;
        if (themeStyleId !== this._lastThemeStyleId || fontScale !== this._lastFontScale) {
            // Theme or font scale changed — full reload required to update embedded CSS
            this._lastThemeStyleId = themeStyleId;
            this._lastFontScale = fontScale;
            this._panel.webview.html = this._getHtmlForWebview(markdown);
        } else {
            // Content-only change — patch the DOM via postMessage to preserve scroll position
            const html = renderMarkdownHtml(markdown, this.realPath);
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
