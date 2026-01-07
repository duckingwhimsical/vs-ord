import * as vscode from 'vscode';
import { spawn, ChildProcess, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { getOrdPath, getOrdDataDirectory, getPlatform, getDefaultDataDirectory } from '../utils/platform';
import { getConfig, getOrdNetworkFlag } from '../utils/config';
import { log as sharedLog, logSection, logProcessOutput, logError, logWarn } from '../ui/outputChannel';
import { getCurrentWallet } from '../utils/walletState';

let ordProcess: ChildProcess | null = null;

function log(message: string): void {
  sharedLog(`[ord] ${message}`);
}

/**
 * Gets the path to the Bitcoin cookie file for authentication.
 * Ord REQUIRES cookie authentication - rpcuser/rpcpassword do NOT work.
 */
function getCookieFilePath(network: string): string {
  const config = getConfig();
  const bitcoinDataDir = config.dataDirectory || getDefaultDataDirectory();

  switch (network) {
    case 'regtest':
      return path.join(bitcoinDataDir, 'regtest', '.cookie');
    case 'testnet':
      return path.join(bitcoinDataDir, 'testnet3', '.cookie');
    case 'signet':
      return path.join(bitcoinDataDir, 'signet', '.cookie');
    default:
      return path.join(bitcoinDataDir, '.cookie');
  }
}

/**
 * Gets the network subdirectory for ord data
 */
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

/**
 * Clears the ord index files when a version mismatch is detected.
 * This is necessary when ord is updated and the old index format is incompatible.
 */
function clearOrdIndex(network: string): void {
  const dataDir = getOrdDataDirectory();
  const networkDir = getNetworkDir(dataDir, network);

  // Delete index.redb if it exists
  const indexPath = path.join(networkDir, 'index.redb');
  if (fs.existsSync(indexPath)) {
    log(`Deleting outdated index file: ${indexPath}`);
    fs.rmSync(indexPath, { recursive: true, force: true });
  }

  // Also check for index.redb in the root data dir (older versions)
  const rootIndexPath = path.join(dataDir, 'index.redb');
  if (fs.existsSync(rootIndexPath)) {
    log(`Deleting outdated index file: ${rootIndexPath}`);
    fs.rmSync(rootIndexPath, { recursive: true, force: true });
  }
}

/**
 * Clears the ord wallet database when a version mismatch is detected.
 */
export function clearOrdWallet(network: string): void {
  const dataDir = getOrdDataDirectory();
  const networkDir = getNetworkDir(dataDir, network);

  // Wallet files can be in various locations depending on ord version
  const walletPaths = [
    // New location: wallets/ord.redb in network subdir
    path.join(networkDir, 'wallets'),
    path.join(networkDir, 'wallets', 'ord.redb'),
    // Root wallets dir
    path.join(dataDir, 'wallets'),
    path.join(dataDir, 'wallets', 'ord.redb'),
    // Old locations
    path.join(networkDir, 'wallet.redb'),
    path.join(networkDir, 'wallet'),
    path.join(dataDir, 'wallet.redb'),
    path.join(dataDir, 'wallet'),
  ];

  for (const walletPath of walletPaths) {
    if (fs.existsSync(walletPath)) {
      log(`Deleting outdated wallet database: ${walletPath}`);
      fs.rmSync(walletPath, { recursive: true, force: true });
    }
  }
}

/**
 * Clears all ord data (index + wallet) for a clean slate.
 */
export function clearAllOrdData(network: string): void {
  log(`Clearing all ord data for network: ${network}`);
  clearOrdIndex(network);
  clearOrdWallet(network);
}

/**
 * Checks if an error message indicates a database version mismatch
 */
function isVersionMismatchError(errorMessage: string): boolean {
  return (
    errorMessage.includes('Manual upgrade required') ||
    errorMessage.includes('Expected file format version') ||
    errorMessage.includes('failed to open index') ||
    errorMessage.includes('failed to open wallet database')
  );
}

export function isOrdRunning(): boolean {
  return ordProcess !== null && ordProcess.exitCode === null;
}

export async function isOrdServerReady(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    // Check /blockcount - this returns a valid integer only when ord is fully indexed
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/blockcount',
        method: 'GET',
        timeout: 2000,
      },
      (res) => {
        if (res.statusCode === 200) {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            // Check if response is a valid integer (ord is indexed)
            const parsed = parseInt(body.trim(), 10);
            resolve(!isNaN(parsed) && parsed >= 0);
          });
        } else {
          resolve(false);
        }
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

export interface OrdHealthCheck {
  healthy: boolean;
  blockcount: number | null;
  error: string | null;
}

/**
 * Gets the current block count from the ord server
 */
export async function getOrdBlockCount(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/blockcount',
        method: 'GET',
        timeout: 5000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            const parsed = parseInt(body.trim(), 10);
            if (!isNaN(parsed)) {
              resolve(parsed);
            } else {
              reject(new Error(`Invalid blockcount: ${body}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      }
    );
    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.end();
  });
}

/**
 * Waits for ord server to sync with bitcoind
 */
export async function waitForOrdSync(port: number, expectedBlocks: number, maxWaitMs: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const ordBlocks = await getOrdBlockCount(port);
      if (ordBlocks >= expectedBlocks) {
        return true;
      }
      log(`Waiting for ord to sync... (${ordBlocks}/${expectedBlocks} blocks)`);
    } catch {
      // Ignore errors, keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/**
 * Verifies that the ord server can communicate with bitcoind.
 * This checks that the cookie authentication is working properly.
 */
export async function verifyOrdBitcoindConnection(port: number): Promise<OrdHealthCheck> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/blockcount',
        method: 'GET',
        timeout: 5000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            const parsed = parseInt(body.trim(), 10);
            if (!isNaN(parsed) && parsed >= 0) {
              resolve({ healthy: true, blockcount: parsed, error: null });
            } else {
              resolve({ healthy: false, blockcount: null, error: `Invalid blockcount response: ${body}` });
            }
          } else if (res.statusCode === 500) {
            // 500 often indicates bitcoind auth failure
            resolve({ healthy: false, blockcount: null, error: `Server error (likely auth failure): ${body}` });
          } else {
            resolve({ healthy: false, blockcount: null, error: `HTTP ${res.statusCode}: ${body}` });
          }
        });
      }
    );
    req.on('error', (err) => {
      resolve({ healthy: false, blockcount: null, error: `Connection error: ${err.message}` });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false, blockcount: null, error: 'Request timeout' });
    });
    req.end();
  });
}

/**
 * Kill any process listening on a specific port (Windows)
 */
async function killProcessOnPort(port: number): Promise<void> {
  if (getPlatform() !== 'windows') {
    return;
  }

  return new Promise((resolve) => {
    exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve();
        return;
      }

      // Parse PID from netstat output
      const lines = stdout.trim().split('\n');
      const pids = new Set<string>();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') {
          pids.add(pid);
        }
      }

      if (pids.size === 0) {
        resolve();
        return;
      }

      log(`Found orphan processes on port ${port}: ${Array.from(pids).join(', ')}`);

      // Kill each PID
      let killed = 0;
      for (const pid of pids) {
        exec(`taskkill /F /PID ${pid}`, (killError) => {
          if (!killError) {
            log(`Killed orphan process ${pid}`);
          }
          killed++;
          if (killed === pids.size) {
            // Give it a moment to release the port
            setTimeout(resolve, 500);
          }
        });
      }
    });
  });
}

export async function startOrdServer(
  context: vscode.ExtensionContext,
  retryAfterIndexClear = true
): Promise<void> {
  if (isOrdRunning()) {
    log('ord server is already running');
    return;
  }

  const ordPath = getOrdPath(context);
  if (!fs.existsSync(ordPath)) {
    throw new Error('ord not found. Please download binaries first.');
  }

  const config = getConfig();
  const networkFlag = getOrdNetworkFlag(config.network);
  const dataDir = getOrdDataDirectory();
  const cookieFile = getCookieFilePath(config.network);

  // Kill any orphan ord processes on the server port
  await killProcessOnPort(config.ordServerPort);

  // Ensure data directory exists
  fs.mkdirSync(dataDir, { recursive: true });

  // Verify cookie file exists (bitcoind must be running first)
  if (!fs.existsSync(cookieFile)) {
    throw new Error(`Bitcoin cookie file not found at ${cookieFile}. Ensure bitcoind is running.`);
  }

  const args: string[] = [];

  if (networkFlag) {
    args.push(networkFlag);
  }

  // IMPORTANT: Use cookie-file authentication, NOT rpcuser/rpcpassword
  // Ord requires cookie authentication to work properly
  args.push(
    `--cookie-file=${cookieFile}`,
    `--data-dir=${dataDir}`,
    'server',
    `--http-port=${config.ordServerPort}`
  );

  logSection('Starting Ord Server');
  log(`Command: ${args.join(' ')}`);

  // Track if we detect an index version error
  let indexVersionError = false;
  let stderrOutput = '';

  ordProcess = spawn(ordPath, args, {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  ordProcess.stdout?.on('data', (data: Buffer) => {
    logProcessOutput('ord', data.toString());
  });

  ordProcess.stderr?.on('data', (data: Buffer) => {
    const text = data.toString();
    stderrOutput += text;
    logProcessOutput('ord:err', text);

    // Detect index or wallet version mismatch error
    if (
      text.includes('Manual upgrade required') ||
      text.includes('Expected file format version') ||
      text.includes('failed to open index') ||
      text.includes('failed to open wallet database')
    ) {
      indexVersionError = true;
    }
  });

  ordProcess.on('error', (err) => {
    logError(`[ord] Failed to start: ${err.message}`);
    ordProcess = null;
  });

  ordProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      logWarn(`[ord] Exited with code ${code}`);
    } else {
      log(`Exited`);
    }
    ordProcess = null;
  });

  // Wait for ord server to be ready
  log('Waiting for ord server to be ready...');
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await isOrdServerReady(config.ordServerPort)) {
      log('ord server is ready!');
      return;
    }
    if (!isOrdRunning()) {
      // Check if we failed due to index/wallet version mismatch
      if (indexVersionError && retryAfterIndexClear) {
        log('Detected database version mismatch. Clearing old data and retrying...');
        vscode.window.showInformationMessage(
          'Ord database is outdated. Clearing and rebuilding (this may take a moment)...'
        );
        clearAllOrdData(config.network);

        // Retry once without allowing another retry
        return startOrdServer(context, false);
      }

      throw new Error(
        `ord server failed to start${stderrOutput ? ': ' + stderrOutput.substring(0, 200) : ''}`
      );
    }
  }

  throw new Error('ord server failed to become ready in time');
}

export async function stopOrdServer(): Promise<void> {
  const proc = ordProcess;
  if (!proc) {
    log('ord server is not running');
    return;
  }

  log('Stopping ord server...');

  return new Promise((resolve) => {
    const treeKill = require('tree-kill');

    const timeout = setTimeout(() => {
      log('ord did not stop gracefully, killing...');
      treeKill(proc.pid, 'SIGKILL');
    }, 5000);

    proc.on('exit', () => {
      clearTimeout(timeout);
      ordProcess = null;
      log('ord server stopped');
      resolve();
    });

    if (getPlatform() === 'windows') {
      treeKill(proc.pid);
    } else {
      proc.kill('SIGTERM');
    }
  });
}

export interface InscriptionResult {
  inscriptionId: string;
  revealTxid: string;
  totalFees: number;
}

export async function inscribeFile(
  context: vscode.ExtensionContext,
  filePath: string,
  feeRate: number = 1,
  walletName?: string,
  retryAfterClear = true
): Promise<InscriptionResult> {
  const ordPath = getOrdPath(context);
  const config = getConfig();
  const networkFlag = getOrdNetworkFlag(config.network);
  const dataDir = getOrdDataDirectory();
  const cookieFile = getCookieFilePath(config.network);
  const wallet = walletName || getCurrentWallet();

  const args: string[] = [];

  if (networkFlag) {
    args.push(networkFlag);
  }

  // Use cookie-file authentication and server-url for wallet commands
  args.push(
    `--cookie-file=${cookieFile}`,
    `--data-dir=${dataDir}`,
    'wallet',
    `--name=${wallet}`,
    `--server-url=http://127.0.0.1:${config.ordServerPort}`,
    'inscribe',
    '--fee-rate',
    feeRate.toString(),
    '--file',
    filePath
  );

  log(`Inscribing file: ${filePath}`);
  log(`Command: ord ${args.join(' ')}`);

  return new Promise((resolve, reject) => {
    exec(`"${ordPath}" ${args.map((a) => `"${a}"`).join(' ')}`, async (error, stdout, stderr) => {
      if (error) {
        log(`Inscription failed: ${error.message}`);
        log(`stderr: ${stderr}`);

        // Check for version mismatch
        if (isVersionMismatchError(stderr) && retryAfterClear) {
          log('Detected database version mismatch. Clearing and retrying...');
          vscode.window.showInformationMessage(
            'Ord database is outdated. Clearing and recreating...'
          );
          clearAllOrdData(config.network);

          // Recreate wallet first
          try {
            await createOrdWallet(context, undefined, false);
            const result = await inscribeFile(context, filePath, feeRate, undefined, false);
            resolve(result);
          } catch (retryError) {
            reject(retryError);
          }
          return;
        }

        reject(new Error(`Inscription failed: ${stderr || error.message}`));
        return;
      }

      log(`Inscription output: ${stdout}`);

      // Parse the inscription result
      try {
        const output = stdout.trim();
        const result = JSON.parse(output);

        // Handle different output formats
        if (result.inscriptions && result.inscriptions.length > 0) {
          resolve({
            inscriptionId: result.inscriptions[0].id,
            revealTxid: result.reveal,
            totalFees: result.total_fees || 0,
          });
        } else if (result.inscription) {
          resolve({
            inscriptionId: result.inscription,
            revealTxid: result.reveal,
            totalFees: result.total_fees || 0,
          });
        } else {
          // Try to find inscription ID in the output
          const idMatch = output.match(/inscription\s+([a-f0-9]{64}i\d+)/i);
          const txMatch = output.match(/reveal\s+([a-f0-9]{64})/i);

          if (idMatch) {
            resolve({
              inscriptionId: idMatch[1],
              revealTxid: txMatch ? txMatch[1] : '',
              totalFees: 0,
            });
          } else {
            reject(new Error(`Could not parse inscription result: ${output}`));
          }
        }
      } catch {
        // Try regex parsing for non-JSON output
        const idMatch = stdout.match(/([a-f0-9]{64}i\d+)/i);
        if (idMatch) {
          resolve({
            inscriptionId: idMatch[1],
            revealTxid: '',
            totalFees: 0,
          });
        } else {
          reject(new Error(`Could not parse inscription result: ${stdout}`));
        }
      }
    });
  });
}

export async function createOrdWallet(
  context: vscode.ExtensionContext,
  walletName?: string,
  retryAfterClear = true
): Promise<void> {
  const ordPath = getOrdPath(context);
  const config = getConfig();
  const networkFlag = getOrdNetworkFlag(config.network);
  const dataDir = getOrdDataDirectory();
  const cookieFile = getCookieFilePath(config.network);
  const wallet = walletName || getCurrentWallet();

  const args: string[] = [];

  if (networkFlag) {
    args.push(networkFlag);
  }

  // Use cookie-file authentication and server-url for wallet commands
  args.push(
    `--cookie-file=${cookieFile}`,
    `--data-dir=${dataDir}`,
    'wallet',
    `--name=${wallet}`,
    `--server-url=http://127.0.0.1:${config.ordServerPort}`,
    'create'
  );

  log(`Creating ord wallet "${wallet}"...`);

  return new Promise((resolve, reject) => {
    exec(`"${ordPath}" ${args.map((a) => `"${a}"`).join(' ')}`, async (error, stdout, stderr) => {
      if (error) {
        // Wallet might already exist
        if (stderr.includes('already exists') || stdout.includes('already exists')) {
          log('Wallet already exists');
          resolve();
          return;
        }

        // Check for version mismatch
        if (isVersionMismatchError(stderr) && retryAfterClear) {
          log('Detected wallet database version mismatch. Clearing and retrying...');
          vscode.window.showInformationMessage(
            'Ord wallet database is outdated. Clearing and recreating...'
          );
          clearAllOrdData(config.network);
          try {
            await createOrdWallet(context, wallet, false);
            resolve();
          } catch (retryError) {
            reject(retryError);
          }
          return;
        }

        log(`Failed to create wallet: ${error.message}`);
        reject(new Error(`Failed to create wallet: ${stderr || error.message}`));
        return;
      }

      log(`Wallet created: ${stdout}`);
      resolve();
    });
  });
}

export async function getOrdReceiveAddress(
  context: vscode.ExtensionContext,
  walletName?: string,
  retryAfterClear = true
): Promise<string> {
  const ordPath = getOrdPath(context);
  const config = getConfig();
  const networkFlag = getOrdNetworkFlag(config.network);
  const dataDir = getOrdDataDirectory();
  const cookieFile = getCookieFilePath(config.network);
  const wallet = walletName || getCurrentWallet();

  const args: string[] = [];

  if (networkFlag) {
    args.push(networkFlag);
  }

  // Use cookie-file authentication and server-url for wallet commands
  args.push(
    `--cookie-file=${cookieFile}`,
    `--data-dir=${dataDir}`,
    'wallet',
    `--name=${wallet}`,
    `--server-url=http://127.0.0.1:${config.ordServerPort}`,
    'receive'
  );

  return new Promise((resolve, reject) => {
    exec(`"${ordPath}" ${args.map((a) => `"${a}"`).join(' ')}`, async (error, stdout, stderr) => {
      if (error) {
        // Check for version mismatch
        if (isVersionMismatchError(stderr) && retryAfterClear) {
          log('Detected wallet database version mismatch. Clearing and retrying...');
          vscode.window.showInformationMessage(
            'Ord wallet database is outdated. Clearing and recreating...'
          );
          clearAllOrdData(config.network);

          // Recreate wallet first
          try {
            await createOrdWallet(context, wallet, false);
            const result = await getOrdReceiveAddress(context, wallet, false);
            resolve(result);
          } catch (retryError) {
            reject(retryError);
          }
          return;
        }

        reject(new Error(`Failed to get receive address: ${stderr || error.message}`));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        const address = result.addresses?.[0]?.address || result.address;
        if (address) {
          resolve(address);
        } else {
          // Try regex as fallback
          const match = stdout.match(/\b(bcrt1|bc1|tb1)[a-zA-HJ-NP-Z0-9]{25,100}\b/);
          if (match) {
            resolve(match[0]);
          } else {
            reject(new Error(`No address found in response: ${stdout}`));
          }
        }
      } catch {
        // Try to extract address from plain text
        const match = stdout.match(/\b(bcrt1|bc1|tb1)[a-zA-HJ-NP-Z0-9]{25,100}\b/);
        if (match) {
          resolve(match[0]);
        } else {
          reject(new Error(`Could not parse address from: ${stdout}`));
        }
      }
    });
  });
}

export async function getOrdBalance(
  context: vscode.ExtensionContext,
  walletName?: string,
  retryAfterClear = true
): Promise<{
  cardinal: number;
  ordinal: number;
  total: number;
}> {
  const ordPath = getOrdPath(context);
  const config = getConfig();
  const networkFlag = getOrdNetworkFlag(config.network);
  const dataDir = getOrdDataDirectory();
  const cookieFile = getCookieFilePath(config.network);
  const wallet = walletName || getCurrentWallet();

  const args: string[] = [];

  if (networkFlag) {
    args.push(networkFlag);
  }

  // Use cookie-file authentication and server-url for wallet commands
  args.push(
    `--cookie-file=${cookieFile}`,
    `--data-dir=${dataDir}`,
    'wallet',
    `--name=${wallet}`,
    `--server-url=http://127.0.0.1:${config.ordServerPort}`,
    'balance'
  );

  return new Promise((resolve, reject) => {
    exec(`"${ordPath}" ${args.map((a) => `"${a}"`).join(' ')}`, async (error, stdout, stderr) => {
      if (error) {
        // Check for version mismatch
        if (isVersionMismatchError(stderr) && retryAfterClear) {
          log('Detected wallet database version mismatch. Clearing and retrying...');
          vscode.window.showInformationMessage(
            'Ord wallet database is outdated. Clearing and recreating...'
          );
          clearAllOrdData(config.network);

          // Recreate wallet first
          try {
            await createOrdWallet(context, wallet, false);
            const result = await getOrdBalance(context, wallet, false);
            resolve(result);
          } catch (retryError) {
            reject(retryError);
          }
          return;
        }

        reject(new Error(`Failed to get balance: ${stderr || error.message}`));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        resolve({
          cardinal: result.cardinal || 0,
          ordinal: result.ordinal || 0,
          total: result.total || (result.cardinal || 0) + (result.ordinal || 0),
        });
      } catch {
        // Parse from plain text
        const match = stdout.match(/(\d+)/);
        const total = match ? parseInt(match[1], 10) : 0;
        resolve({ cardinal: total, ordinal: 0, total });
      }
    });
  });
}

export function getOrdProcess(): ChildProcess | null {
  return ordProcess;
}
