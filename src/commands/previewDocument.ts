import * as net from 'net';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Returns a promise resolving to a free TCP port chosen from the given range.
 * Tries ports in random order; throws if none are available.
 */
function getFreePortInRange(min: number, max: number): Promise<number> {
    const ports = Array.from({ length: max - min + 1 }, (_, i) => min + i)
        .sort(() => Math.random() - 0.5); // shuffle so we don't always pick the same one

    return new Promise((resolve, reject) => {
        const tryNext = (remaining: number[]) => {
            if (remaining.length === 0) {
                reject(new Error(`No free port found in range ${min}–${max}`));
                return;
            }
            const [port, ...rest] = remaining;
            const server = net.createServer();
            server.once('error', () => tryNext(rest));
            server.listen(port, '127.0.0.1', () => {
                server.close(() => resolve(port));
            });
        };
        tryNext(ports);
    });
}

/**
 * Polls localhost:port until a TCP connection succeeds (server is up) or the
 * timeout is exceeded. Resolves true if the server came up, false if it timed out.
 */
function waitForPort(port: number, timeoutMs = 60_000, intervalMs = 500): Promise<boolean> {
    return new Promise(resolve => {
        const deadline = Date.now() + timeoutMs;

        const probe = () => {
            const socket = new net.Socket();
            socket.setTimeout(intervalMs);

            socket.once('connect', () => {
                socket.destroy();
                resolve(true);
            });

            socket.once('error', () => {
                socket.destroy();
                if (Date.now() < deadline) {
                    setTimeout(probe, intervalMs);
                } else {
                    resolve(false);
                }
            });

            socket.once('timeout', () => {
                socket.destroy();
                if (Date.now() < deadline) {
                    setTimeout(probe, intervalMs);
                } else {
                    resolve(false);
                }
            });

            socket.connect(port, '127.0.0.1');
        };

        probe();
    });
}

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


    // ── Pick a free port in our reserved range ─────────────────────────────
    // By choosing the port ourselves we know the preview URL before the server
    // starts, so we can open the Simple Browser immediately — no output parsing
    // or timed delays needed.
    const port = await getFreePortInRange(3690, 3699);
    const previewUrl = `http://localhost:${port}`;

    // ── Run preview as a VS Code Task ─────────────────────────────────────────
    const task = new vscode.Task(
        { type: 'shell' },
        workspaceFolder,
        'Quarto Preview',
        'quarto-stata-helper',
        new vscode.ShellExecution(
            `source "${venvActivate}" && quarto preview ${quotedQmd} --no-watch --no-browser --port ${port}`,
            { cwd: workspaceRoot },
        ),
    );
    await vscode.tasks.executeTask(task);

    // ── Wait for the server to be ready, then open the Simple Browser ─────────
    // Poll the port every 500 ms (up to 60 s) so the browser opens the moment
    // Quarto is ready — no fixed delay, no output parsing.
    const serverReady = await waitForPort(port);
    if (serverReady) {
        await vscode.commands.executeCommand('simpleBrowser.show', previewUrl);
    } else {
        vscode.window.showWarningMessage(
            `Quarto preview server did not start on port ${port} within 60 s.`,
        );
    }

    // ── Original terminal approach (kept for reference) ───────────────────────
    // previewTerminal = vscode.window.createTerminal({
    //     name: 'Quarto Preview',
    //     cwd: workspaceRoot,
    // });
    // previewTerminal.show(false);
    // previewTerminal.sendText(`quarto preview ${relativeQmd} --no-watch --no-browser`, true);
    // ── END original approach ─────────────────────────────────────────────────
}
