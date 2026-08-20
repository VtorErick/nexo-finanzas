import { forwardRef, type MouseEvent, type ReactNode } from "react";

type ModalShellProps = {
  children: ReactNode;
  className: string;
  backdropClassName?: string;
  role?: "dialog" | "alertdialog";
  labelledBy: string;
  describedBy?: string;
  onBackdropClick?: (event: MouseEvent<HTMLDivElement>) => void;
};

export const ModalShell = forwardRef<HTMLElement, ModalShellProps>(function ModalShell(
  {
    children,
    className,
    backdropClassName = "",
    role = "dialog",
    labelledBy,
    describedBy,
    onBackdropClick,
  },
  ref,
) {
  return (
    <div
      className={`modal-backdrop ${backdropClassName}`.trim()}
      role="presentation"
      onClick={onBackdropClick}
    >
      <section
        ref={ref}
        className={className}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
});
