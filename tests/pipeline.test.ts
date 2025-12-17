import { describe, it, expect } from '@jest/globals';
import type { PaperInput } from '../src/pipeline/types';

describe('Pipeline types', () => {
  it('defines valid PaperInput structure', () => {
    const validInput: PaperInput = {
      paper_id: 'test-123',
      title: 'Test Paper',
      raw_text: 'Sample text',
      metadata: {},
    };

    expect(validInput.paper_id).toBe('test-123');
    expect(validInput.title).toBe('Test Paper');
  });
});

