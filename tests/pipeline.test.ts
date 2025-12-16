import { runPipeline } from '../src/pipeline/runPipeline';
import { createDatabaseClient } from '../src/db/client';
import * as fs from 'fs';
import * as path from 'path';

const samplePaper = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures', 'sample_paper.json'),
    'utf-8'
  )
);

async function runPipelineTests(): Promise<void> {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  const hasDb = !!(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!hasApiKey) {
    console.warn(
      'ANTHROPIC_API_KEY not set - skipping pipeline integration tests'
    );
    return;
  }

  if (!hasDb) {
    console.warn(
      'Database credentials not set - skipping pipeline integration tests'
    );
    return;
  }

  console.log('Running pipeline tests...\n');

  try {
    const db = createDatabaseClient();
    const result = await runPipeline(
      {
        paper_id: samplePaper.paper_id,
        title: samplePaper.title,
        raw_text: samplePaper.raw_text,
        metadata: samplePaper.metadata,
      },
      db
    );

    if (result.success && result.stats) {
      console.log('✅ Pipeline completed successfully');
      console.log('Stats:', result.stats);
    } else {
      console.error('❌ Pipeline failed:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Pipeline test failed:', error);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runPipelineTests().catch((error) => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

