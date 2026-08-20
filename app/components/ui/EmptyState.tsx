import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
};

export function EmptyState({ icon = "·", title, description, actions, className = "" }: EmptyStateProps) {
  return (
    <div className={`empty-state ${className}`.trim()}>
      <span aria-hidden="true">{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
        {actions && <div className="empty-state-actions">{actions}</div>}
      </div>
    </div>
  );
}
