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

        // ── Step 3: Ensure required system tools are present ─────────────────
        // Quarto and Python must be installed by the user before setup can
        // continue. This extension does not install system-level tools.
        const missingSystemDeps = missingDeps.filter(
            d => d !== 'nbstata' && d !== 'jupyter' && d !== 'stata',
        );
        if (missingSystemDeps.length > 0) {
            // Show per-dep error messages with links to the download pages.
            installDependencies(missingSystemDeps);
            await vscode.window.showErrorMessage(
                `Setup cannot continue: the following required tools are missing: ${missingSystemDeps.join(', ')}. ` +
                'Please install them, make sure they are available on your PATH, restart VS Code, then run the setup wizard again.',
                { modal: true },
                'OK',
            );
            return;
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
                // ── Step 4: Create venv + install Python packages ───────────────
                progress.report({ message: 'Setting up virtual environment…' });
                venvPath = await setupVenv((msg) => progress.report({ message: msg }));
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

        const examplePath = path.join(workspaceRoot, 'example.qmd');
        const slidesPath = path.join(workspaceRoot, 'example_slides.qmd');

        const slidesContent =
`---
title: "Stata Results as Slides"
subtitle: "A Quarto + nbstata presentation"
author: "Your Name"
date: today
format:
  revealjs:
    theme: simple
    slide-number: true
    code-fold: false
    smaller: true
jupyter: nbstata
---

## What is this?

This file renders as a **reveal.js slideshow** directly from your Stata analysis.

- Each \`##\` heading becomes a new slide
- Stata output, tables, and graphs are embedded automatically
- Click the **▶ button** in the editor title bar to preview

::: {.notes}
Speaker notes go here — visible in presenter view (press S) but not to the audience.
:::

---

## Load data {.smaller}

\`\`\`{stata}
#| output: false
sysuse auto, clear
\`\`\`

We are using Stata's built-in **auto** dataset: 74 observations on cars.

\`\`\`{stata}
describe
\`\`\`

::: {.notes}
The \`#| output: false\` option on the first cell runs the command silently — useful for data prep steps you don't want on screen.
:::

---

## Summary statistics

\`\`\`{stata}
summarize price mpg weight foreign
\`\`\`

---

## Visualisation: fuel efficiency {.center}

\`\`\`{stata}
histogram mpg, normal ///
    title("Distribution of Fuel Efficiency") ///
    xtitle("Miles per Gallon") ///
    color(navy%60)
\`\`\`

---

## Visualisation: price vs weight {.center}

\`\`\`{stata}
scatter price weight, ///
    mcolor(navy%70) ///
    title("Price vs. Weight") ///
    xtitle("Weight (lbs)") ytitle("Price (USD)") ///
    || lfit price weight, lcolor(red) legend(off)
\`\`\`

---

## Regression results

\`\`\`{stata}
regress price mpg weight foreign
\`\`\`

---

## Two-column layout

:::: {.columns}

::: {.column width="50%"}
**Domestic cars**

\`\`\`{stata}
summarize price mpg if foreign == 0
\`\`\`
:::

::: {.column width="50%"}
**Foreign cars**

\`\`\`{stata}
summarize price mpg if foreign == 1
\`\`\`
:::

::::

---

## Incremental bullets {.incremental}

Key findings:

- Foreign cars have **higher average price**
- Foreign cars have **better fuel economy**
- Weight is a strong predictor of price (p < 0.001)
- The model explains roughly **50% of the variance** in price

---

## Tabulation

\`\`\`{stata}
tabulate rep78 foreign, row
\`\`\`

---

## Code highlighted for teaching {.smaller}

Use \`#| code-line-numbers\` to highlight specific lines for a step-by-step explanation:

\`\`\`{stata}
#| code-line-numbers: "1|2|3-4"
sysuse auto, clear
regress price mpg weight foreign
predict price_hat
scatter price price_hat, ///
    title("Actual vs Fitted Price") legend(off)
\`\`\`

---

## Conclusion

::: {.callout-tip}
## Tip
To export these slides as a **PDF**, open the preview in your browser and press \`E\` to enter print mode, then print to PDF.
:::

- Quarto handles all the layout — just write Stata code and markdown
- Use \`format: beamer\` in the YAML to produce a **LaTeX Beamer** PDF instead
- Replace \`sysuse auto\` with your own dataset to adapt this template
`;
        const exampleContent =
`---
title: "Quarto + Stata: What You Can Do"
author: "Your Name"
date: today
format:
  html:
    toc: true
    toc-depth: 2
    code-fold: true
    theme: cosmo
jupyter: nbstata
---

## Introduction

This document demonstrates what you can do when you combine **Quarto**, **Stata**, and the **nbstata** kernel. Every \`{stata}\` code cell executes live against your Stata installation. The rendered HTML includes your output, tables, and graphs automatically.

Click the **▶ button** in the editor title bar to render and preview this document.

---

## 1. Basic descriptive statistics

Load a built-in dataset and summarise it. Output appears directly below the cell.

\`\`\`{stata}
sysuse auto, clear
describe
summarize price mpg weight length
\`\`\`

---

## 2. Regression output

Run a regression and display results. Quarto captures Stata's output directly.

\`\`\`{stata}
* Simple OLS regression
regress price mpg weight foreign
\`\`\`

\`\`\`{stata}
* A second model with an additional predictor
regress price mpg weight foreign rep78
\`\`\`

---

## 3. Graphs

Stata graphs are captured and embedded directly in the rendered document.

\`\`\`{stata}
* Histogram with a normal density overlay
histogram mpg, normal ///
    title("Distribution of Fuel Efficiency") ///
    xtitle("Miles per Gallon") ///
    color(navy%60)
\`\`\`

\`\`\`{stata}
* Scatter plot with a linear fit
scatter price weight, ///
    mcolor(navy%70) ///
    title("Price vs Weight") ///
    xtitle("Weight (lbs)") ytitle("Price (USD)") ///
    || lfit price weight, lcolor(red) legend(off)
\`\`\`

---

## 4. Mixing Markdown and results inline

You can write prose around your analysis. Quarto supports **callout blocks**, **cross-references**, and **LaTeX** equations alongside Stata output.

The classical linear regression model is:

$$
y_i = \\beta_0 + \\beta_1 x_{1i} + \\cdots + \\beta_k x_{ki} + \\varepsilon_i
\\quad \\varepsilon_i \\sim \\mathcal{N}(0, \\sigma^2)
$$

\`\`\`{stata}
* Formal hypothesis test
regress price mpg weight foreign
test mpg weight
\`\`\`

---

## 5. Loops and programmatic output

Stata's loop syntax works exactly as it would in a do-file.

\`\`\`{stata}
* Summary statistics for each foreign/domestic group
foreach group in 0 1 {
    local label = cond(\`group' == 0, "Domestic", "Foreign")
    display "--- \`label' cars ---"
    summarize price mpg if foreign == \`group'
}
\`\`\`

---

## 6. Data manipulation

\`\`\`{stata}
* Create a new variable and tabulate it
sysuse auto, clear
gen price_category = "Low"    if price < 5000
replace price_category = "Mid"  if price >= 5000 & price < 10000
replace price_category = "High" if price >= 10000

tabulate price_category foreign, row
\`\`\`

---

## 7. Code folding

Because this document sets \`code-fold: true\` in the YAML header, all code cells are collapsed by default in the rendered HTML — readers see clean output and can expand the code if they want to inspect it.

\`\`\`{stata}
* This cell's code is hidden by default in the rendered output
* (readers click "Code" to expand it)
correlate price mpg weight length headroom trunk
\`\`\`

---

## Next steps

- Replace \`sysuse auto\` with your own dataset using \`use "mydata.dta", clear\`
- Add \`#| echo: false\` to a cell to hide its code entirely (not just fold it)
- Add \`#| output: false\` to run a cell silently (useful for data prep)
- Use \`format: pdf\` in the YAML header to render a PDF instead of HTML
`;

        try {
            // Only create if it doesn't already exist so we don't clobber user files.
            if (!fs.existsSync(templatePath)) {
                fs.writeFileSync(templatePath, templateContent, 'utf8');
            } else {
                vscode.window.showInformationMessage(
                    'test_stata.qmd already exists — skipping template creation.',
                );
            }

            // Create example.qmd only if it doesn't already exist.
            if (!fs.existsSync(examplePath)) {
                fs.writeFileSync(examplePath, exampleContent, 'utf8');
            }

            // Create example_slides.qmd only if it doesn't already exist.
            if (!fs.existsSync(slidesPath)) {
                fs.writeFileSync(slidesPath, slidesContent, 'utf8');
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