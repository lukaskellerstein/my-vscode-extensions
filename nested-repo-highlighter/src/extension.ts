import {
  CancellationToken,
  Disposable,
  EventEmitter,
  ExtensionContext,
  FileDecoration,
  FileDecorationProvider,
  FileSystemWatcher,
  FileType,
  ProviderResult,
  RelativePattern,
  ThemeColor,
  Uri,
  commands,
  window,
  workspace,
} from "vscode";

const CONFIG_SECTION = "nestedRepoHighlighter";
const CONFIG_COLOR_KEY = "color";
const DEFAULT_COLOR_ID = "charts.blue";

class NestedRepoDecorationProvider implements FileDecorationProvider {
  private readonly _onDidChangeFileDecorations = new EventEmitter<
    Uri | Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  private decorated = new Set<string>();
  private checked = new Set<string>();

  dispose(): void {
    this._onDidChangeFileDecorations.dispose();
  }

  provideFileDecoration(
    uri: Uri,
    _token: CancellationToken
  ): ProviderResult<FileDecoration> {
    if (uri.scheme !== "file") {
      return undefined;
    }

    if (this.decorated.has(uri.fsPath)) {
      return {
        badge: "⎇",
        tooltip: "Nested git repository",
        color: new ThemeColor(getConfiguredColorId()),
        propagate: false,
      };
    }

    if (this.isDirectChildOfWorkspaceRoot(uri) && !this.checked.has(uri.fsPath)) {
      this.checked.add(uri.fsPath);
      void this.checkSingle(uri);
    }

    return undefined;
  }

  async refresh(): Promise<void> {
    this.checked.clear();
    const next = new Set<string>();
    const roots = workspace.workspaceFolders ?? [];
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

  fireAll(): void {
    this._onDidChangeFileDecorations.fire(undefined);
  }

  private isDirectChildOfWorkspaceRoot(uri: Uri): boolean {
    const roots = workspace.workspaceFolders ?? [];
    for (const folder of roots) {
      if (folder.uri.scheme !== "file") continue;
      const rootPath = folder.uri.fsPath.replace(/[\\/]+$/, "");
      const childPath = uri.fsPath;
      if (!childPath.startsWith(rootPath)) continue;
      const rest = childPath.slice(rootPath.length);
      if (rest.length < 2) continue;
      const trimmed = rest.replace(/^[\\/]+/, "");
      if (trimmed.length === 0) continue;
      if (!trimmed.includes("/") && !trimmed.includes("\\")) {
        return true;
      }
    }
    return false;
  }

  private async checkSingle(uri: Uri): Promise<void> {
    try {
      const stat = await workspace.fs.stat(uri);
      if (!(stat.type & FileType.Directory)) return;
    } catch {
      return;
    }

    const gitPath = Uri.joinPath(uri, ".git");
    try {
      await workspace.fs.stat(gitPath);
    } catch {
      return;
    }

    if (!this.decorated.has(uri.fsPath)) {
      this.decorated.add(uri.fsPath);
      this._onDidChangeFileDecorations.fire(uri);
    }
  }
}

async function scanWorkspaceRoot(root: Uri): Promise<Uri[]> {
  const out: Uri[] = [];
  let entries: [string, FileType][];
  try {
    entries = await workspace.fs.readDirectory(root);
  } catch {
    return out;
  }

  for (const [name, type] of entries) {
    if (!(type & FileType.Directory)) continue;
    const child = Uri.joinPath(root, name);
    const gitPath = Uri.joinPath(child, ".git");
    try {
      await workspace.fs.stat(gitPath);
      out.push(child);
    } catch {
      /* no .git, skip */
    }
  }
  return out;
}

function getConfiguredColorId(): string {
  const configured = workspace
    .getConfiguration(CONFIG_SECTION)
    .get<string>(CONFIG_COLOR_KEY);
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured;
  }
  return DEFAULT_COLOR_ID;
}

let watchers: FileSystemWatcher[] = [];

function installWatchers(
  provider: NestedRepoDecorationProvider,
  context: ExtensionContext
): void {
  for (const w of watchers) {
    w.dispose();
  }
  watchers = [];

  const roots = workspace.workspaceFolders ?? [];
  for (const folder of roots) {
    const watcher = workspace.createFileSystemWatcher(
      new RelativePattern(folder, "*/.git")
    );
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

export function activate(context: ExtensionContext): void {
  const provider = new NestedRepoDecorationProvider();
  context.subscriptions.push(provider);
  context.subscriptions.push(window.registerFileDecorationProvider(provider));

  context.subscriptions.push(
    commands.registerCommand("nested-repo-highlighter.refresh", () => {
      void provider.refresh();
    })
  );

  context.subscriptions.push(
    workspace.onDidChangeWorkspaceFolders(() => {
      installWatchers(provider, context);
      void provider.refresh();
    })
  );

  context.subscriptions.push(
    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${CONFIG_SECTION}.${CONFIG_COLOR_KEY}`)) {
        provider.fireAll();
      }
    })
  );

  context.subscriptions.push(
    new Disposable(() => {
      for (const w of watchers) w.dispose();
      watchers = [];
    })
  );

  installWatchers(provider, context);
  void provider.refresh();
}

export function deactivate(): void {
  for (const w of watchers) w.dispose();
  watchers = [];
}
