import type { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { createError } from './errorHandler';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
    userId?: string;
  }
}

async function extractTenantId(
  request: FastifyRequest,
  userId?: string
): Promise<string> {
  const headerTenantId = request.headers['x-tenant-id'] as string | undefined;
  if (headerTenantId) {
    return headerTenantId;
  }

  const params = request.params as { tenantSlug?: string };
  if (params?.tenantSlug) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw createError('Missing Supabase configuration', 500, 'CONFIG_ERROR');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', params.tenantSlug)
      .maybeSingle();

    if (error) {
      throw createError(`Failed to resolve tenant: ${error.message}`, 500, 'TENANT_RESOLVE_ERROR');
    }

    if (data) {
      return data.id;
    }
  }

  if (userId) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return data.tenant_id;
      }
    }
  }

  return DEFAULT_TENANT_ID;
}

async function extractUserId(request: FastifyRequest): Promise<string | undefined> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return undefined;
  }

  const token = authHeader.substring(7);
  
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return undefined;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return undefined;
    }

    return user.id;
  } catch (error) {
    return undefined;
  }
}

async function verifyTenantAccess(
  userId: string | undefined,
  tenantId: string
): Promise<boolean> {
  if (!userId) {
    return true;
  }

  if (tenantId === DEFAULT_TENANT_ID) {
    return true;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw createError('Missing Supabase configuration', 500, 'CONFIG_ERROR');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from('tenant_users')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to verify tenant access: ${error.message}`, 500, 'TENANT_VERIFY_ERROR');
  }

  return data !== null;
}

export async function requireTenant(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    const userId = await extractUserId(request);
    const tenantId = await extractTenantId(request, userId);

    if (userId) {
      const hasAccess = await verifyTenantAccess(userId, tenantId);
      if (!hasAccess) {
        throw createError('Access denied to tenant', 403, 'TENANT_ACCESS_DENIED');
      }
    }

    request.tenantId = tenantId;
    request.userId = userId;
  } catch (error: any) {
    if (error.statusCode && error.code) {
      throw error;
    }
    throw createError(
      error.message || 'Tenant authentication failed',
      500,
      'TENANT_AUTH_ERROR'
    );
  }
}

export async function optionalTenant(
  request: FastifyRequest
): Promise<void> {
  try {
    const userId = await extractUserId(request);
    const tenantId = await extractTenantId(request, userId);
    request.tenantId = tenantId;
    request.userId = userId;
  } catch (error) {
    // Endpoint handles missing tenant context
  }
}

