import { platform } from 'os';

export function getPlatformInfo() {
    const osPlatform = platform();
    const arch = process.arch;

    return {
        os: osPlatform,
        architecture: arch,
    };
}

export function isWindows() {
    return process.platform === 'win32';
}

export function isMac() {
    return process.platform === 'darwin';
}

export function isLinux() {
    return process.platform === 'linux';
}