import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

/**
 * Runs a shell command and returns stdout.
 *
 * NOTE: stderr is intentionally NOT treated as an error. Many tools (pip,
 * brew, python) write progress/warnings to stderr even on success. The
 * promisified exec already throws when the process exits with a non-zero
 * code, which is the correct signal for failure.
 */
export async function runCommand(command: string): Promise<string> {
    try {
        const { stdout } = await execPromise(command);
        return stdout;
    } catch (error) {
        const err = error as Error & { stderr?: string; stdout?: string };
        const detail = err.stderr?.trim() || err.stdout?.trim() || err.message;
        throw new Error(`Command failed: ${command}\n${detail}`);
    }
}