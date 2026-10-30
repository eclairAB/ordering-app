import type { MenuItem, ModifierGroup } from '@ordering/shared';
import { modifierSelectionProblems } from '@ordering/shared/modifiers';
import { formatCentavos, lineTotalCentavos } from '@ordering/shared/money';
import { useState } from 'react';
import { newIdempotencyKey } from '../api.ts';
import type { CartLine } from '../cart.ts';
import { Sheet } from './Sheet.tsx';

interface Props {
  item: MenuItem;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}

/** Pre-select the first option of every "pick exactly one" group (e.g. Size). */
function defaultSelection(groups: ModifierGroup[]): number[] {
  return groups.flatMap((g) => (g.min === 1 && g.max === 1 && g.modifiers[0] ? [g.modifiers[0].id] : []));
}

function deltaLabel(delta: number): string {
  if (delta === 0) return '';
  return delta > 0 ? `+${formatCentavos(delta)}` : `−${formatCentavos(-delta)}`;
}

export function ItemSheet({ item, onClose, onAdd }: Props) {
  const [chosen, setChosen] = useState<number[]>(() => defaultSelection(item.modifierGroups));
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  const toggle = (group: ModifierGroup, id: number) => {
    const groupIds = new Set(group.modifiers.map((m) => m.id));
    if (group.max === 1) {
      const isOn = chosen.includes(id);
      const others = chosen.filter((c) => !groupIds.has(c));
      setChosen(isOn && group.min === 0 ? others : [...others, id]);
      return;
    }
    if (chosen.includes(id)) {
      setChosen(chosen.filter((c) => c !== id));
    } else if (chosen.filter((c) => groupIds.has(c)).length < group.max) {
      setChosen([...chosen, id]);
    }
  };

  const allModifiers = item.modifierGroups.flatMap((g) => g.modifiers);
  const total = lineTotalCentavos({
    unitPriceCentavos: item.priceCentavos,
    modifierDeltasCentavos: allModifiers.filter((m) => chosen.includes(m.id)).map((m) => m.priceDeltaCentavos),
    qty,
  });
  const problems = modifierSelectionProblems(item.modifierGroups, chosen);

  return (
    <Sheet onClose={onClose} label={item.name}>
      {item.imageUrl && <img className="sheet-image" src={item.imageUrl} alt="" />}
      <div className="sheet-body">
        <h2>{item.name}</h2>
        <p className="muted">{item.description}</p>

        {item.modifierGroups.map((group) => (
          <fieldset key={group.id} className="modifier-group">
            <legend>
              {group.name}
              <span className="muted small">
                {group.min > 0 ? ' · required' : ' · optional'}
                {group.max > 1 ? ` · up to ${group.max}` : ''}
              </span>
            </legend>
            {group.modifiers.map((m) => (
              <label key={m.id} className="option">
                <input
                  type={group.max === 1 ? 'radio' : 'checkbox'}
                  name={`group-${group.id}`}
                  checked={chosen.includes(m.id)}
                  onChange={() => toggle(group, m.id)}
                  onClick={() => {
                    // Radios can't normally be unticked; allow it for optional groups.
                    if (group.max === 1 && group.min === 0 && chosen.includes(m.id)) toggle(group, m.id);
                  }}
                />
                <span>{m.name}</span>
                <span className="muted">{deltaLabel(m.priceDeltaCentavos)}</span>
              </label>
            ))}
          </fieldset>
        ))}

        <label className="field">
          <span>Notes for the kitchen</span>
          <input
            value={notes}
            maxLength={200}
            placeholder="e.g. less ice"
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </div>

      <footer className="sheet-footer">
        <div className="stepper" aria-label="Quantity">
          <button className="icon-button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Fewer">
            −
          </button>
          <span>{qty}</span>
          <button className="icon-button" onClick={() => setQty(Math.min(50, qty + 1))} aria-label="More">
            +
          </button>
        </div>
        <button
          className="button button-primary grow"
          disabled={problems.length > 0}
          title={problems.join('\n')}
          onClick={() => onAdd({ id: newIdempotencyKey(), itemId: item.id, qty, modifierIds: chosen, notes })}
        >
          Add · {formatCentavos(total)}
        </button>
      </footer>
    </Sheet>
  );
}
