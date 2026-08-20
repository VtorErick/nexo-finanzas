import type { ReactNode } from "react";

export type FilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

type FilterChipsProps = {
  chips: FilterChip[];
  onClear: () => void;
  clearLabel?: string;
  leading?: ReactNode;
};

export function FilterChips({ chips, onClear, clearLabel = "Limpiar filtros", leading }: FilterChipsProps) {
  if (chips.length === 0 && !leading) return null;

  return (
    <div className="filter-chips" aria-label="Filtros activos">
      {leading}
      {chips.map((chip) => (
        <button type="button" className="filter-chip" key={chip.id} onClick={chip.onRemove}>
          <span>{chip.label}</span>
          <span aria-hidden="true">×</span>
        </button>
      ))}
      {chips.length > 0 && <button type="button" className="filter-clear-button" onClick={onClear}>{clearLabel}</button>}
    </div>
  );
}
