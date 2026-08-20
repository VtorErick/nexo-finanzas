import type { ReactNode } from "react";

type ContextRailProps = {
  label?: string;
  children: ReactNode;
  live?: "polite" | "off";
};

export function ContextRail({ label = "Contexto de la información", children, live = "off" }: ContextRailProps) {
  return <div className="context-rail" role="region" aria-label={label} aria-live={live}>{children}</div>;
}
