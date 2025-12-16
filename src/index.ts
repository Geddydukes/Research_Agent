import 'dotenv/config';
import { runPipeline } from './pipeline/runPipeline';
import { createDatabaseClient } from './db/client';
import { parsePaperFile } from './utils/paperParser';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: npm run dev <path-to-paper>');
    console.error('Supported formats: .pdf, .docx, .json');
    console.error('Example: npm run dev papers/my-paper.pdf');
    process.exit(1);
  }

  const paperPath = args[0];
  let paperInput;

  try {
    paperInput = await parsePaperFile(paperPath);
  } catch (error) {
    console.error(`Failed to parse paper file: ${paperPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  try {
    const db = createDatabaseClient();
    const result = await runPipeline(paperInput, db);

    if (result.success) {
      console.log('Pipeline completed successfully!');
      console.log('Stats:', result.stats);
    } else {
      console.error('Pipeline failed:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { runPipeline } from './pipeline/runPipeline';
export { createDatabaseClient } from './db/client';
export * from './agents/schemas';
export * from './pipeline/types';

