import * as vscode from 'vscode';
import { PreviewPanel } from './PreviewPanel';
import { ThemeManager } from './ThemeManager';
import { MdHtmlFs } from './MdHtmlFs';

type Session = {
    realPath: string;
    virtualUri: vscode.Uri;
    previewPanel: PreviewPanel | null;
    themeIndex: number;
    /** Subscription for text-document changes — feeds updates into the preview panel. */
    docChangeSub: vscode.Disposable | null;
};

export class SessionManager {
    private readonly sessions = new Map<string, Session>();
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private readonly ctx: vscode.ExtensionContext,
        private readonly themeManager: ThemeManager,
        private readonly mdHtmlFs: MdHtmlFs
    ) {
        // Session lifetime is tied to the text document, NOT to the preview panel
        vscode.workspace.onDidCloseTextDocument((doc) => {
            if (doc.uri.scheme === 'mdhtml') {
                this._closeSession(doc.uri.fsPath);
            }
        }, null, this._disposables);

        // When the active editor switches to a different mdhtml file, restore its saved theme
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (!editor || editor.document.uri.scheme !== 'mdhtml') { return; }
            const session = this.getSession(editor.document.uri.fsPath);
            if (session) {
                this.themeManager.setTheme(session.themeIndex);
            }
        }, null, this._disposables);

        // Track theme changes made by the user so the active session stays in sync
        this.themeManager.onThemeChanged(() => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.uri.scheme !== 'mdhtml') { return; }
            const session = this.getSession(editor.document.uri.fsPath);
            if (session) {
                session.themeIndex = this.themeManager.activeThemeIndex;
            }
        }, null, this._disposables);
    }

    private _deriveVirtualUri(realUri: vscode.Uri): vscode.Uri {
        return vscode.Uri.parse(`mdhtml:${realUri.fsPath}`);
    }

    public getSession(realPath: string): Session | undefined {
        return this.sessions.get(realPath);
    }

    /** Attaches a preview panel to a session and wires its dispose callback.
     *  When the panel is closed by the user, the session stays alive so the editor tab remains. */
    private _attachPreview(session: Session, previewPanel: PreviewPanel) {
        session.previewPanel = previewPanel;
        previewPanel.onDidDispose(() => {
            session.previewPanel = null;
            // Do NOT close the session — the text-document is still open in the editor
        });
    }

    /** Subscribes to text-document changes and feeds updates into whatever preview panel is live.
     *  Stored per-session so it can be disposed when the session closes. */
    private _attachDocChangeSub(session: Session) {
        session.docChangeSub?.dispose();
        session.docChangeSub = vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.toString() === session.virtualUri.toString()) {
                session.previewPanel?.update(e.document.getText());
            }
        });
    }

    /** Open (or bring to front) the editor + preview for a real .md.html file. */
    public async open(realUri: vscode.Uri) {
        const existing = this.getSession(realUri.fsPath);
        if (existing) {
            // Bring text editor to front
            vscode.window.showTextDocument(existing.virtualUri, { viewColumn: vscode.ViewColumn.One, preview: false });
            // Reopen preview if the user had closed it
            if (!existing.previewPanel) {
                await this.reopenPreview(realUri.fsPath);
            }
            return;
        }

        const virtualUri = this._deriveVirtualUri(realUri);

        try {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor'); // close the raw editor
            await vscode.window.showTextDocument(virtualUri, { viewColumn: vscode.ViewColumn.One, preview: false });
        } catch (err) {
            console.error(err);
        }

        const previewPanel = new PreviewPanel(this.ctx, realUri.fsPath, this.themeManager);

        // Restore the theme that was last saved with this file
        const storedThemeIndex = this.mdHtmlFs.readThemeIndex(realUri.fsPath);
        if (storedThemeIndex !== null) {
            this.themeManager.setTheme(storedThemeIndex);
        }
        const themeIndex = this.themeManager.activeThemeIndex;

        const session: Session = { realPath: realUri.fsPath, virtualUri, previewPanel: null, themeIndex, docChangeSub: null };
        this.sessions.set(realUri.fsPath, session);
        this._attachPreview(session, previewPanel);
        this._attachDocChangeSub(session);

        // Initial render
        const textDoc = await vscode.workspace.openTextDocument(virtualUri);
        previewPanel.update(textDoc.getText());
    }

    /** Recreate a preview panel for a session whose panel was previously closed. */
    public async reopenPreview(realPath: string) {
        const session = this.getSession(realPath);
        if (!session || session.previewPanel) { return; }

        const previewPanel = new PreviewPanel(this.ctx, realPath, this.themeManager);
        this._attachPreview(session, previewPanel);

        try {
            const textDoc = await vscode.workspace.openTextDocument(session.virtualUri);
            previewPanel.update(textDoc.getText());
        } catch (e) {
            console.error('Failed to reopen preview', e);
        }
    }

    /** Called when an mdhtml: document is already open (e.g. VS Code restart recovery)
     *  and there is no serialized preview panel to restore. Creates a fresh preview. */
    public async openFromExistingDoc(doc: vscode.TextDocument) {
        const realPath = doc.uri.fsPath;
        if (this.sessions.has(realPath)) { return; }

        const virtualUri = doc.uri;
        const previewPanel = new PreviewPanel(this.ctx, realPath, this.themeManager);

        const storedThemeIndex = this.mdHtmlFs.readThemeIndex(realPath);
        if (storedThemeIndex !== null) {
            this.themeManager.setTheme(storedThemeIndex);
        }
        const themeIndex = this.themeManager.activeThemeIndex;

        const session: Session = { realPath, virtualUri, previewPanel: null, themeIndex, docChangeSub: null };
        this.sessions.set(realPath, session);
        this._attachPreview(session, previewPanel);
        this._attachDocChangeSub(session);

        previewPanel.update(doc.getText());
    }

    /** Called by the webview panel serializer to restore a preview panel across VS Code restarts. */
    public async restoreFromPanel(panel: vscode.WebviewPanel, realPath: string) {
        if (this.sessions.has(realPath)) {
            // openFromExistingDoc already created a session — discard the stale serialized panel
            panel.dispose();
            return;
        }

        const virtualUri = this._deriveVirtualUri(vscode.Uri.file(realPath));
        const previewPanel = new PreviewPanel(this.ctx, realPath, this.themeManager, panel);

        // Restore the theme that was last saved with this file
        const storedThemeIndex = this.mdHtmlFs.readThemeIndex(realPath);
        if (storedThemeIndex !== null) {
            this.themeManager.setTheme(storedThemeIndex);
        }
        const themeIndex = this.themeManager.activeThemeIndex;

        const session: Session = { realPath, virtualUri, previewPanel: null, themeIndex, docChangeSub: null };
        this.sessions.set(realPath, session);
        this._attachPreview(session, previewPanel);
        this._attachDocChangeSub(session);

        try {
            const textDoc = await vscode.workspace.openTextDocument(virtualUri);
            previewPanel.update(textDoc.getText());
            await vscode.window.showTextDocument(textDoc, { viewColumn: vscode.ViewColumn.One, preview: false });
        } catch (e) {
            console.error('Failed to restore doc', e);
        }
    }

    private _closeSession(realPath: string) {
        const session = this.sessions.get(realPath);
        if (session) {
            this.sessions.delete(realPath);
            session.docChangeSub?.dispose();
            try {
                session.previewPanel?.dispose();
            } catch {
                // Ignore if already disposed
            }
        }
    }

    public close(realPath: string) {
        this._closeSession(realPath);
    }

    public dispose() {
        for (const session of [...this.sessions.values()]) {
            this._closeSession(session.realPath);
        }
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
    }
}

