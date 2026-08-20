import type { ReactNode } from "react";

type ContextRailProps = {
  label?: string;
  children: ReactNode;
};

export function ContextRail({ label = "Contexto de la información", children }: ContextRailProps) {
  return <div className="context-rail" aria-label={label}>{children}</div>;
}
