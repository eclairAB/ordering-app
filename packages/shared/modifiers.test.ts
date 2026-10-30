import { describe, expect, it } from 'vitest';
import { modifierSelectionProblems } from './modifiers.ts';

const groups = [
  { id: 1, name: 'Size', min: 1, max: 1, modifiers: [{ id: 10 }, { id: 11 }] },
  { id: 2, name: 'Milk', min: 0, max: 1, modifiers: [{ id: 20 }, { id: 21 }] },
];

describe('modifierSelectionProblems', () => {
  it('accepts a valid selection', () => {
    expect(modifierSelectionProblems(groups, [10])).toEqual([]);
    expect(modifierSelectionProblems(groups, [11, 21])).toEqual([]);
  });

  it('enforces min and max per group', () => {
    expect(modifierSelectionProblems(groups, [])).toEqual(['Choose at least 1 for "Size"']);
    expect(modifierSelectionProblems(groups, [10, 20, 21])).toEqual([
      'Choose at most 1 for "Milk"',
    ]);
  });

  it('rejects modifiers that belong to another item', () => {
    expect(modifierSelectionProblems(groups, [10, 99])).toEqual([
      'Unknown option(s) for this item: 99',
    ]);
  });
});
