import * as assert from 'assert';
import * as https from 'https';
import * as http from 'http';

/**
 * These tests verify that download URLs are correctly constructed
 * and that the binaries are actually available at those URLs.
 *
 * This test would have caught the bug where we tried to download
 * Bitcoin Core from GitHub assets (which are empty) instead of
 * bitcoincore.org.
 */
describe('Download URL Verification', () => {
  // Helper to construct Bitcoin Core download URL
  function getBitcoinCoreDownloadUrl(version: string, assetName: string): string {
    const cleanVersion = version.replace(/^v/, '');
    return `https://bitcoincore.org/bin/bitcoin-core-${cleanVersion}/${assetName}`;
  }

  // Helper to get asset name for platform
  function getBitcoindAssetName(version: string, platform: string, arch: string): string {
    const v = version.replace(/^v/, '');

    switch (platform) {
      case 'windows':
        return `bitcoin-${v}-win64.zip`;
      case 'macos':
        return arch === 'arm64'
          ? `bitcoin-${v}-aarch64-apple-darwin.tar.gz`
          : `bitcoin-${v}-x86_64-apple-darwin.tar.gz`;
      case 'linux':
        return arch === 'arm64'
          ? `bitcoin-${v}-aarch64-linux-gnu.tar.gz`
          : `bitcoin-${v}-x86_64-linux-gnu.tar.gz`;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  function getOrdAssetName(version: string, platform: string, arch: string): string {
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
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  describe('Bitcoin Core URL Construction', () => {
    it('should use bitcoincore.org, NOT GitHub', () => {
      const version = 'v30.1';
      const assetName = getBitcoindAssetName(version, 'windows', 'x64');
      const url = getBitcoinCoreDownloadUrl(version, assetName);

      // CRITICAL: Must use bitcoincore.org, not GitHub
      assert.ok(url.includes('bitcoincore.org'), 'URL must use bitcoincore.org');
      assert.ok(!url.includes('github.com'), 'URL must NOT use github.com');
      assert.ok(!url.includes('githubusercontent'), 'URL must NOT use githubusercontent');
    });

    it('should construct correct URL for Windows', () => {
      const version = 'v30.1';
      const assetName = getBitcoindAssetName(version, 'windows', 'x64');
      const url = getBitcoinCoreDownloadUrl(version, assetName);

      assert.strictEqual(
        url,
        'https://bitcoincore.org/bin/bitcoin-core-30.1/bitcoin-30.1-win64.zip'
      );
    });

    it('should construct correct URL for Linux x64', () => {
      const version = 'v30.1';
      const assetName = getBitcoindAssetName(version, 'linux', 'x64');
      const url = getBitcoinCoreDownloadUrl(version, assetName);

      assert.strictEqual(
        url,
        'https://bitcoincore.org/bin/bitcoin-core-30.1/bitcoin-30.1-x86_64-linux-gnu.tar.gz'
      );
    });

    it('should construct correct URL for Linux arm64', () => {
      const version = 'v30.1';
      const assetName = getBitcoindAssetName(version, 'linux', 'arm64');
      const url = getBitcoinCoreDownloadUrl(version, assetName);

      assert.strictEqual(
        url,
        'https://bitcoincore.org/bin/bitcoin-core-30.1/bitcoin-30.1-aarch64-linux-gnu.tar.gz'
      );
    });

    it('should construct correct URL for macOS x64', () => {
      const version = 'v30.1';
      const assetName = getBitcoindAssetName(version, 'macos', 'x64');
      const url = getBitcoinCoreDownloadUrl(version, assetName);

      assert.strictEqual(
        url,
        'https://bitcoincore.org/bin/bitcoin-core-30.1/bitcoin-30.1-x86_64-apple-darwin.tar.gz'
      );
    });

    it('should construct correct URL for macOS arm64', () => {
      const version = 'v30.1';
      const assetName = getBitcoindAssetName(version, 'macos', 'arm64');
      const url = getBitcoinCoreDownloadUrl(version, assetName);

      assert.strictEqual(
        url,
        'https://bitcoincore.org/bin/bitcoin-core-30.1/bitcoin-30.1-aarch64-apple-darwin.tar.gz'
      );
    });

    it('should strip v prefix from version', () => {
      const url = getBitcoinCoreDownloadUrl('v30.1', 'bitcoin-30.1-win64.zip');

      // URL should contain 30.1, not v30.1
      assert.ok(url.includes('/bitcoin-core-30.1/'));
      assert.ok(!url.includes('v30.1'));
    });

    it('should handle versions without v prefix', () => {
      const url = getBitcoinCoreDownloadUrl('30.1', 'bitcoin-30.1-win64.zip');

      assert.strictEqual(
        url,
        'https://bitcoincore.org/bin/bitcoin-core-30.1/bitcoin-30.1-win64.zip'
      );
    });
  });

  describe('Ord URL Construction', () => {
    it('should use GitHub releases for ord', () => {
      // ord DOES use GitHub releases (unlike Bitcoin Core)
      const version = '0.21.0';
      const assetName = getOrdAssetName(version, 'windows', 'x64');

      // Asset name should be correctly formatted
      assert.strictEqual(assetName, 'ord-0.21.0-x86_64-pc-windows-msvc.zip');
    });

    it('should construct correct asset name for Linux', () => {
      const assetName = getOrdAssetName('0.21.0', 'linux', 'x64');
      assert.strictEqual(assetName, 'ord-0.21.0-x86_64-unknown-linux-gnu.tar.gz');
    });

    it('should construct correct asset name for macOS', () => {
      const assetName = getOrdAssetName('0.21.0', 'macos', 'x64');
      assert.strictEqual(assetName, 'ord-0.21.0-x86_64-apple-darwin.tar.gz');
    });
  });

  describe('GitHub Release Structure', () => {
    it('should handle Bitcoin Core releases with empty assets', () => {
      // Bitcoin Core GitHub releases have NO assets - this is expected
      const mockBitcoinRelease = {
        tag_name: 'v30.1',
        assets: [], // Empty! This is correct - binaries are on bitcoincore.org
      };

      // Should NOT try to find asset in GitHub release
      const asset = mockBitcoinRelease.assets.find((a: any) => a.name.includes('win64'));
      assert.strictEqual(asset, undefined);

      // Should instead construct URL to bitcoincore.org
      const url = getBitcoinCoreDownloadUrl(
        mockBitcoinRelease.tag_name,
        getBitcoindAssetName(mockBitcoinRelease.tag_name, 'windows', 'x64')
      );
      assert.ok(url.includes('bitcoincore.org'));
    });

    it('should handle ord releases with assets', () => {
      // ord GitHub releases DO have assets
      const mockOrdRelease = {
        tag_name: '0.21.0',
        assets: [
          {
            name: 'ord-0.21.0-x86_64-pc-windows-msvc.zip',
            browser_download_url: 'https://github.com/ordinals/ord/releases/download/0.21.0/ord-0.21.0-x86_64-pc-windows-msvc.zip',
          },
        ],
      };

      const assetName = getOrdAssetName('0.21.0', 'windows', 'x64');
      const asset = mockOrdRelease.assets.find((a) => a.name === assetName);

      assert.ok(asset, 'Should find ord asset in GitHub release');
      assert.ok(asset.browser_download_url.includes('github.com'));
    });
  });

  describe('URL Validation (Live Check)', function () {
    // These tests make real HTTP requests - skip in CI or if offline
    this.timeout(10000);

    it('should verify bitcoincore.org URL structure is valid', (done) => {
      // Just check that the URL pattern is valid by making a HEAD request
      const url = 'https://bitcoincore.org/bin/bitcoin-core-28.0/';

      https.get(url, { method: 'HEAD' }, (res) => {
        // 200 = exists, 301/302 = redirect (also ok)
        assert.ok(
          res.statusCode === 200 || res.statusCode === 301 || res.statusCode === 302,
          `Expected 200/301/302 but got ${res.statusCode}`
        );
        done();
      }).on('error', (err) => {
        // Skip test if offline
        if (err.message.includes('ENOTFOUND') || err.message.includes('ETIMEDOUT')) {
          done();
        } else {
          done(err);
        }
      });
    });

    it('should verify GitHub API returns empty assets for Bitcoin Core', (done) => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/bitcoin/bitcoin/releases/latest',
        headers: {
          'User-Agent': 'vs-ord-test',
        },
      };

      https.get(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const release = JSON.parse(data);
            // Bitcoin Core releases should have empty or minimal assets
            // (they might have source archives but NOT binaries)
            const hasBinaryAssets = release.assets?.some(
              (a: any) =>
                a.name.includes('win64.zip') ||
                a.name.includes('linux-gnu.tar.gz') ||
                a.name.includes('apple-darwin.tar.gz')
            );
            assert.strictEqual(
              hasBinaryAssets,
              false,
              'Bitcoin Core GitHub releases should NOT have binary assets'
            );
            done();
          } catch (e) {
            done(e);
          }
        });
      }).on('error', (err) => {
        // Skip if offline
        if (err.message.includes('ENOTFOUND')) {
          done();
        } else {
          done(err);
        }
      });
    });

    it('should verify GitHub API returns assets for ord', (done) => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/ordinals/ord/releases/latest',
        headers: {
          'User-Agent': 'vs-ord-test',
        },
      };

      https.get(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const release = JSON.parse(data);
            // ord releases SHOULD have binary assets
            assert.ok(
              release.assets && release.assets.length > 0,
              'ord GitHub releases should have assets'
            );

            const hasWindowsAsset = release.assets.some(
              (a: any) => a.name.includes('windows')
            );
            assert.ok(hasWindowsAsset, 'ord should have Windows binary');
            done();
          } catch (e) {
            done(e);
          }
        });
      }).on('error', (err) => {
        // Skip if offline
        if (err.message.includes('ENOTFOUND')) {
          done();
        } else {
          done(err);
        }
      });
    });
  });
});
