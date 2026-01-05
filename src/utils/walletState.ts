import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getOrdDataDirectory } from './platform';
import { getConfig } from './config';

const CURRENT_WALLET_KEY = 'ord.currentWallet';
const DEFAULT_WALLET_NAME = 'ord';

let extensionContext: vscode.ExtensionContext | null = null;

export function initWalletState(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

/**
 * Gets the current wallet name
 */
export function getCurrentWallet(): string {
  if (!extensionContext) {
    return DEFAULT_WALLET_NAME;
  }
  return extensionContext.globalState.get<string>(CURRENT_WALLET_KEY, DEFAULT_WALLET_NAME);
}

/**
 * Sets the current wallet name
 */
export async function setCurrentWallet(walletName: string): Promise<void> {
  if (!extensionContext) {
    throw new Error('Wallet state not initialized');
  }
  await extensionContext.globalState.update(CURRENT_WALLET_KEY, walletName);
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
 * Lists all available ord wallets for the current network
 */
export function listWallets(): string[] {
  const config = getConfig();
  const dataDir = getOrdDataDirectory();
  const networkDir = getNetworkDir(dataDir, config.network);
  const walletsDir = path.join(networkDir, 'wallets');

  if (!fs.existsSync(walletsDir)) {
    return [];
  }

  try {
    const entries = fs.readdirSync(walletsDir, { withFileTypes: true });
    const wallets: string[] = [];

    for (const entry of entries) {
      // Wallet directories contain .redb files or are .redb files themselves
      if (entry.isDirectory()) {
        // Check if it contains wallet data
        const walletPath = path.join(walletsDir, entry.name);
        const files = fs.readdirSync(walletPath);
        if (files.some(f => f.endsWith('.redb') || f === 'wallet.redb')) {
          wallets.push(entry.name);
        }
      } else if (entry.name.endsWith('.redb')) {
        // Wallet stored as single .redb file
        wallets.push(entry.name.replace('.redb', ''));
      }
    }

    return wallets.sort();
  } catch {
    return [];
  }
}

/**
 * Checks if a wallet exists
 */
export function walletExists(walletName: string): boolean {
  const wallets = listWallets();
  return wallets.includes(walletName);
}
