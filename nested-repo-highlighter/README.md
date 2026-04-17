# Nested Repo Highlighter

A small local VS Code extension that highlights folders in the Explorer which contain their own `.git` entry — i.e. nested git repositories that are **not** submodules.

Each matching direct child of a workspace root gets:

- a badge `R`
- tooltip `Nested git repository`
- a theme-aware color tint (default: green via `gitDecoration.untrackedResourceForeground`)

Only **direct children** of each workspace root are scanned. No recursion. `.git` can be either a directory (normal repo) or a file (worktree / gitdir pointer).

## Screenshot

_(placeholder — drop a screenshot of the Explorer with decorated folders here)_

## Setting

| Key                             | Default                                         | Description                                                                     |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `nestedRepoHighlighter.color`   | `gitDecoration.untrackedResourceForeground`     | Theme color ID used to tint matching folders. Must be a valid VS Code color ID. |

## Command

- `Nested Repo Highlighter: Refresh` — rescans and re-applies decorations.

## Install

```sh
cd nested-repo-highlighter
npm install
npm run compile
```

Then copy or symlink the folder into the VS Code user extensions directory:

```sh
ln -s "$PWD" ~/.vscode/extensions/nested-repo-highlighter-0.0.1
```

Restart VS Code, or run **Developer: Reload Window**.

## Development

Open the folder in VS Code and press `F5` to launch an Extension Development Host with the extension loaded.
