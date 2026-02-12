import { UsageTrackingService, createUsageTrackingService } from './usageTracking';
import type { TenantSettings } from '../db/client';

export interface UsageLimit {
  type: 'monthly_cost' | 'monthly_tokens' | 'daily_cost' | 'daily_tokens';
  limit: number;
  current: number;
  percentage: number;
  status: 'ok' | 'warning' | 'exceeded';
}

export interface LimitCheckResult {
  withinLimits: boolean;
  limits: UsageLimit[];
  warnings: string[];
  errors: string[];
}

export class UsageLimitsService {
  private usageTracking: UsageTrackingService;

  constructor() {
    this.usageTracking = createUsageTrackingService();
  }

  async checkLimits(
    tenantId: string,
    tenantSettings: TenantSettings,
    period: 'daily' | 'monthly' = 'monthly'
  ): Promise<LimitCheckResult> {
    const limits: UsageLimit[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    const now = new Date();
    const startDate = period === 'daily'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : new Date(now.getFullYear(), now.getMonth(), 1);

    const stats = await this.usageTracking.getUsageStats(tenantId, startDate, now);
    const monthlyCostLimit = (tenantSettings as any).monthly_cost_limit;
    if (monthlyCostLimit !== null && monthlyCostLimit !== undefined && monthlyCostLimit > 0) {
      const currentCost = stats.total_cost_usd;
      const percentage = (currentCost / monthlyCostLimit) * 100;
      const status = percentage >= 100 ? 'exceeded' : percentage >= 80 ? 'warning' : 'ok';

      limits.push({
        type: 'monthly_cost',
        limit: monthlyCostLimit,
        current: currentCost,
        percentage,
        status,
      });

      if (status === 'exceeded') {
        errors.push(`Monthly cost limit exceeded: $${currentCost.toFixed(2)} / $${monthlyCostLimit}`);
      } else if (status === 'warning') {
        warnings.push(
          `Approaching monthly cost limit: $${currentCost.toFixed(2)} / $${monthlyCostLimit} (${percentage.toFixed(1)}%)`
        );
      }
    }

    const monthlyTokenLimit = (tenantSettings as any).monthly_token_limit;
    if (monthlyTokenLimit !== null && monthlyTokenLimit !== undefined && monthlyTokenLimit > 0) {
      const currentTokens = stats.total_input_tokens + stats.total_output_tokens;
      const percentage = (currentTokens / monthlyTokenLimit) * 100;
      const status = percentage >= 100 ? 'exceeded' : percentage >= 80 ? 'warning' : 'ok';

      limits.push({
        type: 'monthly_tokens',
        limit: monthlyTokenLimit,
        current: currentTokens,
        percentage,
        status,
      });

      if (status === 'exceeded') {
        errors.push(
          `Monthly token limit exceeded: ${currentTokens.toLocaleString()} / ${monthlyTokenLimit.toLocaleString()} tokens`
        );
      } else if (status === 'warning') {
        warnings.push(
          `Approaching monthly token limit: ${currentTokens.toLocaleString()} / ${monthlyTokenLimit.toLocaleString()} tokens (${percentage.toFixed(1)}%)`
        );
      }
    }

    if (period === 'daily') {
      const dailyCostLimit = (tenantSettings as any).daily_cost_limit;
      if (dailyCostLimit !== null && dailyCostLimit !== undefined && dailyCostLimit > 0) {
        const currentCost = stats.total_cost_usd;
        const percentage = (currentCost / dailyCostLimit) * 100;
        const status = percentage >= 100 ? 'exceeded' : percentage >= 80 ? 'warning' : 'ok';

        limits.push({
          type: 'daily_cost',
          limit: dailyCostLimit,
          current: currentCost,
          percentage,
          status,
        });

        if (status === 'exceeded') {
          errors.push(`Daily cost limit exceeded: $${currentCost.toFixed(2)} / $${dailyCostLimit}`);
        } else if (status === 'warning') {
          warnings.push(
            `Approaching daily cost limit: $${currentCost.toFixed(2)} / $${dailyCostLimit} (${percentage.toFixed(1)}%)`
          );
        }
      }

      const dailyTokenLimit = (tenantSettings as any).daily_token_limit;
      if (dailyTokenLimit !== null && dailyTokenLimit !== undefined && dailyTokenLimit > 0) {
        const currentTokens = stats.total_input_tokens + stats.total_output_tokens;
        const percentage = (currentTokens / dailyTokenLimit) * 100;
        const status = percentage >= 100 ? 'exceeded' : percentage >= 80 ? 'warning' : 'ok';

        limits.push({
          type: 'daily_tokens',
          limit: dailyTokenLimit,
          current: currentTokens,
          percentage,
          status,
        });

        if (status === 'exceeded') {
          errors.push(
            `Daily token limit exceeded: ${currentTokens.toLocaleString()} / ${dailyTokenLimit.toLocaleString()} tokens`
          );
        } else if (status === 'warning') {
          warnings.push(
            `Approaching daily token limit: ${currentTokens.toLocaleString()} / ${dailyTokenLimit.toLocaleString()} tokens (${percentage.toFixed(1)}%)`
          );
        }
      }
    }

    return {
      withinLimits: errors.length === 0,
      limits,
      warnings,
      errors,
    };
  }

  async isWithinLimits(
    tenantId: string,
    tenantSettings: TenantSettings,
    period: 'daily' | 'monthly' = 'monthly'
  ): Promise<boolean> {
    const result = await this.checkLimits(tenantId, tenantSettings, period);
    return result.withinLimits;
  }

  async getUsageSummary(
    tenantId: string,
    tenantSettings: TenantSettings
  ): Promise<{
    current: {
      monthly: {
        cost: number;
        tokens: number;
        events: number;
      };
      daily: {
        cost: number;
        tokens: number;
        events: number;
      };
    };
    limits: {
      monthly: {
        cost?: number;
        tokens?: number;
      };
      daily: {
        cost?: number;
        tokens?: number;
      };
    };
    status: {
      monthly: LimitCheckResult;
      daily: LimitCheckResult;
    };
  }> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const monthlyStats = await this.usageTracking.getUsageStats(tenantId, monthStart, now);
    const dailyStats = await this.usageTracking.getUsageStats(tenantId, dayStart, now);

    const monthlyLimits = await this.checkLimits(tenantId, tenantSettings, 'monthly');
    const dailyLimits = await this.checkLimits(tenantId, tenantSettings, 'daily');

    return {
      current: {
        monthly: {
          cost: monthlyStats.total_cost_usd,
          tokens: monthlyStats.total_input_tokens + monthlyStats.total_output_tokens,
          events: monthlyStats.total_events,
        },
        daily: {
          cost: dailyStats.total_cost_usd,
          tokens: dailyStats.total_input_tokens + dailyStats.total_output_tokens,
          events: dailyStats.total_events,
        },
      },
      limits: {
        monthly: {
          cost: (tenantSettings as any).monthly_cost_limit,
          tokens: (tenantSettings as any).monthly_token_limit,
        },
        daily: {
          cost: (tenantSettings as any).daily_cost_limit,
          tokens: (tenantSettings as any).daily_token_limit,
        },
      },
      status: {
        monthly: monthlyLimits,
        daily: dailyLimits,
      },
    };
  }
}

export function createUsageLimitsService(): UsageLimitsService {
  return new UsageLimitsService();
}
