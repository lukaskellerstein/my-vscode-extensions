"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode_1 = require("vscode");
const CONFIG_SECTION = "nestedRepoHighlighter";
const CONFIG_COLOR_KEY = "color";
const DEFAULT_COLOR_ID = "charts.blue";
class NestedRepoDecorationProvider {
    constructor() {
        this._onDidChangeFileDecorations = new vscode_1.EventEmitter();
        this.onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;
        this.decorated = new Set();
        this.checked = new Set();
    }
    dispose() {
        this._onDidChangeFileDecorations.dispose();
    }
    provideFileDecoration(uri, _token) {
        if (uri.scheme !== "file") {
            return undefined;
        }
        if (this.decorated.has(uri.fsPath)) {
            return {
                badge: "⎇",
                tooltip: "Nested git repository",
                color: new vscode_1.ThemeColor(getConfiguredColorId()),
                propagate: false,
            };
        }
        if (this.isDirectChildOfWorkspaceRoot(uri) && !this.checked.has(uri.fsPath)) {
            this.checked.add(uri.fsPath);
            void this.checkSingle(uri);
        }
        return undefined;
    }
    async refresh() {
        this.checked.clear();
        const next = new Set();
        const roots = vscode_1.workspace.workspaceFolders ?? [];
        for (const folder of roots) {
            const children = await scanWorkspaceRoot(folder.uri);
            for (const child of children) {
                next.add(child.fsPath);
                this.checked.add(child.fsPath);
            }
        }
        this.decorated = next;
        this._onDidChangeFileDecorations.fire(undefined);
    }
    fireAll() {
        this._onDidChangeFileDecorations.fire(undefined);
    }
    isDirectChildOfWorkspaceRoot(uri) {
        const roots = vscode_1.workspace.workspaceFolders ?? [];
        for (const folder of roots) {
            if (folder.uri.scheme !== "file")
                continue;
            const rootPath = folder.uri.fsPath.replace(/[\\/]+$/, "");
            const childPath = uri.fsPath;
            if (!childPath.startsWith(rootPath))
                continue;
            const rest = childPath.slice(rootPath.length);
            if (rest.length < 2)
                continue;
            const trimmed = rest.replace(/^[\\/]+/, "");
            if (trimmed.length === 0)
                continue;
            if (!trimmed.includes("/") && !trimmed.includes("\\")) {
                return true;
            }
        }
        return false;
    }
    async checkSingle(uri) {
        try {
            const stat = await vscode_1.workspace.fs.stat(uri);
            if (!(stat.type & vscode_1.FileType.Directory))
                return;
        }
        catch {
            return;
        }
        const gitPath = vscode_1.Uri.joinPath(uri, ".git");
        try {
            await vscode_1.workspace.fs.stat(gitPath);
        }
        catch {
            return;
        }
        if (!this.decorated.has(uri.fsPath)) {
            this.decorated.add(uri.fsPath);
            this._onDidChangeFileDecorations.fire(uri);
        }
    }
}
async function scanWorkspaceRoot(root) {
    const out = [];
    let entries;
    try {
        entries = await vscode_1.workspace.fs.readDirectory(root);
    }
    catch {
        return out;
    }
    for (const [name, type] of entries) {
        if (!(type & vscode_1.FileType.Directory))
            continue;
        const child = vscode_1.Uri.joinPath(root, name);
        const gitPath = vscode_1.Uri.joinPath(child, ".git");
        try {
            await vscode_1.workspace.fs.stat(gitPath);
            out.push(child);
        }
        catch {
            /* no .git, skip */
        }
    }
    return out;
}
function getConfiguredColorId() {
    const configured = vscode_1.workspace
        .getConfiguration(CONFIG_SECTION)
        .get(CONFIG_COLOR_KEY);
    if (typeof configured === "string" && configured.trim().length > 0) {
        return configured;
    }
    return DEFAULT_COLOR_ID;
}
let watchers = [];
function installWatchers(provider, context) {
    for (const w of watchers) {
        w.dispose();
    }
    watchers = [];
    const roots = vscode_1.workspace.workspaceFolders ?? [];
    for (const folder of roots) {
        const watcher = vscode_1.workspace.createFileSystemWatcher(new vscode_1.RelativePattern(folder, "*/.git"));
        const onChange = () => {
            void provider.refresh();
        };
        watcher.onDidCreate(onChange);
        watcher.onDidDelete(onChange);
        watcher.onDidChange(onChange);
        watchers.push(watcher);
        context.subscriptions.push(watcher);
    }
}
function activate(context) {
    const provider = new NestedRepoDecorationProvider();
    context.subscriptions.push(provider);
    context.subscriptions.push(vscode_1.window.registerFileDecorationProvider(provider));
    context.subscriptions.push(vscode_1.commands.registerCommand("nested-repo-highlighter.refresh", () => {
        void provider.refresh();
    }));
    context.subscriptions.push(vscode_1.workspace.onDidChangeWorkspaceFolders(() => {
        installWatchers(provider, context);
        void provider.refresh();
    }));
    context.subscriptions.push(vscode_1.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(`${CONFIG_SECTION}.${CONFIG_COLOR_KEY}`)) {
            provider.fireAll();
        }
    }));
    context.subscriptions.push(new vscode_1.Disposable(() => {
        for (const w of watchers)
            w.dispose();
        watchers = [];
    }));
    installWatchers(provider, context);
    void provider.refresh();
}
function deactivate() {
    for (const w of watchers)
        w.dispose();
    watchers = [];
}
//# sourceMappingURL=extension.js.map