import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const DEMO_EMAIL = 'Demo@demo.com';
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    console.error('List users failed:', listErr.message);
    process.exit(1);
  }

  const demoUser = listData?.users?.find(
    (u) => u.email?.toLowerCase() === DEMO_EMAIL.toLowerCase()
  );

  if (!demoUser) {
    console.log('Demo user does NOT exist. Run: npm run seed:demo');
    process.exit(1);
  }

  console.log('Demo user exists:', demoUser.email, '(id:', demoUser.id, ')');

  const { data: membership, error: memErr } = await supabase
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', demoUser.id)
    .maybeSingle();

  if (memErr) {
    console.error('Tenant membership check failed:', memErr.message);
    process.exit(1);
  }

  if (!membership) {
    console.log('Demo user is NOT linked to any tenant. Run: npm run seed:demo');
    process.exit(1);
  }

  if (membership.tenant_id !== DEFAULT_TENANT_ID) {
    console.log('Demo user is linked to tenant:', membership.tenant_id, '(expected default).');
    process.exit(1);
  }

  console.log('Demo user is linked to default tenant (role:', membership.role, ')');

  const { count: papersCount, error: papersErr } = await supabase
    .from('papers')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', DEFAULT_TENANT_ID);

  const { count: nodesCount, error: nodesErr } = await supabase
    .from('nodes')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', DEFAULT_TENANT_ID);

  const { count: edgesCount, error: edgesErr } = await supabase
    .from('edges')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', DEFAULT_TENANT_ID);

  if (papersErr || nodesErr || edgesErr) {
    console.warn('Could not read data counts:', papersErr?.message || nodesErr?.message || edgesErr?.message);
  } else {
    console.log('Default tenant data: papers:', papersCount ?? 0, ', nodes:', nodesCount ?? 0, ', edges:', edgesCount ?? 0);
  }

  console.log('\nDemo accounts (run disabled):');
  DEMO_ACCOUNTS.forEach(({ email, password }) => console.log(' ', email, '/', password));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
