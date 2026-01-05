import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | null = null;

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export function createOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Ordinals');
  }
  return outputChannel;
}

export function getOutputChannel(): vscode.OutputChannel | null {
  return outputChannel;
}

function formatTimestamp(): string {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour12: false });
}

export function log(message: string, level: LogLevel = 'INFO'): void {
  const timestamp = formatTimestamp();
  const prefix = level === 'INFO' ? '' : `[${level}] `;
  outputChannel?.appendLine(`[${timestamp}] ${prefix}${message}`);
}

export function logWarn(message: string): void {
  log(message, 'WARN');
}

export function logError(message: string): void {
  log(message, 'ERROR');
}

export function logDebug(message: string): void {
  log(message, 'DEBUG');
}

export function logSection(title: string): void {
  outputChannel?.appendLine('');
  outputChannel?.appendLine(`═══ ${title} ${'═'.repeat(Math.max(0, 50 - title.length))}`);
}

export function logProcessOutput(process: string, data: string): void {
  const lines = data.toString().trim().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      outputChannel?.appendLine(`  [${process}] ${line}`);
    }
  }
}

export function showOutput(): void {
  outputChannel?.show();
}

export function disposeOutputChannel(): void {
  outputChannel?.dispose();
  outputChannel = null;
}
