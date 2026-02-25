import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { isMac } from '../utils/platform';
import { runCommand } from '../utils/terminal';

export async function setupVenv(): Promise<string | false> {
    // Platform guard — expand this block when adding Windows/Linux support
    if (!isMac()) {
        vscode.window.showErrorMessage('setupVenv is currently only supported on macOS.');
        return false;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
        return false;
    }

    const venvPath = path.join(workspaceFolder.uri.fsPath, '.venv');
    const pip = `"${venvPath}/bin/pip"`;
    const packages = ['nbstata', 'ipykernel', 'nbformat', 'jupyter'];

    // If the venv python binary already exists the environment was previously
    // created successfully — skip creation and pip installs entirely so
    // re-running the wizard after a brew install pause is fast.
    const venvPython = path.join(venvPath, 'bin', 'python');
    const venvExists = fs.existsSync(venvPython);

    try {
        if (!venvExists) {
            // Only create the venv on first run — re-creating is harmless but slow.
            await runCommand(`python3 -m venv "${venvPath}"`);
            vscode.window.showInformationMessage('Virtual environment created.');
            // Upgrade pip inside the venv — avoids externally-managed-environment error
            await runCommand(`${pip} install --upgrade pip`);
        } else {
            vscode.window.showInformationMessage('Virtual environment exists — checking packages.');
        }

        // Always run pip installs: pip is idempotent so already-installed
        // packages return instantly. This also fixes any broken/missing
        // packages from a previous partial install.
        for (const pkg of packages) {
            try {
                await runCommand(`${pip} install ${pkg}`);
                vscode.window.showInformationMessage(`${pkg} ready.`);
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to install ${pkg}: ${(error as Error).message}`,
                );
                return false;
            }
        }

        return venvPath;
    } catch (error) {
        vscode.window.showErrorMessage(`Error setting up virtual environment: ${(error as Error).message}`);
        return false;
    }
}