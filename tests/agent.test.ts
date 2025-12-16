import { runAgent } from '../src/agents/runAgent';
import {
  IngestionSchema,
  EntitySchema,
} from '../src/agents/schemas';
import {
  INGESTION_PROMPT,
} from '../src/agents/prompts';
import * as fs from 'fs';
import * as path from 'path';

const samplePaper = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures', 'sample_paper.json'),
    'utf-8'
  )
);

async function runTests(): Promise<void> {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  if (!hasApiKey) {
    console.warn(
      'ANTHROPIC_API_KEY not set - skipping agent integration tests'
    );
    return;
  }

  console.log('Running agent tests...\n');

  console.log('Test 1: Schema validation');
  const validEntity = {
    entities: [
      {
        type: 'method',
        canonical_name: '3D Gaussian Splatting',
        original_confidence: 0.9,
        adjusted_confidence: 0.85,
      },
    ],
  };

  const result = EntitySchema.safeParse(validEntity);
  if (!result.success) {
    console.error('❌ Schema validation failed for valid entity');
    process.exit(1);
  }
  console.log('✅ Schema validation passed\n');

  // Test 2: Ingestion Agent (if API key available)
  console.log('Test 2: Ingestion Agent');
  try {
    const ingested = await runAgent(
      'Ingestion',
      INGESTION_PROMPT,
      JSON.stringify({
        paper_id: samplePaper.paper_id,
        raw_text: samplePaper.raw_text,
        title: samplePaper.title,
        metadata: samplePaper.metadata,
      }),
      IngestionSchema
    );

    if (
      ingested.paper_id === samplePaper.paper_id &&
      ingested.sections.length > 0
    ) {
      console.log(`✅ Ingestion Agent: ${ingested.sections.length} sections extracted\n`);
    } else {
      console.error('❌ Ingestion Agent: Invalid result');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Ingestion Agent failed:', error);
    process.exit(1);
  }

  console.log('All tests passed! ✅');
}

// Run tests
if (require.main === module) {
  runTests().catch((error) => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

