import 'dotenv/config';

process.env.API_KEY = process.env.API_KEY || 'test-api-key';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '⚠️  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env for integration tests'
  );
}
