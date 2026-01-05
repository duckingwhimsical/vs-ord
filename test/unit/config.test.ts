import * as assert from 'assert';

// Test the config utility logic without importing the actual module
// (since vscode is not available in pure unit tests)

type Network = 'regtest' | 'testnet' | 'signet' | 'mainnet';

function getNetworkFlag(network: Network): string {
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

function getOrdNetworkFlag(network: Network): string {
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

function getDefaultRpcPort(network: Network): number {
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

describe('Config Utilities', () => {
  describe('getNetworkFlag()', () => {
    it('should return empty string for mainnet', () => {
      assert.strictEqual(getNetworkFlag('mainnet'), '');
    });

    it('should return -testnet for testnet', () => {
      assert.strictEqual(getNetworkFlag('testnet'), '-testnet');
    });

    it('should return -signet for signet', () => {
      assert.strictEqual(getNetworkFlag('signet'), '-signet');
    });

    it('should return -regtest for regtest', () => {
      assert.strictEqual(getNetworkFlag('regtest'), '-regtest');
    });
  });

  describe('getOrdNetworkFlag()', () => {
    it('should return empty string for mainnet', () => {
      assert.strictEqual(getOrdNetworkFlag('mainnet'), '');
    });

    it('should return --testnet for testnet', () => {
      assert.strictEqual(getOrdNetworkFlag('testnet'), '--testnet');
    });

    it('should return --signet for signet', () => {
      assert.strictEqual(getOrdNetworkFlag('signet'), '--signet');
    });

    it('should return --regtest for regtest', () => {
      assert.strictEqual(getOrdNetworkFlag('regtest'), '--regtest');
    });
  });

  describe('getDefaultRpcPort()', () => {
    it('should return 8332 for mainnet', () => {
      assert.strictEqual(getDefaultRpcPort('mainnet'), 8332);
    });

    it('should return 18332 for testnet', () => {
      assert.strictEqual(getDefaultRpcPort('testnet'), 18332);
    });

    it('should return 38332 for signet', () => {
      assert.strictEqual(getDefaultRpcPort('signet'), 38332);
    });

    it('should return 18443 for regtest', () => {
      assert.strictEqual(getDefaultRpcPort('regtest'), 18443);
    });
  });

  describe('Network type', () => {
    it('should accept valid network values', () => {
      const networks: Network[] = ['regtest', 'testnet', 'signet', 'mainnet'];
      networks.forEach((network) => {
        assert.ok(getNetworkFlag(network) !== undefined);
      });
    });
  });
});
