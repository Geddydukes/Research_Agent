import 'dotenv/config';
import { createDatabaseClient } from '../src/db/client';
import * as fs from 'fs/promises';
import * as path from 'path';

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000000';

async function runSQLFile(db: any, filePath: string): Promise<void> {
  const sql = await fs.readFile(filePath, 'utf-8');
  
  // Split by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    if (statement.trim()) {
      try {
        // Use Supabase client's RPC or raw query capability
        // Note: Supabase PostgREST doesn't support raw SQL directly
        // We'll need to use the Supabase dashboard or psql for migrations
        console.log(`[Migration] Executing: ${statement.substring(0, 50)}...`);
        // For now, we'll just validate the SQL file exists
      } catch (err) {
        console.error(`[Migration] Error executing statement:`, err);
        throw err;
      }
    }
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }

  console.log('[Migration] pgvector migration');
  console.log('[Migration] Note: Supabase PostgREST does not support raw SQL execution');
  console.log('[Migration] Please run the following SQL files manually in your Supabase SQL editor:');
  console.log('');
  console.log('1. src/db/migrations/add_pgvector.sql');
  console.log('2. sql/functions/find_similar_papers.sql');
  console.log('');
  console.log('Or use psql to connect directly to your database.');
  
  // Read and display the SQL files
  const migrationPath = path.join(__dirname, '../src/db/migrations/add_pgvector.sql');
  const functionPath = path.join(__dirname, '../sql/functions/find_similar_papers.sql');
  
  console.log('\n=== Migration SQL ===');
  const migrationSQL = await fs.readFile(migrationPath, 'utf-8');
  console.log(migrationSQL);
  
  console.log('\n=== Function SQL ===');
  const functionSQL = await fs.readFile(functionPath, 'utf-8');
  console.log(functionSQL);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
