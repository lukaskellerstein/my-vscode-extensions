# TMUX Manager

A VSCode extension that allows you to quickly open new windows in running TMUX sessions from within VSCode.

## Features

- List all running TMUX sessions in a quick pick dialog
- Open a new window in the selected TMUX session
- Automatically navigates to the directory of your currently open file
- Quick keyboard shortcut for fast access

## Usage

1. Press `Ctrl+T` (or `Cmd+T` on macOS) to open the TMUX session picker
2. Alternatively, use the command palette (`Ctrl+Shift+P`) and search for "TMUX: Open Session"
3. Select a TMUX session from the list
4. A new window will be created in the selected session at your current file's location

## Requirements

- TMUX must be installed and running on your system
- At least one TMUX session must be active

## Keyboard Shortcuts

- `Ctrl+T` (Linux/Windows) / `Cmd+T` (macOS) - Open TMUX session picker

## Extension Settings

This extension does not add any VSCode settings at this time.

## Known Issues

None at this time.

## Release Notes

### 0.0.1

Initial release of TMUX Manager

- Open new windows in running TMUX sessions
- Quick pick dialog for session selection
- Keyboard shortcut support
