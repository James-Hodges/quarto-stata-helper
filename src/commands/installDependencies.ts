import * as vscode from 'vscode';

/** Install links shown to the user when a required tool is missing. */
const installLinks: Record<string, { label: string; url: string }> = {
    quarto:  { label: 'Download Quarto',  url: 'https://quarto.org/docs/get-started/' },
    python:  { label: 'Download Python',  url: 'https://www.python.org/downloads/' },
};

/**
 * Shows the user actionable guidance for installing any missing system-level
 * dependencies (Quarto and Python). These tools must be installed manually
 * before setup can continue — this extension does not install them.
 *
 * nbstata/jupyter/ipykernel are intentionally omitted here — they are
 * installed into the workspace virtual environment by setupVenv.
 *
 * @param missingDeps - list of dependency names from checkDependencies().
 */
export function installDependencies(missingDeps: string[]): void {
    const deps = missingDeps.filter(d => installLinks[d]);
    if (deps.length === 0) { return; }

    for (const dep of deps) {
        const { label, url } = installLinks[dep];
        vscode.window.showErrorMessage(
            `"${dep}" is not installed or not on PATH. Please install it manually and restart VS Code.`,
            label,
        ).then(choice => {
            if (choice === label) {
                vscode.env.openExternal(vscode.Uri.parse(url));
            }
        });
    }
}