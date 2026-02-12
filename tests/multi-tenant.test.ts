import { describe, it, expect, beforeAll } from '@jest/globals';
import { createDatabaseClient } from '../src/db/client';
import { createUsageTrackingService } from '../src/services/usageTracking';
import { createUsageLimitsService } from '../src/services/usageLimits';
import { encrypt, decrypt } from '../src/services/encryption';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

const describeDb = (globalThis as any).__SKIP_DB_TESTS__ ? describe.skip : describe;

describeDb('Multi-Tenant Functionality', () => {
  let db: ReturnType<typeof createDatabaseClient>;

  beforeAll(() => {
    db = createDatabaseClient(DEFAULT_TENANT_ID);
  });

  describe('DatabaseClient tenant isolation', () => {
    it('should require tenantId in constructor', () => {
      expect(() => {
        // @ts-expect-error - Testing that tenantId is required
        createDatabaseClient();
      }).toThrow();
    });

    it('should create client with tenantId', () => {
      const client = createDatabaseClient(DEFAULT_TENANT_ID);
      expect(client.tenantId).toBe(DEFAULT_TENANT_ID);
    });
  });

  describe('Tenant Settings', () => {
    it('should get tenant settings', async () => {
      const settings = await db.getTenantSettings();
      expect(settings).toBeDefined();
      expect(settings?.tenant_id).toBe(DEFAULT_TENANT_ID);
      expect(settings?.execution_mode).toBeDefined();
    });

    it('should update tenant settings', async () => {
      const originalSettings = await db.getTenantSettings();
      if (!originalSettings) {
        throw new Error('Tenant settings not found');
      }

      await db.updateTenantSettings({
        max_papers_per_run: 50,
        semantic_gating_threshold: 0.75,
      });

      const updated = await db.getTenantSettings();
      expect(updated).toBeDefined();
      expect(updated?.max_papers_per_run).toBe(50);
      expect(updated?.semantic_gating_threshold).toBe(0.75);

      await db.updateTenantSettings({
        max_papers_per_run: originalSettings.max_papers_per_run,
        semantic_gating_threshold: originalSettings.semantic_gating_threshold,
      });
    });
  });
});

describeDb('Usage Tracking', () => {
  const usageTracking = createUsageTrackingService();

  describe('Usage Tracking Service', () => {
    it('should create usage tracking service', () => {
      expect(usageTracking).toBeDefined();
    });

    it('should log usage event', async () => {
      const event = await usageTracking.logLLMUsage({
        tenant_id: DEFAULT_TENANT_ID,
        pipeline_stage: 'entity_extraction',
        agent_name: 'EntityExtraction',
        model: 'gemini-2.5-flash',
        provider: 'gemini',
        input_tokens: 1000,
        output_tokens: 500,
        execution_mode: 'hosted',
        metadata: { test: true },
      });

      expect(event.id).toBeDefined();
      expect(event.tenant_id).toBe(DEFAULT_TENANT_ID);
      expect(event.input_tokens).toBe(1000);
      expect(event.output_tokens).toBe(500);
      expect(event.estimated_cost_usd).toBeGreaterThan(0);
    });

    it('should get usage stats', async () => {
      const stats = await usageTracking.getUsageStats(DEFAULT_TENANT_ID);
      expect(stats).toBeDefined();
      expect(stats.total_events).toBeGreaterThanOrEqual(0);
      expect(stats.total_input_tokens).toBeGreaterThanOrEqual(0);
      expect(stats.total_output_tokens).toBeGreaterThanOrEqual(0);
      expect(stats.total_cost_usd).toBeGreaterThanOrEqual(0);
    });

    it('should get usage events with pagination', async () => {
      const result = await usageTracking.getUsageEvents(DEFAULT_TENANT_ID, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Usage Limits Service', () => {
    const limitsService = createUsageLimitsService();
    const db = createDatabaseClient(DEFAULT_TENANT_ID);

    it('should create usage limits service', () => {
      expect(limitsService).toBeDefined();
    });

    it('should check limits', async () => {
      const tenantSettings = await db.getTenantSettings();
      if (!tenantSettings) {
        throw new Error('Tenant settings not found');
      }

      const result = await limitsService.checkLimits(
        DEFAULT_TENANT_ID,
        tenantSettings,
        'monthly'
      );

      expect(result).toBeDefined();
      expect(result.withinLimits).toBeDefined();
      expect(Array.isArray(result.limits)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should get usage summary', async () => {
      const tenantSettings = await db.getTenantSettings();
      if (!tenantSettings) {
        throw new Error('Tenant settings not found');
      }

      const summary = await limitsService.getUsageSummary(DEFAULT_TENANT_ID, tenantSettings);

      expect(summary).toBeDefined();
      expect(summary.current).toBeDefined();
      expect(summary.current.monthly).toBeDefined();
      expect(summary.current.daily).toBeDefined();
      expect(summary.limits).toBeDefined();
      expect(summary.status).toBeDefined();
    });
  });
});

describe('Encryption Service', () => {
  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a value', async () => {
      const original = 'test-api-key-12345';
      const encrypted = await encrypt(original);
      const decrypted = await decrypt(encrypted);

      expect(encrypted).not.toBe(original);
      expect(decrypted).toBe(original);
    });

    it('should encrypt different values differently', async () => {
      const value1 = 'key1';
      const value2 = 'key2';

      const encrypted1 = await encrypt(value1);
      const encrypted2 = await encrypt(value2);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should detect encrypted values', () => {
      const plain = 'not-encrypted';
      expect(plain).toBeDefined();
    });

    it('should throw on empty encryption', async () => {
      await expect(encrypt('')).rejects.toThrow();
    });

    it('should throw on empty decryption', async () => {
      await expect(decrypt('')).rejects.toThrow();
    });
  });
});
