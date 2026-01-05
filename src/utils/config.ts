import * as vscode from 'vscode';

export type Network = 'regtest' | 'testnet' | 'signet' | 'mainnet';

export interface OrdConfig {
  network: Network;
  dataDirectory: string;
  autoStart: boolean;
  autoDownload: boolean;
  autoUpdate: boolean;
  updateCheckInterval: number;
  bitcoindRpcPort: number;
  ordServerPort: number;
}

export function getConfig(): OrdConfig {
  const config = vscode.workspace.getConfiguration('ord');

  return {
    network: config.get<Network>('network', 'regtest'),
    dataDirectory: config.get<string>('dataDirectory', ''),
    autoStart: config.get<boolean>('autoStart', false),
    autoDownload: config.get<boolean>('autoDownload', true),
    autoUpdate: config.get<boolean>('autoUpdate', true),
    updateCheckInterval: config.get<number>('updateCheckInterval', 24),
    bitcoindRpcPort: config.get<number>('bitcoindRpcPort', 18443),
    ordServerPort: config.get<number>('ordServerPort', 9001),
  };
}

export function getNetworkFlag(network: Network): string {
  switch (network) {
    case 'mainnet':
      return '';
    case 'testnet':
      return '-testnet';
    case 'signet':
      return '-signet';
    case 'regtest':
      return '-regtest';
  }
}

export function getOrdNetworkFlag(network: Network): string {
  switch (network) {
    case 'mainnet':
      return '';
    case 'testnet':
      return '--testnet';
    case 'signet':
      return '--signet';
    case 'regtest':
      return '--regtest';
  }
}

export function getRpcPort(network: Network): number {
  const config = getConfig();
  if (config.bitcoindRpcPort !== 18443) {
    return config.bitcoindRpcPort;
  }

  switch (network) {
    case 'mainnet':
      return 8332;
    case 'testnet':
      return 18332;
    case 'signet':
      return 38332;
    case 'regtest':
      return 18443;
  }
}
