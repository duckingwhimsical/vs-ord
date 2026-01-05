import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, ChildProcess, exec } from 'child_process';
import * as http from 'http';

/**
 * End-to-end test for the full inscription workflow.
 * This test verifies each step of the inscription process to help diagnose issues.
 *
 * Prerequisites:
 * - Bitcoin Core and ord binaries must be downloaded
 * - No other bitcoind or ord processes should be running
 */

// Test configuration
const BITCOIND_PORT = 18443;
const ORD_PORT = 9001; // Use different port to avoid conflicts with other services on 8080
// NOTE: ord REQUIRES cookie authentication - do NOT use rpcuser/rpcpassword
// See: https://docs.ordinals.com/guides/wallet.html
const NETWORK = 'regtest';

// Timeouts for each operation (in milliseconds)
const TIMEOUTS = {
  bitcoindStart: 30000,
  bitcoindReady: 30000,
  ordStart: 60000,
  ordReady: 60000,
  rpcCall: 10000,
  walletCreate: 15000,
  mining: 30000,
  inscribe: 60000,
};

let bitcoindProcess: ChildProcess | null = null;
let ordProcess: ChildProcess | null = null;
let tempDir: string;
let testFile: string;
let cookieFile: string;

// Helper to read cookie file for authentication
function getCookieAuth(): string {
  try {
    const cookie = fs.readFileSync(cookieFile, 'utf-8').trim();
    return Buffer.from(cookie).toString('base64');
  } catch (e) {
    console.log(`    Warning: Could not read cookie file: ${e}`);
    return '';
  }
}

// Helper to get paths (adjust these to match your installation)
function getBinariesPath(): string {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'Code', 'User', 'globalStorage', 'ordinals-dev.vs-ord', 'binaries');
}

function getBitcoindPath(): string {
  const platform = process.platform;
  const binDir = getBinariesPath();
  if (platform === 'win32') {
    return path.join(binDir, 'bitcoin', 'bin', 'bitcoind.exe');
  }
  return path.join(binDir, 'bitcoin', 'bin', 'bitcoind');
}

function getBitcoinCliPath(): string {
  const platform = process.platform;
  const binDir = getBinariesPath();
  if (platform === 'win32') {
    return path.join(binDir, 'bitcoin', 'bin', 'bitcoin-cli.exe');
  }
  return path.join(binDir, 'bitcoin', 'bin', 'bitcoin-cli');
}

function getOrdPath(): string {
  const platform = process.platform;
  const binDir = getBinariesPath();
  if (platform === 'win32') {
    return path.join(binDir, 'ord', 'ord.exe');
  }
  return path.join(binDir, 'ord', 'ord');
}

// Helper to make JSON-RPC calls using cookie authentication
function rpcCall(method: string, params: any[] = [], wallet?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`RPC call ${method} timed out after ${TIMEOUTS.rpcCall}ms`));
    }, TIMEOUTS.rpcCall);

    const rpcPath = wallet ? `/wallet/${wallet}` : '/';
    const body = JSON.stringify({
      jsonrpc: '1.0',
      id: 'test',
      method,
      params,
    });

    const auth = getCookieAuth();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (auth) {
      headers['Authorization'] = `Basic ${auth}`;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: BITCOIND_PORT,
        path: rpcPath,
        method: 'POST',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          clearTimeout(timeout);
          try {
            const result = JSON.parse(data);
            if (result.error) {
              reject(new Error(`RPC error: ${JSON.stringify(result.error)}`));
            } else {
              resolve(result.result);
            }
          } catch (e) {
            reject(new Error(`Failed to parse RPC response: ${data}`));
          }
        });
      }
    );

    req.on('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });

    req.write(body);
    req.end();
  });
}

// Helper to run ord commands using cookie authentication
function runOrdCommand(args: string[], timeoutMs: number = 30000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Ord command timed out after ${timeoutMs}ms: ord ${args.join(' ')}`));
    }, timeoutMs);

    const ordPath = getOrdPath();

    // Build args - use cookie file for authentication (required by ord)
    const baseArgs = [
      '--regtest',
      `--cookie-file=${cookieFile}`,
      `--data-dir=${tempDir}/ord`,
    ];

    let fullArgs: string[];
    if (args[0] === 'wallet') {
      // Insert --server-url after "wallet" but before the wallet subcommand
      fullArgs = [
        ...baseArgs,
        'wallet',
        `--server-url=http://127.0.0.1:${ORD_PORT}`,
        ...args.slice(1),
      ];
    } else {
      fullArgs = [...baseArgs, ...args];
    }

    console.log(`    Running: ord ${fullArgs.join(' ')}`);

    exec(`"${ordPath}" ${fullArgs.map((a) => `"${a}"`).join(' ')}`, (error, stdout, stderr) => {
      clearTimeout(timeout);
      if (error) {
        reject(new Error(`Ord command failed: ${stderr || error.message}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// Helper to check if a port is listening
function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, method: 'GET', path: '/', timeout: 1000 },
      () => resolve(true)
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// Helper to wait for a condition with timeout
async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs: number = 1000,
  description: string = 'condition'
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout waiting for ${description} after ${timeoutMs}ms`);
}

describe('End-to-End Inscription Workflow', function () {
  this.timeout(300000); // 5 minutes for entire suite

  before(async function () {
    console.log('\n=== Setup ===');

    // Check binaries exist
    const bitcoindPath = getBitcoindPath();
    const ordPath = getOrdPath();

    console.log(`  Bitcoind path: ${bitcoindPath}`);
    console.log(`  Ord path: ${ordPath}`);

    if (!fs.existsSync(bitcoindPath)) {
      throw new Error(`Bitcoind not found at ${bitcoindPath}. Run "Ord: Download Binaries" first.`);
    }
    if (!fs.existsSync(ordPath)) {
      throw new Error(`Ord not found at ${ordPath}. Run "Ord: Download Binaries" first.`);
    }

    // Create temp directory for test data
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ord-e2e-'));
    console.log(`  Temp directory: ${tempDir}`);

    fs.mkdirSync(path.join(tempDir, 'bitcoin'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'ord'), { recursive: true });

    // Cookie file will be created by bitcoind at startup
    cookieFile = path.join(tempDir, 'bitcoin', 'regtest', '.cookie');
    console.log(`  Cookie file: ${cookieFile}`);

    // Create test file to inscribe
    testFile = path.join(tempDir, 'test-inscription.txt');
    fs.writeFileSync(testFile, 'Hello, Ordinals! Test inscription at ' + new Date().toISOString());
    console.log(`  Test file: ${testFile}`);
  });

  after(async function () {
    console.log('\n=== Cleanup ===');

    // Stop ord
    if (ordProcess) {
      console.log('  Stopping ord...');
      ordProcess.kill();
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Stop bitcoind
    if (bitcoindProcess) {
      console.log('  Stopping bitcoind...');
      try {
        await rpcCall('stop');
      } catch {
        bitcoindProcess.kill();
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Clean up temp directory (with retry for locked files)
    if (tempDir && fs.existsSync(tempDir)) {
      console.log('  Cleaning up temp directory...');
      // Wait for processes to fully release files
      await new Promise((r) => setTimeout(r, 3000));
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
      } catch (e) {
        console.log(`  Warning: Could not fully clean temp dir: ${e}`);
      }
    }
  });

  describe('Step 1: Start bitcoind', function () {
    it('should start bitcoind process', async function () {
      console.log('\n  Starting bitcoind...');
      const bitcoindPath = getBitcoindPath();
      const dataDir = path.join(tempDir, 'bitcoin');

      // NOTE: Do NOT use -rpcuser/-rpcpassword - ord requires cookie authentication
      const args = [
        '-regtest',
        '-server',
        `-rpcport=${BITCOIND_PORT}`,
        `-datadir=${dataDir}`,
        '-fallbackfee=0.00001',
        '-txindex=1',
      ];

      console.log(`    Command: ${bitcoindPath} ${args.join(' ')}`);

      bitcoindProcess = spawn(bitcoindPath, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      bitcoindProcess.stdout?.on('data', (data: Buffer) => {
        console.log(`    [bitcoind stdout] ${data.toString().trim()}`);
      });

      bitcoindProcess.stderr?.on('data', (data: Buffer) => {
        console.log(`    [bitcoind stderr] ${data.toString().trim()}`);
      });

      bitcoindProcess.on('error', (err) => {
        console.error(`    [bitcoind error] ${err.message}`);
      });

      bitcoindProcess.on('exit', (code) => {
        console.log(`    [bitcoind] Exited with code ${code}`);
        bitcoindProcess = null;
      });

      assert.ok(bitcoindProcess.pid, 'bitcoind process should have a PID');
      console.log(`    bitcoind started with PID: ${bitcoindProcess.pid}`);
    });

    it('should accept RPC connections within timeout', async function () {
      console.log(`\n  Waiting for cookie file to be created...`);

      // Wait for cookie file to be created
      await waitFor(
        async () => {
          return fs.existsSync(cookieFile);
        },
        TIMEOUTS.bitcoindReady,
        500,
        'cookie file creation'
      );
      console.log(`    Cookie file exists: ${cookieFile}`);

      console.log(`  Waiting for bitcoind RPC (timeout: ${TIMEOUTS.bitcoindReady}ms)...`);

      await waitFor(
        async () => {
          try {
            await rpcCall('getblockchaininfo');
            return true;
          } catch {
            return false;
          }
        },
        TIMEOUTS.bitcoindReady,
        1000,
        'bitcoind RPC'
      );

      const info = await rpcCall('getblockchaininfo');
      console.log(`    Chain: ${info.chain}, Blocks: ${info.blocks}`);
      assert.strictEqual(info.chain, 'regtest');
    });
  });

  describe('Step 2: Start ord server (REQUIRED for wallet operations)', function () {
    let ordListeningPromise: Promise<void>;
    let ordListening = false;

    it('should start ord server', async function () {
      console.log('\n  Starting ord server...');
      console.log('    NOTE: Ord wallet commands require the ord server to be running');
      console.log(`    (timeout: ${TIMEOUTS.ordStart}ms)`);

      const ordPath = getOrdPath();
      // Use cookie file for authentication (required by ord)
      const args = [
        '--regtest',
        `--cookie-file=${cookieFile}`,
        `--data-dir=${tempDir}/ord`,
        'server',
        '--http',
        `--http-port=${ORD_PORT}`,
      ];

      console.log(`    Command: ${ordPath} ${args.join(' ')}`);

      // Create a promise that resolves when we see "Listening" in the output
      let resolveListening: () => void;
      ordListeningPromise = new Promise((resolve) => {
        resolveListening = resolve;
      });

      ordProcess = spawn(ordPath, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      });

      let ordHasOutput = false;
      ordProcess.stdout?.on('data', (data: Buffer) => {
        ordHasOutput = true;
        const text = data.toString().trim();
        console.log(`    [ord stdout] ${text}`);
        if (text.includes('Listening')) {
          ordListening = true;
          resolveListening!();
        }
      });

      ordProcess.stderr?.on('data', (data: Buffer) => {
        ordHasOutput = true;
        const text = data.toString().trim();
        console.log(`    [ord stderr] ${text}`);
        if (text.includes('Listening')) {
          ordListening = true;
          resolveListening!();
        }
      });

      ordProcess.on('error', (err) => {
        console.error(`    [ord error] ${err.message}`);
      });

      ordProcess.on('exit', (code) => {
        console.log(`    [ord] Exited with code ${code}`);
        if (!ordHasOutput) {
          console.log(`    [ord] WARNING: No output was captured from ord`);
        }
        ordProcess = null;
      });

      // Wait a moment to see if ord crashes immediately
      await new Promise((r) => setTimeout(r, 2000));
      if (!ordProcess || ordProcess.exitCode !== null) {
        throw new Error(`ord server exited immediately with code ${ordProcess?.exitCode}`);
      }

      assert.ok(ordProcess.pid, 'ord process should have a PID');
      console.log(`    ord started with PID: ${ordProcess.pid}`);
    });

    it('should be ready to accept HTTP requests', async function () {
      console.log(`\n  Waiting for ord server to start listening (timeout: ${TIMEOUTS.ordReady}ms)...`);

      // First wait for ord to output "Listening"
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout waiting for ord to start listening')), TIMEOUTS.ordReady);
      });

      try {
        await Promise.race([ordListeningPromise, timeoutPromise]);
      } catch (e) {
        if (!ordListening) {
          throw e;
        }
      }

      console.log('    ord server is listening! Waiting for indexing to complete...');

      // Give ord time to fully initialize and index
      // ord server needs time after "Listening" before it's fully ready
      await new Promise((r) => setTimeout(r, 5000));

      // Now check endpoints - ord uses /r/ prefix for REST API
      console.log('    Checking endpoints:');
      const endpoints = ['/r/blockcount', '/blockcount', '/api/blockcount', '/'];

      for (const endpoint of endpoints) {
        const result = await new Promise<{ status: number; body: string }>((resolve) => {
          const req = http.request(
            {
              hostname: '127.0.0.1',
              port: ORD_PORT,
              path: endpoint,
              method: 'GET',
              timeout: 5000,
            },
            (res) => {
              let body = '';
              res.on('data', (chunk) => (body += chunk));
              res.on('end', () => resolve({ status: res.statusCode || 0, body: body.substring(0, 100) }));
            }
          );
          req.on('error', (e) => resolve({ status: 0, body: `error: ${e.message}` }));
          req.on('timeout', () => {
            req.destroy();
            resolve({ status: 0, body: 'timeout' });
          });
          req.end();
        });
        console.log(`      ${endpoint}: status=${result.status}, body=${result.body}`);
      }

      // Wait for /blockcount to return a valid number (ord is indexed)
      console.log('    Waiting for /blockcount to return a valid integer...');
      await waitFor(
        async () => {
          try {
            return new Promise((resolve) => {
              const req = http.request(
                {
                  hostname: '127.0.0.1',
                  port: ORD_PORT,
                  path: '/blockcount',
                  method: 'GET',
                  timeout: 2000,
                },
                (res) => {
                  if (res.statusCode === 200) {
                    let body = '';
                    res.on('data', (chunk) => (body += chunk));
                    res.on('end', () => {
                      const trimmed = body.trim();
                      const parsed = parseInt(trimmed, 10);
                      const isValid = !isNaN(parsed) && parsed >= 0;
                      console.log(`      /blockcount body="${trimmed}" parsed=${parsed} valid=${isValid}`);
                      resolve(isValid);
                    });
                  } else {
                    console.log(`      /blockcount status: ${res.statusCode}`);
                    resolve(false);
                  }
                }
              );
              req.on('error', (e) => {
                console.log(`      /blockcount error: ${e.message}`);
                resolve(false);
              });
              req.on('timeout', () => {
                req.destroy();
                resolve(false);
              });
              req.end();
            });
          } catch {
            return false;
          }
        },
        TIMEOUTS.ordReady,
        2000,
        'ord /blockcount returning integer'
      );

      console.log('    ord server is ready!');
    });
  });

  describe('Step 3: Create ord wallet', function () {
    it('should create ord wallet', async function () {
      console.log('\n  Creating ord wallet...');
      console.log('    IMPORTANT: ord wallet must be created FIRST to set up correct descriptors');

      try {
        const result = await runOrdCommand(['wallet', 'create'], TIMEOUTS.walletCreate);
        console.log(`    Result: ${result.stdout}`);
      } catch (e: any) {
        if (e.message.includes('already exists')) {
          console.log('    Ord wallet already exists');
        } else {
          throw e;
        }
      }
    });

    it('should get receive address', async function () {
      console.log('\n  Getting receive address...');

      const result = await runOrdCommand(['wallet', 'receive'], TIMEOUTS.rpcCall);
      console.log(`    Address output: ${result.stdout.trim()}`);

      // Parse address from output
      const addressMatch = result.stdout.match(/(bcrt1[a-zA-HJ-NP-Z0-9]{25,})/);
      assert.ok(addressMatch, 'Should get a valid regtest address');
      console.log(`    Address: ${addressMatch[1]}`);
    });
  });

  describe('Step 4: Fund wallet', function () {
    let miningAddress: string;

    it('should get mining address', async function () {
      console.log('\n  Getting mining address...');

      const result = await runOrdCommand(['wallet', 'receive'], TIMEOUTS.rpcCall);
      const addressMatch = result.stdout.match(/(bcrt1[a-zA-HJ-NP-Z0-9]{25,})/);
      miningAddress = addressMatch![1];
      console.log(`    Mining address: ${miningAddress}`);
    });

    it('should mine 110 blocks for coinbase maturity', async function () {
      console.log('\n  Mining 110 blocks...');
      console.log(`    (timeout: ${TIMEOUTS.mining}ms)`);

      const startTime = Date.now();
      const blocks = await rpcCall('generatetoaddress', [110, miningAddress]);
      const elapsed = Date.now() - startTime;

      console.log(`    Mined ${blocks.length} blocks in ${elapsed}ms`);
      assert.strictEqual(blocks.length, 110);
    });

    it('should have balance after mining', async function () {
      console.log('\n  Checking balance...');

      const result = await runOrdCommand(['wallet', 'balance'], TIMEOUTS.rpcCall);
      console.log(`    Balance output: ${result.stdout.trim()}`);

      // Parse balance - could be JSON or plain text
      let balance = 0;
      try {
        const parsed = JSON.parse(result.stdout);
        balance = parsed.cardinal || parsed.total || 0;
      } catch {
        const match = result.stdout.match(/(\d+)/);
        balance = match ? parseInt(match[1], 10) : 0;
      }

      console.log(`    Balance: ${balance} sats (${balance / 100000000} BTC)`);
      assert.ok(balance > 0, 'Wallet should have balance after mining');
    });
  });

  describe('Step 5: Inscribe file', function () {
    let inscriptionId: string;

    it('should inscribe test file', async function () {
      console.log('\n  Inscribing file...');
      console.log(`    File: ${testFile}`);
      console.log(`    (timeout: ${TIMEOUTS.inscribe}ms)`);

      const startTime = Date.now();
      const result = await runOrdCommand(
        ['wallet', 'inscribe', '--fee-rate', '1', '--file', testFile],
        TIMEOUTS.inscribe
      );
      const elapsed = Date.now() - startTime;

      console.log(`    Completed in ${elapsed}ms`);
      console.log(`    Output: ${result.stdout}`);

      // Parse inscription ID
      const idMatch = result.stdout.match(/([a-f0-9]{64}i\d+)/i);
      assert.ok(idMatch, 'Should get inscription ID from output');
      inscriptionId = idMatch[1];
      console.log(`    Inscription ID: ${inscriptionId}`);
    });

    it('should mine confirmation block', async function () {
      console.log('\n  Mining confirmation block...');

      const result = await runOrdCommand(['wallet', 'receive'], TIMEOUTS.rpcCall);
      const addressMatch = result.stdout.match(/(bcrt1[a-zA-HJ-NP-Z0-9]{25,})/);
      const address = addressMatch![1];

      const blocks = await rpcCall('generatetoaddress', [1, address]);
      console.log(`    Mined ${blocks.length} block`);
    });

    it('should be viewable on ord server', async function () {
      console.log('\n  Checking inscription on ord server...');

      // Wait longer for ord to index the new block with inscription
      await new Promise((r) => setTimeout(r, 5000));

      const url = `http://127.0.0.1:${ORD_PORT}/inscription/${inscriptionId}`;
      console.log(`    URL: ${url}`);

      const response = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: ORD_PORT,
            path: `/inscription/${inscriptionId}`,
            method: 'GET',
            timeout: 5000,
          },
          (res) => {
            resolve(res.statusCode || 0);
          }
        );
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timed out'));
        });
        req.end();
      });

      console.log(`    Response status: ${response}`);
      assert.strictEqual(response, 200, 'Inscription should be viewable');
    });
  });
});
