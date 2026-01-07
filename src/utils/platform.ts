import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export type Platform = 'windows' | 'macos' | 'linux';
export type Arch = 'x64' | 'arm64';

export function getPlatform(): Platform {
  switch (process.platform) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'macos';
    default:
      return 'linux';
  }
}

export function getArch(): Arch {
  return process.arch === 'arm64' ? 'arm64' : 'x64';
}

export function getBitcoindAssetName(version: string): string {
  const platform = getPlatform();
  const arch = getArch();
  const v = version.replace(/^v/, '');

  switch (platform) {
    case 'windows':
      return `bitcoin-${v}-win64.zip`;
    case 'macos':
      return arch === 'arm64'
        ? `bitcoin-${v}-arm64-apple-darwin.tar.gz`
        : `bitcoin-${v}-x86_64-apple-darwin.tar.gz`;
    case 'linux':
      return arch === 'arm64'
        ? `bitcoin-${v}-aarch64-linux-gnu.tar.gz`
        : `bitcoin-${v}-x86_64-linux-gnu.tar.gz`;
  }
}

export function getOrdAssetName(version: string): string {
  const platform = getPlatform();
  const arch = getArch();

  switch (platform) {
    case 'windows':
      return `ord-${version}-x86_64-pc-windows-msvc.zip`;
    case 'macos':
      return arch === 'arm64'
        ? `ord-${version}-aarch64-apple-darwin.tar.gz`
        : `ord-${version}-x86_64-apple-darwin.tar.gz`;
    case 'linux':
      return arch === 'arm64'
        ? `ord-${version}-aarch64-unknown-linux-gnu.tar.gz`
        : `ord-${version}-x86_64-unknown-linux-gnu.tar.gz`;
  }
}

export function getBinariesDirectory(context: vscode.ExtensionContext): string {
  return path.join(context.globalStorageUri.fsPath, 'binaries');
}

export function getBitcoindPath(context: vscode.ExtensionContext): string {
  const binDir = getBinariesDirectory(context);
  const exe = getPlatform() === 'windows' ? 'bitcoind.exe' : 'bitcoind';
  return path.join(binDir, 'bitcoin', 'bin', exe);
}

export function getBitcoinCliPath(context: vscode.ExtensionContext): string {
  const binDir = getBinariesDirectory(context);
  const exe = getPlatform() === 'windows' ? 'bitcoin-cli.exe' : 'bitcoin-cli';
  return path.join(binDir, 'bitcoin', 'bin', exe);
}

export function getOrdPath(context: vscode.ExtensionContext): string {
  const binDir = getBinariesDirectory(context);
  const exe = getPlatform() === 'windows' ? 'ord.exe' : 'ord';
  return path.join(binDir, 'ord', exe);
}

export function getDefaultDataDirectory(): string {
  const platform = getPlatform();
  const home = os.homedir();

  switch (platform) {
    case 'windows':
      return path.join(process.env.APPDATA || home, 'Bitcoin');
    case 'macos':
      return path.join(home, 'Library', 'Application Support', 'Bitcoin');
    default:
      return path.join(home, '.bitcoin');
  }
}

export function getOrdDataDirectory(): string {
  const platform = getPlatform();
  const home = os.homedir();

  switch (platform) {
    case 'windows':
      return path.join(process.env.APPDATA || home, 'ord');
    case 'macos':
      return path.join(home, 'Library', 'Application Support', 'ord');
    default:
      return path.join(home, '.ord');
  }
}
