import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig, getRpcPort, Network } from './config';
import { getDefaultDataDirectory } from './platform';

interface RpcResponse<T = unknown> {
  result: T;
  error: { code: number; message: string } | null;
  id: string;
}

let requestId = 0;

function getCookieFilePath(network: Network): string {
  const config = getConfig();
  const bitcoinDataDir = config.dataDirectory || getDefaultDataDirectory();

  switch (network) {
    case 'regtest':
      return path.join(bitcoinDataDir, 'regtest', '.cookie');
    case 'testnet':
      return path.join(bitcoinDataDir, 'testnet3', '.cookie');
    case 'signet':
      return path.join(bitcoinDataDir, 'signet', '.cookie');
    default:
      return path.join(bitcoinDataDir, '.cookie');
  }
}

function getCookieAuth(network: Network): string {
  const cookiePath = getCookieFilePath(network);
  if (!fs.existsSync(cookiePath)) {
    throw new Error(`Bitcoin cookie file not found at ${cookiePath}. Is bitcoind running?`);
  }
  const cookie = fs.readFileSync(cookiePath, 'utf-8').trim();
  return Buffer.from(cookie).toString('base64');
}

export async function rpcCall<T = unknown>(
  method: string,
  params: unknown[] = [],
  wallet?: string
): Promise<T> {
  const config = getConfig();
  const port = getRpcPort(config.network);

  const rpcPath = wallet ? `/wallet/${wallet}` : '/';

  const body = JSON.stringify({
    jsonrpc: '1.0',
    id: `req-${++requestId}`,
    method,
    params,
  });

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: rpcPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: 'Basic ' + getCookieAuth(config.network),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const response: RpcResponse<T> = JSON.parse(data);
            if (response.error) {
              reject(new Error(`RPC Error: ${response.error.message} (${response.error.code})`));
            } else {
              resolve(response.result);
            }
          } catch (e) {
            reject(new Error(`Failed to parse RPC response: ${data}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function getBlockchainInfo(): Promise<{
  chain: string;
  blocks: number;
  headers: number;
  bestblockhash: string;
}> {
  return rpcCall('getblockchaininfo');
}

export async function getWalletInfo(wallet: string): Promise<{
  walletname: string;
  balance: number;
  txcount: number;
}> {
  return rpcCall('getwalletinfo', [], wallet);
}

export async function createWallet(name: string): Promise<{ name: string }> {
  return rpcCall('createwallet', [name, false, false, '', false, true]);
}

export async function loadWallet(name: string): Promise<{ name: string }> {
  return rpcCall('loadwallet', [name]);
}

export async function unloadWallet(name: string): Promise<void> {
  return rpcCall('unloadwallet', [name]);
}

export async function listWallets(): Promise<string[]> {
  return rpcCall('listwallets');
}

export async function getNewAddress(wallet: string): Promise<string> {
  return rpcCall('getnewaddress', [], wallet);
}

export async function generateToAddress(
  numBlocks: number,
  address: string
): Promise<string[]> {
  return rpcCall('generatetoaddress', [numBlocks, address]);
}

export async function getBalance(wallet: string): Promise<number> {
  return rpcCall('getbalance', [], wallet);
}

export async function isBitcoindReady(): Promise<boolean> {
  try {
    await getBlockchainInfo();
    return true;
  } catch {
    return false;
  }
}
