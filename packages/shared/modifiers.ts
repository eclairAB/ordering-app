export interface ModifierRules {
  id: number;
  name: string;
  min: number;
  max: number;
  modifiers: { id: number }[];
}

/**
 * Check a set of chosen modifier ids against an item's groups.
 * Returns human-readable problems; an empty array means the selection is valid.
 * The server always runs this; the UI may run it too for early feedback.
 */
export function modifierSelectionProblems(
  groups: readonly ModifierRules[],
  chosenIds: readonly number[],
): string[] {
  const problems: string[] = [];
  const known = new Set<number>();

  for (const group of groups) {
    const ids = new Set(group.modifiers.map((m) => m.id));
    for (const id of ids) known.add(id);
    const count = chosenIds.filter((id) => ids.has(id)).length;
    if (count < group.min) {
      problems.push(`Choose at least ${group.min} for "${group.name}"`);
    } else if (count > group.max) {
      problems.push(`Choose at most ${group.max} for "${group.name}"`);
    }
  }

  const unknown = chosenIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    problems.push(`Unknown option(s) for this item: ${unknown.join(', ')}`);
  }
  return problems;
}
