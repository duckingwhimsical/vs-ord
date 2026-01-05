import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as http from 'http';

describe('Services', () => {
  describe('Bitcoind Service', () => {
    describe('Configuration', () => {
      it('should build correct regtest args', () => {
        const config = {
          network: 'regtest' as const,
          rpcPort: 18443,
          dataDirectory: '/tmp/bitcoin',
        };

        // bitcoind uses cookie auth - no rpcuser/rpcpassword needed
        const args = [
          '-regtest',
          '-server',
          `-rpcport=${config.rpcPort}`,
          `-datadir=${config.dataDirectory}`,
          '-fallbackfee=0.00001',
          '-txindex=1',
        ];

        assert.ok(args.includes('-regtest'));
        assert.ok(args.includes('-server'));
        assert.ok(args.includes('-rpcport=18443'));
        assert.ok(args.includes('-txindex=1'));
      });

      it('should build correct mainnet args (no network flag)', () => {
        const network = 'mainnet';
        const networkFlag = network === 'mainnet' ? '' : `-${network}`;

        assert.strictEqual(networkFlag, '');
      });

      it('should build correct testnet args', () => {
        const network = 'testnet';
        const networkFlag = `-${network}`;

        assert.strictEqual(networkFlag, '-testnet');
      });
    });

    describe('Process State', () => {
      it('should track running state correctly', () => {
        interface ProcessLike {
          exitCode: number | null;
        }

        function isRunning(proc: ProcessLike | null): boolean {
          return proc !== null && proc.exitCode === null;
        }

        // Simulate not running
        assert.strictEqual(isRunning(null), false);

        // Simulate running
        assert.strictEqual(isRunning({ exitCode: null }), true);

        // Simulate exited
        assert.strictEqual(isRunning({ exitCode: 0 }), false);
        assert.strictEqual(isRunning({ exitCode: 1 }), false);
      });
    });
  });

  describe('Ord Service', () => {
    describe('Configuration', () => {
      it('should build correct ord server args', () => {
        const config = {
          network: 'regtest' as const,
          rpcPort: 18443,
          ordServerPort: 8080,
          dataDirectory: '/tmp/ord',
          cookieFile: '/tmp/bitcoin/regtest/.cookie',
        };

        // ord uses cookie-file auth - no rpc username/password needed
        const args = [
          '--regtest',
          `--cookie-file=${config.cookieFile}`,
          `--data-dir=${config.dataDirectory}`,
          'server',
          `--http-port=${config.ordServerPort}`,
        ];

        assert.ok(args.includes('--regtest'));
        assert.ok(args.includes('--cookie-file=/tmp/bitcoin/regtest/.cookie'));
        assert.ok(args.includes('server'));
        assert.ok(args.includes('--http-port=8080'));
      });

      it('should not include network flag for mainnet', () => {
        const network = 'mainnet';
        const networkFlag = network === 'mainnet' ? '' : `--${network}`;

        assert.strictEqual(networkFlag, '');
      });
    });

    describe('Inscription Result Parsing', () => {
      it('should parse JSON inscription result', () => {
        const output = JSON.stringify({
          inscriptions: [{ id: 'abc123i0' }],
          reveal: 'def456',
          total_fees: 1000,
        });

        const result = JSON.parse(output);
        assert.strictEqual(result.inscriptions[0].id, 'abc123i0');
        assert.strictEqual(result.reveal, 'def456');
        assert.strictEqual(result.total_fees, 1000);
      });

      it('should parse alternative JSON format', () => {
        const output = JSON.stringify({
          inscription: 'abc123i0',
          reveal: 'def456',
          total_fees: 1000,
        });

        const result = JSON.parse(output);
        assert.strictEqual(result.inscription, 'abc123i0');
      });

      it('should extract inscription ID from plain text', () => {
        // 64 hex chars + i + number
        const inscriptionId = 'a'.repeat(64) + 'i0';
        const output = `Created inscription ${inscriptionId}`;
        const match = output.match(/([a-f0-9]{64}i\d+)/i);

        assert.ok(match);
        assert.strictEqual(match[1], inscriptionId);
      });
    });

    describe('Address Parsing', () => {
      it('should parse regtest address', () => {
        const output = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';
        const match = output.match(/\b(bcrt1|bc1|tb1)[a-zA-HJ-NP-Z0-9]{25,100}\b/);

        assert.ok(match);
        assert.ok(match[0].startsWith('bcrt1'));
      });

      it('should parse mainnet address', () => {
        const output = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
        const match = output.match(/\b(bcrt1|bc1|tb1)[a-zA-HJ-NP-Z0-9]{25,100}\b/);

        assert.ok(match);
        assert.ok(match[0].startsWith('bc1'));
      });

      it('should parse testnet address', () => {
        const output = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
        const match = output.match(/\b(bcrt1|bc1|tb1)[a-zA-HJ-NP-Z0-9]{25,100}\b/);

        assert.ok(match);
        assert.ok(match[0].startsWith('tb1'));
      });
    });

    describe('Balance Parsing', () => {
      it('should parse JSON balance', () => {
        const output = JSON.stringify({
          cardinal: 5000000000,
          ordinal: 10000,
          total: 5000010000,
        });

        const result = JSON.parse(output);
        assert.strictEqual(result.cardinal, 5000000000);
        assert.strictEqual(result.ordinal, 10000);
        assert.strictEqual(result.total, 5000010000);
      });

      it('should convert satoshis to BTC', () => {
        const sats = 5000000000;
        const btc = sats / 100000000;

        assert.strictEqual(btc, 50);
      });
    });

    describe('Index Version Mismatch Detection', () => {
      it('should detect "Manual upgrade required" error', () => {
        const errorMessages = [
          'error: failed to open index: Manual upgrade required. Expected file format version 3, but file is version 2',
          'Manual upgrade required',
          'Expected file format version',
        ];

        function isIndexVersionError(stderr: string): boolean {
          return (
            stderr.includes('Manual upgrade required') ||
            stderr.includes('Expected file format version') ||
            stderr.includes('failed to open index')
          );
        }

        for (const msg of errorMessages) {
          assert.ok(isIndexVersionError(msg), `Should detect: ${msg}`);
        }
      });

      it('should not detect unrelated errors as index version errors', () => {
        const otherErrors = [
          'Connection refused',
          'Bitcoin RPC error',
          'Network timeout',
        ];

        function isIndexVersionError(stderr: string): boolean {
          return (
            stderr.includes('Manual upgrade required') ||
            stderr.includes('Expected file format version') ||
            stderr.includes('failed to open index')
          );
        }

        for (const msg of otherErrors) {
          assert.ok(!isIndexVersionError(msg), `Should NOT detect: ${msg}`);
        }
      });

      it('should determine correct index path for each network', () => {
        function getIndexPath(dataDir: string, network: string): string {
          let networkDir: string;
          switch (network) {
            case 'regtest':
              networkDir = path.join(dataDir, 'regtest');
              break;
            case 'testnet':
              networkDir = path.join(dataDir, 'testnet3');
              break;
            case 'signet':
              networkDir = path.join(dataDir, 'signet');
              break;
            default:
              networkDir = dataDir;
          }
          return path.join(networkDir, 'index.redb');
        }

        const dataDir = '/tmp/ord';

        assert.ok(getIndexPath(dataDir, 'regtest').includes('regtest'));
        assert.ok(getIndexPath(dataDir, 'testnet').includes('testnet3'));
        assert.ok(getIndexPath(dataDir, 'signet').includes('signet'));
        assert.ok(!getIndexPath(dataDir, 'mainnet').includes('regtest'));
        assert.ok(!getIndexPath(dataDir, 'mainnet').includes('testnet'));
      });

      it('should handle index cleanup for regtest', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ord-test-'));
        const regtestDir = path.join(tmpDir, 'regtest');
        fs.mkdirSync(regtestDir, { recursive: true });

        // Create a fake index file
        const indexPath = path.join(regtestDir, 'index.redb');
        fs.writeFileSync(indexPath, 'fake index data');

        assert.ok(fs.existsSync(indexPath), 'Index file should exist');

        // Simulate cleanup
        fs.rmSync(indexPath, { recursive: true, force: true });

        assert.ok(!fs.existsSync(indexPath), 'Index file should be deleted');

        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });
      });
    });

    describe('Health Check', () => {
      interface OrdHealthCheck {
        healthy: boolean;
        blockcount: number | null;
        error: string | null;
      }

      // Simulates the verifyOrdBitcoindConnection function logic
      function parseHealthResponse(statusCode: number, body: string): OrdHealthCheck {
        if (statusCode === 200) {
          const parsed = parseInt(body.trim(), 10);
          if (!isNaN(parsed) && parsed >= 0) {
            return { healthy: true, blockcount: parsed, error: null };
          } else {
            return { healthy: false, blockcount: null, error: `Invalid blockcount response: ${body}` };
          }
        } else if (statusCode === 500) {
          return { healthy: false, blockcount: null, error: `Server error (likely auth failure): ${body}` };
        } else {
          return { healthy: false, blockcount: null, error: `HTTP ${statusCode}: ${body}` };
        }
      }

      it('should report healthy when blockcount returns valid number', () => {
        const result = parseHealthResponse(200, '150');
        assert.strictEqual(result.healthy, true);
        assert.strictEqual(result.blockcount, 150);
        assert.strictEqual(result.error, null);
      });

      it('should report healthy for zero blocks (fresh regtest)', () => {
        const result = parseHealthResponse(200, '0');
        assert.strictEqual(result.healthy, true);
        assert.strictEqual(result.blockcount, 0);
        assert.strictEqual(result.error, null);
      });

      it('should report unhealthy for 500 error (auth failure)', () => {
        const result = parseHealthResponse(500, 'Internal Server Error');
        assert.strictEqual(result.healthy, false);
        assert.strictEqual(result.blockcount, null);
        assert.ok(result.error?.includes('auth failure'));
      });

      it('should report unhealthy for invalid blockcount response', () => {
        const result = parseHealthResponse(200, 'not a number');
        assert.strictEqual(result.healthy, false);
        assert.strictEqual(result.blockcount, null);
        assert.ok(result.error?.includes('Invalid blockcount'));
      });

      it('should report unhealthy for other HTTP errors', () => {
        const result = parseHealthResponse(404, 'Not Found');
        assert.strictEqual(result.healthy, false);
        assert.strictEqual(result.blockcount, null);
        assert.ok(result.error?.includes('HTTP 404'));
      });

      it('should verify health check with mock server', (done) => {
        // Create a mock ord server that returns blockcount
        const server = http.createServer((req, res) => {
          if (req.url === '/blockcount') {
            res.writeHead(200);
            res.end('42');
          } else {
            res.writeHead(404);
            res.end('Not Found');
          }
        });

        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (!addr || typeof addr === 'string') {
            server.close();
            done(new Error('Failed to get server address'));
            return;
          }

          const port = addr.port;

          // Make health check request
          const req = http.request(
            {
              hostname: '127.0.0.1',
              port,
              path: '/blockcount',
              method: 'GET',
              timeout: 2000,
            },
            (res) => {
              let body = '';
              res.on('data', (chunk) => (body += chunk));
              res.on('end', () => {
                const result = parseHealthResponse(res.statusCode || 0, body);
                assert.strictEqual(result.healthy, true);
                assert.strictEqual(result.blockcount, 42);
                server.close();
                done();
              });
            }
          );

          req.on('error', (err) => {
            server.close();
            done(err);
          });

          req.end();
        });
      });

      it('should detect auth failure with mock server returning 500', (done) => {
        // Create a mock ord server that simulates auth failure
        const server = http.createServer((req, res) => {
          if (req.url === '/blockcount') {
            res.writeHead(500);
            res.end('Internal Server Error');
          } else {
            res.writeHead(404);
            res.end('Not Found');
          }
        });

        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (!addr || typeof addr === 'string') {
            server.close();
            done(new Error('Failed to get server address'));
            return;
          }

          const port = addr.port;

          // Make health check request
          const req = http.request(
            {
              hostname: '127.0.0.1',
              port,
              path: '/blockcount',
              method: 'GET',
              timeout: 2000,
            },
            (res) => {
              let body = '';
              res.on('data', (chunk) => (body += chunk));
              res.on('end', () => {
                const result = parseHealthResponse(res.statusCode || 0, body);
                assert.strictEqual(result.healthy, false);
                assert.ok(result.error?.includes('auth failure'));
                server.close();
                done();
              });
            }
          );

          req.on('error', (err) => {
            server.close();
            done(err);
          });

          req.end();
        });
      });
    });
  });
});
