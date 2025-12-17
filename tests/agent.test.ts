import { describe, it, expect } from '@jest/globals';
import { EntitySchema } from '../src/agents/schemas';

describe('Agent schemas', () => {
  it('validates entity schema correctly', () => {
    const validEntity = {
      entities: [
        {
          type: 'method',
          canonical_name: '3D Gaussian Splatting',
          original_confidence: 0.9,
        },
      ],
    };

    const result = EntitySchema.safeParse(validEntity);
    expect(result.success).toBe(true);
  });
});

