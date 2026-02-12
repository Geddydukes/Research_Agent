import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SEED_EMAIL = 'geddydukes@gmail.com';
const SEED_PASSWORD = 'Gman3434!';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'workspace';
}

async function main() {
  console.log('Seed script starting...');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }
  console.log('Env OK, connecting to Supabase...');

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Listing users...');
  const { data: existing, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('List users failed:', listError.message);
    process.exit(1);
  }
  const existingUser = existing?.users?.find((u) => u.email === SEED_EMAIL);

  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
    console.log('Using existing user:', SEED_EMAIL);
  } else {
    console.log('Creating user...');
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email: SEED_EMAIL,
      password: SEED_PASSWORD,
      email_confirm: true,
    });
    if (createError) {
      console.error('Create user failed:', createError.message);
      process.exit(1);
    }
    if (!createData?.user?.id) {
      console.error('Create user returned no user id');
      process.exit(1);
    }
    userId = createData.user.id;
    console.log('Created user:', SEED_EMAIL);
  }

  console.log('Checking tenant membership...');
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (membership?.tenant_id) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name, slug')
      .eq('id', membership.tenant_id)
      .single();
    console.log('User already has tenant:', tenant?.name ?? membership.tenant_id);
    const { error: settingsErr } = await supabase
      .from('tenant_settings')
      .update({ execution_mode: 'hosted' })
      .eq('tenant_id', membership.tenant_id);
    if (settingsErr) {
      console.warn('Could not ensure execution_mode:', settingsErr.message);
    } else {
      console.log('Tenant settings set to hosted (onboarding already complete).');
    }
    console.log('\nSign in with:', SEED_EMAIL, '/', SEED_PASSWORD);
    return;
  }

  const baseName = SEED_EMAIL.split('@')[0] || 'user';
  const tenantName = `${baseName}'s Workspace`;
  const baseSlug = slugify(baseName);
  let slug = baseSlug;
  for (let i = 0; i < 5; i++) {
    const suffix = i === 0 ? '' : `-${Math.random().toString(36).slice(2, 6)}`;
    const candidate = `${baseSlug}${suffix}`;
    const { data: conflict } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();
    if (!conflict) {
      slug = candidate;
      break;
    }
  }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({ name: tenantName, slug })
    .select()
    .single();

  if (tenantError || !tenant) {
    console.error('Create tenant failed:', tenantError?.message);
    process.exit(1);
  }

  const { error: userLinkError } = await supabase.from('tenant_users').insert({
    tenant_id: tenant.id,
    user_id: userId,
    role: 'owner',
  });

  if (userLinkError) {
    console.error('Link user to tenant failed:', userLinkError.message);
    process.exit(1);
  }

  const { error: settingsError } = await supabase.from('tenant_settings').insert({
    tenant_id: tenant.id,
    execution_mode: 'hosted',
  });

  if (settingsError) {
    console.error('Create tenant settings failed:', settingsError.message);
    process.exit(1);
  }

  console.log('Tenant created:', tenant.name, '(' + tenant.slug + ')');
  console.log('Tenant settings: execution_mode = hosted (signed up with us).');
  console.log('\nSign in with:');
  console.log('  Email:', SEED_EMAIL);
  console.log('  Password:', SEED_PASSWORD);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
