"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type ActionMenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
};

type ActionMenuProps = {
  label: string;
  items: ActionMenuItem[];
};

export function ActionMenu({ label, items }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusItem(index: number) {
    const enabledItems = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null && !item.disabled);
    if (enabledItems.length === 0) return;
    const nextIndex = (index + enabledItems.length) % enabledItems.length;
    enabledItems[nextIndex]?.focus();
  }

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      const currentIndex = itemRefs.current.findIndex((item) => item === document.activeElement);
      if (event.key === "ArrowDown") { event.preventDefault(); focusItem(currentIndex + 1); }
      if (event.key === "ArrowUp") { event.preventDefault(); focusItem(currentIndex - 1); }
      if (event.key === "Home") { event.preventDefault(); focusItem(0); }
      if (event.key === "End") { event.preventDefault(); focusItem(itemRefs.current.length - 1); }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    focusItem(0);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="action-menu">
      <button
        ref={triggerRef}
        type="button"
        className="action-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">•••</span>
      </button>
      {open && (
        <div className="action-menu-items" role="menu" aria-label={label}>
          {items.map((item, index) => (
            <button
              ref={(element) => { itemRefs.current[index] = element; }}
              key={item.label}
              type="button"
              role="menuitem"
              className={item.danger ? "danger-link" : undefined}
              disabled={item.disabled}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
