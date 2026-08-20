import type { ReactNode } from "react";

export type PrimaryNavigationItem = {
  id: string;
  label: string;
  icon: ReactNode;
};

type PrimaryNavigationProps = {
  items: PrimaryNavigationItem[];
  activeView: string;
  onNavigate: (view: string) => void;
  theme: "light" | "dark";
  themeIcon: ReactNode;
  backupIcon: ReactNode;
  onToggleTheme: () => void;
  modeLabel: string;
  modeDescription: string;
  isExample: boolean;
  saveStatus?: string;
  onBackup: () => void;
  onNewTransaction: () => void;
};

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true">N</span>;
}

function ThemeButton({ theme, icon, compact, onToggle }: { theme: "light" | "dark"; icon: ReactNode; compact?: boolean; onToggle: () => void }) {
  const nextTheme = theme === "light" ? "oscuro" : "claro";
  return (
    <button
      className={`theme-toggle${compact ? " icon-only" : ""}`}
      type="button"
      aria-label={`Cambiar a tema ${nextTheme}`}
      aria-pressed={theme === "dark"}
      onClick={onToggle}
    >
      <span className="theme-icon" aria-hidden="true">{icon}</span>
      <b>{theme === "light" ? "Oscuro" : "Claro"}</b>
    </button>
  );
}

export function PrimaryNavigation({
  items,
  activeView,
  onNavigate,
  theme,
  themeIcon,
  backupIcon,
  onToggleTheme,
  modeLabel,
  modeDescription,
  isExample,
  saveStatus,
  onBackup,
  onNewTransaction,
}: PrimaryNavigationProps) {
  const activeItem = items.find((item) => item.id === activeView);

  return (
    <>
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => onNavigate("overview")}>
          <BrandMark />
          <span className="brand-text">Nexo<small>finanzas personales</small></span>
        </button>
        <nav className="side-nav" aria-label="Navegación principal">
          {items.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={activeView === item.id ? "active" : ""}
              aria-current={activeView === item.id ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              {item.icon}<span className="nav-label">{item.label}</span><span className="nav-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot" aria-label="Acciones de la aplicación">
          <div className="sidebar-status">
            <span className={`private-pill ${isExample ? "example" : ""}`}><i /> {modeLabel}</span>
            <small>{modeDescription}</small>
            {saveStatus && <span className="save-status"><i className="status-dot green" /> {saveStatus}</span>}
          </div>
          <div className="sidebar-foot-row">
            <ThemeButton theme={theme} icon={themeIcon} onToggle={onToggleTheme} />
            <button className="backup-button" type="button" aria-label="Abrir respaldo de datos" onClick={onBackup}>{backupIcon}<span>Respaldo</span></button>
          </div>
          <button className="primary-button edit-balances-button" type="button" onClick={onNewTransaction}>+ Movimiento</button>
        </div>
      </aside>

      <header className="mobile-topbar" aria-label="Navegación móvil">
        <button className="brand" type="button" onClick={() => onNavigate("overview")}>
          <BrandMark />
          <span className="brand-text">Nexo</span>
        </button>
        <span className="mobile-view-label" aria-live="polite">{activeItem?.label}</span>
        <div className="top-actions">
          <ThemeButton theme={theme} icon={themeIcon} compact onToggle={onToggleTheme} />
          <button className="primary-button edit-balances-button" type="button" aria-label="Registrar movimiento" onClick={onNewTransaction}>
            <span className="label-full">+ Movimiento</span>
            <span className="label-short" aria-hidden="true">+</span>
          </button>
        </div>
      </header>

      <nav className="tab-bar" aria-label="Navegación de secciones">
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            className={activeView === item.id ? "active" : ""}
            aria-current={activeView === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {item.icon}<span>{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
