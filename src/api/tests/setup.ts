import 'dotenv/config';

process.env.API_KEY = process.env.API_KEY || 'test-api-key';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const hasSupabaseConfig = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === '1' && hasSupabaseConfig;

if (!shouldRunIntegration) {
  console.warn(
    '⚠️  Integration tests skipped. Set RUN_INTEGRATION_TESTS=1 and Supabase env vars to enable.'
  );
}

(globalThis as any).__SKIP_DB_TESTS__ = !shouldRunIntegration;
