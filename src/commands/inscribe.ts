import * as vscode from 'vscode';
import * as path from 'path';
import { inscribeFile, isOrdRunning, waitForOrdSync } from '../services/ord';
import { isBitcoindRunning, startBitcoind } from '../services/bitcoind';
import { startOrdServer } from '../services/ord';
import { ensureWalletFunded } from './wallet';
import { ensureBinariesInstalled } from '../services/download';
import { generateToAddress, rpcCall } from '../utils/rpc';
import { getOrdReceiveAddress } from '../services/ord';
import { getConfig } from '../utils/config';
import { updateStatusBar } from '../ui/statusBar';
import { log } from '../ui/outputChannel';
import { addInscription } from '../utils/inscriptionHistory';
import { showErrorWithSuggestion } from '../utils/errorHelper';
import { refreshInscriptionsTree, refreshWalletTree } from '../ui/treeView';

async function ensureServicesRunning(context: vscode.ExtensionContext): Promise<boolean> {
  // Check binaries
  if (!(await ensureBinariesInstalled(context))) {
    const result = await vscode.window.showWarningMessage(
      'Bitcoin Core and ord binaries are not installed.',
      'Download',
      'Cancel'
    );
    if (result === 'Download') {
      await vscode.commands.executeCommand('ord.downloadBinaries');
      return ensureServicesRunning(context);
    }
    return false;
  }

  // Start bitcoind if needed
  if (!isBitcoindRunning()) {
    log('Starting bitcoind for inscription...');
    await startBitcoind(context);
    updateStatusBar();
  }

  // Start ord if needed
  if (!isOrdRunning()) {
    log('Starting ord server for inscription...');
    await startOrdServer(context);
    updateStatusBar();
  }

  return true;
}

export async function inscribeCurrentFile(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No file is currently open.');
    return;
  }

  // Save the file first
  await editor.document.save();

  await doInscribe(context, editor.document.uri.fsPath);
}

export async function inscribeFileFromExplorer(
  context: vscode.ExtensionContext,
  uri: vscode.Uri
): Promise<void> {
  if (!uri) {
    vscode.window.showErrorMessage('No file selected.');
    return;
  }

  await doInscribe(context, uri.fsPath);
}

interface InscribeResult {
  inscriptionId: string;
  localUrl: string;
  error?: Error | string;
}

async function doInscribe(context: vscode.ExtensionContext, filePath: string): Promise<void> {
  const config = getConfig();
  const fileName = path.basename(filePath);

  // Warn on mainnet
  if (config.network === 'mainnet') {
    const result = await vscode.window.showWarningMessage(
      'You are about to inscribe on MAINNET. This will cost real Bitcoin!',
      'Continue',
      'Cancel'
    );
    if (result !== 'Continue') {
      return;
    }
  }

  // Run inscription with progress, return result for post-progress handling
  const inscribeResult = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Inscribing ${fileName}...`,
      cancellable: false,
    },
    async (progress): Promise<InscribeResult | null> => {
      try {
        // Ensure services are running
        progress.report({ message: 'Starting services...' });
        if (!(await ensureServicesRunning(context))) {
          return null;
        }

        // Ensure wallet is funded (regtest only auto-funds)
        progress.report({ message: 'Checking wallet (may mine blocks if empty)...' });
        const funded = await ensureWalletFunded(context);
        if (!funded && config.network !== 'regtest') {
          vscode.window.showErrorMessage(
            'Wallet does not have enough funds. Please fund your wallet first.'
          );
          return null;
        }

        // Wait for ord to sync with bitcoind (funding may have mined blocks)
        progress.report({ message: 'Syncing ord index...' });
        const bitcoindBlocks = await rpcCall<number>('getblockcount');
        const synced = await waitForOrdSync(config.ordServerPort, bitcoindBlocks);
        if (!synced) {
          throw new Error('Ord server failed to sync with bitcoind');
        }

        // Inscribe the file
        progress.report({ message: 'Creating inscription...' });
        const result = await inscribeFile(context, filePath, 1);
        log(`Inscription created: ${result.inscriptionId}`);

        // Save to inscription history
        addInscription(result.inscriptionId, fileName);

        // Mine a block to confirm (regtest only)
        if (config.network === 'regtest') {
          progress.report({ message: 'Mining confirmation block...' });
          try {
            const address = await getOrdReceiveAddress(context);
            await generateToAddress(1, address);
            log('Mined confirmation block');
          } catch (e) {
            log(`Warning: Could not mine confirmation block: ${e}`);
          }
        }

        const ordPort = config.ordServerPort;
        return {
          inscriptionId: result.inscriptionId,
          localUrl: `http://127.0.0.1:${ordPort}/inscription/${result.inscriptionId}`,
        };
      } catch (error) {
        // Return error to show after progress dismisses
        return { inscriptionId: '', localUrl: '', error: error instanceof Error ? error : String(error) };
      }
    }
  );

  // Handle error AFTER progress dismisses
  if (inscribeResult?.error) {
    await showErrorWithSuggestion('Inscription failed', inscribeResult.error);
    return;
  }

  // Show success message AFTER progress dismisses
  if (inscribeResult?.inscriptionId) {
    // Refresh tree views to show new inscription and updated balance
    refreshInscriptionsTree();
    refreshWalletTree();

    const action = await vscode.window.showInformationMessage(
      `Inscription created!\n${inscribeResult.inscriptionId}`,
      'Open in Browser',
      'Copy ID'
    );

    if (action === 'Open in Browser') {
      vscode.env.openExternal(vscode.Uri.parse(inscribeResult.localUrl));
    } else if (action === 'Copy ID') {
      await vscode.env.clipboard.writeText(inscribeResult.inscriptionId);
      vscode.window.showInformationMessage('Inscription ID copied to clipboard!');
    }
  }
}
