type NextBestActionProps = {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  tone?: "accent" | "neutral";
};

export function NextBestAction({ title, description, actionLabel, onAction, tone = "accent" }: NextBestActionProps) {
  return (
    <aside className={`next-best-action next-best-action-${tone}`} aria-label="Siguiente mejor acción">
      <div>
        <span className="eyebrow">SIGUIENTE PASO</span>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <button type="button" className="text-button" onClick={onAction}>
        {actionLabel} <span aria-hidden="true">→</span>
      </button>
    </aside>
  );
}
