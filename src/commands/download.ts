import * as vscode from 'vscode';
import {
  downloadBitcoind,
  downloadOrd,
  getInstalledVersions,
  checkForUpdates,
} from '../services/download';
import { log } from '../ui/outputChannel';

export async function downloadBinaries(context: vscode.ExtensionContext): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Downloading binaries...',
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ message: 'Downloading Bitcoin Core...' });
        const bitcoindVersion = await downloadBitcoind(context, progress);
        log(`Downloaded Bitcoin Core ${bitcoindVersion}`);

        progress.report({ message: 'Downloading ord...', increment: 0 });
        const ordVersion = await downloadOrd(context, progress);
        log(`Downloaded ord ${ordVersion}`);

        vscode.window.showInformationMessage(
          `Downloaded Bitcoin Core ${bitcoindVersion} and ord ${ordVersion}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Download failed: ${message}`);
        log(`Download error: ${message}`);
      }
    }
  );
}

export async function checkAndPromptUpdates(context: vscode.ExtensionContext): Promise<void> {
  try {
    const updates = await checkForUpdates(context);
    const installed = getInstalledVersions(context);

    const updateMessages: string[] = [];

    if (updates.bitcoind) {
      updateMessages.push(`Bitcoin Core: ${installed.bitcoind} -> ${updates.bitcoind}`);
    }

    if (updates.ord) {
      updateMessages.push(`ord: ${installed.ord} -> ${updates.ord}`);
    }

    if (updateMessages.length > 0) {
      const result = await vscode.window.showInformationMessage(
        `Updates available:\n${updateMessages.join('\n')}`,
        'Update Now',
        'Later'
      );

      if (result === 'Update Now') {
        await downloadBinaries(context);
      }
    }
  } catch (error) {
    // Silently fail update checks
    log(`Update check failed: ${error}`);
  }
}
