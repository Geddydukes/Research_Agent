import type { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { createError } from './errorHandler';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';
export type TenantRole = 'owner' | 'member' | 'viewer';
type AuthMethod = 'user' | 'api_key';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
    userId?: string;
    userEmail?: string;
    userRole?: TenantRole;
    authMethod?: AuthMethod;
  }
}

function isApiKeyAuthenticated(request: FastifyRequest): boolean {
  const apiKey = request.headers['x-api-key'] as string | undefined;
  const expectedKey = process.env.API_KEY;
  return Boolean(apiKey && expectedKey && apiKey === expectedKey);
}

async function extractTenantId(
  request: FastifyRequest,
  userId?: string,
  allowDefaultTenant = false
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

  if (allowDefaultTenant) {
    return DEFAULT_TENANT_ID;
  }

  throw createError('Tenant context is required', 400, 'TENANT_REQUIRED');
}

async function extractUser(request: FastifyRequest): Promise<{ id?: string; email?: string } | undefined> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return undefined;
  }

  const token = authHeader.substring(7);
  
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return undefined;
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return undefined;
    }

    return {
      id: user.id,
      email: user.email || undefined,
    };
  } catch (error) {
    return undefined;
  }
}

async function resolveTenantRole(
  userId: string,
  tenantId: string
): Promise<TenantRole | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw createError('Missing Supabase configuration', 500, 'CONFIG_ERROR');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    throw createError(`Failed to verify tenant membership: ${error.message}`, 500, 'TENANT_VERIFY_ERROR');
  }

  return (data?.role as TenantRole | undefined) || null;
}

export async function requireTenant(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const existingUserId = request.userId;
    const existingUserEmail = request.userEmail;
    const user = existingUserId
      ? { id: existingUserId, email: existingUserEmail }
      : await extractUser(request);
    const apiKeyAuthenticated = request.authMethod === 'api_key' || isApiKeyAuthenticated(request);
    const userId = user?.id;

    if (!userId && !apiKeyAuthenticated) {
      throw createError('Session invalid or expired. Please sign in again.', 401, 'AUTH_REQUIRED');
    }

    const tenantId = await extractTenantId(request, userId, apiKeyAuthenticated && !userId);
    let userRole: TenantRole = 'owner';

    if (userId) {
      const role = await resolveTenantRole(userId, tenantId);
      if (!role) {
        throw createError('Access denied to tenant', 403, 'TENANT_ACCESS_DENIED');
      }
      userRole = role;
    }

    request.tenantId = tenantId;
    request.userId = userId;
    request.userEmail = user?.email;
    request.userRole = userRole;
    request.authMethod = userId ? 'user' : 'api_key';

    void reply;
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
    const user = await extractUser(request);
    const userId = user?.id;
    const tenantId = await extractTenantId(request, userId, !userId);
    const userRole = userId ? await resolveTenantRole(userId, tenantId) : undefined;
    request.tenantId = tenantId;
    request.userId = userId;
    request.userEmail = user?.email;
    request.userRole = userRole || undefined;
    request.authMethod = userId ? 'user' : undefined;
  } catch (error) {
    // Endpoint handles missing tenant context
  }
}

export async function requireUser(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  const hasBearer = authHeader?.startsWith('Bearer ');
  if (hasBearer) {
    const user = await extractUser(request);
    if (user?.id) {
      request.userId = user.id;
      request.userEmail = user.email;
      request.authMethod = 'user';
      return;
    }
    throw createError('Session invalid or expired. Please sign in again.', 401, 'SESSION_INVALID');
  }

  const apiKey = request.headers['x-api-key'] as string | undefined;
  const expectedKey = process.env.API_KEY;
  if (apiKey && expectedKey && apiKey === expectedKey) {
    request.authMethod = 'api_key';
    return;
  }

  throw createError('Session invalid or expired. Please sign in again.', 401, 'AUTH_REQUIRED');
}

export async function requireTenantWriteAccess(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.tenantId) {
    await requireTenant(request, reply);
  }

  if (request.authMethod === 'api_key') {
    return;
  }

  if (request.userRole === 'viewer') {
    throw createError(
      'This account is read-only and cannot perform this action.',
      403,
      'READ_ONLY_ACCOUNT'
    );
  }
}
