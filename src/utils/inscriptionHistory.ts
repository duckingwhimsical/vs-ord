import * as vscode from 'vscode';

export interface InscriptionRecord {
  id: string;
  fileName: string;
  timestamp: number;
}

const HISTORY_KEY = 'ord.inscriptionHistory';
const MAX_HISTORY = 5;

let extensionContext: vscode.ExtensionContext | null = null;

export function initInscriptionHistory(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

export function addInscription(id: string, fileName: string): void {
  if (!extensionContext) return;

  const history = getInscriptionHistory();

  // Add new inscription at the beginning
  history.unshift({
    id,
    fileName,
    timestamp: Date.now(),
  });

  // Keep only the last MAX_HISTORY inscriptions
  const trimmed = history.slice(0, MAX_HISTORY);

  extensionContext.globalState.update(HISTORY_KEY, trimmed);
}

export function getInscriptionHistory(): InscriptionRecord[] {
  if (!extensionContext) return [];

  return extensionContext.globalState.get<InscriptionRecord[]>(HISTORY_KEY, []);
}

export function clearInscriptionHistory(): void {
  if (!extensionContext) return;

  extensionContext.globalState.update(HISTORY_KEY, []);
}
