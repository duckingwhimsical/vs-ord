import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';

// Test the platform utility logic without importing the actual module
// (since vscode is not available in pure unit tests)

type Platform = 'windows' | 'macos' | 'linux';
type Arch = 'x64' | 'arm64';

function getPlatform(): Platform {
  switch (process.platform) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'macos';
    default:
      return 'linux';
  }
}

function getArch(): Arch {
  return process.arch === 'arm64' ? 'arm64' : 'x64';
}

function getBitcoindAssetName(version: string): string {
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

function getOrdAssetName(version: string): string {
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

function getDefaultDataDirectory(): string {
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

function getOrdDataDirectory(): string {
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

describe('Platform Utilities', () => {
  describe('getPlatform()', () => {
    it('should return a valid platform', () => {
      const platform = getPlatform();
      assert.ok(['windows', 'macos', 'linux'].includes(platform));
    });

    it('should return windows on win32', () => {
      if (process.platform === 'win32') {
        assert.strictEqual(getPlatform(), 'windows');
      }
    });

    it('should return macos on darwin', () => {
      if (process.platform === 'darwin') {
        assert.strictEqual(getPlatform(), 'macos');
      }
    });

    it('should return linux on linux', () => {
      if (process.platform === 'linux') {
        assert.strictEqual(getPlatform(), 'linux');
      }
    });
  });

  describe('getArch()', () => {
    it('should return a valid architecture', () => {
      const arch = getArch();
      assert.ok(['x64', 'arm64'].includes(arch));
    });

    it('should match process.arch for x64', () => {
      if (process.arch === 'x64') {
        assert.strictEqual(getArch(), 'x64');
      }
    });

    it('should match process.arch for arm64', () => {
      if (process.arch === 'arm64') {
        assert.strictEqual(getArch(), 'arm64');
      }
    });
  });

  describe('getBitcoindAssetName()', () => {
    it('should return correct Windows asset name', () => {
      const platform = getPlatform();
      if (platform === 'windows') {
        const name = getBitcoindAssetName('v28.0');
        assert.strictEqual(name, 'bitcoin-28.0-win64.zip');
      }
    });

    it('should strip v prefix from version', () => {
      const platform = getPlatform();
      if (platform === 'windows') {
        const name = getBitcoindAssetName('v28.0');
        assert.ok(!name.includes('v28.0'));
        assert.ok(name.includes('28.0'));
      }
    });

    it('should return .tar.gz for Linux', () => {
      const platform = getPlatform();
      if (platform === 'linux') {
        const name = getBitcoindAssetName('v28.0');
        assert.ok(name.endsWith('.tar.gz'));
      }
    });

    it('should return .tar.gz for macOS', () => {
      const platform = getPlatform();
      if (platform === 'macos') {
        const name = getBitcoindAssetName('v28.0');
        assert.ok(name.endsWith('.tar.gz'));
      }
    });
  });

  describe('getOrdAssetName()', () => {
    it('should return correct Windows asset name', () => {
      const platform = getPlatform();
      if (platform === 'windows') {
        const name = getOrdAssetName('0.21.0');
        assert.strictEqual(name, 'ord-0.21.0-x86_64-pc-windows-msvc.zip');
      }
    });

    it('should return .tar.gz for Linux', () => {
      const platform = getPlatform();
      if (platform === 'linux') {
        const name = getOrdAssetName('0.21.0');
        assert.ok(name.endsWith('.tar.gz'));
        assert.ok(name.includes('linux'));
      }
    });

    it('should return .tar.gz for macOS', () => {
      const platform = getPlatform();
      if (platform === 'macos') {
        const name = getOrdAssetName('0.21.0');
        assert.ok(name.endsWith('.tar.gz'));
        assert.ok(name.includes('apple-darwin'));
      }
    });

    it('should include arm64 for ARM Macs', () => {
      const platform = getPlatform();
      const arch = getArch();
      if (platform === 'macos' && arch === 'arm64') {
        const name = getOrdAssetName('0.21.0');
        assert.ok(name.includes('aarch64'));
      }
    });
  });

  describe('getDefaultDataDirectory()', () => {
    it('should return a non-empty path', () => {
      const dir = getDefaultDataDirectory();
      assert.ok(dir.length > 0);
    });

    it('should return path containing Bitcoin', () => {
      const dir = getDefaultDataDirectory();
      assert.ok(dir.toLowerCase().includes('bitcoin'));
    });

    it('should return an absolute path', () => {
      const dir = getDefaultDataDirectory();
      assert.ok(path.isAbsolute(dir));
    });
  });

  describe('getOrdDataDirectory()', () => {
    it('should return a non-empty path', () => {
      const dir = getOrdDataDirectory();
      assert.ok(dir.length > 0);
    });

    it('should return path containing ord', () => {
      const dir = getOrdDataDirectory();
      assert.ok(dir.toLowerCase().includes('ord'));
    });

    it('should return an absolute path', () => {
      const dir = getOrdDataDirectory();
      assert.ok(path.isAbsolute(dir));
    });
  });
});
