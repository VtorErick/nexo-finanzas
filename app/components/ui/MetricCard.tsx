import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  valueLabel?: string;
  icon?: ReactNode;
  tone?: "reserve" | "cash" | "investment" | "neutral";
  className?: string;
};

export function MetricCard({ label, value, detail, valueLabel, icon, tone = "neutral", className = "" }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card-${tone} ${className}`.trim()}>
      <div className="metric-card-heading">
        {icon && <span className="metric-card-icon" aria-hidden="true">{icon}</span>}
        <span className="metric-card-label">{label}</span>
      </div>
      <strong className="metric-card-value" aria-label={valueLabel}>{value}</strong>
      <small className="metric-card-detail">{detail}</small>
    </article>
  );
}
