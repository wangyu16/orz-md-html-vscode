import * as vscode from 'vscode';
import * as fs from 'fs';
import { ThemeManager } from './ThemeManager';
import { extractMarkdown, embedMarkdown, extractThemeIndex } from './util/mdHtmlFormat';
import { renderForOutput } from './Renderer';

export class MdHtmlFs implements vscode.FileSystemProvider {
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    constructor(private readonly themeManager: ThemeManager) { }

    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        const realPath = uri.fsPath;
        const watcher = fs.watch(realPath, (event, filename) => {
            if (event === 'change') {
                this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
            } else if (event === 'rename') {
                if (fs.existsSync(realPath)) {
                    this._emitter.fire([{ type: vscode.FileChangeType.Created, uri }]);
                } else {
                    this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
                }
            }
        });
        return new vscode.Disposable(() => watcher.close());
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        const realPath = uri.fsPath;
        try {
            const stat = fs.statSync(realPath);
            return {
                type: vscode.FileType.File,
                ctime: stat.ctimeMs,
                mtime: stat.mtimeMs,
                size: stat.size
            };
        } catch {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
        throw vscode.FileSystemError.NoPermissions();
    }

    createDirectory(uri: vscode.Uri): void {
        throw vscode.FileSystemError.NoPermissions();
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const realPath = uri.fsPath;

        let content = '';
        try {
            content = fs.readFileSync(realPath, 'utf8');
        } catch {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        // Auto-initialize: empty or whitespace file
        if (!content.trim()) {
            const skeletonHtml = await renderForOutput('', this.themeManager, realPath);
            fs.writeFileSync(realPath, skeletonHtml, 'utf8');
            return new Uint8Array(0); // empty markdown buffer
        }

        const mdSource = extractMarkdown(content);

        // Auto-initialize: missing script block
        if (mdSource === null) {
            const fixedHtml = embedMarkdown(content, '');
            fs.writeFileSync(realPath, fixedHtml, 'utf8');
            return new Uint8Array(0);
        }

        return Buffer.from(mdSource, 'utf8');
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): Promise<void> {
        const realPath = uri.fsPath;
        const mdSource = Buffer.from(content).toString('utf8');

        try {
            fs.readFileSync(realPath, 'utf8');
        } catch {
            // New file cases handled primarily by 'new file' command. Render empty stub if need be.
        }

        const html = await renderForOutput(mdSource, this.themeManager, realPath);
        fs.writeFileSync(realPath, html, 'utf8');
        this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    }

    delete(uri: vscode.Uri, options: { recursive: boolean }): void {
        throw vscode.FileSystemError.NoPermissions();
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void {
        throw vscode.FileSystemError.NoPermissions();
    }

    /** Reads the theme index stored in a *.md.html file's meta tag. Returns null if absent. */
    public readThemeIndex(fsPath: string): number | null {
        try {
            const content = fs.readFileSync(fsPath, 'utf8');
            return extractThemeIndex(content);
        } catch {
            return null;
        }
    }
}
