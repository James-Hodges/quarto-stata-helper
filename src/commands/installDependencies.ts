import * as vscode from 'vscode';
import { isMac } from '../utils/platform';

/**
 * Maps dependency names (as returned by checkDependencies) to the Homebrew
 * formula/cask that installs them.
 * nbstata/jupyter/ipykernel are intentionally omitted — installed in the venv
 * by setupVenv.
 */
const brewFormulas: Record<string, string> = {
    quarto: '--cask quarto',
    python3: 'python',   // checkDependencies reports this dep as 'python3'
};

/**
 * Installs system-level dependencies via Homebrew in a **visible** VS Code
 * terminal so that any admin-password prompts (e.g. from `brew install --cask
 * quarto`) are interactive and the user can respond to them.
 *
 * Because the terminal runs asynchronously there is no way to await completion.
 * The wizard stops after calling this function and tells the user to re-run
 * the wizard once installation is finished.
 *
 * @param missingDeps - list of dependency names from checkDependencies().
 */
export function installDependencies(missingDeps: string[]): void {
    if (!isMac()) {
        vscode.window.showErrorMessage('installDependencies is currently only supported on macOS.');
        return;
    }

    const deps = missingDeps.filter(d => brewFormulas[d]);
    if (deps.length === 0) { return; }

    // If an install terminal is already open the user probably ran the wizard
    // again before the previous brew install finished. Warn and bail out rather
    // than running a second parallel install.
    const alreadyRunning = vscode.window.terminals.find(
        t => t.name === 'Quarto Stata Helper: Install',
    );
    if (alreadyRunning) {
        vscode.window.showWarningMessage(
            'An installation is already in progress in the ' +
            '"Quarto Stata Helper: Install" terminal. ' +
            'Please wait for it to complete, then run the setup wizard again.',
        );
        alreadyRunning.show();
        return;
    }

    const terminal = vscode.window.createTerminal('Quarto Stata Helper: Install');
    terminal.show();

    for (const dep of deps) {
        terminal.sendText(`brew install ${brewFormulas[dep]}`);
    }

    // Visual separator so the user knows when all commands have been sent.
    terminal.sendText('echo ""');
    terminal.sendText('echo "✅ Homebrew installs complete. Return to VS Code and re-run the setup wizard."');
}