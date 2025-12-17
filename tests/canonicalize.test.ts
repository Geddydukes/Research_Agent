import { describe, it, expect } from '@jest/globals';
import { canonicalize, extractAliases } from '../src/utils/canonicalize';

describe('canonicalize', () => {
  it('handles parenthetical aliases', () => {
    expect(canonicalize('3D Gabor Splatting (3DGabSplat)')).toBe('3dgabsplat');
    expect(canonicalize('NeRF (Neural Radiance Fields)')).toBe('neural_radiance_fields');
  });

  it('normalizes whitespace and case', () => {
    expect(canonicalize('  Test   Entity  ')).toBe('test_entity');
    expect(canonicalize('MixedCase Entity')).toBe('mixedcase_entity');
  });

  it('strips punctuation', () => {
    expect(canonicalize('Entity-Name!')).toBe('entity_name');
    expect(canonicalize('Entity: Name?')).toBe('entity_name');
  });

  it('preserves hyphens in tokens', () => {
    expect(canonicalize('3D-Gaussian-Splatting')).toBe('3d_gaussian_splatting');
  });

  it('handles empty and edge cases', () => {
    expect(canonicalize('')).toBe('');
    expect(canonicalize('   ')).toBe('');
  });
});

describe('extractAliases', () => {
  it('extracts parenthetical aliases', () => {
    const aliases = extractAliases('3D Gabor Splatting (3DGabSplat)');
    expect(aliases).toContain('3D Gabor Splatting');
    expect(aliases).toContain('3DGabSplat');
  });

  it('returns single name if no parentheses', () => {
    expect(extractAliases('SimpleName')).toEqual(['SimpleName']);
  });
});
