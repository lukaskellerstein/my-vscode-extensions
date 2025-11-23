import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

interface TmuxSession {
    name: string;
    windows: number;
    attached: boolean;
}

/**
 * Get list of all running TMUX sessions
 */
async function getTmuxSessions(): Promise<TmuxSession[]> {
    try {
        const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}|#{session_windows}|#{session_attached}"');

        const sessions: TmuxSession[] = stdout
            .trim()
            .split('\n')
            .filter(line => line.length > 0)
            .map(line => {
                const [name, windows, attached] = line.split('|');
                return {
                    name,
                    windows: parseInt(windows, 10),
                    attached: attached === '1'
                };
            });

        return sessions;
    } catch (error: any) {
        // If tmux is not running or no sessions exist
        if (error.code === 1) {
            return [];
        }
        throw error;
    }
}

/**
 * Open a new window in the specified TMUX session at the given path
 */
async function openTmuxWindow(sessionName: string, currentPath: string): Promise<void> {
    try {
        // Create a new window in the specified session at the current path
        const command = `tmux new-window -t "${sessionName}" -c "${currentPath}"`;
        await execAsync(command);

        vscode.window.showInformationMessage(`Opened new window in TMUX session: ${sessionName}`);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to open TMUX window: ${error.message}`);
        throw error;
    }
}

/**
 * Get the current file's directory path, or workspace root if no file is open
 */
function getCurrentPath(): string {
    const activeEditor = vscode.window.activeTextEditor;

    if (activeEditor) {
        // Get the directory of the currently open file
        const filePath = activeEditor.document.uri.fsPath;
        return path.dirname(filePath);
    }

    // Fall back to workspace root
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        return workspaceFolders[0].uri.fsPath;
    }

    // Default to home directory if nothing else is available
    return process.env.HOME || '~';
}

/**
 * Main command: Show TMUX session picker and open a new window in selected session
 */
async function openTmuxSession() {
    try {
        // Get list of TMUX sessions
        const sessions = await getTmuxSessions();

        if (sessions.length === 0) {
            vscode.window.showWarningMessage('No TMUX sessions found. Please start a TMUX session first.');
            return;
        }

        // Create quick pick items
        const items: vscode.QuickPickItem[] = sessions.map(session => ({
            label: session.name,
            description: `${session.windows} window${session.windows !== 1 ? 's' : ''}`,
            detail: session.attached ? 'Currently attached' : ''
        }));

        // Show quick pick dialog
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a TMUX session to open a new window',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (!selected) {
            // User cancelled
            return;
        }

        // Get current path
        const currentPath = getCurrentPath();

        // Open new window in selected session
        await openTmuxWindow(selected.label, currentPath);

    } catch (error: any) {
        vscode.window.showErrorMessage(`TMUX Manager error: ${error.message}`);
    }
}

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('TMUX Manager extension is now active');

    // Register the command
    const disposable = vscode.commands.registerCommand(
        'tmux-manager.openSession',
        openTmuxSession
    );

    context.subscriptions.push(disposable);
}

/**
 * Extension deactivation
 */
export function deactivate() {
    console.log('TMUX Manager extension is now deactivated');
}
