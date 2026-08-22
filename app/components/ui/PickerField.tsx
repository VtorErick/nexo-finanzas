"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type PickerOption = {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

type PickerFieldProps = {
  value: string;
  options: readonly PickerOption[];
  onChange: (value: string) => void;
  label: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
};

const PICKER_OPEN_EVENT = "nexo:picker-open";

export function PickerField({
  value,
  options,
  onChange,
  label,
  ariaLabel,
  placeholder = "Selecciona una opción",
  disabled = false,
  className = "",
  searchable = options.length > 6,
}: PickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const selected = options.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLocaleLowerCase("es-MX");
  const filteredOptions = normalizedQuery
    ? options.filter((option) => `${option.label} ${option.description ?? ""}`.toLocaleLowerCase("es-MX").includes(normalizedQuery))
    : options;

  useEffect(() => {
    const closePicker = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== headingId) setOpen(false);
    };
    window.addEventListener(PICKER_OPEN_EVENT, closePicker);
    return () => window.removeEventListener(PICKER_OPEN_EVENT, closePicker);
  }, [headingId]);

  useEffect(() => {
    if (!open) return;

    window.dispatchEvent(new CustomEvent(PICKER_OPEN_EVENT, { detail: headingId }));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    const focusTimer = window.setTimeout(() => {
      if (searchable) searchRef.current?.focus();
    }, 40);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [headingId, open, searchable]);

  function closePicker() {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  function selectOption(option: PickerOption) {
    if (option.disabled) return;
    onChange(option.value);
    closePicker();
  }

  return (
    <div className={`picker-field${className ? ` ${className}` : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="picker-trigger"
        aria-label={ariaLabel ?? label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="picker-trigger-value">
          {selected?.icon && <span className="picker-trigger-icon" aria-hidden="true">{selected.icon}</span>}
          <span>{selected?.label ?? placeholder}</span>
        </span>
        <span className="picker-chevron" aria-hidden="true">⌄</span>
      </button>

      {open && createPortal(
        <div className="picker-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) closePicker(); }}>
          <section className="picker-sheet" role="dialog" aria-modal="true" aria-labelledby={headingId}>
            <div className="picker-sheet-heading">
              <div>
                <span className="eyebrow">SELECCIONA</span>
                <h2 id={headingId}>{label}</h2>
                <p>{selected?.label ?? placeholder}</p>
              </div>
              <button type="button" className="picker-close" aria-label={`Cerrar ${label}`} onClick={closePicker}><span aria-hidden="true">×</span></button>
            </div>
            {searchable && (
              <label className="picker-search">
                <span aria-hidden="true">⌕</span>
                <span className="sr-only">Buscar {label}</span>
                <input ref={searchRef} type="search" value={query} placeholder={`Buscar ${label.toLocaleLowerCase("es-MX")}`} onChange={(event) => setQuery(event.target.value)} />
                {query && <button type="button" aria-label="Borrar búsqueda" onClick={() => { setQuery(""); searchRef.current?.focus(); }}>×</button>}
              </label>
            )}
            <div className="picker-option-list" role="listbox" aria-label={label}>
              {filteredOptions.length > 0 ? filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  disabled={option.disabled}
                  className={`picker-option${option.value === value ? " is-selected" : ""}`}
                  onClick={() => selectOption(option)}
                >
                  <span className="picker-option-leading">
                    {option.icon && <span className="picker-option-icon" aria-hidden="true">{option.icon}</span>}
                    <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
                  </span>
                  <span className="picker-option-check" aria-hidden="true">{option.value === value ? "✓" : ""}</span>
                </button>
              )) : <p className="picker-empty">No encontramos opciones con “{query}”.</p>}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
