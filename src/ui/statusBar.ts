import * as vscode from 'vscode';
import { isBitcoindRunning } from '../services/bitcoind';
import { isOrdRunning } from '../services/ord';
import { getConfig } from '../utils/config';
import { getInscriptionHistory } from '../utils/inscriptionHistory';
import { getCurrentWallet, listWallets } from '../utils/walletState';

let statusBarItem: vscode.StatusBarItem;
let updateInterval: NodeJS.Timeout | null = null;

interface CommandQuickPickItem extends vscode.QuickPickItem {
  command: string;
  args?: unknown;
}

export async function showStatusBarMenu(): Promise<void> {
  const bitcoindRunning = isBitcoindRunning();
  const ordRunning = isOrdRunning();
  const config = getConfig();

  const items: CommandQuickPickItem[] = [];

  // Service control commands
  if (!bitcoindRunning) {
    items.push({
      label: '$(play) Start Services',
      description: 'Start bitcoind and ord',
      command: 'ord.start',
    });
  } else {
    items.push({
      label: '$(debug-stop) Stop Services',
      description: 'Stop bitcoind and ord',
      command: 'ord.stop',
    });
  }

  // Commands available when services are running
  if (bitcoindRunning && ordRunning) {
    const currentWallet = getCurrentWallet();
    const walletCount = listWallets().length;

    items.push(
      {
        label: '$(file-add) Inscribe Current File',
        description: 'Inscribe the active editor file',
        command: 'ord.inscribe',
      },
      { label: '', kind: vscode.QuickPickItemKind.Separator, command: '' },
      {
        label: `$(wallet) Wallet: ${currentWallet}`,
        description: walletCount > 1 ? `${walletCount} wallets available` : '',
        command: 'ord.switchWallet',
      },
      {
        label: '$(add) Create New Wallet',
        description: 'Create a new named wallet',
        command: 'ord.createNamedWallet',
      },
      {
        label: '$(credit-card) Show Balance',
        description: 'Show wallet balance',
        command: 'ord.getBalance',
      },
      { label: '', kind: vscode.QuickPickItemKind.Separator, command: '' },
      {
        label: '$(package) Mine Blocks',
        description: 'Mine blocks (regtest only)',
        command: 'ord.mineBlocks',
      },
      {
        label: '$(globe) Open in Browser',
        description: `Open ord server at http://127.0.0.1:${config.ordServerPort}`,
        command: 'ord.openServer',
      },
      {
        label: '$(trash) Reset Wallet',
        description: 'Delete wallet and start fresh',
        command: 'ord.resetWallet',
      }
    );

    // Add recent inscriptions
    const history = getInscriptionHistory();
    if (history.length > 0) {
      items.push({ label: '', kind: vscode.QuickPickItemKind.Separator, command: '' });
      items.push({
        label: '$(bookmark) Recent Inscriptions',
        kind: vscode.QuickPickItemKind.Separator,
        command: '',
      });

      for (const inscription of history) {
        const shortId = inscription.id.substring(0, 8) + '...' + inscription.id.substring(inscription.id.length - 6);
        items.push({
          label: `$(file) ${inscription.fileName}`,
          description: shortId,
          detail: new Date(inscription.timestamp).toLocaleString(),
          command: 'ord.openInscription',
          args: inscription.id,
        });
      }
    }
  }

  // Always available commands
  items.push(
    { label: '', kind: vscode.QuickPickItemKind.Separator, command: '' },
    {
      label: '$(cloud-download) Download/Update Binaries',
      description: 'Download or update bitcoind and ord',
      command: 'ord.downloadBinaries',
    },
    {
      label: '$(output) Show Output',
      description: 'Show the output channel',
      command: 'ord.showOutput',
    }
  );

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `Ord [${config.network}] - Select a command`,
  });

  if (selected && selected.command) {
    if (selected.args !== undefined) {
      vscode.commands.executeCommand(selected.command, selected.args);
    } else {
      vscode.commands.executeCommand(selected.command);
    }
  }
}

export function createStatusBar(): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'ord.statusBarMenu';
  updateStatusBar();

  // Update status bar periodically
  updateInterval = setInterval(updateStatusBar, 2000);

  return statusBarItem;
}

export function updateStatusBar(): void {
  if (!statusBarItem) return;

  const bitcoindRunning = isBitcoindRunning();
  const ordRunning = isOrdRunning();
  const config = getConfig();

  // Set context for view title button visibility
  const servicesRunning = bitcoindRunning && ordRunning;
  vscode.commands.executeCommand('setContext', 'ordinals.servicesRunning', servicesRunning);

  if (bitcoindRunning && ordRunning) {
    statusBarItem.text = `$(check) Ord [${config.network}]`;
    statusBarItem.tooltip = `bitcoind and ord are running\nNetwork: ${config.network}\nClick for commands`;
    statusBarItem.backgroundColor = undefined;
    statusBarItem.show();
  } else if (bitcoindRunning) {
    statusBarItem.text = `$(sync~spin) Ord [bitcoind only]`;
    statusBarItem.tooltip = 'bitcoind is running, ord is stopped\nClick for commands';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    statusBarItem.show();
  } else {
    // Hide status bar when services are stopped
    statusBarItem.hide();
  }
}

export function disposeStatusBar(): void {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  statusBarItem?.dispose();
}
