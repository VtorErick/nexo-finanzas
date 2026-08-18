export type CategoryIconName = "food" | "home" | "car" | "services" | "health" | "shopping" | "education" | "entertainment" | "travel" | "work" | "shield" | "trend" | "wallet" | "general";

export type TransactionCategory = {
  id: string;
  label: string;
  icon: CategoryIconName;
  custom?: boolean;
};

export const DEFAULT_TRANSACTION_CATEGORIES: TransactionCategory[] = [
  { id: "general", label: "General", icon: "general" },
  { id: "alimentos", label: "Alimentos", icon: "food" },
  { id: "vivienda", label: "Vivienda", icon: "home" },
  { id: "transporte", label: "Transporte", icon: "car" },
  { id: "servicios", label: "Servicios", icon: "services" },
  { id: "salud", label: "Salud", icon: "health" },
  { id: "compras", label: "Compras", icon: "shopping" },
  { id: "educacion", label: "Educación", icon: "education" },
  { id: "entretenimiento", label: "Entretenimiento", icon: "entertainment" },
  { id: "viajes", label: "Viajes", icon: "travel" },
  { id: "trabajo", label: "Trabajo", icon: "work" },
  { id: "ingreso", label: "Ingreso", icon: "wallet" },
  { id: "ahorro", label: "Ahorro", icon: "shield" },
  { id: "inversion", label: "Inversión", icon: "trend" },
  { id: "transferencia", label: "Transferencia", icon: "wallet" },
];

export const CATEGORY_ICON_OPTIONS: Array<{ id: CategoryIconName; label: string }> = [
  { id: "food", label: "Alimentos" },
  { id: "home", label: "Vivienda" },
  { id: "car", label: "Transporte" },
  { id: "services", label: "Servicios" },
  { id: "health", label: "Salud" },
  { id: "shopping", label: "Compras" },
  { id: "education", label: "Educación" },
  { id: "entertainment", label: "Entretenimiento" },
  { id: "travel", label: "Viajes" },
  { id: "work", label: "Trabajo" },
  { id: "shield", label: "Ahorro" },
  { id: "trend", label: "Inversión" },
  { id: "wallet", label: "Dinero" },
  { id: "general", label: "General" },
];
