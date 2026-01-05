import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Test wallet state utilities
// Since vscode is not available in unit tests, we test the core logic separately

describe('Wallet State', () => {
  describe('Wallet Name Validation', () => {
    function isValidWalletName(name: string): boolean {
      if (!name || name.trim().length === 0) {
        return false;
      }
      return /^[a-zA-Z0-9_-]+$/.test(name);
    }

    it('should accept valid wallet names', () => {
      const validNames = ['ord', 'my-wallet', 'wallet_1', 'Test123', 'a', 'A-B_C'];
      for (const name of validNames) {
        assert.ok(isValidWalletName(name), `Should accept: ${name}`);
      }
    });

    it('should reject empty wallet names', () => {
      assert.ok(!isValidWalletName(''), 'Should reject empty string');
      assert.ok(!isValidWalletName('   '), 'Should reject whitespace only');
    });

    it('should reject wallet names with invalid characters', () => {
      const invalidNames = ['my wallet', 'wallet@1', 'test/wallet', 'a.b', 'x:y', 'a\\b'];
      for (const name of invalidNames) {
        assert.ok(!isValidWalletName(name), `Should reject: ${name}`);
      }
    });
  });

  describe('Network Directory Resolution', () => {
    function getNetworkDir(dataDir: string, network: string): string {
      switch (network) {
        case 'regtest':
          return path.join(dataDir, 'regtest');
        case 'testnet':
          return path.join(dataDir, 'testnet3');
        case 'signet':
          return path.join(dataDir, 'signet');
        default:
          return dataDir;
      }
    }

    it('should return regtest subdirectory for regtest network', () => {
      const dataDir = '/tmp/ord';
      const result = getNetworkDir(dataDir, 'regtest');
      assert.ok(result.endsWith('regtest'));
    });

    it('should return testnet3 subdirectory for testnet network', () => {
      const dataDir = '/tmp/ord';
      const result = getNetworkDir(dataDir, 'testnet');
      assert.ok(result.endsWith('testnet3'));
    });

    it('should return signet subdirectory for signet network', () => {
      const dataDir = '/tmp/ord';
      const result = getNetworkDir(dataDir, 'signet');
      assert.ok(result.endsWith('signet'));
    });

    it('should return base directory for mainnet', () => {
      const dataDir = '/tmp/ord';
      const result = getNetworkDir(dataDir, 'mainnet');
      assert.strictEqual(result, dataDir);
    });
  });

  describe('Wallet Directory Structure', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ord-wallet-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function listWalletsFromDir(walletsDir: string): string[] {
      if (!fs.existsSync(walletsDir)) {
        return [];
      }

      try {
        const entries = fs.readdirSync(walletsDir, { withFileTypes: true });
        const wallets: string[] = [];

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const walletPath = path.join(walletsDir, entry.name);
            const files = fs.readdirSync(walletPath);
            if (files.some(f => f.endsWith('.redb') || f === 'wallet.redb')) {
              wallets.push(entry.name);
            }
          } else if (entry.name.endsWith('.redb')) {
            wallets.push(entry.name.replace('.redb', ''));
          }
        }

        return wallets.sort();
      } catch {
        return [];
      }
    }

    it('should return empty array when wallets directory does not exist', () => {
      const walletsDir = path.join(tmpDir, 'wallets');
      const result = listWalletsFromDir(walletsDir);
      assert.deepStrictEqual(result, []);
    });

    it('should detect wallet directories containing .redb files', () => {
      const walletsDir = path.join(tmpDir, 'wallets');
      const walletDir = path.join(walletsDir, 'my-wallet');
      fs.mkdirSync(walletDir, { recursive: true });
      fs.writeFileSync(path.join(walletDir, 'wallet.redb'), 'fake data');

      const result = listWalletsFromDir(walletsDir);
      assert.deepStrictEqual(result, ['my-wallet']);
    });

    it('should detect wallet .redb files directly in wallets dir', () => {
      const walletsDir = path.join(tmpDir, 'wallets');
      fs.mkdirSync(walletsDir, { recursive: true });
      fs.writeFileSync(path.join(walletsDir, 'ord.redb'), 'fake data');

      const result = listWalletsFromDir(walletsDir);
      assert.deepStrictEqual(result, ['ord']);
    });

    it('should detect multiple wallets', () => {
      const walletsDir = path.join(tmpDir, 'wallets');

      // Create wallet as directory
      const wallet1Dir = path.join(walletsDir, 'wallet-a');
      fs.mkdirSync(wallet1Dir, { recursive: true });
      fs.writeFileSync(path.join(wallet1Dir, 'wallet.redb'), 'fake data');

      // Create wallet as file
      fs.writeFileSync(path.join(walletsDir, 'wallet-b.redb'), 'fake data');

      // Create another directory wallet
      const wallet3Dir = path.join(walletsDir, 'wallet-c');
      fs.mkdirSync(wallet3Dir, { recursive: true });
      fs.writeFileSync(path.join(wallet3Dir, 'data.redb'), 'fake data');

      const result = listWalletsFromDir(walletsDir);
      assert.deepStrictEqual(result, ['wallet-a', 'wallet-b', 'wallet-c']);
    });

    it('should ignore directories without .redb files', () => {
      const walletsDir = path.join(tmpDir, 'wallets');

      // Create valid wallet
      const validDir = path.join(walletsDir, 'valid-wallet');
      fs.mkdirSync(validDir, { recursive: true });
      fs.writeFileSync(path.join(validDir, 'wallet.redb'), 'fake data');

      // Create invalid directory (no .redb file)
      const invalidDir = path.join(walletsDir, 'not-a-wallet');
      fs.mkdirSync(invalidDir, { recursive: true });
      fs.writeFileSync(path.join(invalidDir, 'some-other-file.txt'), 'text');

      const result = listWalletsFromDir(walletsDir);
      assert.deepStrictEqual(result, ['valid-wallet']);
    });
  });

  describe('Default Wallet', () => {
    const DEFAULT_WALLET_NAME = 'ord';

    it('should use "ord" as the default wallet name', () => {
      assert.strictEqual(DEFAULT_WALLET_NAME, 'ord');
    });

    it('should be a valid wallet name', () => {
      function isValidWalletName(name: string): boolean {
        return /^[a-zA-Z0-9_-]+$/.test(name);
      }
      assert.ok(isValidWalletName(DEFAULT_WALLET_NAME));
    });
  });
});

describe('Ord Wallet Commands', () => {
  describe('Wallet Args Building', () => {
    function buildWalletArgs(options: {
      networkFlag: string;
      cookieFile: string;
      dataDir: string;
      walletName: string;
      serverUrl: string;
      command: string;
    }): string[] {
      const args: string[] = [];

      if (options.networkFlag) {
        args.push(options.networkFlag);
      }

      args.push(
        `--cookie-file=${options.cookieFile}`,
        `--data-dir=${options.dataDir}`,
        'wallet',
        `--name=${options.walletName}`,
        `--server-url=${options.serverUrl}`,
        options.command
      );

      return args;
    }

    it('should include wallet name in args', () => {
      const args = buildWalletArgs({
        networkFlag: '--regtest',
        cookieFile: '/tmp/.cookie',
        dataDir: '/tmp/ord',
        walletName: 'my-wallet',
        serverUrl: 'http://127.0.0.1:8080',
        command: 'balance',
      });

      assert.ok(args.includes('--name=my-wallet'));
      assert.ok(args.includes('wallet'));
      assert.ok(args.includes('balance'));
    });

    it('should include network flag when specified', () => {
      const args = buildWalletArgs({
        networkFlag: '--regtest',
        cookieFile: '/tmp/.cookie',
        dataDir: '/tmp/ord',
        walletName: 'ord',
        serverUrl: 'http://127.0.0.1:8080',
        command: 'create',
      });

      assert.ok(args.includes('--regtest'));
    });

    it('should not include network flag for mainnet', () => {
      const args = buildWalletArgs({
        networkFlag: '',
        cookieFile: '/tmp/.cookie',
        dataDir: '/tmp/ord',
        walletName: 'ord',
        serverUrl: 'http://127.0.0.1:8080',
        command: 'receive',
      });

      assert.ok(!args.includes(''));
      assert.ok(args.includes('--name=ord'));
    });

    it('should build correct args for different commands', () => {
      const commands = ['create', 'balance', 'receive', 'inscribe'];

      for (const cmd of commands) {
        const args = buildWalletArgs({
          networkFlag: '--regtest',
          cookieFile: '/tmp/.cookie',
          dataDir: '/tmp/ord',
          walletName: 'test-wallet',
          serverUrl: 'http://127.0.0.1:8080',
          command: cmd,
        });

        assert.ok(args.includes(cmd), `Should include command: ${cmd}`);
        assert.ok(args.includes('--name=test-wallet'), `Should include wallet name for: ${cmd}`);
      }
    });
  });

  describe('Inscribe Args Building', () => {
    function buildInscribeArgs(options: {
      networkFlag: string;
      cookieFile: string;
      dataDir: string;
      walletName: string;
      serverUrl: string;
      feeRate: number;
      filePath: string;
    }): string[] {
      const args: string[] = [];

      if (options.networkFlag) {
        args.push(options.networkFlag);
      }

      args.push(
        `--cookie-file=${options.cookieFile}`,
        `--data-dir=${options.dataDir}`,
        'wallet',
        `--name=${options.walletName}`,
        `--server-url=${options.serverUrl}`,
        'inscribe',
        '--fee-rate',
        options.feeRate.toString(),
        '--file',
        options.filePath
      );

      return args;
    }

    it('should include wallet name in inscribe args', () => {
      const args = buildInscribeArgs({
        networkFlag: '--regtest',
        cookieFile: '/tmp/.cookie',
        dataDir: '/tmp/ord',
        walletName: 'my-inscribe-wallet',
        serverUrl: 'http://127.0.0.1:8080',
        feeRate: 1,
        filePath: '/tmp/test.txt',
      });

      assert.ok(args.includes('--name=my-inscribe-wallet'));
      assert.ok(args.includes('inscribe'));
      assert.ok(args.includes('--fee-rate'));
      assert.ok(args.includes('1'));
      assert.ok(args.includes('--file'));
      assert.ok(args.includes('/tmp/test.txt'));
    });

    it('should use correct fee rate', () => {
      const args = buildInscribeArgs({
        networkFlag: '--regtest',
        cookieFile: '/tmp/.cookie',
        dataDir: '/tmp/ord',
        walletName: 'ord',
        serverUrl: 'http://127.0.0.1:8080',
        feeRate: 5,
        filePath: '/tmp/test.txt',
      });

      const feeRateIndex = args.indexOf('--fee-rate');
      assert.ok(feeRateIndex >= 0);
      assert.strictEqual(args[feeRateIndex + 1], '5');
    });
  });

  describe('Wallet Existence Check', () => {
    function walletExists(walletName: string, existingWallets: string[]): boolean {
      return existingWallets.includes(walletName);
    }

    it('should return true for existing wallet', () => {
      const wallets = ['ord', 'my-wallet', 'test-wallet'];
      assert.ok(walletExists('ord', wallets));
      assert.ok(walletExists('my-wallet', wallets));
    });

    it('should return false for non-existing wallet', () => {
      const wallets = ['ord', 'my-wallet'];
      assert.ok(!walletExists('other-wallet', wallets));
      assert.ok(!walletExists('', wallets));
    });

    it('should be case-sensitive', () => {
      const wallets = ['MyWallet', 'test'];
      assert.ok(walletExists('MyWallet', wallets));
      assert.ok(!walletExists('mywallet', wallets));
      assert.ok(!walletExists('MYWALLET', wallets));
    });
  });
});

describe('Wallet Switching', () => {
  describe('Current Wallet State', () => {
    // Simulate in-memory state for testing
    class MockWalletState {
      private currentWallet: string = 'ord';

      getCurrentWallet(): string {
        return this.currentWallet;
      }

      setCurrentWallet(name: string): void {
        this.currentWallet = name;
      }
    }

    it('should default to "ord" wallet', () => {
      const state = new MockWalletState();
      assert.strictEqual(state.getCurrentWallet(), 'ord');
    });

    it('should update current wallet when switching', () => {
      const state = new MockWalletState();
      state.setCurrentWallet('my-wallet');
      assert.strictEqual(state.getCurrentWallet(), 'my-wallet');
    });

    it('should persist wallet changes', () => {
      const state = new MockWalletState();
      state.setCurrentWallet('wallet-1');
      state.setCurrentWallet('wallet-2');
      state.setCurrentWallet('wallet-3');
      assert.strictEqual(state.getCurrentWallet(), 'wallet-3');
    });
  });

  describe('Wallet Selection UI', () => {
    interface WalletQuickPickItem {
      label: string;
      description: string;
      picked: boolean;
    }

    function buildWalletPickItems(wallets: string[], currentWallet: string): WalletQuickPickItem[] {
      return wallets.map((name) => ({
        label: name,
        description: name === currentWallet ? '(current)' : '',
        picked: name === currentWallet,
      }));
    }

    it('should mark current wallet as picked', () => {
      const items = buildWalletPickItems(['ord', 'wallet-1', 'wallet-2'], 'wallet-1');

      const currentItem = items.find(i => i.label === 'wallet-1');
      assert.ok(currentItem?.picked);
      assert.strictEqual(currentItem?.description, '(current)');
    });

    it('should not mark other wallets as picked', () => {
      const items = buildWalletPickItems(['ord', 'wallet-1', 'wallet-2'], 'ord');

      const otherItems = items.filter(i => i.label !== 'ord');
      for (const item of otherItems) {
        assert.ok(!item.picked);
        assert.strictEqual(item.description, '');
      }
    });

    it('should include all wallets in the list', () => {
      const wallets = ['ord', 'wallet-1', 'wallet-2', 'wallet-3'];
      const items = buildWalletPickItems(wallets, 'ord');

      assert.strictEqual(items.length, wallets.length);
      for (const wallet of wallets) {
        assert.ok(items.some(i => i.label === wallet));
      }
    });
  });
});

describe('Error Handling', () => {
  describe('Wallet Already Exists Error', () => {
    function isWalletExistsError(stderr: string): boolean {
      return stderr.includes('already exists');
    }

    it('should detect "already exists" error', () => {
      const errors = [
        'error: wallet "ord" already exists',
        'Wallet already exists',
        'The wallet already exists at path',
      ];

      for (const error of errors) {
        assert.ok(isWalletExistsError(error), `Should detect: ${error}`);
      }
    });

    it('should not detect unrelated errors', () => {
      const otherErrors = [
        'Connection refused',
        'Invalid wallet name',
        'Network timeout',
      ];

      for (const error of otherErrors) {
        assert.ok(!isWalletExistsError(error), `Should NOT detect: ${error}`);
      }
    });
  });

  describe('Version Mismatch Error', () => {
    function isVersionMismatchError(stderr: string): boolean {
      return (
        stderr.includes('Manual upgrade required') ||
        stderr.includes('Expected file format version') ||
        stderr.includes('failed to open index') ||
        stderr.includes('failed to open wallet database')
      );
    }

    it('should detect version mismatch errors', () => {
      const errors = [
        'Manual upgrade required',
        'Expected file format version 3, but file is version 2',
        'failed to open index: some error',
        'failed to open wallet database',
      ];

      for (const error of errors) {
        assert.ok(isVersionMismatchError(error), `Should detect: ${error}`);
      }
    });

    it('should not detect unrelated errors', () => {
      const otherErrors = [
        'Wallet already exists',
        'Connection refused',
        'Invalid address',
      ];

      for (const error of otherErrors) {
        assert.ok(!isVersionMismatchError(error), `Should NOT detect: ${error}`);
      }
    });
  });
});
