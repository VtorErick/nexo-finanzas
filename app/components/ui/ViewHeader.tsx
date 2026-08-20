import type { ReactNode } from "react";

type ViewHeaderProps = {
  id?: string;
  eyebrow: string;
  title: string;
  description: string;
  end?: ReactNode;
  className?: string;
};

export function ViewHeader({ id, eyebrow, title, description, end, className = "" }: ViewHeaderProps) {
  return (
    <section id={id} className={`page-heading view-header ${className}`.trim()}>
      <div className="view-header-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {end && <div className="heading-meta view-header-end">{end}</div>}
    </section>
  );
}
