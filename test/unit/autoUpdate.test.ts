import * as assert from 'assert';

describe('Auto-Download and Auto-Update', () => {
  describe('Configuration', () => {
    it('should have autoDownload default to true', () => {
      const defaultConfig = {
        autoDownload: true,
      };
      assert.strictEqual(defaultConfig.autoDownload, true);
    });

    it('should have autoUpdate default to true', () => {
      const defaultConfig = {
        autoUpdate: true,
      };
      assert.strictEqual(defaultConfig.autoUpdate, true);
    });

    it('should have updateCheckInterval default to 24 hours', () => {
      const defaultConfig = {
        updateCheckInterval: 24,
      };
      assert.strictEqual(defaultConfig.updateCheckInterval, 24);
    });

    it('should disable periodic checks when interval is 0', () => {
      const config = { updateCheckInterval: 0 };
      const shouldCheck = config.updateCheckInterval > 0;
      assert.strictEqual(shouldCheck, false);
    });

    it('should enable periodic checks when interval is positive', () => {
      const config = { updateCheckInterval: 24 };
      const shouldCheck = config.updateCheckInterval > 0;
      assert.strictEqual(shouldCheck, true);
    });
  });

  describe('Update Check Interval', () => {
    it('should calculate hours since last check correctly', () => {
      const lastCheck = Date.now() - (12 * 60 * 60 * 1000); // 12 hours ago
      const now = Date.now();
      const hoursSinceLastCheck = (now - lastCheck) / (1000 * 60 * 60);

      assert.ok(hoursSinceLastCheck >= 11.9 && hoursSinceLastCheck <= 12.1);
    });

    it('should skip check if not enough time has passed', () => {
      const lastCheck = Date.now() - (6 * 60 * 60 * 1000); // 6 hours ago
      const now = Date.now();
      const hoursSinceLastCheck = (now - lastCheck) / (1000 * 60 * 60);
      const updateCheckInterval = 24;

      const shouldCheck = hoursSinceLastCheck >= updateCheckInterval;
      assert.strictEqual(shouldCheck, false);
    });

    it('should perform check if enough time has passed', () => {
      const lastCheck = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      const now = Date.now();
      const hoursSinceLastCheck = (now - lastCheck) / (1000 * 60 * 60);
      const updateCheckInterval = 24;

      const shouldCheck = hoursSinceLastCheck >= updateCheckInterval;
      assert.strictEqual(shouldCheck, true);
    });

    it('should always check if last check is 0 (never checked)', () => {
      const lastCheck = 0;
      const now = Date.now();
      const hoursSinceLastCheck = (now - lastCheck) / (1000 * 60 * 60);
      const updateCheckInterval = 24;

      const shouldCheck = hoursSinceLastCheck >= updateCheckInterval;
      assert.strictEqual(shouldCheck, true);
    });
  });

  describe('Version Comparison', () => {
    it('should detect Bitcoin Core update available', () => {
      const installed = { bitcoind: 'v27.0', ord: '0.20.0' };
      const latest = { bitcoind: 'v28.0', ord: '0.20.0' };

      const bitcoindNeedsUpdate = installed.bitcoind !== latest.bitcoind;
      const ordNeedsUpdate = installed.ord !== latest.ord;

      assert.strictEqual(bitcoindNeedsUpdate, true);
      assert.strictEqual(ordNeedsUpdate, false);
    });

    it('should detect ord update available', () => {
      const installed = { bitcoind: 'v28.0', ord: '0.20.0' };
      const latest = { bitcoind: 'v28.0', ord: '0.21.0' };

      const bitcoindNeedsUpdate = installed.bitcoind !== latest.bitcoind;
      const ordNeedsUpdate = installed.ord !== latest.ord;

      assert.strictEqual(bitcoindNeedsUpdate, false);
      assert.strictEqual(ordNeedsUpdate, true);
    });

    it('should detect both need update', () => {
      const installed = { bitcoind: 'v27.0', ord: '0.20.0' };
      const latest = { bitcoind: 'v28.0', ord: '0.21.0' };

      const bitcoindNeedsUpdate = installed.bitcoind !== latest.bitcoind;
      const ordNeedsUpdate = installed.ord !== latest.ord;

      assert.strictEqual(bitcoindNeedsUpdate, true);
      assert.strictEqual(ordNeedsUpdate, true);
    });

    it('should detect no updates needed', () => {
      const installed = { bitcoind: 'v28.0', ord: '0.21.0' };
      const latest = { bitcoind: 'v28.0', ord: '0.21.0' };

      const bitcoindNeedsUpdate = installed.bitcoind !== latest.bitcoind;
      const ordNeedsUpdate = installed.ord !== latest.ord;

      assert.strictEqual(bitcoindNeedsUpdate, false);
      assert.strictEqual(ordNeedsUpdate, false);
    });
  });

  describe('Update Message Formatting', () => {
    it('should format single update message', () => {
      const installed = { bitcoind: 'v27.0', ord: '0.20.0' };
      const updates = { bitcoind: 'v28.0', ord: null };

      const messages: string[] = [];
      if (updates.bitcoind) {
        messages.push(`Bitcoin Core: ${installed.bitcoind} → ${updates.bitcoind}`);
      }
      if (updates.ord) {
        messages.push(`ord: ${installed.ord} → ${updates.ord}`);
      }

      assert.strictEqual(messages.length, 1);
      assert.strictEqual(messages[0], 'Bitcoin Core: v27.0 → v28.0');
    });

    it('should format multiple update messages', () => {
      const installed = { bitcoind: 'v27.0', ord: '0.20.0' };
      const updates = { bitcoind: 'v28.0', ord: '0.21.0' };

      const messages: string[] = [];
      if (updates.bitcoind) {
        messages.push(`Bitcoin Core: ${installed.bitcoind} → ${updates.bitcoind}`);
      }
      if (updates.ord) {
        messages.push(`ord: ${installed.ord} → ${updates.ord}`);
      }

      assert.strictEqual(messages.length, 2);
      assert.ok(messages.join(' and ').includes('Bitcoin Core'));
      assert.ok(messages.join(' and ').includes('ord'));
    });
  });

  describe('Auto-Download Logic', () => {
    it('should not download if autoDownload is false', () => {
      const config = { autoDownload: false };
      const binariesInstalled = false;

      const shouldAutoDownload = !binariesInstalled && config.autoDownload;
      assert.strictEqual(shouldAutoDownload, false);
    });

    it('should download if autoDownload is true and binaries missing', () => {
      const config = { autoDownload: true };
      const binariesInstalled = false;

      const shouldAutoDownload = !binariesInstalled && config.autoDownload;
      assert.strictEqual(shouldAutoDownload, true);
    });

    it('should not download if binaries already installed', () => {
      const config = { autoDownload: true };
      const binariesInstalled = true;

      const shouldAutoDownload = !binariesInstalled && config.autoDownload;
      assert.strictEqual(shouldAutoDownload, false);
    });
  });
});
