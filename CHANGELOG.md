# Changelog

## [0.1.0] - 2026-02-25

### Added
- Setup wizard that automates the full Quarto + Stata + nbstata environment in one command
- Automatic Stata path detection across known macOS install locations, including `.app` bundles (StataNow, Stata 16–18)
- Manual Stata path selection via file picker (`Quarto Stata Helper: Select Stata Path`)
- Python virtual environment creation with nbstata, ipykernel, nbformat, and jupyter installed in isolation
- nbstata Jupyter kernel registration
- Workspace-scoped `.vscode/settings.json` configuration (python interpreter, default kernel, Stata path)
- Automatic `~/.nbstata.conf` generation with correct `stata_dir` and `edition` for Quarto CLI usage outside VS Code
- Preview document command with dedicated terminal that activates `.venv` before running `quarto preview`
- Editor title bar ▶ button for `.qmd` files that triggers the preview command
- Starter `test_stata.qmd` template created at end of setup
- Automatic `.gitignore` entry for `.venv/` to prevent committing the virtual environment
- Homebrew dependency installation via visible interactive terminal (supports admin password prompts)
- Two-phase wizard: if system tools need installing, wizard pauses and resumes cleanly on second run
