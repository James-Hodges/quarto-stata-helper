import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Known macOS Stata installation directories, ordered newest → oldest.
 * Each directory contains edition-specific binaries (StataMP, StataSE, StataBE).
 * Expand this list when new Stata major versions ship.
 */
export const STATA_SEARCH_DIRS = [
    '/Applications/StataNow',
    '/Applications/Stata',
    '/Applications/Stata18',
    '/Applications/Stata17',
    '/Applications/Stata16',
];

/** Edition executables in preference order (highest → lowest licence). */
const STATA_EXECUTABLES = ['StataMP', 'StataSE', 'StataBE', 'Stata'];

/**
 * Given a path that may point at a macOS `.app` bundle, resolve it to the
 * actual Unix executable inside `Contents/MacOS/<name>`.
 * If the path is already a plain binary (or the resolved path doesn't exist),
 * the original path is returned unchanged.
 */
function resolveAppBundle(candidate: string): string {
    if (!candidate.endsWith('.app')) {
        return candidate;
    }
    const macosDir = `${candidate}/Contents/MacOS`;
    // 1. Try the common case: binary named the same as the .app bundle
    const bundleName = candidate.slice(candidate.lastIndexOf('/') + 1, -4);
    const exact = `${macosDir}/${bundleName}`;
    if (fs.existsSync(exact)) {
        return exact;
    }
    // 2. Fall back to the first executable entry in Contents/MacOS/
    //    (handles edge cases where Stata names the binary differently)
    try {
        const entries = fs.readdirSync(macosDir);
        const first = entries.find(e => {
            try {
                fs.accessSync(`${macosDir}/${e}`, fs.constants.X_OK);
                return true;
            } catch { return false; }
        });
        if (first) { return `${macosDir}/${first}`; }
    } catch { /* macosDir doesn't exist — fall through */ }
    // 3. Return the original path unchanged so the caller's error handling fires
    return candidate;
}

/**
 * Given a path that may point at a macOS `.app` bundle, resolve it to the
 * actual Unix executable inside `Contents/MacOS/<name>`.
 * If the path is already a plain binary (or the resolved path doesn't exist),
 * the original path is returned unchanged.
 *
 * Exported so other modules can normalise stored paths that may be bundle paths.
 */
export function resolveAppBundlePath(candidate: string): string {
    return resolveAppBundle(candidate);
}

export function findStataExecutable(): string | undefined {
    for (const dir of STATA_SEARCH_DIRS) {
        for (const exe of STATA_EXECUTABLES) {
            // Try bare binary first (e.g. /Applications/Stata18/StataMP)
            const bare = `${dir}/${exe}`;
            if (fs.existsSync(bare)) {
                return bare;
            }
            // Try .app bundle (e.g. /Applications/StataNow/StataBE.app)
            const appBundle = `${dir}/${exe}.app`;
            if (fs.existsSync(appBundle)) {
                return resolveAppBundle(appBundle);
            }
        }
    }
    return undefined;
}

/**
 * Returns the Stata executable path to use, consulting (in order):
 *  1. The user/workspace VS Code setting `quartoStataHelper.stataPath`
 *  2. Auto-detection across known install directories
 *
 * Returns `undefined` when Stata cannot be located by either method.
 */
export function getStataPath(): string | undefined {
    const configured = vscode.workspace
        .getConfiguration('quartoStataHelper')
        .get<string>('stataPath');

    if (configured && configured.trim() !== '') {
        return configured.trim();
    }

    return findStataExecutable();
}

/**
 * Given a resolved Stata binary path, returns the directory that nbstata
 * expects for `stata_dir` in ~/.nbstata.conf.
 *
 * nbstata wants the folder that *contains* the .app bundle (or bare binary),
 * NOT the binary itself. Examples:
 *   /Applications/StataNow/StataBE.app/Contents/MacOS/StataBE
 *     → /Applications/StataNow
 *   /Applications/Stata18/StataMP
 *     → /Applications/Stata18
 */
export function getStataDir(resolvedBinaryPath: string): string {
    // If path contains .app, the stata_dir is the folder containing the .app
    const appIndex = resolvedBinaryPath.indexOf('.app');
    if (appIndex !== -1) {
        const appBundle = resolvedBinaryPath.slice(0, appIndex + 4); // up to and including .app
        return path.dirname(appBundle);
    }
    // Bare binary — stata_dir is just the parent directory
    return path.dirname(resolvedBinaryPath);
}

/**
 * Infers the Stata edition from the resolved binary path.
 * Returns 'mp', 'se', 'be', or 'stata' (the generic fallback).
 * nbstata expects lowercase in the conf file.
 */
export function getStataEdition(resolvedBinaryPath: string): string {
    // Strip .app suffix before checking so 'StataBE.app' correctly matches 'be'
    const name = path.basename(resolvedBinaryPath, '.app').toLowerCase();
    if (name.includes('mp'))  { return 'mp'; }
    if (name.includes('se'))  { return 'se'; }
    if (name.includes('be'))  { return 'be'; }
    return 'stata';
}

/**
 * Opens a file-picker so the user can manually locate their Stata executable,
 * then persists the choice to the workspace settings (.vscode/settings.json)
 * so each project can independently point at a different Stata installation
 * without touching the user's global VS Code settings.
 *
 * Returns the chosen path, or `undefined` if the user cancelled.
 */
export async function selectStataPath(): Promise<string | undefined> {
    if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showErrorMessage(
            'Quarto Stata Helper: Please open a folder before selecting a Stata path.',
        );
        return undefined;
    }

    const autoDetected = findStataExecutable();

    const defaultUri = autoDetected
        ? vscode.Uri.file(autoDetected)
        : vscode.Uri.file('/Applications');

    const result = await vscode.window.showOpenDialog({
        title: 'Select your Stata app or executable (e.g. StataBE.app, StataMP)',
        openLabel: 'Select Stata',
        canSelectFiles: true,
        canSelectFolders: true,   // .app bundles appear as folders on macOS
        canSelectMany: false,
        defaultUri,
    });

    if (!result || result.length === 0) {
        return undefined;
    }

    // Resolve .app bundles to the binary inside Contents/MacOS/
    const chosen = resolveAppBundle(result[0].fsPath);

    // Validate the selection is executable
    try {
        fs.accessSync(chosen, fs.constants.X_OK);
    } catch {
        vscode.window.showErrorMessage(
            `Could not find an executable Stata binary at: ${chosen}. ` +
            'You can select either the .app bundle (e.g. StataBE.app) or the ' +
            'binary directly (e.g. StataBE.app/Contents/MacOS/StataBE).',
        );
        return undefined;
    }

    // Persist to workspace settings (.vscode/settings.json) so each project
    // can point at a different Stata version and no global settings are touched.
    await vscode.workspace
        .getConfiguration('quartoStataHelper')
        .update('stataPath', chosen, vscode.ConfigurationTarget.Workspace);

    vscode.window.showInformationMessage(`Stata path saved to workspace settings: ${chosen}`);
    return chosen;
}
