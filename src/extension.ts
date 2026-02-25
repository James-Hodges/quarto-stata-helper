import * as vscode from 'vscode';
import { checkDependencies } from './commands/checkDependencies';
import { installDependencies } from './commands/installDependencies';
import { setupVenv } from './commands/setupVenv';
import { registerKernel } from './commands/registerKernel';
import { configureSettings } from './commands/configureSettings';
import { selectStataPath } from './commands/selectStataPath';
import { previewDocument } from './commands/previewDocument';
import { SetupWizard } from './wizards/setupWizard';

export function activate(context: vscode.ExtensionContext) {
    const checkDepsCommand = vscode.commands.registerCommand('quarto-stata-helper.checkDependencies', checkDependencies);
    const installDepsCommand = vscode.commands.registerCommand('quarto-stata-helper.installDependencies', installDependencies);
    const setupVenvCommand = vscode.commands.registerCommand('quarto-stata-helper.setupVenv', setupVenv);
    const registerKernelCommand = vscode.commands.registerCommand('quarto-stata-helper.registerKernel', registerKernel);
    const configureSettingsCommand = vscode.commands.registerCommand('quarto-stata-helper.configureSettings', configureSettings);
    const selectStataPathCommand = vscode.commands.registerCommand('quarto-stata-helper.selectStataPath', selectStataPath);
    const previewDocumentCommand = vscode.commands.registerCommand('quarto-stata-helper.previewDocument', previewDocument);
    const setupWizardCommand = vscode.commands.registerCommand(
        'quarto-stata-helper.setupWizard',
        () => new SetupWizard(context).start(),
    );

    context.subscriptions.push(
        checkDepsCommand,
        installDepsCommand,
        setupVenvCommand,
        registerKernelCommand,
        configureSettingsCommand,
        selectStataPathCommand,
        previewDocumentCommand,
        setupWizardCommand,
    );
}

export function deactivate() {}