import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const DEMO_EMAIL = 'Demo@demo.com';
const DEMO_PASSWORD = 'Demo1234';
const LIVEDEMO_EMAIL = 'livedemo@demo.com';
const LIVEDEMO_PASSWORD = 'LiveDemo1';
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

async function ensureDemoUser(
  supabase: ReturnType<typeof createClient>,
  email: string,
  password: string
): Promise<string> {
  const { data: existing } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existingUser = existing?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (existingUser) {
    console.log('Using existing user:', existingUser.email);
    return existingUser.id;
  }

  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) {
    const { data: retryList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const found = retryList?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      console.log('User already exists (found after create error):', email);
      return found.id;
    }
    throw new Error(`Create user ${email} failed: ${createError.message}`);
  }
  if (!createData?.user?.id) {
    throw new Error('Create user returned no user id');
  }
  console.log('Created user:', email);
  return createData.user.id;
}

async function linkToDefaultTenant(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (membership?.tenant_id) {
    return false;
  }

  const { error: linkError } = await supabase.from('tenant_users').insert({
    tenant_id: DEFAULT_TENANT_ID,
    user_id: userId,
    role: 'viewer',
  });
  if (linkError) {
    throw new Error(`Link to default tenant failed: ${linkError.message}`);
  }
  return true;
}

async function main() {
  console.log('Seeding demo accounts...');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userId1 = await ensureDemoUser(supabase, DEMO_EMAIL, DEMO_PASSWORD);
  const linked1 = await linkToDefaultTenant(supabase, userId1);
  if (linked1) console.log('Demo user linked to default tenant.');

  const userId2 = await ensureDemoUser(supabase, LIVEDEMO_EMAIL, LIVEDEMO_PASSWORD);
  const linked2 = await linkToDefaultTenant(supabase, userId2);
  if (linked2) console.log('Live demo user linked to default tenant.');

  console.log('\nDemo accounts (run disabled, same default data):');
  console.log('  1.', DEMO_EMAIL, '/', DEMO_PASSWORD);
  console.log('  2.', LIVEDEMO_EMAIL, '/', LIVEDEMO_PASSWORD);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
