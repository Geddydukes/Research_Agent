import { createDatabaseClient, DatabaseClient } from './client';

const NODE_TYPES = [
  {
    type_name: 'method',
    description: 'A research method, algorithm, or technique',
  },
  {
    type_name: 'dataset',
    description: 'A dataset used for training or evaluation',
  },
  {
    type_name: 'metric',
    description: 'An evaluation metric or performance measure',
  },
  {
    type_name: 'model',
    description: 'A machine learning model or architecture',
  },
  {
    type_name: 'baseline',
    description: 'A baseline method used for comparison',
  },
  {
    type_name: 'task',
    description: 'A research task or problem domain',
  },
  {
    type_name: 'domain',
    description: 'A research domain or field',
  },
  {
    type_name: 'tool',
    description: 'A software tool or framework',
  },
  {
    type_name: 'concept',
    description: 'A theoretical concept or idea',
  },
  {
    type_name: 'application',
    description: 'An application area or use case',
  },
];

export async function runMigrations(db: DatabaseClient): Promise<void> {
  console.log('[Migration] Starting database migrations...');
  console.log('[Migration] Seeding node_type_registry...');

  for (const nodeType of NODE_TYPES) {
    try {
      await db.upsertNodeType(
        nodeType.type_name,
        nodeType.description
      );
    } catch (err) {
      console.warn(
        `[Migration] Failed to upsert node type ${nodeType.type_name}:`,
        err
      );
    }
  }

  console.log('[Migration] Database migrations completed');
}

async function main(): Promise<void> {
  try {
    const db = createDatabaseClient();
    await runMigrations(db);
    console.log('[Migration] Success');
    process.exit(0);
  } catch (error) {
    console.error('[Migration] Failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

