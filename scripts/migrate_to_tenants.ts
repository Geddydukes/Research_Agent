import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs/promises';
import * as path from 'path';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('Starting migration to multi-tenancy...');

  try {
    // Read the migration SQL file for display
    const migrationPath = path.join(__dirname, '../src/db/migrations/add_tenancy.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf8');

    console.log('⚠️  NOTE: This script verifies the migration but does not execute it.');
    console.log('Please run the migration SQL manually in your Supabase SQL editor first.');
    console.log(`\nMigration file location: ${migrationPath}`);
    console.log('\nTo run the migration:');
    console.log('1. Go to your Supabase project dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy and paste the contents of the migration file');
    console.log('4. Execute the SQL');
    console.log('\nMigration SQL:');
    console.log('─'.repeat(80));
    console.log(migrationSql);
    console.log('─'.repeat(80));
    
    // Wait a bit for user to read
    console.log('\nWaiting 5 seconds before verification...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify migration success
    console.log('\nVerifying migration...');
    
    // Check that default tenant exists
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('id', DEFAULT_TENANT_ID)
      .maybeSingle();

    if (tenantError || !tenant) {
      console.error('Migration verification failed: default tenant not found');
      process.exit(1);
    }

    console.log('✓ Default tenant exists:', tenant.name);

    // Check that tenant_id columns exist on key tables
    const tablesToCheck = ['papers', 'nodes', 'edges', 'paper_sections', 'entity_mentions', 'inferred_insights'];
    
    for (const table of tablesToCheck) {
      const { data, error } = await supabase
        .from(table)
        .select('tenant_id')
        .limit(1);

      if (error) {
        console.error(`✗ Error checking ${table}:`, error.message);
        process.exit(1);
      }

      console.log(`✓ ${table} has tenant_id column`);
    }

    // Check tenant_settings
    const { data: settings, error: settingsError } = await supabase
      .from('tenant_settings')
      .select('tenant_id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .maybeSingle();

    if (settingsError || !settings) {
      console.error('Migration verification failed: default tenant settings not found');
      process.exit(1);
    }

    console.log('✓ Default tenant settings exist');

    console.log('\n✓ Migration verification complete!');
    console.log('\nNote: All existing data has been assigned to the default tenant.');
    console.log('To create additional tenants, use the tenant management API or SQL directly.');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

