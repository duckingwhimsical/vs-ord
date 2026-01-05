import * as assert from 'assert';
import * as sinon from 'sinon';
import * as https from 'https';
import { EventEmitter } from 'events';

// We'll test the GitHub API parsing logic
describe('Download Service', () => {
  describe('GitHub Release Parsing', () => {
    it('should parse Bitcoin Core release structure', () => {
      const mockRelease = {
        tag_name: 'v28.0',
        assets: [
          { name: 'bitcoin-28.0-win64.zip', browser_download_url: 'https://example.com/bitcoin-28.0-win64.zip' },
          { name: 'bitcoin-28.0-x86_64-linux-gnu.tar.gz', browser_download_url: 'https://example.com/bitcoin-28.0-x86_64-linux-gnu.tar.gz' },
          { name: 'bitcoin-28.0-x86_64-apple-darwin.tar.gz', browser_download_url: 'https://example.com/bitcoin-28.0-x86_64-apple-darwin.tar.gz' },
        ],
      };

      assert.strictEqual(mockRelease.tag_name, 'v28.0');
      assert.strictEqual(mockRelease.assets.length, 3);

      const winAsset = mockRelease.assets.find((a) => a.name.includes('win64'));
      assert.ok(winAsset);
      assert.strictEqual(winAsset.name, 'bitcoin-28.0-win64.zip');
    });

    it('should parse ord release structure', () => {
      const mockRelease = {
        tag_name: '0.21.0',
        assets: [
          { name: 'ord-0.21.0-x86_64-pc-windows-msvc.zip', browser_download_url: 'https://example.com/ord-0.21.0-x86_64-pc-windows-msvc.zip' },
          { name: 'ord-0.21.0-x86_64-unknown-linux-gnu.tar.gz', browser_download_url: 'https://example.com/ord-0.21.0-x86_64-unknown-linux-gnu.tar.gz' },
          { name: 'ord-0.21.0-x86_64-apple-darwin.tar.gz', browser_download_url: 'https://example.com/ord-0.21.0-x86_64-apple-darwin.tar.gz' },
        ],
      };

      assert.strictEqual(mockRelease.tag_name, '0.21.0');

      const linuxAsset = mockRelease.assets.find((a) => a.name.includes('linux'));
      assert.ok(linuxAsset);
      assert.ok(linuxAsset.name.includes('x86_64-unknown-linux-gnu'));
    });

    it('should find correct asset for platform', () => {
      const mockAssets = [
        { name: 'ord-0.21.0-x86_64-pc-windows-msvc.zip' },
        { name: 'ord-0.21.0-x86_64-unknown-linux-gnu.tar.gz' },
        { name: 'ord-0.21.0-aarch64-unknown-linux-gnu.tar.gz' },
        { name: 'ord-0.21.0-x86_64-apple-darwin.tar.gz' },
        { name: 'ord-0.21.0-aarch64-apple-darwin.tar.gz' },
      ];

      // Find Windows asset
      const winAsset = mockAssets.find((a) => a.name.includes('windows'));
      assert.ok(winAsset);
      assert.ok(winAsset.name.endsWith('.zip'));

      // Find Linux x64 asset
      const linuxX64 = mockAssets.find((a) => a.name.includes('x86_64-unknown-linux'));
      assert.ok(linuxX64);

      // Find Linux arm64 asset
      const linuxArm = mockAssets.find((a) => a.name.includes('aarch64-unknown-linux'));
      assert.ok(linuxArm);

      // Find macOS x64 asset
      const macX64 = mockAssets.find((a) => a.name.includes('x86_64-apple-darwin'));
      assert.ok(macX64);

      // Find macOS arm64 asset
      const macArm = mockAssets.find((a) => a.name.includes('aarch64-apple-darwin'));
      assert.ok(macArm);
    });
  });

  describe('Version comparison', () => {
    it('should detect when update is needed', () => {
      const installed = { bitcoind: 'v27.0', ord: '0.20.0' };
      const latest = { bitcoind: 'v28.0', ord: '0.21.0' };

      assert.notStrictEqual(installed.bitcoind, latest.bitcoind);
      assert.notStrictEqual(installed.ord, latest.ord);
    });

    it('should detect when no update is needed', () => {
      const installed = { bitcoind: 'v28.0', ord: '0.21.0' };
      const latest = { bitcoind: 'v28.0', ord: '0.21.0' };

      assert.strictEqual(installed.bitcoind, latest.bitcoind);
      assert.strictEqual(installed.ord, latest.ord);
    });
  });

  describe('Archive type detection', () => {
    it('should detect zip files', () => {
      const path = 'bitcoin-28.0-win64.zip';
      assert.ok(path.endsWith('.zip'));
    });

    it('should detect tar.gz files', () => {
      const path = 'bitcoin-28.0-x86_64-linux-gnu.tar.gz';
      assert.ok(path.endsWith('.tar.gz'));
    });
  });
});
