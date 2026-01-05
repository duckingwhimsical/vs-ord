import * as vscode from 'vscode';
import { spawn, ChildProcess, exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getBitcoindPath, getDefaultDataDirectory, getPlatform } from '../utils/platform';
import { getConfig, getNetworkFlag, getRpcPort, Network } from '../utils/config';
import { isBitcoindReady } from '../utils/rpc';
import { log as sharedLog, logSection, logProcessOutput, logError, logWarn } from '../ui/outputChannel';

let bitcoindProcess: ChildProcess | null = null;
let outputChannel: vscode.OutputChannel | null = null;

export function setBitcoindOutputChannel(channel: vscode.OutputChannel): void {
  outputChannel = channel;
}

function log(message: string): void {
  sharedLog(`[bitcoind] ${message}`);
}

export function isBitcoindRunning(): boolean {
  return bitcoindProcess !== null && bitcoindProcess.exitCode === null;
}

/**
 * Check if a port is in use and warn user (don't kill - bitcoind might be intentional)
 */
async function checkPortInUse(port: number): Promise<boolean> {
  if (getPlatform() !== 'windows') {
    return false;
  }

  return new Promise((resolve) => {
    exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

export async function startBitcoind(context: vscode.ExtensionContext): Promise<void> {
  if (isBitcoindRunning()) {
    log('bitcoind is already running');
    return;
  }

  const bitcoindPath = getBitcoindPath(context);
  if (!fs.existsSync(bitcoindPath)) {
    throw new Error('bitcoind not found. Please download binaries first.');
  }

  const config = getConfig();
  const dataDir = config.dataDirectory || getDefaultDataDirectory();
  const networkFlag = getNetworkFlag(config.network);
  const rpcPort = getRpcPort(config.network);

  // Check if port is already in use (existing bitcoind instance)
  if (await checkPortInUse(rpcPort)) {
    // Try to connect to the existing instance
    if (await isBitcoindReady()) {
      log(`Found existing bitcoind on port ${rpcPort}, reusing it`);
      return;
    }
    throw new Error(`Port ${rpcPort} is in use but bitcoind is not responding. Another process may be using this port.`);
  }

  // Ensure data directory exists
  fs.mkdirSync(dataDir, { recursive: true });

  const args = [
    '-server',
    `-rpcport=${rpcPort}`,
    `-datadir=${dataDir}`,
    '-fallbackfee=0.00001',
    '-txindex=1',
  ];

  if (networkFlag) {
    args.unshift(networkFlag);
  }

  // Regtest-specific settings
  if (config.network === 'regtest') {
    args.push('-rpcallowip=127.0.0.1');
    args.push('-rpcbind=127.0.0.1');
  }

  logSection('Starting Bitcoin Core');
  log(`Command: ${args.join(' ')}`);
  log(`Data directory: ${dataDir}`);

  bitcoindProcess = spawn(bitcoindPath, args, {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  bitcoindProcess.stdout?.on('data', (data: Buffer) => {
    logProcessOutput('bitcoind', data.toString());
  });

  bitcoindProcess.stderr?.on('data', (data: Buffer) => {
    logProcessOutput('bitcoind:err', data.toString());
  });

  bitcoindProcess.on('error', (err) => {
    logError(`[bitcoind] Failed to start: ${err.message}`);
    bitcoindProcess = null;
  });

  bitcoindProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      logWarn(`[bitcoind] Exited with code ${code}`);
    } else {
      log(`Exited`);
    }
    bitcoindProcess = null;
  });

  // Wait for bitcoind to be ready
  log('Waiting for bitcoind to be ready...');
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await isBitcoindReady()) {
      log('bitcoind is ready!');
      return;
    }
    if (!isBitcoindRunning()) {
      throw new Error('bitcoind failed to start');
    }
  }

  throw new Error('bitcoind failed to become ready in time');
}

export async function stopBitcoind(): Promise<void> {
  const proc = bitcoindProcess;
  if (!proc) {
    log('bitcoind is not running');
    return;
  }

  log('Stopping bitcoind...');

  return new Promise((resolve) => {
    const treeKill = require('tree-kill');

    const timeout = setTimeout(() => {
      log('bitcoind did not stop gracefully, killing...');
      treeKill(proc.pid, 'SIGKILL');
    }, 10000);

    proc.on('exit', () => {
      clearTimeout(timeout);
      bitcoindProcess = null;
      log('bitcoind stopped');
      resolve();
    });

    // Send SIGTERM for graceful shutdown
    if (getPlatform() === 'windows') {
      treeKill(proc.pid);
    } else {
      proc.kill('SIGTERM');
    }
  });
}

export async function waitForBitcoind(maxWaitMs: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    if (await isBitcoindReady()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

export function getBitcoindProcess(): ChildProcess | null {
  return bitcoindProcess;
}
