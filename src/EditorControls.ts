import * as vscode from 'vscode';
import { ThemeManager, THEMES } from './ThemeManager';

export class EditorControls {
    private themeStatusBarItem: vscode.StatusBarItem;
    private fontSmallerStatusBarItem: vscode.StatusBarItem;
    private fontLargerStatusBarItem: vscode.StatusBarItem;

    private _disposables: vscode.Disposable[] = [];

    constructor(private readonly themeManager: ThemeManager) {
        this.themeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.themeStatusBarItem.command = 'orz-md.selectTheme';
        this.themeStatusBarItem.tooltip = 'Select Theme';

        this.fontSmallerStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
        this.fontSmallerStatusBarItem.text = 'A-';
        this.fontSmallerStatusBarItem.command = 'orz-md.fontSmaller';
        this.fontSmallerStatusBarItem.tooltip = 'Decrease Font Size';

        this.fontLargerStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
        this.fontLargerStatusBarItem.text = 'A+';
        this.fontLargerStatusBarItem.command = 'orz-md.fontLarger';
        this.fontLargerStatusBarItem.tooltip = 'Increase Font Size';

        this._disposables.push(
            this.themeStatusBarItem,
            this.fontSmallerStatusBarItem,
            this.fontLargerStatusBarItem
        );

        this.updateThemeStatusBar();
        this.themeManager.onThemeChanged(() => this.updateThemeStatusBar());

        vscode.window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor, this, this._disposables);
        this.onDidChangeActiveTextEditor(vscode.window.activeTextEditor);
    }

    private updateThemeStatusBar() {
        this.themeStatusBarItem.text = `$(symbol-color) ${this.themeManager.activeTheme.name}`;
    }

    private onDidChangeActiveTextEditor(editor: vscode.TextEditor | undefined) {
        if (editor && editor.document.uri.scheme === 'mdhtml') {
            this.themeStatusBarItem.show();
            this.fontSmallerStatusBarItem.show();
            this.fontLargerStatusBarItem.show();
        } else {
            this.themeStatusBarItem.hide();
            this.fontSmallerStatusBarItem.hide();
            this.fontLargerStatusBarItem.hide();
        }
    }

    public static registerCommands(ctx: vscode.ExtensionContext, themeManager: ThemeManager) {
        ctx.subscriptions.push(vscode.commands.registerCommand('orz-md.selectTheme', async () => {
            const items: vscode.QuickPickItem[] = THEMES.map((t, index) => ({
                label: `$(symbol-color) ${t.name}`,
                description: t.colorScheme === 'dark' ? 'Dark' : 'Light',
                index
            })) as (vscode.QuickPickItem & { index: number })[];

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a preview theme'
            });

            if (selected) {
                themeManager.setTheme((selected as any).index);
            }
        }));

        ctx.subscriptions.push(vscode.commands.registerCommand('orz-md.fontSmaller', () => {
            themeManager.setFontScale(themeManager.fontScale * 0.9);
        }));

        ctx.subscriptions.push(vscode.commands.registerCommand('orz-md.fontLarger', () => {
            themeManager.setFontScale(themeManager.fontScale * 1.1);
        }));
    }

    public dispose() {
        this._disposables.forEach(d => d.dispose());
    }
}
