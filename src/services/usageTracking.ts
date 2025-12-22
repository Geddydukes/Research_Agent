import { createClient } from '@supabase/supabase-js';
import { calculateCost } from './pricing';

export interface UsageEvent {
  id: string;
  tenant_id: string;
  user_id?: string;
  pipeline_stage: string;
  agent_name?: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  execution_mode: 'hosted' | 'byo_key';
  timestamp: string;
  job_id?: string;
  metadata?: Record<string, unknown>;
}

export interface InsertUsageEvent {
  tenant_id: string;
  user_id?: string;
  pipeline_stage: string;
  agent_name?: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  execution_mode: 'hosted' | 'byo_key';
  job_id?: string;
  metadata?: Record<string, unknown>;
}

export interface UsageStats {
  total_events: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  events_by_stage: Record<string, number>;
  events_by_model: Record<string, number>;
  cost_by_stage: Record<string, number>;
}

export class UsageTrackingService {
  private supabase;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async logUsageEvent(event: InsertUsageEvent): Promise<UsageEvent> {
    const { data, error } = await this.supabase
      .from('usage_events')
      .insert(event)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to log usage event: ${error.message}`);
    }

    return data as UsageEvent;
  }

  async logLLMUsage(params: {
    tenant_id: string;
    user_id?: string;
    pipeline_stage: string;
    agent_name?: string;
    model: string;
    provider: string;
    input_tokens: number;
    output_tokens: number;
    execution_mode: 'hosted' | 'byo_key';
    job_id?: string;
    metadata?: Record<string, unknown>;
    markup?: number;
  }): Promise<UsageEvent> {
    const markup = params.execution_mode === 'hosted' ? (params.markup || 0.1) : 0;
    const estimatedCost = calculateCost(
      params.model,
      params.provider,
      params.input_tokens,
      params.output_tokens,
      markup
    );

    return this.logUsageEvent({
      tenant_id: params.tenant_id,
      user_id: params.user_id,
      pipeline_stage: params.pipeline_stage,
      agent_name: params.agent_name,
      model: params.model,
      provider: params.provider,
      input_tokens: params.input_tokens,
      output_tokens: params.output_tokens,
      estimated_cost_usd: estimatedCost,
      execution_mode: params.execution_mode,
      job_id: params.job_id,
      metadata: params.metadata,
    });
  }

  async getUsageStats(
    tenantId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<UsageStats> {
    let query = this.supabase
      .from('usage_events')
      .select('*')
      .eq('tenant_id', tenantId);

    if (startDate) {
      query = query.gte('timestamp', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('timestamp', endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get usage stats: ${error.message}`);
    }

    const events = (data || []) as UsageEvent[];

    const stats: UsageStats = {
      total_events: events.length,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost_usd: 0,
      events_by_stage: {},
      events_by_model: {},
      cost_by_stage: {},
    };

    for (const event of events) {
      stats.total_input_tokens += event.input_tokens;
      stats.total_output_tokens += event.output_tokens;
      stats.total_cost_usd += Number(event.estimated_cost_usd);
      stats.events_by_stage[event.pipeline_stage] =
        (stats.events_by_stage[event.pipeline_stage] || 0) + 1;
      stats.events_by_model[event.model] = (stats.events_by_model[event.model] || 0) + 1;
      stats.cost_by_stage[event.pipeline_stage] =
        (stats.cost_by_stage[event.pipeline_stage] || 0) + Number(event.estimated_cost_usd);
    }

    return stats;
  }

  async getUsageEvents(
    tenantId: string,
    params: {
      page?: number;
      limit?: number;
      startDate?: Date;
      endDate?: Date;
      pipeline_stage?: string;
    } = {}
  ): Promise<{ data: UsageEvent[]; count: number }> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 100);
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('usage_events')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.startDate) {
      query = query.gte('timestamp', params.startDate.toISOString());
    }

    if (params.endDate) {
      query = query.lte('timestamp', params.endDate.toISOString());
    }

    if (params.pipeline_stage) {
      query = query.eq('pipeline_stage', params.pipeline_stage);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to get usage events: ${error.message}`);
    }

    return {
      data: (data || []) as UsageEvent[],
      count: count || 0,
    };
  }
}

export function createUsageTrackingService(): UsageTrackingService {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  }

  return new UsageTrackingService(supabaseUrl, supabaseKey);
}
