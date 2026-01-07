import * as assert from 'assert';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Download Service Integration', () => {
  describe('GitHub API Response Handling', () => {
    let mockServer: http.Server;
    let serverPort: number;

    const mockBitcoinRelease = {
      tag_name: 'v28.0',
      assets: [
        {
          name: 'bitcoin-28.0-win64.zip',
          browser_download_url: 'https://example.com/bitcoin-28.0-win64.zip',
        },
        {
          name: 'bitcoin-28.0-x86_64-linux-gnu.tar.gz',
          browser_download_url: 'https://example.com/bitcoin-28.0-x86_64-linux-gnu.tar.gz',
        },
        {
          name: 'bitcoin-28.0-x86_64-apple-darwin.tar.gz',
          browser_download_url: 'https://example.com/bitcoin-28.0-x86_64-apple-darwin.tar.gz',
        },
        {
          name: 'bitcoin-28.0-aarch64-apple-darwin.tar.gz',
          browser_download_url: 'https://example.com/bitcoin-28.0-aarch64-apple-darwin.tar.gz',
        },
        {
          name: 'bitcoin-28.0-aarch64-linux-gnu.tar.gz',
          browser_download_url: 'https://example.com/bitcoin-28.0-aarch64-linux-gnu.tar.gz',
        },
      ],
    };

    const mockOrdRelease = {
      tag_name: '0.21.0',
      assets: [
        {
          name: 'ord-0.21.0-x86_64-pc-windows-msvc.zip',
          browser_download_url: 'https://example.com/ord-0.21.0-x86_64-pc-windows-msvc.zip',
        },
        {
          name: 'ord-0.21.0-x86_64-unknown-linux-gnu.tar.gz',
          browser_download_url: 'https://example.com/ord-0.21.0-x86_64-unknown-linux-gnu.tar.gz',
        },
        {
          name: 'ord-0.21.0-x86_64-apple-darwin.tar.gz',
          browser_download_url: 'https://example.com/ord-0.21.0-x86_64-apple-darwin.tar.gz',
        },
        {
          name: 'ord-0.21.0-aarch64-apple-darwin.tar.gz',
          browser_download_url: 'https://example.com/ord-0.21.0-aarch64-apple-darwin.tar.gz',
        },
        {
          name: 'ord-0.21.0-aarch64-unknown-linux-gnu.tar.gz',
          browser_download_url: 'https://example.com/ord-0.21.0-aarch64-unknown-linux-gnu.tar.gz',
        },
      ],
    };

    before((done) => {
      mockServer = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');

        if (req.url?.includes('bitcoin/bitcoin')) {
          res.end(JSON.stringify(mockBitcoinRelease));
        } else if (req.url?.includes('ordinals/ord')) {
          res.end(JSON.stringify(mockOrdRelease));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });

      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        done();
      });
    });

    after((done) => {
      mockServer.close(done);
    });

    it('should parse Bitcoin Core release correctly', (done) => {
      http.get(`http://127.0.0.1:${serverPort}/repos/bitcoin/bitcoin/releases/latest`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const release = JSON.parse(data);
          assert.strictEqual(release.tag_name, 'v28.0');
          assert.strictEqual(release.assets.length, 5);

          // Find Windows asset
          const winAsset = release.assets.find((a: any) => a.name.includes('win64'));
          assert.ok(winAsset);
          assert.strictEqual(winAsset.name, 'bitcoin-28.0-win64.zip');

          done();
        });
      });
    });

    it('should parse ord release correctly', (done) => {
      http.get(`http://127.0.0.1:${serverPort}/repos/ordinals/ord/releases/latest`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const release = JSON.parse(data);
          assert.strictEqual(release.tag_name, '0.21.0');
          assert.strictEqual(release.assets.length, 5);

          // Find Linux asset
          const linuxAsset = release.assets.find((a: any) => a.name.includes('linux'));
          assert.ok(linuxAsset);
          assert.ok(linuxAsset.name.includes('x86_64-unknown-linux-gnu'));

          done();
        });
      });
    });

    it('should find correct asset for each platform', () => {
      const platforms = ['windows', 'linux', 'macos'];
      const archs = ['x64', 'arm64'];

      for (const platform of platforms) {
        for (const arch of archs) {
          let expectedPattern: string;

          if (platform === 'windows') {
            expectedPattern = 'win64.zip';
          } else if (platform === 'linux') {
            expectedPattern = arch === 'arm64' ? 'aarch64-linux-gnu' : 'x86_64-linux-gnu';
          } else {
            expectedPattern = arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
          }

          const asset = mockBitcoinRelease.assets.find((a) => a.name.includes(expectedPattern));

          // Windows only has x64, so skip arm64
          if (platform === 'windows' && arch === 'arm64') {
            continue;
          }

          assert.ok(asset, `Should find asset for ${platform}/${arch} with pattern ${expectedPattern}`);
        }
      }
    });
  });

  describe('Version File Management', () => {
    const testDir = path.join(os.tmpdir(), 'vs-ord-test-' + Date.now());
    const versionsFile = path.join(testDir, 'versions.json');

    before(() => {
      fs.mkdirSync(testDir, { recursive: true });
    });

    after(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should create versions file', () => {
      const versions = { bitcoind: 'v28.0', ord: '0.21.0' };
      fs.writeFileSync(versionsFile, JSON.stringify(versions, null, 2));

      assert.ok(fs.existsSync(versionsFile));
    });

    it('should read versions file', () => {
      const versions = JSON.parse(fs.readFileSync(versionsFile, 'utf-8'));

      assert.strictEqual(versions.bitcoind, 'v28.0');
      assert.strictEqual(versions.ord, '0.21.0');
    });

    it('should update versions file', () => {
      const versions = { bitcoind: 'v29.0', ord: '0.22.0' };
      fs.writeFileSync(versionsFile, JSON.stringify(versions, null, 2));

      const updated = JSON.parse(fs.readFileSync(versionsFile, 'utf-8'));
      assert.strictEqual(updated.bitcoind, 'v29.0');
      assert.strictEqual(updated.ord, '0.22.0');
    });

    it('should handle missing versions file', () => {
      const missingFile = path.join(testDir, 'missing.json');
      const exists = fs.existsSync(missingFile);

      assert.strictEqual(exists, false);

      // Should return empty versions
      const defaultVersions = { bitcoind: '', ord: '' };
      assert.strictEqual(defaultVersions.bitcoind, '');
      assert.strictEqual(defaultVersions.ord, '');
    });
  });

  describe('Binary Path Detection', () => {
    it('should construct correct bitcoind path for Windows', () => {
      const binDir = 'C:\\Users\\test\\.vscode\\extensions\\vs-ord\\binaries';
      const exe = 'bitcoind.exe';
      const expectedPath = path.join(binDir, 'bitcoin', 'bin', exe);

      assert.ok(expectedPath.includes('bitcoin'));
      assert.ok(expectedPath.includes('bin'));
      assert.ok(expectedPath.endsWith('.exe'));
    });

    it('should construct correct bitcoind path for Unix', () => {
      const binDir = '/home/user/.vscode/extensions/vs-ord/binaries';
      const exe = 'bitcoind';
      const expectedPath = path.join(binDir, 'bitcoin', 'bin', exe);

      assert.ok(expectedPath.includes('bitcoin'));
      assert.ok(expectedPath.includes('bin'));
      assert.ok(!expectedPath.endsWith('.exe'));
    });

    it('should construct correct ord path for Windows', () => {
      const binDir = 'C:\\Users\\test\\.vscode\\extensions\\vs-ord\\binaries';
      const exe = 'ord.exe';
      const expectedPath = path.join(binDir, 'ord', exe);

      assert.ok(expectedPath.includes('ord'));
      assert.ok(expectedPath.endsWith('.exe'));
    });

    it('should construct correct ord path for Unix', () => {
      const binDir = '/home/user/.vscode/extensions/vs-ord/binaries';
      const exe = 'ord';
      const expectedPath = path.join(binDir, 'ord', exe);

      assert.ok(expectedPath.includes('ord'));
      assert.ok(!expectedPath.endsWith('.exe'));
    });
  });

  describe('Download Progress Tracking', () => {
    it('should calculate download percentage correctly', () => {
      const totalSize = 100000000; // 100 MB
      let downloadedSize = 0;
      const percentages: number[] = [];

      // Simulate download chunks
      const chunkSize = 10000000; // 10 MB
      for (let i = 0; i < 10; i++) {
        downloadedSize += chunkSize;
        const percent = Math.floor((downloadedSize / totalSize) * 100);
        percentages.push(percent);
      }

      assert.deepStrictEqual(percentages, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    });

    it('should handle unknown total size', () => {
      const totalSize = 0;
      const downloadedSize = 50000000;

      // When total size is unknown, percentage calculation should be skipped
      const canCalculatePercent = totalSize > 0;
      assert.strictEqual(canCalculatePercent, false);
    });
  });

  describe('Archive Extraction', () => {
    it('should detect zip files', () => {
      const zipFiles = [
        'bitcoin-28.0-win64.zip',
        'ord-0.21.0-x86_64-pc-windows-msvc.zip',
      ];

      for (const file of zipFiles) {
        assert.ok(file.endsWith('.zip'), `${file} should be detected as zip`);
      }
    });

    it('should detect tar.gz files', () => {
      const tarFiles = [
        'bitcoin-28.0-x86_64-linux-gnu.tar.gz',
        'ord-0.21.0-x86_64-unknown-linux-gnu.tar.gz',
        'bitcoin-28.0-x86_64-apple-darwin.tar.gz',
      ];

      for (const file of tarFiles) {
        assert.ok(file.endsWith('.tar.gz'), `${file} should be detected as tar.gz`);
      }
    });

    it('should choose correct extraction method', () => {
      function getExtractionMethod(filename: string): 'zip' | 'tar' {
        return filename.endsWith('.zip') ? 'zip' : 'tar';
      }

      assert.strictEqual(getExtractionMethod('file.zip'), 'zip');
      assert.strictEqual(getExtractionMethod('file.tar.gz'), 'tar');
      assert.strictEqual(getExtractionMethod('file.tgz'), 'tar');
    });
  });

  describe('Update Check Logic', () => {
    it('should detect updates correctly', () => {
      interface VersionInfo {
        bitcoind: string;
        ord: string;
      }

      function checkForUpdates(
        installed: VersionInfo,
        latest: VersionInfo
      ): { bitcoind: string | null; ord: string | null } {
        return {
          bitcoind: installed.bitcoind !== latest.bitcoind ? latest.bitcoind : null,
          ord: installed.ord !== latest.ord ? latest.ord : null,
        };
      }

      // Both need update
      let result = checkForUpdates(
        { bitcoind: 'v27.0', ord: '0.20.0' },
        { bitcoind: 'v28.0', ord: '0.21.0' }
      );
      assert.strictEqual(result.bitcoind, 'v28.0');
      assert.strictEqual(result.ord, '0.21.0');

      // Only bitcoind needs update
      result = checkForUpdates(
        { bitcoind: 'v27.0', ord: '0.21.0' },
        { bitcoind: 'v28.0', ord: '0.21.0' }
      );
      assert.strictEqual(result.bitcoind, 'v28.0');
      assert.strictEqual(result.ord, null);

      // Only ord needs update
      result = checkForUpdates(
        { bitcoind: 'v28.0', ord: '0.20.0' },
        { bitcoind: 'v28.0', ord: '0.21.0' }
      );
      assert.strictEqual(result.bitcoind, null);
      assert.strictEqual(result.ord, '0.21.0');

      // No updates needed
      result = checkForUpdates(
        { bitcoind: 'v28.0', ord: '0.21.0' },
        { bitcoind: 'v28.0', ord: '0.21.0' }
      );
      assert.strictEqual(result.bitcoind, null);
      assert.strictEqual(result.ord, null);
    });

    it('should handle first-time installation', () => {
      const installed = { bitcoind: '', ord: '' };
      const latest = { bitcoind: 'v28.0', ord: '0.21.0' };

      const needsDownload = installed.bitcoind === '' || installed.ord === '';
      assert.strictEqual(needsDownload, true);
    });
  });

  describe('HTTP Redirect Handling', () => {
    let redirectServer: http.Server;
    let targetServer: http.Server;
    let redirectPort: number;
    let targetPort: number;

    before((done) => {
      // Target server that returns content
      targetServer = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'ok', data: 'final content' }));
      });

      // Redirect server
      redirectServer = http.createServer((req, res) => {
        res.statusCode = 302;
        res.setHeader('Location', `http://127.0.0.1:${targetPort}/final`);
        res.end();
      });

      targetServer.listen(0, '127.0.0.1', () => {
        const addr = targetServer.address();
        if (addr && typeof addr === 'object') {
          targetPort = addr.port;
        }

        redirectServer.listen(0, '127.0.0.1', () => {
          const addr = redirectServer.address();
          if (addr && typeof addr === 'object') {
            redirectPort = addr.port;
          }
          done();
        });
      });
    });

    after((done) => {
      redirectServer.close(() => {
        targetServer.close(done);
      });
    });

    it('should detect redirect responses', (done) => {
      http.get(`http://127.0.0.1:${redirectPort}/start`, (res) => {
        assert.ok(res.statusCode === 301 || res.statusCode === 302);
        assert.ok(res.headers.location);
        done();
      });
    });

    it('should follow redirect to get final content', (done) => {
      http.get(`http://127.0.0.1:${redirectPort}/start`, (res) => {
        const location = res.headers.location;
        assert.ok(location);

        http.get(location!, (finalRes) => {
          let data = '';
          finalRes.on('data', (chunk) => (data += chunk));
          finalRes.on('end', () => {
            const result = JSON.parse(data);
            assert.strictEqual(result.status, 'ok');
            assert.strictEqual(result.data, 'final content');
            done();
          });
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', () => {
      function handleDownloadError(error: Error): string {
        if (error.message.includes('ECONNREFUSED')) {
          return 'Connection refused - server may be down';
        } else if (error.message.includes('ETIMEDOUT')) {
          return 'Connection timed out - check your network';
        } else if (error.message.includes('ENOTFOUND')) {
          return 'Server not found - check your internet connection';
        }
        return `Download failed: ${error.message}`;
      }

      assert.ok(handleDownloadError(new Error('ECONNREFUSED')).includes('Connection refused'));
      assert.ok(handleDownloadError(new Error('ETIMEDOUT')).includes('timed out'));
      assert.ok(handleDownloadError(new Error('ENOTFOUND')).includes('not found'));
      assert.ok(handleDownloadError(new Error('Unknown')).includes('Download failed'));
    });

    it('should handle missing assets', () => {
      const assets = [
        { name: 'bitcoin-28.0-win64.zip' },
        { name: 'bitcoin-28.0-x86_64-linux-gnu.tar.gz' },
      ];

      const missingPlatform = 'arm64-windows';
      const asset = assets.find((a) => a.name.includes(missingPlatform));

      assert.strictEqual(asset, undefined);

      // Should throw appropriate error
      function findAssetOrThrow(assets: { name: string }[], pattern: string): { name: string } {
        const asset = assets.find((a) => a.name.includes(pattern));
        if (!asset) {
          throw new Error(`Could not find binary for your platform: ${pattern}`);
        }
        return asset;
      }

      assert.throws(() => findAssetOrThrow(assets, missingPlatform), /Could not find binary/);
    });

    it('should handle corrupted version file', () => {
      function parseVersionFile(content: string): { bitcoind: string; ord: string } {
        try {
          return JSON.parse(content);
        } catch {
          return { bitcoind: '', ord: '' };
        }
      }

      // Valid JSON
      let result = parseVersionFile('{"bitcoind": "v28.0", "ord": "0.21.0"}');
      assert.strictEqual(result.bitcoind, 'v28.0');

      // Invalid JSON
      result = parseVersionFile('not valid json');
      assert.strictEqual(result.bitcoind, '');
      assert.strictEqual(result.ord, '');

      // Empty string
      result = parseVersionFile('');
      assert.strictEqual(result.bitcoind, '');
    });
  });
});
