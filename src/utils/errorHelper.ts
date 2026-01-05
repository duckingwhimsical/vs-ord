import * as vscode from 'vscode';
import { log, showOutput } from '../ui/outputChannel';

interface ErrorSuggestion {
  pattern: RegExp;
  message: string;
  suggestion: string;
  actions?: { label: string; command: string }[];
}

const ERROR_PATTERNS: ErrorSuggestion[] = [
  {
    pattern: /cookie file.*not found|No .cookie file/i,
    message: 'Bitcoin Core authentication failed',
    suggestion: 'The cookie file is missing. Services may not be running or data directory is incorrect.',
    actions: [
      { label: 'Start Services', command: 'ord.start' },
      { label: 'Check Settings', command: 'workbench.action.openSettings' },
    ],
  },
  {
    pattern: /output in wallet but not in ord server/i,
    message: 'Wallet sync issue detected',
    suggestion: 'The ord index is out of sync with the wallet. A full reset will fix this.',
    actions: [
      { label: 'Reset Wallet', command: 'ord.resetWallet' },
      { label: 'View Logs', command: 'ord.showOutput' },
    ],
  },
  {
    pattern: /address.*already in use|EADDRINUSE/i,
    message: 'Port is already in use',
    suggestion: 'Another instance may be running, or another application is using the port. Try stopping services or change the port in settings.',
    actions: [
      { label: 'Stop Services', command: 'ord.stop' },
      { label: 'Change Settings', command: 'workbench.action.openSettings' },
    ],
  },
  {
    pattern: /wallet.*not.*found|no wallet|wallet does not exist/i,
    message: 'No wallet found',
    suggestion: 'A wallet needs to be created before this operation.',
    actions: [
      { label: 'Create Wallet', command: 'ord.createWallet' },
    ],
  },
  {
    pattern: /insufficient funds|not enough funds|balance.*insufficient/i,
    message: 'Insufficient funds',
    suggestion: 'The wallet needs more Bitcoin. In regtest mode, mine some blocks to fund it.',
    actions: [
      { label: 'Mine Blocks', command: 'ord.mineBlocks' },
      { label: 'Check Balance', command: 'ord.getBalance' },
    ],
  },
  {
    pattern: /bitcoind.*not running|bitcoin core.*not running/i,
    message: 'Bitcoin Core is not running',
    suggestion: 'Start the services to use this feature.',
    actions: [
      { label: 'Start Services', command: 'ord.start' },
    ],
  },
  {
    pattern: /ord.*not running|ord server.*not running/i,
    message: 'Ord server is not running',
    suggestion: 'Start the services to use this feature.',
    actions: [
      { label: 'Start Services', command: 'ord.start' },
    ],
  },
  {
    pattern: /connection refused|ECONNREFUSED/i,
    message: 'Connection refused',
    suggestion: 'The service is not responding. It may have crashed or failed to start.',
    actions: [
      { label: 'Restart Services', command: 'ord.start' },
      { label: 'View Logs', command: 'ord.showOutput' },
    ],
  },
  {
    pattern: /timeout|timed out/i,
    message: 'Operation timed out',
    suggestion: 'The operation took too long. Check the logs for more details.',
    actions: [
      { label: 'View Logs', command: 'ord.showOutput' },
    ],
  },
  {
    pattern: /failed to download|download.*failed/i,
    message: 'Download failed',
    suggestion: 'Check your internet connection and firewall settings. Binaries are downloaded from bitcoincore.org and GitHub.',
    actions: [
      { label: 'Retry Download', command: 'ord.downloadBinaries' },
    ],
  },
];

function findSuggestion(errorMessage: string): ErrorSuggestion | null {
  for (const suggestion of ERROR_PATTERNS) {
    if (suggestion.pattern.test(errorMessage)) {
      return suggestion;
    }
  }
  return null;
}

export async function showErrorWithSuggestion(
  context: string,
  error: Error | string
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : error;
  const suggestion = findSuggestion(errorMessage);

  log(`Error in ${context}: ${errorMessage}`);

  if (suggestion) {
    const actions = suggestion.actions?.map((a) => a.label) || [];
    actions.push('View Logs');

    const result = await vscode.window.showErrorMessage(
      `${suggestion.message}: ${suggestion.suggestion}`,
      ...actions
    );

    if (result === 'View Logs') {
      showOutput();
    } else if (result) {
      const action = suggestion.actions?.find((a) => a.label === result);
      if (action) {
        vscode.commands.executeCommand(action.command);
      }
    }
  } else {
    // Generic error with option to view logs
    const result = await vscode.window.showErrorMessage(
      `${context}: ${errorMessage}`,
      'View Logs'
    );

    if (result === 'View Logs') {
      showOutput();
    }
  }
}

export async function showWarningWithAction(
  message: string,
  actionLabel: string,
  command: string
): Promise<void> {
  const result = await vscode.window.showWarningMessage(message, actionLabel, 'Dismiss');

  if (result === actionLabel) {
    vscode.commands.executeCommand(command);
  }
}
