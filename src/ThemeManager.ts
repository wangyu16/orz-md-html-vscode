import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export type ThemeDefinition = {
    styleId: string;
    name: string;
    file: string;             // CSS filename relative to themes/ in orz-markdown package
    colorScheme: 'dark' | 'light';
    mermaidTheme: 'dark' | 'default';
    smilesTheme: 'dark' | 'light';
    previewBg: string;        // Background color for VS Code webview preview
};

export const THEMES: ThemeDefinition[] = [
    { styleId: 'theme-1',  name: 'Dark Elegant I',   file: 'dark-elegant-1.css',  colorScheme: 'dark',  mermaidTheme: 'dark',    smilesTheme: 'dark',  previewBg: '#0d0f18' },
    { styleId: 'theme-2',  name: 'Dark Elegant II',  file: 'dark-elegant-2.css',  colorScheme: 'dark',  mermaidTheme: 'dark',    smilesTheme: 'dark',  previewBg: '#071018' },
    { styleId: 'theme-3',  name: 'Light Neat I',     file: 'light-neat-1.css',    colorScheme: 'light', mermaidTheme: 'default', smilesTheme: 'light', previewBg: '#edf4fa' },
    { styleId: 'theme-4',  name: 'Light Neat II',    file: 'light-neat-2.css',    colorScheme: 'light', mermaidTheme: 'default', smilesTheme: 'light', previewBg: '#f7f7f2' },
    { styleId: 'theme-5',  name: 'Beige Decent I',   file: 'beige-decent-1.css',  colorScheme: 'light', mermaidTheme: 'default', smilesTheme: 'light', previewBg: '#f4ecdf' },
    { styleId: 'theme-6',  name: 'Beige Decent II',  file: 'beige-decent-2.css',  colorScheme: 'light', mermaidTheme: 'default', smilesTheme: 'light', previewBg: '#eee6d8' },
    { styleId: 'theme-7',  name: 'Light Academic I', file: 'light-academic-1.css',colorScheme: 'light', mermaidTheme: 'default', smilesTheme: 'light', previewBg: '#fffff8' },
    { styleId: 'theme-8',  name: 'Light Academic II',file: 'light-academic-2.css',colorScheme: 'light', mermaidTheme: 'default', smilesTheme: 'light', previewBg: '#ffffff' },
    { styleId: 'theme-9',  name: 'Light Playful I',  file: 'light-playful-1.css', colorScheme: 'light', mermaidTheme: 'default', smilesTheme: 'light', previewBg: '#fcf9f2' },
    { styleId: 'theme-10', name: 'Light Playful II', file: 'light-playful-2.css', colorScheme: 'light', mermaidTheme: 'default', smilesTheme: 'light', previewBg: '#ffffff' },
];

export function getTheme(index: number): ThemeDefinition {
    return THEMES[Math.max(0, Math.min(index, THEMES.length - 1))];
}

export class ThemeManager {
    private readonly _onThemeChanged = new vscode.EventEmitter<ThemeDefinition>();
    public readonly onThemeChanged = this._onThemeChanged.event;

    private readonly _onFontScaleChanged = new vscode.EventEmitter<number>();
    public readonly onFontScaleChanged = this._onFontScaleChanged.event;

    private _activeThemeIndex: number;
    private _fontScale: number;

    constructor(private readonly ctx: vscode.ExtensionContext) {
        this._activeThemeIndex = ctx.workspaceState.get<number>('orz-md.themeIndex', 0);
        this._fontScale = ctx.workspaceState.get<number>('orz-md.fontScale', 1.0);
    }

    get activeThemeIndex(): number { return this._activeThemeIndex; }
    get activeTheme(): ThemeDefinition { return getTheme(this._activeThemeIndex); }
    get fontScale(): number { return this._fontScale; }

    setTheme(index: number) {
        if (index !== this._activeThemeIndex && index >= 0 && index < THEMES.length) {
            this._activeThemeIndex = index;
            this.ctx.workspaceState.update('orz-md.themeIndex', index);
            this._onThemeChanged.fire(this.activeTheme);
        }
    }

    setFontScale(scale: number) {
        const _scale = Math.max(0.5, Math.min(scale, 3.0));
        if (_scale !== this._fontScale) {
            this._fontScale = _scale;
            this.ctx.workspaceState.update('orz-md.fontScale', this._fontScale);
            this._onFontScaleChanged.fire(this._fontScale);
        }
    }

    loadThemeCss(): string {
        try {
            const themePath = path.join(this.ctx.extensionPath, 'out', 'themes', this.activeTheme.file);
            return fs.readFileSync(themePath, 'utf-8');
        } catch (e) {
            console.error('Failed to load theme CSS', e);
            return '/* theme load error */';
        }
    }
}
