import * as vscode from 'vscode';
import { isBitcoindRunning } from '../services/bitcoind';
import { isOrdRunning, getOrdBalance, getOrdReceiveAddress } from '../services/ord';
import { getInscriptionHistory } from '../utils/inscriptionHistory';
import { getConfig } from '../utils/config';
import { getCurrentWallet, listWallets } from '../utils/walletState';

// Wallet Tree Provider
export class WalletTreeProvider implements vscode.TreeDataProvider<WalletItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<WalletItem | undefined | null | void> = new vscode.EventEmitter<WalletItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<WalletItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private context: vscode.ExtensionContext;
  private balance: { cardinal: number; ordinal: number; total: number } | null = null;
  private address: string | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  refresh(): void {
    this.balance = null;
    this.address = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: WalletItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: WalletItem): Promise<WalletItem[]> {
    if (element) {
      return [];
    }

    const items: WalletItem[] = [];
    const config = getConfig();

    // Status item
    const bitcoindUp = isBitcoindRunning();
    const ordUp = isOrdRunning();

    if (!bitcoindUp) {
      items.push(new WalletItem(
        'Services Stopped',
        'Click to start',
        vscode.TreeItemCollapsibleState.None,
        'circle-slash',
        'ord.start'
      ));
      return items;
    }

    // Network
    items.push(new WalletItem(
      `Network: ${config.network}`,
      '',
      vscode.TreeItemCollapsibleState.None,
      'globe'
    ));

    // Current Wallet
    const currentWallet = getCurrentWallet();
    const allWallets = listWallets();
    const walletCount = allWallets.length;
    items.push(new WalletItem(
      `Wallet: ${currentWallet}`,
      walletCount > 1 ? `${walletCount} wallets - Click to switch` : 'Click to switch',
      vscode.TreeItemCollapsibleState.None,
      'wallet',
      'ord.switchWallet'
    ));

    // Service status
    items.push(new WalletItem(
      `bitcoind: Running`,
      '',
      vscode.TreeItemCollapsibleState.None,
      'check'
    ));

    items.push(new WalletItem(
      `ord: ${ordUp ? 'Running' : 'Stopped'}`,
      ordUp ? '' : 'Click to start',
      vscode.TreeItemCollapsibleState.None,
      ordUp ? 'check' : 'circle-slash',
      ordUp ? undefined : 'ord.start'
    ));

    if (!ordUp) {
      return items;
    }

    // Separator
    items.push(new WalletItem('─────────────', '', vscode.TreeItemCollapsibleState.None));

    // Balance
    try {
      if (!this.balance) {
        this.balance = await getOrdBalance(this.context);
      }
      const btcTotal = (this.balance.total / 100000000).toFixed(8);
      const btcCardinal = (this.balance.cardinal / 100000000).toFixed(8);

      items.push(new WalletItem(
        `Balance: ${btcTotal} BTC`,
        `Cardinal: ${btcCardinal} BTC`,
        vscode.TreeItemCollapsibleState.None,
        'credit-card',
        'ord.getBalance'
      ));
    } catch {
      items.push(new WalletItem(
        'Balance: No wallet',
        'Click to create',
        vscode.TreeItemCollapsibleState.None,
        'wallet',
        'ord.createWallet'
      ));
    }

    // Receive address
    try {
      if (!this.address) {
        this.address = await getOrdReceiveAddress(this.context);
      }
      const shortAddr = this.address.substring(0, 12) + '...' + this.address.substring(this.address.length - 6);
      items.push(new WalletItem(
        `Address: ${shortAddr}`,
        'Click to copy',
        vscode.TreeItemCollapsibleState.None,
        'key',
        'ord.copyAddress'
      ));
    } catch {
      // No wallet
    }

    // Separator
    items.push(new WalletItem('─────────────', '', vscode.TreeItemCollapsibleState.None));

    // Actions
    items.push(new WalletItem(
      'Mine Blocks',
      config.network === 'regtest' ? '' : 'regtest only',
      vscode.TreeItemCollapsibleState.None,
      'package',
      config.network === 'regtest' ? 'ord.mineBlocks' : undefined
    ));

    items.push(new WalletItem(
      'Open in Browser',
      `localhost:${config.ordServerPort}`,
      vscode.TreeItemCollapsibleState.None,
      'globe',
      'ord.openServer'
    ));

    return items;
  }
}

class WalletItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly icon?: string,
    public readonly commandId?: string
  ) {
    super(label, collapsibleState);
    this.description = description;

    if (icon) {
      this.iconPath = new vscode.ThemeIcon(icon);
    }

    if (commandId) {
      this.command = {
        command: commandId,
        title: label,
      };
    }
  }
}

// Inscriptions Tree Provider
export class InscriptionsTreeProvider implements vscode.TreeDataProvider<InscriptionItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<InscriptionItem | undefined | null | void> = new vscode.EventEmitter<InscriptionItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<InscriptionItem | undefined | null | void> = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: InscriptionItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: InscriptionItem): Promise<InscriptionItem[]> {
    if (element) {
      return [];
    }

    const history = getInscriptionHistory();
    const config = getConfig();

    if (history.length === 0) {
      return [new InscriptionItem(
        'No inscriptions yet',
        'Inscribe a file to get started',
        '',
        vscode.TreeItemCollapsibleState.None
      )];
    }

    return history.map(inscription => {
      const shortId = inscription.id.substring(0, 8) + '...';
      const date = new Date(inscription.timestamp).toLocaleDateString();

      return new InscriptionItem(
        inscription.fileName,
        `${shortId} • ${date}`,
        inscription.id,
        vscode.TreeItemCollapsibleState.None,
        config.ordServerPort
      );
    });
  }
}

class InscriptionItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly inscriptionId: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly port?: number
  ) {
    super(label, collapsibleState);
    this.description = description;
    this.iconPath = new vscode.ThemeIcon('file');
    this.tooltip = inscriptionId || 'No inscription';

    if (inscriptionId && port) {
      this.command = {
        command: 'ord.openInscription',
        title: 'Open Inscription',
        arguments: [inscriptionId],
      };
      this.contextValue = 'inscription';
    }
  }
}

// Module-level providers for external refresh calls
let walletProviderInstance: WalletTreeProvider | null = null;
let inscriptionsProviderInstance: InscriptionsTreeProvider | null = null;

// Export functions to refresh tree views from other modules
export function refreshWalletTree(): void {
  walletProviderInstance?.refresh();
}

export function refreshInscriptionsTree(): void {
  inscriptionsProviderInstance?.refresh();
}

export function refreshAllTrees(): void {
  walletProviderInstance?.refresh();
  inscriptionsProviderInstance?.refresh();
}

// Export functions to register tree views
export function registerTreeViews(context: vscode.ExtensionContext): {
  walletProvider: WalletTreeProvider;
  inscriptionsProvider: InscriptionsTreeProvider;
} {
  const walletProvider = new WalletTreeProvider(context);
  const inscriptionsProvider = new InscriptionsTreeProvider();

  // Store references for external refresh calls
  walletProviderInstance = walletProvider;
  inscriptionsProviderInstance = inscriptionsProvider;

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('ordinalsWallet', walletProvider),
    vscode.window.registerTreeDataProvider('ordinalsInscriptions', inscriptionsProvider)
  );

  // Register refresh commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ord.refreshWallet', () => walletProvider.refresh()),
    vscode.commands.registerCommand('ord.refreshInscriptions', () => inscriptionsProvider.refresh())
  );

  // Register copy address command
  context.subscriptions.push(
    vscode.commands.registerCommand('ord.copyAddress', async () => {
      try {
        const address = await getOrdReceiveAddress(context);
        await vscode.env.clipboard.writeText(address);
        vscode.window.showInformationMessage('Address copied to clipboard!');
      } catch (e) {
        vscode.window.showErrorMessage('No wallet address available');
      }
    })
  );

  return { walletProvider, inscriptionsProvider };
}
