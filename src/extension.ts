import * as vscode from 'vscode';
import { ThemeManager } from './ThemeManager';
import { EditorControls } from './EditorControls';
import { MdHtmlFs } from './MdHtmlFs';
import { SessionManager } from './SessionManager';
import { PreviewPanel } from './PreviewPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('orz-md-vscode activated');

    const themeManager = new ThemeManager(context);
    const editorControls = new EditorControls(themeManager);
    context.subscriptions.push(editorControls);

    const mdHtmlFs = new MdHtmlFs(themeManager);
    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider('mdhtml', mdHtmlFs, {
            isCaseSensitive: true,
            isReadonly: false
        })
    );

    const sessionManager = new SessionManager(context, themeManager, mdHtmlFs);
    context.subscriptions.push({ dispose: () => sessionManager.dispose() });

    // Handle initial interception to reroute standard vs code HTML file opening to virtual split editing
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(async (doc) => {
        if (!doc.fileName.endsWith('.md.html')) return;

        if (doc.uri.scheme === 'mdhtml') {
            // VS Code restart: virtual doc restored from saved editor state with no session yet.
            // Give deserializeWebviewPanel a tick to run first; if it doesn't create a session,
            // open a fresh preview panel for this document.
            if (!sessionManager.getSession(doc.uri.fsPath)) {
                setTimeout(() => {
                    if (!sessionManager.getSession(doc.uri.fsPath)) {
                        sessionManager.openFromExistingDoc(doc);
                    }
                }, 300);
            }
            return;
        }

        // Ensure we bypass if opened inside extension's media dir
        if (doc.uri.fsPath.includes('media/vendor')) return;

        // Close HTML viewer right away, bring open our virtual URI system instead
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await sessionManager.open(doc.uri);
    }));

    // Panel serialize logic for VS Code restarts
    vscode.window.registerWebviewPanelSerializer(PreviewPanel.viewType, {
        async deserializeWebviewPanel(panel, state) {
            const realPath: string | undefined = state?.realPath;
            if (!realPath) {
                panel.dispose();
                return;
            }

            try {
                // Determine existence via Fs layer before restore
                mdHtmlFs.stat(vscode.Uri.file(realPath));
            } catch {
                panel.dispose();
                return;
            }

            sessionManager.restoreFromPanel(panel, realPath);
        }
    });

    EditorControls.registerCommands(context, themeManager);

    context.subscriptions.push(vscode.commands.registerCommand('orz-md.openPreview', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'mdhtml') { return; }
        await sessionManager.reopenPreview(editor.document.uri.fsPath);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('orz-md.newFile', async () => {
        const uri = await vscode.window.showSaveDialog({
            filters: { 'Orz Markdown': ['md.html'] },
            saveLabel: 'Create File'
        });

        if (uri) {
            try {
                const finalUri = uri.fsPath.endsWith('.md.html')
                    ? uri
                    : uri.with({ path: uri.path + '.md.html' });

                // Ensure empty existence and write
                const buf = new Uint8Array(0);
                await vscode.workspace.fs.writeFile(finalUri, buf);

                // Then open virtual workspace matching that uri
                await sessionManager.open(finalUri);
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to create new file: ${err}`);
            }
        }
    }));
}

export function deactivate() { }
