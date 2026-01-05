import * as vscode from 'vscode';
import { createOrdWallet, getOrdBalance, getOrdReceiveAddress, clearOrdWallet, clearAllOrdData, isOrdRunning, stopOrdServer, startOrdServer } from '../services/ord';
import { generateToAddress, createWallet as createBitcoinWallet, listWallets as listBitcoinWallets, loadWallet, unloadWallet, getNewAddress, rpcCall } from '../utils/rpc';
import { isBitcoindRunning } from '../services/bitcoind';
import { getConfig } from '../utils/config';
import { log } from '../ui/outputChannel';
import { updateStatusBar } from '../ui/statusBar';
import { showErrorWithSuggestion, showWarningWithAction } from '../utils/errorHelper';
import { refreshWalletTree } from '../ui/treeView';
import { getCurrentWallet, setCurrentWallet, listWallets as listOrdWallets } from '../utils/walletState';

const COINBASE_MATURITY = 100;

export async function createWallet(context: vscode.ExtensionContext): Promise<void> {
  if (!isBitcoindRunning()) {
    await showWarningWithAction('Bitcoin Core is not running. Start services to create a wallet.', 'Start Services', 'ord.start');
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Creating wallet...',
      cancellable: false,
    },
    async () => {
      try {
        // IMPORTANT: Create ord wallet FIRST - it will create its own Bitcoin wallet
        // with the correct descriptors. Don't pre-create a Bitcoin wallet named "ord"
        // as that will cause descriptor mismatch errors.
        await createOrdWallet(context);

        // Create a separate Bitcoin wallet for mining rewards (not named "ord")
        try {
          await createBitcoinWallet('mining');
          log('Created Bitcoin wallet "mining" for coinbase rewards');
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.includes('already exists')) {
            throw e;
          }
          // Try to load it if it exists but isn't loaded
          try {
            await loadWallet('mining');
          } catch {
            // Already loaded, ignore
          }
          log('Bitcoin wallet "mining" already exists');
        }

        vscode.window.showInformationMessage('Wallet created successfully!');
        refreshWalletTree();
      } catch (error) {
        await showErrorWithSuggestion('Failed to create wallet', error instanceof Error ? error : String(error));
      }
    }
  );
}

export async function showBalance(context: vscode.ExtensionContext): Promise<void> {
  if (!isBitcoindRunning()) {
    await showWarningWithAction('Bitcoin Core is not running. Start services to check balance.', 'Start Services', 'ord.start');
    return;
  }

  try {
    const balance = await getOrdBalance(context);
    const btcTotal = balance.total / 100000000;
    const btcCardinal = balance.cardinal / 100000000;

    vscode.window.showInformationMessage(
      `Wallet Balance: ${btcTotal.toFixed(8)} BTC (Cardinal: ${btcCardinal.toFixed(8)} BTC)`
    );
  } catch (error) {
    await showErrorWithSuggestion('Failed to get balance', error instanceof Error ? error : String(error));
  }
}

export async function mineBlocks(context: vscode.ExtensionContext): Promise<void> {
  const config = getConfig();

  if (config.network !== 'regtest') {
    vscode.window.showWarningMessage(`Mining is only available in regtest mode (current: ${config.network}).`);
    return;
  }

  if (!isBitcoindRunning()) {
    await showWarningWithAction('Bitcoin Core is not running. Start services to mine blocks.', 'Start Services', 'ord.start');
    return;
  }

  const input = await vscode.window.showInputBox({
    prompt: 'How many blocks to mine?',
    value: '1',
    validateInput: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1 || num > 1000) {
        return 'Please enter a number between 1 and 1000';
      }
      return null;
    },
  });

  if (!input) return;

  const numBlocks = parseInt(input, 10);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Mining ${numBlocks} block(s)...`,
      cancellable: false,
    },
    async () => {
      try {
        // Get address to mine to - prefer ord wallet address
        let address: string;
        try {
          address = await getOrdReceiveAddress(context);
        } catch {
          // Fall back to separate mining wallet (not named "ord" to avoid conflicts)
          const wallets = await listBitcoinWallets();
          if (!wallets.includes('mining')) {
            await createBitcoinWallet('mining');
          }
          address = await getNewAddress('mining');
        }

        const blocks = await generateToAddress(numBlocks, address);
        log(`Mined ${blocks.length} blocks`);

        vscode.window.showInformationMessage(`Mined ${blocks.length} block(s)!`);
        refreshWalletTree();
      } catch (error) {
        await showErrorWithSuggestion('Failed to mine blocks', error instanceof Error ? error : String(error));
      }
    }
  );
}

export async function resetWallet(context: vscode.ExtensionContext): Promise<void> {
  const config = getConfig();

  // Confirm with user
  const confirm = await vscode.window.showWarningMessage(
    `This will delete the ord wallet AND index for ${config.network}. All inscription history will be lost. The index will need to rebuild. Continue?`,
    { modal: true },
    'Full Reset'
  );

  if (confirm !== 'Full Reset') {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Resetting ord...',
      cancellable: false,
    },
    async (progress) => {
      try {
        // Stop ord if running (files may be locked)
        const wasRunning = isOrdRunning();
        if (wasRunning) {
          progress.report({ message: 'Stopping ord server...' });
          await stopOrdServer();
          updateStatusBar();
        }

        // Unload the ord wallet from bitcoind if it exists
        if (isBitcoindRunning()) {
          progress.report({ message: 'Unloading Bitcoin wallet...' });
          try {
            const wallets = await listBitcoinWallets();
            if (wallets.includes('ord')) {
              await unloadWallet('ord');
              log('Unloaded ord wallet from bitcoind');
            }
          } catch (e) {
            log(`Note: Could not unload ord wallet: ${e}`);
          }
        }

        // Clear ALL ord data (wallet + index) for a clean slate
        progress.report({ message: 'Deleting ord data...' });
        clearAllOrdData(config.network);
        log(`Cleared all ord data for ${config.network}`);

        // Restart ord if it was running (will rebuild index)
        if (wasRunning && isBitcoindRunning()) {
          progress.report({ message: 'Restarting ord server (rebuilding index)...' });
          await startOrdServer(context);
          updateStatusBar();
        }

        vscode.window.showInformationMessage('Ord has been reset. Create a new wallet to continue.');
        refreshWalletTree();
      } catch (error) {
        await showErrorWithSuggestion('Failed to reset wallet', error instanceof Error ? error : String(error));
      }
    }
  );
}

export async function ensureWalletFunded(context: vscode.ExtensionContext): Promise<boolean> {
  const config = getConfig();
  const currentWallet = getCurrentWallet();

  try {
    // IMPORTANT: Create ord wallet FIRST - it manages its own Bitcoin wallet
    // with correct descriptors. Don't create a Bitcoin wallet named "ord" separately.
    log(`Ensuring ord wallet "${currentWallet}" exists...`);
    try {
      await createOrdWallet(context);
      log('Ord wallet created/verified');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Wallet already exists is fine
      if (!msg.includes('already exists')) {
        log(`Error creating ord wallet: ${msg}`);
        throw e; // Re-throw non-"already exists" errors
      }
      log('Ord wallet already exists');
    }

    // Ensure we have a mining wallet (separate from ord)
    const wallets = await listBitcoinWallets();
    if (!wallets.includes('mining')) {
      log('Creating Bitcoin wallet "mining" for coinbase rewards...');
      try {
        await createBitcoinWallet('mining');
      } catch (e) {
        // Try loading if exists
        try {
          await loadWallet('mining');
        } catch {
          // Ignore
        }
      }
    }

    // Check balance
    const balance = await getOrdBalance(context);
    log(`Current ord wallet "${currentWallet}" balance: ${balance.cardinal} sats`);

    if (balance.cardinal < 10000 && config.network === 'regtest') {
      log('Wallet needs funding, mining blocks...');

      // Get receive address from ord wallet
      const address = await getOrdReceiveAddress(context);
      log(`Mining to ord address: ${address}`);

      // For a wallet with no balance, we need to mine enough blocks for coinbase to mature.
      // Coinbase rewards require COINBASE_MATURITY (100) confirmations before they can be spent.
      // So we need to mine at least COINBASE_MATURITY + 1 blocks to this address.
      const blocksToMine = COINBASE_MATURITY + 1;
      log(`Mining ${blocksToMine} blocks to fund wallet "${currentWallet}"...`);

      await generateToAddress(blocksToMine, address);
      log(`Mined ${blocksToMine} blocks for funding`);

      return true;
    }

    return balance.cardinal >= 10000;
  } catch (error) {
    log(`Error ensuring wallet funded: ${error}`);
    return false;
  }
}

export async function createNamedWallet(context: vscode.ExtensionContext): Promise<void> {
  if (!isBitcoindRunning()) {
    await showWarningWithAction('Bitcoin Core is not running. Start services to create a wallet.', 'Start Services', 'ord.start');
    return;
  }

  const walletName = await vscode.window.showInputBox({
    prompt: 'Enter a name for the new wallet',
    placeHolder: 'my-wallet',
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return 'Wallet name cannot be empty';
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
        return 'Wallet name can only contain letters, numbers, hyphens, and underscores';
      }
      const existing = listOrdWallets();
      if (existing.includes(value)) {
        return 'A wallet with this name already exists';
      }
      return null;
    },
  });

  if (!walletName) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Creating wallet "${walletName}"...`,
      cancellable: false,
    },
    async () => {
      try {
        await createOrdWallet(context, walletName);

        // Switch to the new wallet
        await setCurrentWallet(walletName);

        vscode.window.showInformationMessage(`Wallet "${walletName}" created and activated!`);
        refreshWalletTree();
      } catch (error) {
        await showErrorWithSuggestion('Failed to create wallet', error instanceof Error ? error : String(error));
      }
    }
  );
}

export async function switchWallet(): Promise<void> {
  const wallets = listOrdWallets();
  const currentWallet = getCurrentWallet();

  if (wallets.length === 0) {
    vscode.window.showInformationMessage('No wallets found. Create a wallet first.');
    return;
  }

  const items = wallets.map((name) => ({
    label: name,
    description: name === currentWallet ? '(current)' : '',
    picked: name === currentWallet,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a wallet to switch to',
    title: 'Switch Wallet',
  });

  if (!selected || selected.label === currentWallet) {
    return;
  }

  await setCurrentWallet(selected.label);
  vscode.window.showInformationMessage(`Switched to wallet "${selected.label}"`);
  refreshWalletTree();
}

export function getActiveWalletName(): string {
  return getCurrentWallet();
}
