import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { checkDependencies } from '../commands/checkDependencies';
import { installDependencies } from '../commands/installDependencies';
import { setupVenv } from '../commands/setupVenv';
import { registerKernel } from '../commands/registerKernel';
import { configureSettings } from '../commands/configureSettings';
import { selectStataPath, getStataPath } from '../commands/selectStataPath';

export class SetupWizard {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public async start() {
        // ── Pre-flight: workspace folder required ─────────────────────────────
        if (!vscode.workspace.workspaceFolders?.length) {
            vscode.window.showErrorMessage(
                'Quarto Stata Helper: Please open a folder before running setup.',
            );
            return;
        }

        // ── Step 1: Check dependencies ────────────────────────────────────────
        let missingDeps: string[];
        try {
            missingDeps = await checkDependencies();
        } catch (error) {
            vscode.window.showErrorMessage(
                `Setup failed at dependency check: ${(error as Error).message}`,
            );
            return;
        }

        // ── Step 2: Handle missing Stata ──────────────────────────────────────
        // Stata is a paid app and can't be installed automatically. If it isn't
        // found in any known location, give the user three choices before we
        // continue so the rest of the environment is still built correctly.
        if (missingDeps.includes('stata')) {
            const choice = await vscode.window.showWarningMessage(
                'Stata was not found in any known install location. ' +
                'nbstata requires a licensed copy of Stata to run code cells.',
                { modal: true },
                'Locate Stata…',
                'Continue Anyway',
                'Cancel',
            );

            if (choice === undefined || choice === 'Cancel') {
                // Escape key or Cancel — stop setup entirely
                return;
            }

            if (choice === 'Locate Stata…') {
                const chosen = await selectStataPath();
                if (!chosen) {
                    // User dismissed the file picker — treat as Cancel
                    return;
                }
                // Remove 'stata' from missing deps since it's now resolved
                missingDeps = missingDeps.filter(d => d !== 'stata');
            }
            // 'Continue Anyway': proceed without Stata. The environment will
            // be built but nbstata won't run cells until Stata is installed.
        }

        // ── Step 3: Install missing system dependencies via Homebrew ──────────
        // Exclude Python-package deps (handled by setupVenv) and stata
        // (handled above or must be installed manually).
        const brewDeps = missingDeps.filter(
            d => d !== 'nbstata' && d !== 'jupyter' && d !== 'stata',
        );
        if (brewDeps.length > 0) {
            const install = await vscode.window.showInformationMessage(
                `Missing system tools: ${brewDeps.join(', ')}. Install now via Homebrew?`,
                { modal: true },
                'Yes',
                'No',
            );
            if (install === 'Yes') {
                // installDependencies opens a visible terminal so admin-password
                // prompts work. Because the terminal is async we cannot await
                // completion — stop here and ask the user to re-run the wizard.
                installDependencies(brewDeps);
                vscode.window.showInformationMessage(
                    'Installing system tools in the "Quarto Stata Helper: Install" terminal. ' +
                    'Once the installs finish, run the setup wizard again to complete setup.',
                    { modal: true },
                    'OK',
                );
                return;
            }
            // 'No': user chose to skip — continue setup anyway (quarto/python
            // may already be installed despite not being detected, or user will
            // fix it manually).
        }

        // ── Steps 4–6: venv, kernel, settings (wrapped in progress notification)
        // These steps are silent background processes that can take 2–4 minutes
        // on first run. The progress notification prevents VS Code from appearing
        // frozen and keeps the user informed at each stage.
        let venvPath: string | false = false;
        const setupOk = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Quarto Stata Helper: Setting up environment',
                cancellable: false,
            },
            async (progress) => {
                // ── Step 4: Create venv + install Python packages ─────────────
                progress.report({ message: 'Creating virtual environment and installing packages…' });
                venvPath = await setupVenv();
                if (!venvPath) {
                    vscode.window.showErrorMessage(
                        'Setup failed: could not create the virtual environment. ' +
                        'Check the notifications above for the specific error.',
                    );
                    return false;
                }

                // ── Step 5: Register the nbstata kernel ───────────────────────
                progress.report({ message: 'Registering nbstata Jupyter kernel…' });
                try {
                    await registerKernel(venvPath);
                } catch (error) {
                    vscode.window.showErrorMessage(
                        `Setup failed while registering the Stata kernel: ${(error as Error).message}`,
                    );
                    return false;
                }

                // ── Step 6: Write .vscode/settings.json ───────────────────────
                progress.report({ message: 'Writing workspace settings…' });
                try {
                    await configureSettings();
                } catch (error) {
                    vscode.window.showErrorMessage(
                        `Setup failed while configuring VS Code settings: ${(error as Error).message}`,
                    );
                    return false;
                }

                return true;
            },
        );

        if (!setupOk) { return; }

        // ── Step 7: Create starter template + .gitignore ─────────────────────
        const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
        const templatePath = path.join(workspaceRoot, 'test_stata.qmd');
        const templateContent =
`---
jupyter: nbstata
format: html
---

\`\`\`{stata}
sysuse auto
summarize mpg
hist mpg
\`\`\`
`;

        try {
            // Only create if it doesn't already exist so we don't clobber user files.
            if (!fs.existsSync(templatePath)) {
                fs.writeFileSync(templatePath, templateContent, 'utf8');
            }

            // Ensure .venv is excluded from git — without this, git status will
            // show hundreds of untracked files from the virtual environment.
            const gitignorePath = path.join(workspaceRoot, '.gitignore');
            const venvEntry = '.venv/';
            let gitignoreContent = fs.existsSync(gitignorePath)
                ? fs.readFileSync(gitignorePath, 'utf8')
                : '';
            if (!gitignoreContent.includes(venvEntry)) {
                const separator = gitignoreContent.length > 0 && !gitignoreContent.endsWith('\n') ? '\n' : '';
                fs.writeFileSync(gitignorePath, `${gitignoreContent}${separator}# Python virtual environment (Quarto Stata Helper)\n${venvEntry}\n`, 'utf8');
            }

            const stataResolved = getStataPath();
            const stataNote = stataResolved
                ? `Stata found at: ${stataResolved}.`
                : 'Note: Stata was not located — run "Select Stata Path" when Stata is installed.';

            const open = await vscode.window.showInformationMessage(
                `Quarto Stata Helper setup complete! ${stataNote}`,
                'Open test_stata.qmd',
                'Dismiss',
            );

            if (open === 'Open test_stata.qmd') {
                const doc = await vscode.workspace.openTextDocument(templatePath);
                await vscode.window.showTextDocument(doc);
            }
        } catch (error) {
            // Template creation is non-critical — report but don't fail setup.
            vscode.window.showWarningMessage(
                `Setup complete, but could not create template file: ${(error as Error).message}`,
            );
        }
    }
}