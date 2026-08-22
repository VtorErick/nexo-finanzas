import type { ReactNode } from "react";

type ViewHeaderProps = {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
  sectionIndex?: number;
  sectionTotal?: number;
  sectionHint?: string;
  end?: ReactNode;
  className?: string;
};

export function ViewHeader({ id, eyebrow, title, description, sectionIndex, sectionTotal = 5, sectionHint, end, className = "" }: ViewHeaderProps) {
  return (
    <section id={id} className={`page-heading view-header ${className}`.trim()}>
      <div className="view-header-copy">
        <span className="eyebrow">{eyebrow}</span>
        {sectionIndex && <div className="view-orientation" aria-label={`Sección ${sectionIndex} de ${sectionTotal}`}><b>{String(sectionIndex).padStart(2, "0")}</b><span>de {String(sectionTotal).padStart(2, "0")}</span>{sectionHint && <small>{sectionHint}</small>}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {end && <div className="heading-meta view-header-end">{end}</div>}
    </section>
  );
}
