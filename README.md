# Quarto Stata Helper

A VS Code extension that automates the setup of a [Quarto](https://quarto.org) + [Stata](https://www.stata.com) writing environment using the [nbstata](https://github.com/hugetim/nbstata) Jupyter kernel. After running the one-time setup wizard, you can write `.qmd` documents with `{stata}` code cells that execute live against a licensed Stata installation.

---

## Prerequisites

The following must be installed **before** running the setup wizard. The extension does not install them for you.

| Prerequisite | How to install |
|---|---|
| **Stata** | Purchase and install from [stata.com](https://www.stata.com). StataNow and versioned installs (Stata 16–18) are all supported. |
| **Python 3** | Download from [python.org](https://www.python.org/downloads/) or install via your preferred package manager. Make sure `python3` is available on your `PATH`. |
| **Quarto** | Download from [quarto.org](https://quarto.org/docs/get-started/). Make sure `quarto` is available on your `PATH`. |

The following VS Code extensions are **automatically installed** alongside this extension:

| Extension | Why it's needed |
|---|---|
| [Quarto](https://marketplace.visualstudio.com/items?itemName=quarto.quarto) | `.qmd` syntax highlighting and document support |
| [Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python) | Python interpreter management |
| [Jupyter](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter) | Interactive code cell execution in `.qmd` files |

---

## Setup

### 1. Install prerequisites

Ensure **Python 3**, **Quarto**, and **Stata** are installed and that `python3` and `quarto` are available on your `PATH`. Restart VS Code after installing them so the new `PATH` entries are picked up.

### 2. Open your project folder

Open the folder where you want to write Stata Quarto documents in VS Code (**File → Open Folder**). The wizard creates all files (`.venv`, `.vscode/settings.json`, `test_stata.qmd`) inside this folder.

### 3. Run the setup wizard

Open the Command Palette (`Cmd+Shift+P`) and run:

```
Quarto Stata Helper: Run Setup Wizard
```

The wizard will:

1. **Check dependencies** — verifies that Quarto, Python, and Stata are available. If any system tool is missing, setup stops and shows an error with a link to the relevant download page.
2. **Locate Stata** — probes known install paths automatically (see [Stata path detection](#stata-path-detection)); prompts you to locate it manually if not found.
3. **Create `.venv`** — builds an isolated Python virtual environment in your workspace root and installs `nbstata`, `ipykernel`, `nbformat`, and `jupyter` into it.
4. **Register the kernel** — registers the nbstata Jupyter kernel so VS Code can find it.
5. **Write workspace settings** — creates/updates `.vscode/settings.json` with the correct Python interpreter path, nbstata Stata path, and default Jupyter kernel.
6. **Create a test file** — generates `test_stata.qmd` with a starter Stata snippet and offers to open it.

### 4. Test your setup

Open `test_stata.qmd` (created by the wizard, or use **Open test_stata.qmd** in the completion dialog).

- **Interactive cells**: Click the ▶ button next to a `{stata}` code cell. When prompted for a kernel, select **nbstata**. The cell will execute against your live Stata installation.
- **Full document preview**: Click the **▶ (play)** button in the editor title bar (top right) to run `quarto preview` in a dedicated terminal. This renders the document and opens a live-reloading browser preview.

---

## Stata path detection

The extension probes the following locations automatically, in order:

```
/Applications/StataNow/     ← StataNow (current branded name)
/Applications/Stata/        ← Generic install
/Applications/Stata18/
/Applications/Stata17/
/Applications/Stata16/
```

Within each directory it looks for editions in preference order: `StataMP` → `StataSE` → `StataBE` → `Stata`. Both bare binaries and `.app` bundles are detected — e.g. `StataBE.app` is automatically resolved to `StataBE.app/Contents/MacOS/StataBE`.

If auto-detection fails, the wizard will prompt you to locate Stata manually. You can also run this at any time:

```
Quarto Stata Helper: Select Stata Path
```

Or set it directly in `.vscode/settings.json`:

```json
{
    "quartoStataHelper.stataPath": "/Applications/StataNow/StataBE.app/Contents/MacOS/StataBE"
}
```

---

## Commands

All commands are available via the Command Palette (`Cmd+Shift+P`):

| Command | Description |
|---|---|
| `Quarto Stata Helper: Run Setup Wizard` | Runs the full one-time setup flow |
| `Quarto Stata Helper: Select Stata Path` | Opens a file picker to manually locate your Stata executable |
| `Quarto Stata Helper: Preview Document` | Runs `quarto preview` for the active `.qmd` file in a dedicated terminal (also available as the ▶ button in the editor title bar) |
| `Quarto Stata Helper: Check Dependencies` | Reports which dependencies are missing |
| `Quarto Stata Helper: Setup Python Virtual Environment` | Creates `.venv` and installs Python packages |
| `Quarto Stata Helper: Register Stata Kernel` | Registers the nbstata kernel with Jupyter |
| `Quarto Stata Helper: Configure Settings` | Writes `.vscode/settings.json` |

---

## What gets written to your workspace

The wizard only modifies files inside your open workspace folder — nothing is changed globally in VS Code.

| Path | Contents |
|---|---|
| `.venv/` | Isolated Python environment with nbstata and dependencies |
| `.vscode/settings.json` | `python.defaultInterpreterPath`, `nbstata.stataPath`, `jupyter.defaultKernel` |
| `test_stata.qmd` | Starter Quarto document with a Stata code cell (only created if it doesn't already exist) |

---

## Troubleshooting

### Quarto or Python not found during setup

The wizard will stop and show an error message if `quarto` or `python3` are not on your `PATH`. Install the missing tool (see [Prerequisites](#prerequisites)), then **restart VS Code** so the updated `PATH` is picked up, and re-run the wizard.

### Stata not found during setup

The wizard shows a "Stata was not found" dialog. Choose **Locate Stata…** and navigate to your Stata application. You can select the `.app` bundle directly (e.g. `StataBE.app`) — the extension will resolve the correct binary inside it automatically.

To fix it after setup, run **Quarto Stata Helper: Select Stata Path** from the Command Palette.

### "kernel not found" or wrong kernel selected

1. Check that the kernel was registered: open a terminal in VS Code and run `jupyter kernelspec list`. You should see `nbstata` in the list.
2. If it's missing, run **Register Stata Kernel** from the Command Palette.
3. Confirm `.vscode/settings.json` contains `"jupyter.defaultKernel": "nbstata"`. If not, run **Configure Settings**.

### Interactive cell opens with a Python kernel instead of nbstata

Confirm `.vscode/settings.json` contains:
```json
"jupyter.defaultKernel": "nbstata"
```
If it's missing, run **Configure Settings** from the Command Palette. You can also switch the kernel manually using the kernel picker in the top-right of the interactive panel.

### `quarto preview` button does nothing or shows an error

- The ▶ button requires a `.qmd` file to be the active editor.
- Check the **Quarto Preview** terminal that opens — any error output from `quarto` or `nbstata` will appear there.
- Make sure the `.venv` exists (`ls .venv/bin/python` in your workspace terminal). If not, re-run the setup wizard.

### `quarto preview` fails with "nbstata not found"

The preview terminal activates `.venv` automatically, but if `.venv` was deleted or is corrupted, the activation will fail. Re-run the setup wizard to recreate it.

### Python interpreter not recognised

Check that `.vscode/settings.json` contains a `python.defaultInterpreterPath` pointing at your workspace `.venv`:
```json
"python.defaultInterpreterPath": "/path/to/your/workspace/.venv/bin/python"
```
The extension writes the absolute path to your workspace, so the value will be specific to your machine. If the key is missing entirely, run **Quarto Stata Helper: Configure Settings** from the Command Palette, then reload the VS Code window (`Cmd+Shift+P → Developer: Reload Window`).

### Resetting to a clean state

To start fresh and re-run the wizard from scratch:

```bash
# In your workspace folder:
rm -rf .venv .vscode test_stata.qmd

# Remove the registered kernel:
jupyter kernelspec remove nbstata
```

Then close and reopen VS Code in the workspace folder and run the wizard again.

---

## Requirements summary

- VS Code 1.74.0 or later
- Python 3 installed and available as `python3` on your `PATH`
- Quarto installed and available as `quarto` on your `PATH`
- A licensed copy of Stata (BE, SE, or MP; version 16 or later recommended)