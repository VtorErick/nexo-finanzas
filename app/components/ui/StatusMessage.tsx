import type { ReactNode } from "react";

type StatusMessageProps = {
  tone?: "success" | "warning" | "error" | "info";
  title?: string;
  children: ReactNode;
  live?: "polite" | "assertive" | "off";
};

export function StatusMessage({ tone = "info", title, children, live = "polite" }: StatusMessageProps) {
  return (
    <div className={`status-message status-message-${tone}`} role={live === "off" ? undefined : "status"} aria-live={live === "off" ? undefined : live}>
      <span className="status-message-mark" aria-hidden="true">{tone === "success" ? "✓" : tone === "warning" ? "!" : tone === "error" ? "×" : "i"}</span>
      <div>
        {title && <strong>{title}</strong>}
        <span>{children}</span>
      </div>
    </div>
  );
}
