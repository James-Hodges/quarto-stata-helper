import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { window, workspace } from 'vscode';
import { getStataPath, getStataDir, getStataEdition, resolveAppBundlePath } from './selectStataPath';

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
        // This line was breaking things, vscode threw errors about being unable to intepret this. 
        //'python.defaultInterpreterPath': path.join(workspacePath, '.venv', 'bin', 'python'),
        'jupyter.defaultKernel': 'nbstata',

        // TESTING: Prevents VS Code from relaunching the terminal when an extension
        // (e.g. the Python extension activating a venv) changes the terminal environment.
        // Without this, the Quarto preview render can be interrupted mid-run by a
        // `source activate` relaunch. Remove this if it causes other issues.
        'terminal.integrated.environmentChangesRelaunch': false,
    };

    // If we know where Stata lives, write it into the nbstata settings so the
    // kernel can find Stata without the user needing to configure it separately.
    // Resolve any .app bundle path to the actual binary inside it, in case an
    // older version of the extension saved the bundle path instead of the binary.
    const rawStataPath = getStataPath();
    const stataPath = rawStataPath?.endsWith('.app')
        ? resolveAppBundlePath(rawStataPath)
        : rawStataPath;
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

        // ── Write ~/.nbstata.conf ─────────────────────────────────────────────
        // nbstata reads this file when invoked by Quarto outside of VS Code.
        // It needs stata_dir (the folder *containing* the .app bundle) and
        // edition — NOT the full binary path that .vscode/settings.json uses.
        // We always overwrite so that previously-wrong values (e.g. a full
        // binary path the user entered manually) are corrected automatically.
        if (stataPath) {
            const nbstataConfPath = path.join(os.homedir(), '.nbstata.conf');
            const stataDir = getStataDir(stataPath);
            const edition = getStataEdition(stataPath);
            const confContent =
`[nbstata]
stata_dir = ${stataDir}
edition = ${edition}
splash = False
`;
            fs.writeFileSync(nbstataConfPath, confContent, 'utf8');
            window.showInformationMessage(
                `nbstata config written: stata_dir = ${stataDir}, edition = ${edition}`,
            );
        }
    } catch (error) {
        window.showErrorMessage(`Error configuring VS Code settings: ${(error as Error).message}`);
    }
}