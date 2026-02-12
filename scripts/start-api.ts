import 'dotenv/config';
import { start } from '../src/api/server';

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
