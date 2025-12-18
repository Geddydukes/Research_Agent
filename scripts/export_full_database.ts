import 'dotenv/config';
import { createDatabaseClient } from '../src/db/client';
import * as fs from 'fs';
import * as path from 'path';

const logger = {
  error: (msg: string, ctx?: Record<string, unknown>) => console.error(`[Export] ${msg}`, ctx || ''),
  warn: (msg: string, ctx?: Record<string, unknown>) => console.warn(`[Export] ${msg}`, ctx || ''),
  info: (msg: string, ctx?: Record<string, unknown>) => console.info(`[Export] ${msg}`, ctx || ''),
};

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }

  const db = createDatabaseClient();
  
  logger.info('Exporting full database...');
  const startTime = Date.now();

  // Export all tables
  const tables = [
    'papers',
    'paper_sections',
    'nodes',
    'edges',
    'entity_mentions',
    'inferred_insights',
  ];

  const exportData: Record<string, any[]> = {};
  const counts: Record<string, number> = {};

  for (const table of tables) {
    logger.info(`Exporting ${table}...`);
    const { data, error } = await db.client
      .from(table)
      .select('*');

    if (error) {
      logger.error(`Failed to export ${table}`, { error: error.message });
      throw error;
    }

    exportData[table] = data || [];
    counts[table] = (data || []).length;
    logger.info(`  Exported ${counts[table]} rows from ${table}`);
  }

  // Create export file
  const exportDataFull = {
    timestamp: new Date().toISOString(),
    supabaseUrl: process.env.SUPABASE_URL,
    exportVersion: '1.0',
    counts,
    data: exportData,
  };

  const exportPath = path.join(process.cwd(), `full_database_export_${Date.now()}.json`);
  fs.writeFileSync(exportPath, JSON.stringify(exportDataFull, null, 2));

  const fileSize = fs.statSync(exportPath).size;
  const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);

  logger.info('');
  logger.info(`✅ Full database export complete!`);
  logger.info(`   Total rows: ${Object.values(counts).reduce((a, b) => a + b, 0)}`);
  logger.info(`   File size: ${fileSizeMB} MB`);
  logger.info(`   Saved to: ${exportPath}`);
  logger.info(`   Time taken: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
  logger.info('');
  logger.info('Tables exported:');
  for (const [table, count] of Object.entries(counts)) {
    logger.info(`   ${table}: ${count} rows`);
  }
  logger.info('');
  logger.info('You can restore this using: npx ts-node scripts/restore_database.ts <export_file>');
}

main().catch((error) => {
  logger.error('Export failed', { error: error.message, stack: error.stack });
  process.exit(1);
});
