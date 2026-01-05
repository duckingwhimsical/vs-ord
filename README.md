# Ordinals Development for VS Code

Develop and test Bitcoin Ordinals inscriptions locally without needing to set up bitcoind and ord manually.

## Features

- **Auto-Download Binaries**: Automatically downloads Bitcoin Core and ord binaries for your platform
- **One-Click Services**: Start/stop bitcoind and ord server with a single click
- **Local Regtest**: Test inscriptions on a local regtest network with free test bitcoin
- **Inscribe Files**: Right-click any file to inscribe it as an ordinal
- **Wallet Management**: Create wallets, check balance, mine blocks
- **Recent Inscriptions**: Quick access to your last 5 inscriptions from the status bar

## Quick Start

1. **Install the extension**
2. **Click the Ord status bar item** (bottom left) and select "Start Services"
3. **Wait for binaries to download** (first time only, ~100MB)
4. **Open a file** you want to inscribe
5. **Press `Ctrl+Shift+I`** (or right-click and select "Inscribe Current File")
6. **View your inscription** in the browser when prompted

## Status Bar

The extension adds a status bar item showing the current state:

| Status | Meaning |
|--------|---------|
| `Ord [regtest]` | Both services running |
| `Ord [bitcoind only]` | Only bitcoind is running |
| `Ord [stopped]` | Services stopped |

Click the status bar for a menu of available commands.

## Commands

Access via Command Palette (`Ctrl+Shift+P`) or status bar menu:

| Command | Description |
|---------|-------------|
| `Ord: Start Services` | Start bitcoind and ord server |
| `Ord: Stop Services` | Stop all services |
| `Ord: Inscribe Current File` | Inscribe the active file (`Ctrl+Shift+I`) |
| `Ord: Create Wallet` | Create a new ord wallet |
| `Ord: Show Balance` | Display wallet balance |
| `Ord: Mine Blocks` | Mine blocks (regtest only) |
| `Ord: Open in Browser` | Open ord server in browser |
| `Ord: Reset Wallet` | Delete wallet and index, start fresh |
| `Ord: Download/Update Binaries` | Download or update bitcoind/ord |

## Context Menu

Right-click options available:

- **In Editor**: "Inscribe Current File"
- **In Explorer**: "Inscribe File" (on any file)

## Keyboard Shortcuts

| Shortcut | Command |
|----------|---------|
| `Ctrl+Shift+I` | Inscribe current file |
| `Ctrl+Shift+O` | Open ord in browser |

## Settings

Configure via `File > Preferences > Settings` and search for "ord":

| Setting | Default | Description |
|---------|---------|-------------|
| `ord.network` | `regtest` | Bitcoin network (regtest, testnet, signet, mainnet) |
| `ord.autoStart` | `false` | Auto-start services when VS Code opens |
| `ord.autoDownload` | `true` | Auto-download binaries if missing |
| `ord.autoUpdate` | `true` | Check for binary updates periodically |
| `ord.updateCheckInterval` | `24` | Hours between update checks (0 to disable) |
| `ord.dataDirectory` | (default) | Custom Bitcoin data directory |
| `ord.bitcoindRpcPort` | `18443` | Bitcoind RPC port |
| `ord.ordServerPort` | `9001` | Ord HTTP server port |

## Networks

| Network | Use Case |
|---------|----------|
| `regtest` | Local testing, instant blocks, free coins (recommended) |
| `testnet` | Public test network, test coins from faucets |
| `signet` | More stable test network |
| `mainnet` | Real Bitcoin - costs real money! |

> **Warning**: Mainnet inscriptions cost real Bitcoin. The extension will warn you before inscribing on mainnet.

## How It Works

1. **Bitcoin Core** runs a local regtest node
2. **Ord** indexes the blockchain and serves an explorer
3. Wallet is automatically funded by mining blocks (regtest only)
4. Files are inscribed as ordinals on the local chain
5. View inscriptions at `http://localhost:9001`

## Data Locations

| Data | Windows | macOS | Linux |
|------|---------|-------|-------|
| Bitcoin | `%APPDATA%\Bitcoin` | `~/Library/Application Support/Bitcoin` | `~/.bitcoin` |
| Ord | `%APPDATA%\ord` | `~/Library/Application Support/ord` | `~/.ord` |
| Binaries | VS Code globalStorage | VS Code globalStorage | VS Code globalStorage |

## Troubleshooting

### "Cookie file not found"
Services may not be running. Click the status bar and select "Start Services".

### "Output in wallet but not in ord server"
The ord index is out of sync. Use "Reset Wallet" from the status bar menu to do a full reset.

### "Port already in use"
Another instance of bitcoind or ord may be running. Stop it or change the port in settings.

### Inscription fails silently
Check the output panel: `View > Output` and select "Ordinals" from the dropdown.

### Binaries won't download
Check your internet connection and firewall. Binaries are downloaded from:
- Bitcoin Core: `https://bitcoincore.org`
- Ord: `https://github.com/ordinals/ord`

## Requirements

- VS Code 1.85.0 or later
- Windows, macOS, or Linux
- ~500MB disk space for binaries and blockchain data

## Contributing

Issues and pull requests welcome on GitHub.

## License

MIT
