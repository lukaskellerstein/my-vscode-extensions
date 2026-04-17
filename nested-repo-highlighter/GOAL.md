# Nested Repo Highlighter — Implementation Brief

## Context

The user works in a VS Code workspace that is itself a git repo. Inside that workspace, sibling repos are colocated on disk (e.g. `platform/`, `mod-foo/`, `mod-bar/`) and excluded via the workspace's `.gitignore`. They are **not** git submodules — this is deliberate, to preserve independent release cadence across modules.

The user wants the Explorer (file tree in the sidebar) to visually highlight any folder that contains its own `.git` entry, so nested repos are immediately distinguishable from regular folders.

Material Icon Theme's submodule detection does not fire on these (no submodule metadata exists), and its name-based `customClones` would require manually listing every folder. Neither works.

The solution is a small, local VS Code extension using the `FileDecorationProvider` API.

## Goal

Build a VS Code extension named `nested-repo-highlighter` that:

1. Scans **only the direct children** of each workspace root folder.
2. For each direct child that is a directory, checks whether it contains a `.git` entry (either a directory — normal repo — or a file — git worktree / submodule-style pointer; both should count).
3. Applies a `FileDecoration` to each matching folder:
   - **Badge**: single character, `"R"`.
   - **Tooltip**: `"Nested git repository"`.
   - **Color**: a theme color ID so it adapts to light/dark themes. Use `gitDecoration.untrackedResourceForeground` as the default (renders as a theme-appropriate green in most themes). Make this configurable (see Settings below).
4. Refreshes decorations when:
   - The workspace folders change (`workspace.onDidChangeWorkspaceFolders`).
   - A `.git` entry appears or disappears in any direct child (watch with `workspace.createFileSystemWatcher` on a pattern like `*/.git`).
   - The user runs a command `nested-repo-highlighter.refresh` (register it, bind nothing by default).

## Non-goals

- Do **not** recurse beyond direct children. Direct children of each workspace root only.
- Do **not** read or parse `.git` contents. Existence is sufficient.
- Do **not** change folder icons — only the decoration (badge + color). Icon themes remain the user's choice.
- Do **not** publish to the marketplace. This is a local extension installed by copying into `~/.vscode/extensions/`.

## Settings

Expose one configuration key:

```jsonc
"nestedRepoHighlighter.color": {
  "type": "string",
  "default": "gitDecoration.untrackedResourceForeground",
  "description": "Theme color ID used to tint folders that contain a .git entry. Must be a valid VS Code theme color ID."
}
```

Read it via `workspace.getConfiguration`. React to changes via `workspace.onDidChangeConfiguration` and fire the decoration provider's `onDidChangeFileDecorations` event for all currently-decorated URIs.

## API reference

- `vscode.window.registerFileDecorationProvider(provider)` — registers the provider.
- `FileDecorationProvider.provideFileDecoration(uri, token)` — called by VS Code for every file/folder the Explorer renders. Return a `FileDecoration` or `undefined`. Must be fast; cache results.
- `FileDecoration` fields: `badge` (1–2 chars), `tooltip` (string), `color` (`ThemeColor`), `propagate` (boolean — leave `false` so the color doesn't bleed into children).
- `EventEmitter<Uri | Uri[] | undefined>` exposed as `onDidChangeFileDecorations` — fire this to invalidate cached decorations.

## Implementation outline

### File layout

```
nested-repo-highlighter/
├── package.json
├── tsconfig.json
├── .vscodeignore
├── README.md
└── src/
    └── extension.ts
```

### `package.json`

- `name`: `nested-repo-highlighter`
- `displayName`: `Nested Repo Highlighter`
- `publisher`: `local`
- `version`: `0.0.1`
- `engines.vscode`: `^1.80.0`
- `main`: `./out/extension.js`
- `activationEvents`: `["onStartupFinished"]`
- `contributes.configuration`: the setting above.
- `contributes.commands`: one entry for `nested-repo-highlighter.refresh` with title `"Nested Repo Highlighter: Refresh"`.
- `scripts`: `compile` → `tsc -p ./`, `watch` → `tsc -watch -p ./`.
- `devDependencies`: `@types/vscode`, `@types/node`, `typescript`.

### `tsconfig.json`

Standard VS Code extension tsconfig: target `ES2020`, module `commonjs`, `outDir: "out"`, `rootDir: "src"`, `strict: true`, `lib: ["ES2020"]`.

### `src/extension.ts`

Responsibilities:

1. **`activate(context)`**
   - Instantiate a `NestedRepoDecorationProvider`.
   - Register it with `window.registerFileDecorationProvider`.
   - Register the `refresh` command that calls `provider.refresh()`.
   - Register workspace folder change listener → `provider.refresh()`.
   - Register config change listener (filter for `nestedRepoHighlighter.color`) → `provider.refresh()`.
   - For each current workspace folder, create a `FileSystemWatcher` with pattern `new RelativePattern(folder, "*/.git")`. On create/delete, call `provider.refresh()`. Push all disposables into `context.subscriptions`.

2. **`NestedRepoDecorationProvider`** implements `FileDecorationProvider`.
   - Holds a `Set<string>` of fsPath strings for folders currently known to contain `.git`. Populate lazily + eagerly:
     - **Eager**: on construction and on every `refresh()`, scan direct children of every workspace root using `workspace.fs.readDirectory`, and for each directory child, `stat` its `.git` path; if it exists, add the child's fsPath to the set.
     - **Lazy fallback**: in `provideFileDecoration`, if the uri's fsPath matches a direct-child path of any workspace root that isn't in the set yet and hasn't been checked, check it synchronously-ish (fire-and-forget async that updates the set and fires the change event).
   - `provideFileDecoration(uri)`:
     - If `uri.scheme !== "file"`, return `undefined`.
     - If `uri.fsPath` is in the set, return:
       ```ts
       {
         badge: "R",
         tooltip: "Nested git repository",
         color: new ThemeColor(configuredColorId),
         propagate: false,
       }
       ```
     - Otherwise return `undefined`.
   - `refresh()`:
     - Rebuild the set from scratch via the eager scan.
     - Fire `_onDidChangeFileDecorations.fire(undefined)` to invalidate all.

3. **Eager scan helper**
   ```ts
   async function scanWorkspaceRoot(root: Uri): Promise<Uri[]> {
     const out: Uri[] = [];
     const entries = await workspace.fs.readDirectory(root);
     for (const [name, type] of entries) {
       if (!(type & FileType.Directory)) continue;
       const child = Uri.joinPath(root, name);
       const gitPath = Uri.joinPath(child, ".git");
       try {
         await workspace.fs.stat(gitPath); // throws if missing
         out.push(child);
       } catch { /* no .git, skip */ }
     }
     return out;
   }
   ```
   Note: `.git` can be either a directory (normal repo) or a file (worktree / gitdir pointer). `stat` succeeds in both cases, which is what we want.

### `.vscodeignore`

Exclude `src/`, `tsconfig.json`, `.vscode/`, `node_modules/`, `**/*.map`.

### `README.md`

A short description, a screenshot placeholder, the single setting, and the install instructions (see below).

## Install instructions (include in README)

1. `cd nested-repo-highlighter`
2. `npm install`
3. `npm run compile`
4. Copy or symlink the whole folder into `~/.vscode/extensions/nested-repo-highlighter-0.0.1/`.
5. Restart VS Code (or reload window: `Developer: Reload Window`).

Alternatively, for iterative development: open the folder in VS Code and press F5 to launch an Extension Development Host.

## Acceptance criteria

- Opening a workspace whose root contains a folder with a `.git` subdirectory shows that folder with a badge `R` and a tinted name in the Explorer.
- Removing the inner `.git` (or deleting the inner repo) causes the decoration to disappear without reloading the window.
- Adding a new nested repo (e.g. `git clone` into the workspace root) causes the decoration to appear without reloading the window.
- Folders that do not contain `.git` are completely untouched.
- The decoration does not propagate to children of the nested repo (files inside `platform/` render normally).
- Changing `nestedRepoHighlighter.color` in settings takes effect immediately.
- No visible errors in the "Nested Repo Highlighter" / extension host output channel.

## Edge cases to handle

- **Multi-root workspaces**: iterate every root in `workspace.workspaceFolders`. Each root gets its own watcher.
- **Workspace with no folders open**: provider should no-op gracefully.
- **Permission errors** reading a directory: swallow and skip; never throw out of `provideFileDecoration`.
- **Very large workspace roots** with hundreds of direct children: the eager scan is one `readDirectory` plus one `stat` per directory child — fine at this scale. Do not recurse.
- **`.git` as a file** (worktree case): `workspace.fs.stat` succeeds and `FileType.File` is returned. Treat this the same as the directory case.

## Out of scope (do not implement)

- Recursive scanning.
- Reading `.gitignore` or respecting it.
- Distinguishing "clean" vs "dirty" nested repos.
- Any UI beyond the decoration (no status bar, no tree view, no webview).
- Packaging as a `.vsix` or publishing.