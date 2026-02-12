import fs from 'fs/promises';
import path from 'path';

async function main() {
  const migrationsDir = path.join(__dirname, '../src/db/migrations');
  const entries = await fs.readdir(migrationsDir);
  const sqlFiles = entries.filter((file) => file.endsWith('.sql')).sort();

  console.log('Supabase SQL Migrations');
  console.log('------------------------');
  console.log('Run these files in your Supabase SQL editor in order:\n');

  sqlFiles.forEach((file, index) => {
    console.log(`${index + 1}. ${file}`);
  });

  const shouldPrint = process.argv.includes('--print');
  if (shouldPrint) {
    for (const file of sqlFiles) {
      const fullPath = path.join(migrationsDir, file);
      const sql = await fs.readFile(fullPath, 'utf8');
      console.log(`\n--- ${file} ---\n`);
      console.log(sql);
    }
  }
}

main().catch((error) => {
  console.error('Failed to list migrations:', error);
  process.exit(1);
});
