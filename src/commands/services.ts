import * as vscode from 'vscode';
import { startBitcoind, stopBitcoind } from '../services/bitcoind';
import { startOrdServer, stopOrdServer, isOrdRunning, verifyOrdBitcoindConnection } from '../services/ord';
import { ensureBinariesInstalled } from '../services/download';
import { updateStatusBar } from '../ui/statusBar';
import { log } from '../ui/outputChannel';
import { getConfig } from '../utils/config';
import { showErrorWithSuggestion, showWarningWithAction } from '../utils/errorHelper';
import { refreshWalletTree } from '../ui/treeView';

export async function startServices(context: vscode.ExtensionContext): Promise<void> {
  // Check if binaries are installed
  if (!(await ensureBinariesInstalled(context))) {
    const result = await vscode.window.showWarningMessage(
      'Bitcoin Core and ord binaries are not installed. Download them now?',
      'Download',
      'Cancel'
    );

    if (result === 'Download') {
      await vscode.commands.executeCommand('ord.downloadBinaries');
    } else {
      return;
    }
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Starting Ordinals services...',
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ message: 'Starting bitcoind...' });
        await startBitcoind(context);
        updateStatusBar();

        progress.report({ message: 'Starting ord server...' });
        await startOrdServer(context);
        updateStatusBar();

        // Verify ord can communicate with bitcoind
        progress.report({ message: 'Verifying connection...' });
        const config = getConfig();
        const health = await verifyOrdBitcoindConnection(config.ordServerPort);

        if (!health.healthy) {
          log(`Ord health check failed: ${health.error}`);
          log('Restarting ord server with fresh credentials...');

          progress.report({ message: 'Restarting ord (stale credentials)...' });
          await stopOrdServer();
          await startOrdServer(context);

          // Verify again
          const retryHealth = await verifyOrdBitcoindConnection(config.ordServerPort);
          if (!retryHealth.healthy) {
            throw new Error(`Ord server cannot connect to bitcoind: ${retryHealth.error}`);
          }
          log(`Ord health check passed after restart (blockcount: ${retryHealth.blockcount})`);
        } else {
          log(`Ord health check passed (blockcount: ${health.blockcount})`);
        }

        vscode.window.showInformationMessage('Ordinals services started successfully!');
        log('All services started');

        // Refresh tree views to show updated status
        refreshWalletTree();
      } catch (error) {
        await showErrorWithSuggestion('Failed to start services', error instanceof Error ? error : String(error));
        throw error;
      }
    }
  );
}

export async function stopServices(): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Stopping Ordinals services...',
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ message: 'Stopping ord server...' });
        await stopOrdServer();
        updateStatusBar();

        progress.report({ message: 'Stopping bitcoind...' });
        await stopBitcoind();
        updateStatusBar();

        vscode.window.showInformationMessage('Ordinals services stopped.');
        log('All services stopped');

        // Refresh tree views to show updated status
        refreshWalletTree();
      } catch (error) {
        await showErrorWithSuggestion('Failed to stop services', error instanceof Error ? error : String(error));
      }
    }
  );
}

export async function openOrdServer(): Promise<void> {
  const config = vscode.workspace.getConfiguration('ord');
  const port = config.get<number>('ordServerPort', 8080);
  const url = `http://127.0.0.1:${port}`;

  if (!isOrdRunning()) {
    await showWarningWithAction('Ord server is not running.', 'Start Services', 'ord.start');
    return;
  }

  vscode.env.openExternal(vscode.Uri.parse(url));
}
