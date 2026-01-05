import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getBinariesDirectory,
  getBitcoindAssetName,
  getOrdAssetName,
  getPlatform,
} from '../utils/platform';

interface GitHubRelease {
  tag_name: string;
  assets: {
    name: string;
    browser_download_url: string;
  }[];
}

interface VersionInfo {
  bitcoind: string;
  ord: string;
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const makeRequest = (url: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      https
        .get(
          url,
          {
            headers: {
              'User-Agent': 'vs-ord-extension',
            },
          },
          (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
              const location = res.headers.location;
              if (location) {
                makeRequest(location, redirectCount + 1);
                return;
              }
            }

            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve(data));
          }
        )
        .on('error', reject);
    };
    makeRequest(url);
  });
}

function downloadFile(
  url: string,
  dest: string,
  progress?: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    const makeRequest = (url: string, redirectCount = 0) => {
      if (redirectCount > 10) {
        reject(new Error('Too many redirects'));
        return;
      }

      https
        .get(
          url,
          {
            headers: {
              'User-Agent': 'vs-ord-extension',
            },
          },
          (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
              const location = res.headers.location;
              if (location) {
                makeRequest(location, redirectCount + 1);
                return;
              }
            }

            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}: Failed to download from ${url}`));
              return;
            }

            const totalSize = parseInt(res.headers['content-length'] || '0', 10);
            let downloadedSize = 0;
            let lastPercent = 0;

            res.on('data', (chunk: Buffer) => {
              downloadedSize += chunk.length;
              if (totalSize > 0 && progress) {
                const percent = Math.floor((downloadedSize / totalSize) * 100);
                if (percent > lastPercent) {
                  progress.report({
                    message: `${percent}%`,
                    increment: percent - lastPercent,
                  });
                  lastPercent = percent;
                }
              }
            });

            res.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve();
            });
          }
        )
        .on('error', (err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
    };

    makeRequest(url);
  });
}

async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  const isZip = archivePath.endsWith('.zip');

  if (isZip) {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(destDir, true);
  } else {
    const tar = require('tar');
    await tar.x({
      file: archivePath,
      cwd: destDir,
    });
  }
}

export async function getLatestBitcoindRelease(): Promise<GitHubRelease> {
  const response = await httpsGet(
    'https://api.github.com/repos/bitcoin/bitcoin/releases/latest'
  );
  return JSON.parse(response);
}

export async function getLatestOrdRelease(): Promise<GitHubRelease> {
  const response = await httpsGet(
    'https://api.github.com/repos/ordinals/ord/releases/latest'
  );
  return JSON.parse(response);
}

export function getInstalledVersions(context: vscode.ExtensionContext): VersionInfo {
  const versionFile = path.join(getBinariesDirectory(context), 'versions.json');
  if (fs.existsSync(versionFile)) {
    try {
      return JSON.parse(fs.readFileSync(versionFile, 'utf-8'));
    } catch {
      return { bitcoind: '', ord: '' };
    }
  }
  return { bitcoind: '', ord: '' };
}

function saveInstalledVersions(context: vscode.ExtensionContext, versions: VersionInfo): void {
  const binDir = getBinariesDirectory(context);
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'versions.json'), JSON.stringify(versions, null, 2));
}

/**
 * Get Bitcoin Core download URL from bitcoincore.org
 * GitHub releases don't include binaries - they're hosted on bitcoincore.org
 */
function getBitcoinCoreDownloadUrl(version: string, assetName: string): string {
  // Version from GitHub is like "v30.1", we need "30.1" for the URL
  const cleanVersion = version.replace(/^v/, '');
  return `https://bitcoincore.org/bin/bitcoin-core-${cleanVersion}/${assetName}`;
}

export async function downloadBitcoind(
  context: vscode.ExtensionContext,
  progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<string> {
  progress.report({ message: 'Fetching latest Bitcoin Core release...' });
  const release = await getLatestBitcoindRelease();
  const version = release.tag_name;
  const assetName = getBitcoindAssetName(version);

  // Bitcoin Core binaries are hosted on bitcoincore.org, not GitHub
  const downloadUrl = getBitcoinCoreDownloadUrl(version, assetName);

  const binDir = getBinariesDirectory(context);
  fs.mkdirSync(binDir, { recursive: true });

  const tmpDir = os.tmpdir();
  const archivePath = path.join(tmpDir, assetName);

  progress.report({ message: `Downloading Bitcoin Core ${version}...` });
  await downloadFile(downloadUrl, archivePath, progress);

  progress.report({ message: 'Extracting Bitcoin Core...' });
  const extractDir = path.join(binDir, 'bitcoin-extract');
  fs.mkdirSync(extractDir, { recursive: true });
  await extractArchive(archivePath, extractDir);

  // Find the extracted directory and move contents to final location
  const extracted = fs.readdirSync(extractDir);
  const bitcoinDir = extracted.find((d) => d.startsWith('bitcoin-'));
  if (!bitcoinDir) {
    throw new Error('Could not find extracted Bitcoin Core directory');
  }

  const finalDir = path.join(binDir, 'bitcoin');
  if (fs.existsSync(finalDir)) {
    fs.rmSync(finalDir, { recursive: true });
  }
  fs.renameSync(path.join(extractDir, bitcoinDir), finalDir);
  fs.rmSync(extractDir, { recursive: true });
  fs.unlinkSync(archivePath);

  // Make binaries executable on Unix
  if (getPlatform() !== 'windows') {
    const binPath = path.join(finalDir, 'bin');
    for (const file of fs.readdirSync(binPath)) {
      fs.chmodSync(path.join(binPath, file), 0o755);
    }
  }

  const versions = getInstalledVersions(context);
  versions.bitcoind = version;
  saveInstalledVersions(context, versions);

  return version;
}

export async function downloadOrd(
  context: vscode.ExtensionContext,
  progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<string> {
  progress.report({ message: 'Fetching latest ord release...' });
  const release = await getLatestOrdRelease();
  const version = release.tag_name;
  const assetName = getOrdAssetName(version);

  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) {
    throw new Error(`Could not find ord binary for your platform: ${assetName}`);
  }

  const binDir = getBinariesDirectory(context);
  fs.mkdirSync(binDir, { recursive: true });

  const tmpDir = os.tmpdir();
  const archivePath = path.join(tmpDir, assetName);

  progress.report({ message: `Downloading ord ${version}...` });
  await downloadFile(asset.browser_download_url, archivePath, progress);

  progress.report({ message: 'Extracting ord...' });
  const extractDir = path.join(binDir, 'ord-extract');
  fs.mkdirSync(extractDir, { recursive: true });
  await extractArchive(archivePath, extractDir);

  // Move ord binary to final location
  const finalDir = path.join(binDir, 'ord');
  if (fs.existsSync(finalDir)) {
    fs.rmSync(finalDir, { recursive: true });
  }
  fs.mkdirSync(finalDir, { recursive: true });

  const ordExe = getPlatform() === 'windows' ? 'ord.exe' : 'ord';
  const extractedOrd = path.join(extractDir, ordExe);
  const finalOrd = path.join(finalDir, ordExe);

  if (fs.existsSync(extractedOrd)) {
    fs.renameSync(extractedOrd, finalOrd);
  } else {
    // Sometimes it's in a subdirectory
    const files = fs.readdirSync(extractDir);
    let found = false;
    for (const file of files) {
      const filePath = path.join(extractDir, file);
      if (fs.statSync(filePath).isDirectory()) {
        const subOrd = path.join(filePath, ordExe);
        if (fs.existsSync(subOrd)) {
          fs.renameSync(subOrd, finalOrd);
          found = true;
          break;
        }
      } else if (file === ordExe) {
        fs.renameSync(filePath, finalOrd);
        found = true;
        break;
      }
    }
    if (!found) {
      throw new Error(`Could not find ord executable in extracted archive`);
    }
  }

  fs.rmSync(extractDir, { recursive: true });
  fs.unlinkSync(archivePath);

  // Make binary executable on Unix
  if (getPlatform() !== 'windows') {
    fs.chmodSync(finalOrd, 0o755);
  }

  const versions = getInstalledVersions(context);
  versions.ord = version;
  saveInstalledVersions(context, versions);

  return version;
}

export async function ensureBinariesInstalled(
  context: vscode.ExtensionContext
): Promise<boolean> {
  const versions = getInstalledVersions(context);
  return versions.bitcoind !== '' && versions.ord !== '';
}

export async function checkForUpdates(
  context: vscode.ExtensionContext
): Promise<{ bitcoind: string | null; ord: string | null }> {
  const installed = getInstalledVersions(context);
  const updates: { bitcoind: string | null; ord: string | null } = {
    bitcoind: null,
    ord: null,
  };

  try {
    const bitcoindRelease = await getLatestBitcoindRelease();
    if (bitcoindRelease.tag_name !== installed.bitcoind) {
      updates.bitcoind = bitcoindRelease.tag_name;
    }
  } catch {
    // Ignore errors checking for updates
  }

  try {
    const ordRelease = await getLatestOrdRelease();
    if (ordRelease.tag_name !== installed.ord) {
      updates.ord = ordRelease.tag_name;
    }
  } catch {
    // Ignore errors checking for updates
  }

  return updates;
}
