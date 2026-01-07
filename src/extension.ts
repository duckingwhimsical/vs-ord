import * as vscode from 'vscode';
import { createOutputChannel, showOutput, disposeOutputChannel, log } from './ui/outputChannel';
import { createStatusBar, disposeStatusBar, showStatusBarMenu } from './ui/statusBar';
import { registerTreeViews } from './ui/treeView';
import { setBitcoindOutputChannel, stopBitcoind } from './services/bitcoind';
import { setOrdOutputChannel, stopOrdServer } from './services/ord';
import { getConfig } from './utils/config';
import {
  startServices,
  stopServices,
  openOrdServer,
  createWallet,
  showBalance,
  mineBlocks,
  resetWallet,
  createNamedWallet,
  switchWallet,
  inscribeCurrentFile,
  inscribeFileFromExplorer,
  downloadBinaries,
} from './commands';
import { initWalletState } from './utils/walletState';
import { ensureBinariesInstalled, getInstalledVersions, checkForUpdates } from './services/download';
import { initInscriptionHistory } from './utils/inscriptionHistory';

let updateCheckInterval: NodeJS.Timeout | null = null;
const LAST_UPDATE_CHECK_KEY = 'ord.lastUpdateCheck';

async function performAutoDownload(context: vscode.ExtensionContext): Promise<boolean> {
  const config = getConfig();

  if (!config.autoDownload) {
    log('Auto-download is disabled');
    return false;
  }

  log('Auto-downloading binaries...');

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Ordinals: Downloading binaries...',
        cancellable: false,
      },
      async (progress) => {
        const { downloadBitcoind, downloadOrd } = await import('./services/download');

        progress.report({ message: 'Downloading Bitcoin Core...' });
        const bitcoindVersion = await downloadBitcoind(context, progress);
        log(`Downloaded Bitcoin Core ${bitcoindVersion}`);

        progress.report({ message: 'Downloading ord...', increment: 0 });
        const ordVersion = await downloadOrd(context, progress);
        log(`Downloaded ord ${ordVersion}`);
      }
    );

    vscode.window.showInformationMessage('Ordinals: Bitcoin Core and ord have been downloaded.');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Auto-download failed: ${message}`);
    vscode.window.showErrorMessage(`Ordinals: Failed to download binaries: ${message}`);
    return false;
  }
}

async function performAutoUpdate(context: vscode.ExtensionContext): Promise<void> {
  const config = getConfig();

  if (!config.autoUpdate) {
    return;
  }

  // Check if enough time has passed since last check
  const lastCheck = context.globalState.get<number>(LAST_UPDATE_CHECK_KEY, 0);
  const now = Date.now();
  const hoursSinceLastCheck = (now - lastCheck) / (1000 * 60 * 60);

  if (hoursSinceLastCheck < config.updateCheckInterval) {
    log(`Skipping update check (${hoursSinceLastCheck.toFixed(1)}h since last check, interval is ${config.updateCheckInterval}h)`);
    return;
  }

  log('Checking for updates...');

  try {
    const updates = await checkForUpdates(context);
    await context.globalState.update(LAST_UPDATE_CHECK_KEY, now);

    if (!updates.bitcoind && !updates.ord) {
      log('No updates available');
      return;
    }

    const installed = getInstalledVersions(context);
    const updateMessages: string[] = [];

    if (updates.bitcoind) {
      updateMessages.push(`Bitcoin Core: ${installed.bitcoind} → ${updates.bitcoind}`);
    }
    if (updates.ord) {
      updateMessages.push(`ord: ${installed.ord} → ${updates.ord}`);
    }

    log(`Updates available: ${updateMessages.join(', ')}`);

    // Auto-install updates
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Ordinals: Installing updates...',
        cancellable: false,
      },
      async (progress) => {
        const { downloadBitcoind, downloadOrd } = await import('./services/download');

        if (updates.bitcoind) {
          progress.report({ message: `Updating Bitcoin Core to ${updates.bitcoind}...` });
          await downloadBitcoind(context, progress);
          log(`Updated Bitcoin Core to ${updates.bitcoind}`);
        }

        if (updates.ord) {
          progress.report({ message: `Updating ord to ${updates.ord}...`, increment: 0 });
          await downloadOrd(context, progress);
          log(`Updated ord to ${updates.ord}`);
        }
      }
    );

    vscode.window.showInformationMessage(
      `Ordinals: Updated ${updateMessages.join(' and ')}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Update check failed: ${message}`);
  }
}

function startPeriodicUpdateCheck(context: vscode.ExtensionContext): void {
  const config = getConfig();

  if (config.updateCheckInterval <= 0 || !config.autoUpdate) {
    log('Periodic update checking is disabled');
    return;
  }

  // Check every hour, but only perform update if interval has passed
  const checkIntervalMs = 60 * 60 * 1000; // 1 hour

  updateCheckInterval = setInterval(() => {
    performAutoUpdate(context).catch((err) => {
      log(`Periodic update check failed: ${err}`);
    });
  }, checkIntervalMs);

  log(`Periodic update checking enabled (every ${config.updateCheckInterval}h)`);
}

function stopPeriodicUpdateCheck(): void {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  log('Activating Ordinals extension...');

  // Initialize inscription history
  initInscriptionHistory(context);

  // Initialize wallet state
  initWalletState(context);

  // Create output channel
  const outputChannel = createOutputChannel();
  setBitcoindOutputChannel(outputChannel);
  setOrdOutputChannel(outputChannel);

  // Create status bar
  const statusBar = createStatusBar();
  context.subscriptions.push(statusBar);

  // Register tree views
  registerTreeViews(context);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ord.start', () => startServices(context)),
    vscode.commands.registerCommand('ord.stop', () => stopServices()),
    vscode.commands.registerCommand('ord.inscribe', () => inscribeCurrentFile(context)),
    vscode.commands.registerCommand('ord.inscribeFile', (uri: vscode.Uri) =>
      inscribeFileFromExplorer(context, uri)
    ),
    vscode.commands.registerCommand('ord.createWallet', () => createWallet(context)),
    vscode.commands.registerCommand('ord.getBalance', () => showBalance(context)),
    vscode.commands.registerCommand('ord.mineBlocks', () => mineBlocks(context)),
    vscode.commands.registerCommand('ord.openServer', () => openOrdServer()),
    vscode.commands.registerCommand('ord.downloadBinaries', () => downloadBinaries(context)),
    vscode.commands.registerCommand('ord.showOutput', () => showOutput()),
    vscode.commands.registerCommand('ord.statusBarMenu', () => showStatusBarMenu()),
    vscode.commands.registerCommand('ord.openInscription', (inscriptionId: string) => {
      const config = getConfig();
      const url = `http://127.0.0.1:${config.ordServerPort}/inscription/${inscriptionId}`;
      vscode.env.openExternal(vscode.Uri.parse(url));
    }),
    vscode.commands.registerCommand('ord.resetWallet', () => resetWallet(context)),
    vscode.commands.registerCommand('ord.createNamedWallet', () => createNamedWallet(context)),
    vscode.commands.registerCommand('ord.switchWallet', () => switchWallet())
  );

  // Check if binaries are installed
  let binariesInstalled = await ensureBinariesInstalled(context);

  if (!binariesInstalled) {
    const config = getConfig();

    if (config.autoDownload) {
      // Auto-download binaries
      binariesInstalled = await performAutoDownload(context);
    } else {
      // Prompt user to download
      const result = await vscode.window.showInformationMessage(
        'Ordinals: Bitcoin Core and ord binaries are not installed. Download them now?',
        'Download',
        'Later'
      );

      if (result === 'Download') {
        await downloadBinaries(context);
        binariesInstalled = await ensureBinariesInstalled(context);
      }
    }
  }

  if (binariesInstalled) {
    const config = getConfig();

    // Perform initial update check
    performAutoUpdate(context).catch((err) => {
      log(`Initial update check failed: ${err}`);
    });

    // Start periodic update checking
    startPeriodicUpdateCheck(context);

    // Auto-start services if enabled
    if (config.autoStart) {
      startServices(context).catch((err) => {
        log(`Auto-start failed: ${err}`);
      });
    }
  }

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('ord.autoUpdate') || e.affectsConfiguration('ord.updateCheckInterval')) {
        stopPeriodicUpdateCheck();
        startPeriodicUpdateCheck(context);
      }
    })
  );

  log('Ordinals extension activated!');
}

export async function deactivate(): Promise<void> {
  log('Deactivating Ordinals extension...');

  // Stop periodic update checking
  stopPeriodicUpdateCheck();

  // Stop all services
  try {
    await stopOrdServer();
  } catch {
    // Ignore errors during shutdown
  }

  try {
    await stopBitcoind();
  } catch {
    // Ignore errors during shutdown
  }

  disposeStatusBar();
  disposeOutputChannel();
}
