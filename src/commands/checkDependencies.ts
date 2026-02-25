import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { getStataPath } from './selectStataPath';

const execPromise = promisify(exec);

async function checkShellDependency(command: string): Promise<boolean> {
    try {
        await execPromise(command);
        return true;
    } catch {
        return false;
    }
}

/**
 * Returns the python binary to use for import checks.
 * Prefers the workspace .venv when it already exists so that subsequent
 * wizard runs correctly detect jupyter/nbstata as installed rather than
 * always reporting them missing (they live in the venv, not system python3).
 */
function getPythonBin(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        const venvPython = path.join(workspaceFolders[0].uri.fsPath, '.venv', 'bin', 'python');
        if (fs.existsSync(venvPython)) {
            return `"${venvPython}"`;
        }
    }
    return 'python3';
}

/**
 * Checks all required dependencies and returns the names of any that are
 * missing. Returns an empty array when everything is installed.
 *
 * jupyter/nbstata are checked against the workspace .venv python when it
 * exists, so the wizard reports them as installed on subsequent runs.
 *
 * Stata is checked by probing known macOS install paths and the user-
 * configured `quartoStataHelper.stataPath` setting — NOT via `which stata`,
 * because Stata on macOS is a .app bundle rarely on $PATH.
 */
export async function checkDependencies(): Promise<string[]> {
    const pythonBin = getPythonBin();

    const shellDependencies: Record<string, string> = {
        quarto:  'quarto --version',
        python:  'python3 --version',
        jupyter: `${pythonBin} -c "import jupyter"`,
        nbstata: `${pythonBin} -c "import nbstata"`,
    };

    const shellResults = await Promise.all(
        Object.entries(shellDependencies).map(async ([name, command]) => {
            const isInstalled = await checkShellDependency(command);
            console.log(`${name}: ${isInstalled ? 'installed' : 'MISSING'}`);
            return { name, isInstalled };
        })
    );

    const missing = shellResults
        .filter(({ isInstalled }) => !isInstalled)
        .map(({ name }) => name);

    // Stata check: probe known install paths + user setting
    const stataPath = getStataPath();
    const stataFound = stataPath !== undefined;
    console.log(`stata: ${stataFound ? `found at ${stataPath}` : 'MISSING'}`);
    if (!stataFound) {
        missing.push('stata');
    }

    return missing;
}