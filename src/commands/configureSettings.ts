import * as fs from 'fs';
import * as path from 'path';
import { window, workspace } from 'vscode';
import { getStataPath } from './selectStataPath';

export async function configureSettings(): Promise<void> {
    const workspaceFolder = workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        window.showErrorMessage('No workspace folder found. Please open a folder first.');
        return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const vscodePath = path.join(workspacePath, '.vscode');
    const settingsPath = path.join(vscodePath, 'settings.json');

    const newSettings: Record<string, unknown> = {
        // Absolute path — the ${workspaceFolder} token is not resolved by all
        // consumers (e.g. nbstata reads the raw string from settings.json).
        'python.defaultInterpreterPath': path.join(workspacePath, '.venv', 'bin', 'python'),
        'jupyter.defaultKernel': 'nbstata',
    };

    // If we know where Stata lives, write it into the nbstata settings so the
    // kernel can find Stata without the user needing to configure it separately.
    const stataPath = getStataPath();
    if (stataPath) {
        newSettings['nbstata.stataPath'] = stataPath;
    }

    try {
        // Ensure .vscode directory exists
        if (!fs.existsSync(vscodePath)) {
            fs.mkdirSync(vscodePath, { recursive: true });
        }

        let existingSettings: Record<string, unknown> = {};
        if (fs.existsSync(settingsPath)) {
            try {
                existingSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            } catch {
                window.showWarningMessage(
                    'Existing .vscode/settings.json could not be parsed — it will be replaced. ' +
                    'Check your settings file for syntax errors.',
                );
                existingSettings = {};
            }
        }

        // Merge: existing user values win on conflict so that manually set
        // settings are never overwritten on subsequent wizard runs.
        // newSettings act as defaults — only applied when the key is absent.
        const updatedSettings = { ...newSettings, ...existingSettings };
        fs.writeFileSync(settingsPath, JSON.stringify(updatedSettings, null, 4));
    } catch (error) {
        window.showErrorMessage(`Error configuring VS Code settings: ${(error as Error).message}`);
    }
}