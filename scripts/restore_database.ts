import 'dotenv/config';
import { createDatabaseClient } from '../src/db/client';
import * as fs from 'fs';
import * as path from 'path';

const logger = {
  error: (msg: string, ctx?: Record<string, unknown>) => console.error(`[Restore] ${msg}`, ctx || ''),
  warn: (msg: string, ctx?: Record<string, unknown>) => console.warn(`[Restore] ${msg}`, ctx || ''),
  info: (msg: string, ctx?: Record<string, unknown>) => console.info(`[Restore] ${msg}`, ctx || ''),
};

const CONFIRM = process.env.RESTORE_CONFIRM === 'YES';

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }

  const exportFile = process.argv[2];
  if (!exportFile) {
    logger.error('Usage: npx ts-node scripts/restore_database.ts <export_file.json>');
    logger.error('Example: npx ts-node scripts/restore_database.ts full_database_export_1234567890.json');
    process.exit(1);
  }

  const exportPath = path.isAbsolute(exportFile) 
    ? exportFile 
    : path.join(process.cwd(), exportFile);

  if (!fs.existsSync(exportPath)) {
    logger.error(`Export file not found: ${exportPath}`);
    process.exit(1);
  }

  if (!CONFIRM) {
    logger.error('⚠️  WARNING: This will DELETE all existing data and restore from export!');
    logger.error('⚠️  Set RESTORE_CONFIRM=YES to proceed');
    logger.error('');
    logger.error('This will:');
    logger.error('  1. Delete all data from: papers, paper_sections, nodes, edges, entity_mentions, inferred_insights');
    logger.error('  2. Restore data from the export file');
    logger.error('  3. This is IRREVERSIBLE - make sure you want to do this!');
    process.exit(1);
  }

  logger.info(`Loading export file: ${exportPath}`);
  const exportData = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));

  logger.info(`Export timestamp: ${exportData.timestamp}`);
  logger.info(`Export version: ${exportData.exportVersion}`);
  logger.info(`Rows to restore: ${Object.values(exportData.counts).reduce((a: number, b: number) => a + b, 0)}`);
  logger.info('');

  const db = createDatabaseClient();

  // Restore in order (respecting foreign key dependencies)
  const restoreOrder = [
    'papers',           // No dependencies
    'paper_sections',   // Depends on papers
    'nodes',            // No dependencies (except self-referential, but we'll handle that)
    'entity_mentions',  // Depends on nodes and papers
    'edges',            // Depends on nodes
    'inferred_insights', // Depends on nodes
  ];

  logger.info('⚠️  DELETING all existing data...');
  
  // Delete in reverse order (to respect FK constraints)
  const deleteOrder = [...restoreOrder].reverse();
  for (const table of deleteOrder) {
    logger.info(`Deleting all rows from ${table}...`);
    const { error } = await db.client
      .from(table)
      .delete()
      .neq('id', -1); // Delete all (using a condition that's always true)

    if (error) {
      logger.error(`Failed to delete from ${table}`, { error: error.message });
      throw error;
    }
    logger.info(`  ✓ Deleted all rows from ${table}`);
  }

  logger.info('');
  logger.info('Restoring data...');

  // Restore in order
  for (const table of restoreOrder) {
    const rows = exportData.data[table] || [];
    if (rows.length === 0) {
      logger.info(`Skipping ${table} (no data)`);
      continue;
    }

    logger.info(`Restoring ${rows.length} rows to ${table}...`);

    // For tables with serial IDs, we need to handle them carefully
    // Supabase/Postgres will auto-generate new IDs, but we want to preserve them
    // So we'll insert with explicit IDs where possible

    const BATCH_SIZE = 100;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      
      // Remove any null/undefined values that might cause issues
      const cleanBatch = batch.map(row => {
        const clean: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
          if (value !== null && value !== undefined) {
            clean[key] = value;
          }
        }
        return clean;
      });

      const { error } = await db.client
        .from(table)
        .insert(cleanBatch);

      if (error) {
        logger.error(`Failed to restore batch ${Math.floor(i / BATCH_SIZE) + 1} to ${table}`, { 
          error: error.message,
          batchStart: i,
          batchSize: batch.length,
        });
        throw error;
      }

      logger.info(`  Restored batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)}`);
    }

    logger.info(`  ✓ Restored ${rows.length} rows to ${table}`);
  }

  logger.info('');
  logger.info('✅ Database restore complete!');
  logger.info('');
  logger.info('Verifying restore...');

  // Verify counts
  for (const table of restoreOrder) {
    const expectedCount = exportData.counts[table] || 0;
    const { count, error } = await db.client
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      logger.warn(`Failed to verify ${table}`, { error: error.message });
    } else {
      if (count === expectedCount) {
        logger.info(`  ✓ ${table}: ${count} rows (matches export)`);
      } else {
        logger.warn(`  ⚠ ${table}: ${count} rows (expected ${expectedCount})`);
      }
    }
  }

  logger.info('');
  logger.info('Restore verification complete!');
}

main().catch((error) => {
  logger.error('Restore failed', { error: error.message, stack: error.stack });
  process.exit(1);
});
