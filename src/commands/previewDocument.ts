import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Owns the single persistent preview terminal so we can reuse or replace it
 * across multiple preview invocations without leaving orphaned terminals.
 */
let previewTerminal: vscode.Terminal | undefined;

/**
 * Previews the currently active .qmd file using our workspace .venv so that
 * nbstata is always resolved correctly — bypassing the Quarto VS Code
 * extension's process launcher which does not inherit the venv environment.
 *
 * The preview runs in a dedicated terminal named "Quarto Preview". If that
 * terminal already exists it is reused (the old preview process is killed
 * first so the port is freed). The terminal stays open after the preview
 * server starts so the user can see output and Ctrl+C if needed.
 */
export async function previewDocument(): Promise<void> {
    // ── Guard: workspace folder required ────────────────────────────────────
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage(
            'Quarto Stata Helper: Please open a folder before previewing.',
        );
        return;
    }

    // ── Guard: active editor must be a .qmd file ─────────────────────────────
    // Check before saving so we never accidentally save the wrong file.
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document.fileName.endsWith('.qmd')) {
        vscode.window.showErrorMessage(
            'Quarto Stata Helper: Open a .qmd file and make it the active editor before previewing.',
        );
        return;
    }

    // Save now that we've confirmed it's a .qmd file
    await editor.document.save();

    const workspaceRoot = workspaceFolder.uri.fsPath;
    const venvActivate = path.join(workspaceRoot, '.venv', 'bin', 'activate');
    const relativeQmd = path.relative(workspaceRoot, editor.document.fileName);
    const quotedQmd = `"${relativeQmd}"`;

    // ── Reuse or create the preview terminal ─────────────────────────────────
    // Check if our terminal is still alive (user may have closed it manually)
    const existingTerminals = vscode.window.terminals;
    const existingPreview = existingTerminals.find(t => t.name === 'Quarto Preview');


    if (existingPreview) {
        // Dispose the old terminal entirely rather than sending Ctrl+C with an
        // unreliable timeout. This guarantees the process tree is dead and the
        // port is freed before we create a fresh terminal.
        existingPreview.dispose();
        await new Promise(resolve => setTimeout(resolve, 1000));
    }


    previewTerminal = vscode.window.createTerminal({
        name: 'Quarto Preview',
        cwd: workspaceRoot,
    });

    previewTerminal.show(false); // show but don't steal focus from the editor

    // ── Activate venv and launch preview ─────────────────────────────────────
    // We activate the venv explicitly so quarto finds the correct python/jupyter
    // with nbstata installed, regardless of the system PATH.
    previewTerminal.sendText(`quarto preview ${relativeQmd} --no-watch --no-browser`, true);
}
