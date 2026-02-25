import * as vscode from 'vscode';
import { isMac } from '../utils/platform';
import { runCommand } from '../utils/terminal';

/**
 * Registers the nbstata Jupyter kernel using the python binary from the
 * workspace .venv so the kernel is linked to the correct environment.
 *
 * @param venvPath - absolute path to the .venv directory. When omitted the
 *   function derives it from the first workspace folder.
 */
export async function registerKernel(venvPath?: string): Promise<void> {
    // Platform guard — expand this block when adding Windows/Linux support
    if (!isMac()) {
        vscode.window.showErrorMessage('registerKernel is currently only supported on macOS.');
        return;
    }

    let resolvedVenvPath = venvPath;

    if (!resolvedVenvPath) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
            return;
        }
        resolvedVenvPath = `${workspaceFolder.uri.fsPath}/.venv`;
    }

    // Use the venv python so nbstata.install registers the kernel inside the
    // correct environment, not the system Python.
    const python = `"${resolvedVenvPath}/bin/python"`;
    const kernelCommand = `${python} -m nbstata.install --sys-prefix --conf-file`;

    try {
        const output = await runCommand(kernelCommand);
        vscode.window.showInformationMessage('Stata kernel registered successfully!');
        console.log(output);
    } catch (error) {
        vscode.window.showErrorMessage('Failed to register Stata kernel: ' + (error as Error).message);
    }
}