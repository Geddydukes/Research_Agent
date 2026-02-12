import { describe, it, expect } from '@jest/globals';
import { createUsageTrackingService } from '../src/services/usageTracking';
import { calculateCost, getModelPricing } from '../src/services/pricing';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const describeDb = (globalThis as any).__SKIP_DB_TESTS__ ? describe.skip : describe;

describeDb('Usage Tracking Integration', () => {
  const usageTracking = createUsageTrackingService();

  describe('Cost Calculation', () => {
    it('should calculate cost for gemini models', () => {
      const cost = calculateCost('gemini-2.5-flash', 'gemini', 1000, 500);
      expect(cost).toBeGreaterThan(0);
      expect(typeof cost).toBe('number');
    });

    it('should apply markup for hosted mode', () => {
      const baseCost = calculateCost('gemini-2.5-flash', 'gemini', 1000, 500, 0);
      const withMarkup = calculateCost('gemini-2.5-flash', 'gemini', 1000, 500, 0.1);
      
      expect(withMarkup).toBeGreaterThan(baseCost);
      expect(withMarkup).toBeCloseTo(baseCost * 1.1, 6);
    });

    it('should get model pricing', () => {
      const pricing = getModelPricing('gemini-2.5-flash', 'gemini');
      expect(pricing).toBeDefined();
      expect(pricing.inputPricePerMillion).toBeGreaterThan(0);
      expect(pricing.outputPricePerMillion).toBeGreaterThan(0);
    });

    it('should use default pricing for unknown models', () => {
      const pricing = getModelPricing('unknown-model', 'gemini');
      expect(pricing).toBeDefined();
      expect(pricing.inputPricePerMillion).toBeGreaterThan(0);
    });
  });

  describe('Usage Event Logging', () => {
    it('should log hosted mode usage', async () => {
      const event = await usageTracking.logLLMUsage({
        tenant_id: DEFAULT_TENANT_ID,
        pipeline_stage: 'entity_extraction',
        agent_name: 'EntityExtraction',
        model: 'gemini-2.5-flash',
        provider: 'gemini',
        input_tokens: 2000,
        output_tokens: 1000,
        execution_mode: 'hosted',
      });

      expect(event.execution_mode).toBe('hosted');
      expect(event.estimated_cost_usd).toBeGreaterThan(0);
    });

    it('should log BYO key mode usage', async () => {
      const event = await usageTracking.logLLMUsage({
        tenant_id: DEFAULT_TENANT_ID,
        pipeline_stage: 'relationship_extraction',
        agent_name: 'RelationshipExtraction',
        model: 'gemini-2.5-pro',
        provider: 'gemini',
        input_tokens: 5000,
        output_tokens: 2000,
        execution_mode: 'byo_key',
      });

      expect(event.execution_mode).toBe('byo_key');
      expect(event.estimated_cost_usd).toBeGreaterThan(0);
      const baseCost = calculateCost('gemini-2.5-pro', 'gemini', 5000, 2000, 0);
      expect(event.estimated_cost_usd).toBeCloseTo(baseCost, 4);
    });
  });

  describe('Usage Statistics', () => {
    it('should aggregate statistics by stage', async () => {
      await usageTracking.logLLMUsage({
        tenant_id: DEFAULT_TENANT_ID,
        pipeline_stage: 'entity_extraction',
        model: 'gemini-2.5-flash',
        provider: 'gemini',
        input_tokens: 1000,
        output_tokens: 500,
        execution_mode: 'hosted',
      });

      await usageTracking.logLLMUsage({
        tenant_id: DEFAULT_TENANT_ID,
        pipeline_stage: 'relationship_extraction',
        model: 'gemini-2.5-flash',
        provider: 'gemini',
        input_tokens: 2000,
        output_tokens: 1000,
        execution_mode: 'hosted',
      });

      const stats = await usageTracking.getUsageStats(DEFAULT_TENANT_ID);
      
      expect(stats.events_by_stage).toBeDefined();
      expect(stats.cost_by_stage).toBeDefined();
      expect(stats.events_by_model).toBeDefined();
    });
  });
});
