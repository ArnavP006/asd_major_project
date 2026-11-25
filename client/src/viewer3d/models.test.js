import { describe, expect, it } from 'vitest';
import { modelsFor, models } from './models';

describe('models map', () => {
  it('returns model lists with url and credit for registered exhibitions', () => {
    expect(models[1].length).toBeGreaterThan(1);
    for (const item of models[1]) {
      expect(item.url).toMatch(/^\.\/models\/.+\.glb$/);
      expect(item.credit).toBeTruthy();
      expect(item.name).toBeTruthy();
    }
    expect(models[2].length).toBe(2);
    expect(models[3].length).toBe(2);
  });

  it('returns undefined for exhibitions without a model', () => {
    expect(modelsFor(999)).toBeUndefined();
    expect(modelsFor(null)).toBeUndefined();
    expect(modelsFor(undefined)).toBeUndefined();
  });
});
