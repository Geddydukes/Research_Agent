import { createClient } from '@supabase/supabase-js';
import { createError } from '../middleware/errorHandler';

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

interface TenantMembership {
  tenant: TenantSummary;
  role: 'owner' | 'member' | 'viewer';
}

function createAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw createError('Missing Supabase configuration', 500, 'CONFIG_ERROR');
  }

  return createClient(supabaseUrl, supabaseKey);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'workspace';
}

async function findUniqueSlug(base: string): Promise<string> {
  const supabase = createAdminClient();
  const baseSlug = slugify(base);

  for (let i = 0; i < 5; i++) {
    const suffix = i === 0 ? '' : `-${Math.random().toString(36).slice(2, 6)}`;
    const slug = `${baseSlug}${suffix}`;
    const { data, error } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      throw createError(`Failed to check tenant slug: ${error.message}`, 500, 'TENANT_SLUG_CHECK_FAILED');
    }

    if (!data) {
      return slug;
    }
  }

  return `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getTenantsForUser(userId: string): Promise<TenantMembership[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('tenant_users')
    .select('role, tenants (id, name, slug, created_at, updated_at)')
    .eq('user_id', userId);

  if (error) {
    throw createError(`Failed to load tenants: ${error.message}`, 500, 'TENANT_LIST_FAILED');
  }

  return (data || [])
    .map((row: any) => ({
      role: row.role,
      tenant: row.tenants as TenantSummary,
    }))
    .filter((row) => row.tenant);
}

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const DEMO_EMAILS = ['demo@demo.com', 'livedemo@demo.com'];

export async function ensureTenantForUser(
  userId: string,
  email?: string
): Promise<TenantMembership> {
  const existing = await getTenantsForUser(userId);
  if (existing.length > 0) {
    return existing[0]!;
  }

  const supabase = createAdminClient();
  const normalizedEmail = email?.toLowerCase();
  if (normalizedEmail && DEMO_EMAILS.includes(normalizedEmail)) {
    const { data: defaultTenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, name, slug, created_at, updated_at')
      .eq('id', DEFAULT_TENANT_ID)
      .single();
    if (tenantErr || !defaultTenant) {
      throw createError('Default tenant not found for demo account', 500, 'TENANT_NOT_FOUND');
    }
    const { error: linkErr } = await supabase.from('tenant_users').insert({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: userId,
      role: 'viewer',
    });
    if (linkErr) {
      throw createError(`Failed to link demo user to tenant: ${linkErr.message}`, 500, 'TENANT_USER_CREATE_FAILED');
    }
    return { role: 'viewer', tenant: defaultTenant as TenantSummary };
  }

  const baseName = email ? email.split('@')[0] : 'My Workspace';
  const tenantName = baseName ? `${baseName}'s Workspace` : 'My Workspace';
  const slug = await findUniqueSlug(baseName || 'workspace');

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({
      name: tenantName,
      slug,
    })
    .select()
    .single();

  if (tenantError || !tenant) {
    throw createError(`Failed to create tenant: ${tenantError?.message}`, 500, 'TENANT_CREATE_FAILED');
  }

  const { error: userError } = await supabase
    .from('tenant_users')
    .insert({
      tenant_id: tenant.id,
      user_id: userId,
      role: 'owner',
    });

  if (userError) {
    throw createError(`Failed to link tenant user: ${userError.message}`, 500, 'TENANT_USER_CREATE_FAILED');
  }

  const { error: settingsError } = await supabase
    .from('tenant_settings')
    .insert({
      tenant_id: tenant.id,
    });

  if (settingsError) {
    throw createError(`Failed to create tenant settings: ${settingsError.message}`, 500, 'TENANT_SETTINGS_CREATE_FAILED');
  }

  return {
    role: 'owner',
    tenant: tenant as TenantSummary,
  };
}
