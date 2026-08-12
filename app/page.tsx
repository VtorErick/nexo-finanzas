"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { captureNexoScreenshots, exportNexoWorkbook, importNexoWorkbook } from "./lib/nexo-workbook";

const DEFAULT_TARGET = 150000;
const DEFAULT_MONTHLY_EXPENSES = 25000;
const DEFAULT_YEARS = 5;
const RESERVE_RETURN = 10;
const GBM_RETURN = 11;
const DEFAULT_INFLATION = 3.75;
const MAX_YEARS = 30;
const STORAGE_PREFIX = "nexo-finanzas";
const STORAGE_KEY = "nexo-finanzas-demo-v5";
const THEME_KEY = "nexo-theme";
const MEXICO_TIME_ZONE = "America/Mexico_City";

type AccountGroup = "reserve" | "investment" | "cash";
type Account = {
  id: string;
  label: string;
  amount: number;
  amountText?: string;
  rate: string;
  group: AccountGroup;
  note: string;
};
type EventTone = "blue" | "green" | "orange" | "red";
type EventRecurrence = "none" | "weekly" | "monthly" | "annual";
type MovementKind = "expense" | "income" | "transfer" | "contribution";
type ProjectionDestination = "none" | "cetes" | "gbm";
type DataMode = "example" | "imported";
type Theme = "light" | "dark";
type CalendarEvent = {
  id: number;
  date: string;
  title: string;
  amount: string;
  detail: string;
  numericAmount: number;
  tone: EventTone;
  kind: MovementKind;
  destination: ProjectionDestination;
  includeInProjection: boolean;
  recurrence: EventRecurrence;
  recurrenceEnd: string | null;
  completedDates: string[];
  skippedDates: string[];
};
type CalendarOccurrence = CalendarEvent & { sourceId: number; occurrenceKey: string };
type ExtraIncome = {
  id: number;
  enabled: boolean;
  amount: number;
  amountText?: string;
  recurring: boolean;
  frequency: "monthly" | "annual";
  destination: "cetes" | "gbm";
  startMonth: number;
  endMonth: number | null;
  monthOfYear: number;
  oneTimeMonth: number;
};

const DEFAULT_ACCOUNTS: Account[] = [
  { id: "demo-daily", label: "Cuenta diaria", amount: 18500, rate: "0% · liquidez inmediata", group: "cash", note: "Ejemplo para gastos del mes" },
  { id: "demo-emergency", label: "Ahorro de emergencia", amount: 72000, rate: "8% anual estimado", group: "reserve", note: "Ejemplo de reserva disponible" },
  { id: "demo-cetes", label: "CETES de ejemplo", amount: 45000, rate: "10% anual estimado", group: "reserve", note: "Ejemplo de ahorro de corto plazo" },
  { id: "demo-index", label: "Inversión indexada", amount: 90000, rate: "11% anual estimado", group: "investment", note: "Ejemplo de inversión de largo plazo" },
];

const DEFAULT_EMERGENCY_IDS = ["demo-emergency", "demo-cetes"];

const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const plainNumber = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const formatMoney = (value: number) => money.format(value);
const formatNumberInput = (value: number) => plainNumber.format(Math.max(0, Math.round(value)));
const parseMoneyInput = (value: string) => {
  const normalized = value.replace(/[^\d.-]/g, "");
  return normalized === "" ? 0 : Math.max(0, Number(normalized) || 0);
};
const formatCompact = (value: number) => {
  const absolute = Math.abs(value);
  const divisor = absolute >= 1000000 ? 1000000 : absolute >= 1000 ? 1000 : 1;
  const suffix = divisor === 1000000 ? " M" : divisor === 1000 ? " k" : "";
  const scaled = value / divisor;
  const digits = Math.abs(scaled) < 10 && !Number.isInteger(scaled) ? 1 : 0;
  return `$${scaled.toFixed(digits)}${suffix}`;
};

function getMexicoToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MEXICO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Number(values.year), Number(values.month) - 1, Number(values.day), 12);
}

function getNexoStorageKeys() {
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  return keys;
}

function formatHeadingDate(date: Date) {
  return date.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: MEXICO_TIME_ZONE,
  }).toLocaleUpperCase("es-MX");
}

function formatDurationMonths(months: number | null) {
  if (!months) return "Meta fuera del horizonte";
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years === 0) return `${remainingMonths} ${remainingMonths === 1 ? "mes" : "meses"}`;
  if (remainingMonths === 0) return `${years} ${years === 1 ? "año" : "años"}`;
  return `${years} ${years === 1 ? "año" : "años"} y ${remainingMonths} ${remainingMonths === 1 ? "mes" : "meses"}`;
}

function movementKindLabel(kind: MovementKind) {
  if (kind === "expense") return "Gasto";
  if (kind === "income") return "Ingreso";
  if (kind === "contribution") return "Aportación";
  return "Transferencia";
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateAfter(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return toIsoDate(result);
}

function createExampleExtras(today: Date): ExtraIncome[] {
  return [{
    id: 1,
    enabled: true,
    amount: 2500,
    recurring: true,
    frequency: "monthly",
    destination: "gbm",
    startMonth: 1,
    endMonth: null,
    monthOfYear: today.getMonth() + 1,
    oneTimeMonth: 1,
  }];
}

function createExampleEvents(today: Date): CalendarEvent[] {
  return [
    { id: 1, date: dateAfter(today, 3), title: "Aportación mensual", amount: "$3,000", detail: "Ejemplo para inversión", numericAmount: 3000, tone: "green", kind: "contribution", destination: "gbm", includeInProjection: true, recurrence: "monthly", recurrenceEnd: null, completedDates: [], skippedDates: [] },
    { id: 2, date: dateAfter(today, 7), title: "Pago de servicios", amount: "$2,200", detail: "Movimiento recurrente de ejemplo", numericAmount: 2200, tone: "red", kind: "expense", destination: "none", includeInProjection: false, recurrence: "monthly", recurrenceEnd: null, completedDates: [], skippedDates: [] },
    { id: 3, date: dateAfter(today, 15), title: "Ingreso de ejemplo", amount: "$6,000", detail: "Ingreso extraordinario ficticio", numericAmount: 6000, tone: "blue", kind: "income", destination: "cetes", includeInProjection: true, recurrence: "none", recurrenceEnd: null, completedDates: [], skippedDates: [] },
  ];
}

function dayNumber(date: Date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

function recurrenceLabel(recurrence: EventRecurrence) {
  if (recurrence === "weekly") return "Cada semana";
  if (recurrence === "monthly") return "Cada mes";
  if (recurrence === "annual") return "Cada año";
  return "Una vez";
}

function occurrenceFromEvent(event: CalendarEvent, date: Date): CalendarOccurrence {
  const occurrenceDate = toIsoDate(date);
  return { ...event, date: occurrenceDate, sourceId: event.id, occurrenceKey: `${event.id}-${occurrenceDate}` };
}

function normalizeEvent(event: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "date" | "title">): CalendarEvent {
  const numericAmount = typeof event.numericAmount === "number" ? event.numericAmount : parseMoneyInput(event.amount ?? "");
  const legacyDetail = numericAmount > 0 ? "" : event.amount ?? "";
  return {
    id: event.id,
    date: event.date,
    title: event.title,
    amount: event.amount ?? (numericAmount > 0 ? formatMoney(numericAmount) : "$0"),
    detail: event.detail ?? legacyDetail,
    numericAmount,
    tone: event.tone ?? "blue",
    kind: event.kind ?? "transfer",
    destination: event.destination ?? "none",
    includeInProjection: event.includeInProjection ?? false,
    recurrence: event.recurrence ?? "none",
    recurrenceEnd: event.recurrenceEnd ?? null,
    completedDates: Array.isArray(event.completedDates) ? event.completedDates : [],
    skippedDates: Array.isArray(event.skippedDates) ? event.skippedDates : [],
  };
}

function getEventOccurrences(events: CalendarEvent[], month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const monthStart = new Date(year, monthIndex, 1, 12);
  const monthEnd = new Date(year, monthIndex + 1, 0, 12);
  const occurrences: CalendarOccurrence[] = [];

  events.forEach((event) => {
    const start = parseIsoDate(event.date);
    const end = event.recurrenceEnd ? parseIsoDate(event.recurrenceEnd) : null;
    if (end && end < monthStart) return;

    if (event.recurrence === "none") {
      if (start >= monthStart && start <= monthEnd && !event.skippedDates.includes(event.date)) occurrences.push(occurrenceFromEvent(event, start));
      return;
    }

    if (event.recurrence === "weekly") {
      const searchStart = start > monthStart ? start : monthStart;
      const elapsedDays = dayNumber(searchStart) - dayNumber(start);
      const offset = (7 - (elapsedDays % 7)) % 7;
      const occurrence = new Date(searchStart);
      occurrence.setDate(occurrence.getDate() + offset);
      while (occurrence <= monthEnd && (!end || occurrence <= end)) {
        const occurrenceDate = toIsoDate(occurrence);
        if (!event.skippedDates.includes(occurrenceDate)) occurrences.push(occurrenceFromEvent(event, occurrence));
        occurrence.setDate(occurrence.getDate() + 7);
      }
      return;
    }

    if (event.recurrence === "monthly") {
      const monthDifference = (year - start.getFullYear()) * 12 + monthIndex - start.getMonth();
      if (monthDifference < 0) return;
      const day = Math.min(start.getDate(), monthEnd.getDate());
      const occurrence = new Date(year, monthIndex, day, 12);
      if (occurrence >= start && (!end || occurrence <= end) && !event.skippedDates.includes(toIsoDate(occurrence))) occurrences.push(occurrenceFromEvent(event, occurrence));
      return;
    }

    if (year < start.getFullYear() || monthIndex !== start.getMonth()) return;
    const day = Math.min(start.getDate(), monthEnd.getDate());
    const occurrence = new Date(year, monthIndex, day, 12);
    if (occurrence >= start && (!end || occurrence <= end) && !event.skippedDates.includes(toIsoDate(occurrence))) occurrences.push(occurrenceFromEvent(event, occurrence));
  });

  return occurrences.sort((a, b) => a.date.localeCompare(b.date));
}

function sumAccounts(accounts: Account[], group?: AccountGroup) {
  return accounts
    .filter((account) => !group || account.group === group)
    .reduce((total, account) => total + account.amount, 0);
}

function selectedTotal(accounts: Account[], ids: string[]) {
  return accounts
    .filter((account) => ids.includes(account.id))
    .reduce((total, account) => total + account.amount, 0);
}

function monthInputForIndex(index: number, baseDate: Date) {
  const date = new Date(baseDate.getFullYear(), baseDate.getMonth() + index - 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthIndexFromInput(value: string, baseDate: Date) {
  if (!/^\d{4}-\d{2}$/.test(value)) return 1;
  const [year, month] = value.split("-").map(Number);
  return Math.max(1, (year - baseDate.getFullYear()) * 12 + month - (baseDate.getMonth() + 1) + 1);
}

function monthLabelForIndex(index: number, baseDate: Date) {
  const date = new Date(baseDate.getFullYear(), baseDate.getMonth() + index - 1, 1);
  return date.toLocaleDateString("es-MX", { month: "short", year: "numeric" }).replace(".", "");
}

function buildProjection(
  years: number,
  startingReserve: number,
  startingGbm: number,
  reserveRate: number,
  gbmRate: number,
  extras: ExtraIncome[],
  events: CalendarEvent[],
  target: number,
  baseDate: Date,
) {
  const reserveMonthlyReturn = reserveRate / 100 / 12;
  const gbmMonthlyReturn = gbmRate / 100 / 12;
  const points = [{ month: 0, reserve: startingReserve, gbm: startingGbm }];
  let reserve = startingReserve;
  let gbm = startingGbm;
  let goalMonth: number | null = null;
  let netContributions = 0;
  const baseIso = toIsoDate(baseDate);

  for (let month = 1; month <= years * 12; month += 1) {
    const projectedMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + month - 1, 1, 12);
    const monthOfYear = projectedMonth.getMonth() + 1;
    const dueExtras = extras.filter((extra) => {
      if (!extra.enabled) return false;
      if (!extra.recurring) return month === extra.oneTimeMonth;
      if (extra.frequency === "annual") return monthOfYear === extra.monthOfYear;
      return month >= extra.startMonth && (extra.endMonth === null || month <= extra.endMonth);
    });
    const extraToReserve = dueExtras
      .filter((extra) => extra.destination === "cetes")
      .reduce((total, extra) => total + extra.amount, 0);
    const extraToGbm = dueExtras
      .filter((extra) => extra.destination === "gbm")
      .reduce((total, extra) => total + extra.amount, 0);

    const projectedMovements = getEventOccurrences(events.filter((event) => event.includeInProjection), projectedMonth)
      .filter((event) => event.date >= baseIso && !event.completedDates.includes(event.date));
    const movementValue = (event: CalendarOccurrence) => event.kind === "expense" ? -event.numericAmount : event.kind === "transfer" ? 0 : event.numericAmount;
    const movementToReserve = projectedMovements
      .filter((event) => event.destination === "cetes")
      .reduce((total, event) => total + movementValue(event), 0);
    const movementToGbm = projectedMovements
      .filter((event) => event.destination === "gbm")
      .reduce((total, event) => total + movementValue(event), 0);

    reserve = Math.max(0, reserve * (1 + reserveMonthlyReturn) + extraToReserve + movementToReserve);
    gbm = Math.max(0, gbm * (1 + gbmMonthlyReturn) + extraToGbm + movementToGbm);
    netContributions += extraToReserve + extraToGbm + movementToReserve + movementToGbm;
    if (!goalMonth && reserve >= target) goalMonth = month;
    points.push({ month, reserve, gbm });
  }

  return { points, goalMonth, netContributions };
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true">N</span>;
}

function GoalRing({ progress }: { progress: number }) {
  return (
    <div className="goal-ring" style={{ "--progress": `${progress * 3.6}deg` } as CSSProperties}>
      <div><strong>{progress}%</strong><span>completado</span></div>
    </div>
  );
}

function ProjectionChart({
  points,
  goalMonth,
  years,
  target,
  baseDate,
}: {
  points: Array<{ month: number; reserve: number; gbm: number; realTotal: number }>;
  goalMonth: number | null;
  years: number;
  target: number;
  baseDate: Date;
}) {
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const width = 920;
  const height = 310;
  const padding = { top: 22, right: 18, bottom: 38, left: 62 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...points.map((point) => Math.max(point.reserve, point.gbm, point.realTotal)));
  const scaleStep = maxValue > 500000 ? 100000 : 50000;
  const maxY = Math.max(target * 1.15, scaleStep, Math.ceil(maxValue / scaleStep) * scaleStep);
  const x = (month: number) => padding.left + (month / (points.length - 1)) * chartWidth;
  const y = (value: number) => padding.top + chartHeight - (value / maxY) * chartHeight;
  const pathFor = (key: "reserve" | "gbm" | "realTotal") =>
    points.map((point, index) => `${index ? "L" : "M"} ${x(point.month).toFixed(2)} ${y(point[key]).toFixed(2)}`).join(" ");
  const hoveredPoint = hoveredMonth === null ? null : points[hoveredMonth];
  const labelStep = years <= 10 ? 1 : years <= 20 ? 2 : 5;
  const xLabels = Array.from({ length: years + 1 }, (_, year) => year)
    .filter((year) => year === 0 || year === years || year % labelStep === 0)
    .map((year) => (
      <text key={year} x={x(year * 12)} y={height - 11} textAnchor="middle">{year === 0 ? "Hoy" : `${year}a`}</text>
    ));

  const handleMove = (event: ReactPointerEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX = Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width);
    setHoveredMonth(Math.round((relativeX / bounds.width) * (points.length - 1)));
  };

  return (
    <div className="chart-shell">
      <div className="chart-legend">
        <span><i className="legend-line reserve-line" /><span>Reserva nominal<b>{formatMoney(points.at(-1)!.reserve)}</b></span></span>
        <span><i className="legend-line gbm-line" /><span>Inversión nominal<b>{formatMoney(points.at(-1)!.gbm)}</b></span></span>
        <span><i className="legend-line real-line" /><span>Patrimonio en pesos de hoy<b>{formatMoney(points.at(-1)!.realTotal)}</b></span></span>
        {goalMonth && <span><i className="legend-marker" /> Meta en {formatDurationMonths(goalMonth)}</span>}
      </div>
      <div className="chart-frame">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Comparación de reserva nominal, inversión nominal y patrimonio total en pesos de hoy">
          <g className="chart-grid">
            {[0, 1, 2, 3, 4].map((tick) => {
              const value = (maxY / 4) * tick;
              return (
                <g key={value}>
                  <line x1={padding.left} x2={width - padding.right} y1={y(value)} y2={y(value)} />
                  <text x={padding.left - 12} y={y(value) + 4} textAnchor="end">{formatCompact(value)}</text>
                </g>
              );
            })}
            {xLabels}
          </g>
          <path className="chart-area real-area" d={`${pathFor("realTotal")} L ${x(points.at(-1)!.month)} ${y(0)} L ${x(0)} ${y(0)} Z`} />
          <line className="target-line" x1={padding.left} x2={width - padding.right} y1={y(target)} y2={y(target)} />
          <text className="target-label" x={width - padding.right} y={y(target) - 8} textAnchor="end">Meta {formatCompact(target)}</text>
          {goalMonth && <line className="goal-line" x1={x(goalMonth)} x2={x(goalMonth)} y1={padding.top} y2={height - padding.bottom} />}
          <path className="chart-line reserve-stroke" d={pathFor("reserve")} />
          <path className="chart-line gbm-stroke" d={pathFor("gbm")} />
          <path className="chart-line real-stroke" d={pathFor("realTotal")} />
          {hoveredPoint && (
            <g className="hover-point" aria-hidden="true">
              <line x1={x(hoveredPoint.month)} x2={x(hoveredPoint.month)} y1={padding.top} y2={height - padding.bottom} />
              <circle className="marker-reserve" cx={x(hoveredPoint.month)} cy={y(hoveredPoint.reserve)} r="5" />
              <rect className="marker-investment" x={x(hoveredPoint.month) - 5} y={y(hoveredPoint.gbm) - 5} width="10" height="10" rx="1" />
              <rect className="marker-real" x={x(hoveredPoint.month) - 4.5} y={y(hoveredPoint.realTotal) - 4.5} width="9" height="9" transform={`rotate(45 ${x(hoveredPoint.month)} ${y(hoveredPoint.realTotal)})`} />
            </g>
          )}
          <rect className="chart-hitbox" x={padding.left} y={padding.top} width={chartWidth} height={chartHeight} onPointerMove={handleMove} onPointerDown={handleMove} onPointerLeave={() => setHoveredMonth(null)} />
        </svg>
        {hoveredPoint && (
          <div className="chart-tooltip" style={{ left: `${(x(hoveredPoint.month) / width) * 100}%` }}>
            <b>{hoveredPoint.month === 0 ? "Hoy" : monthLabelForIndex(hoveredPoint.month, baseDate)}</b>
            <span><i className="tooltip-dot reserve" /> Reserva nominal {formatMoney(hoveredPoint.reserve)}</span>
            <span><i className="tooltip-dot investment" /> Inversión nominal {formatMoney(hoveredPoint.gbm)}</span>
            <span><i className="tooltip-dot real" /> Pesos de hoy {formatMoney(hoveredPoint.realTotal)}</span>
            <small>Total nominal {formatMoney(hoveredPoint.reserve + hoveredPoint.gbm)}</small>
          </div>
        )}
      </div>
    </div>
  );
}

function Calendar({ month, onMonthChange, events, today }: { month: Date; onMonthChange: (delta: number) => void; events: CalendarOccurrence[]; today: Date }) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDay = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const eventMap = new Map<number, CalendarOccurrence[]>();
  events.forEach((event) => {
    const eventDate = new Date(`${event.date}T12:00:00`);
    if (eventDate.getFullYear() !== year || eventDate.getMonth() !== monthIndex) return;
    const day = eventDate.getDate();
    eventMap.set(day, [...(eventMap.get(day) ?? []), event]);
  });
  const monthName = month.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];

  return (
    <div className="calendar-card">
      <div className="calendar-toolbar">
        <button onClick={() => onMonthChange(-1)} aria-label="Mes anterior">‹</button>
        <strong>{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</strong>
        <button onClick={() => onMonthChange(1)} aria-label="Mes siguiente">›</button>
      </div>
      <div className="weekday-row">{["L", "M", "M", "J", "V", "S", "D"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="calendar-grid">
        {cells.map((day, index) => (
          <div key={`${day}-${index}`} className={`calendar-day ${day === today.getDate() && monthIndex === today.getMonth() && year === today.getFullYear() ? "today" : ""}`}>
            {day && <><b>{day}</b><div className="day-dots">{(eventMap.get(day) ?? []).slice(0, 3).map((event) => <i key={event.occurrenceKey} className={`dot-${event.tone}`} title={`${event.title} · ${recurrenceLabel(event.recurrence)}`} />)}</div></>}
          </div>
        ))}
      </div>
    </div>
  );
}

function createEventDraft(today: Date): Omit<CalendarEvent, "id"> {
  return {
    date: toIsoDate(today),
    title: "",
    amount: "0",
    detail: "",
    numericAmount: 0,
    tone: "blue",
    kind: "expense",
    destination: "none",
    includeInProjection: false,
    recurrence: "none",
    recurrenceEnd: null,
    completedDates: [],
    skippedDates: [],
  };
}

export default function Home() {
  const [today] = useState(getMexicoToday);
  const todayIso = toIsoDate(today);
  const [accounts, setAccounts] = useState<Account[]>(DEFAULT_ACCOUNTS);
  const [draftAccounts, setDraftAccounts] = useState<Account[]>(DEFAULT_ACCOUNTS);
  const [emergencyIds, setEmergencyIds] = useState<string[]>(DEFAULT_EMERGENCY_IDS);
  const [draftEmergencyIds, setDraftEmergencyIds] = useState<string[]>(DEFAULT_EMERGENCY_IDS);
  const [editing, setEditing] = useState(false);
  const [years, setYears] = useState(DEFAULT_YEARS);
  const [targetText, setTargetText] = useState(formatNumberInput(DEFAULT_TARGET));
  const [monthlyExpensesText, setMonthlyExpensesText] = useState(formatNumberInput(DEFAULT_MONTHLY_EXPENSES));
  const [reserveRateText, setReserveRateText] = useState(String(RESERVE_RETURN));
  const [gbmRateText, setGbmRateText] = useState(String(GBM_RETURN));
  const [inflationRateText, setInflationRateText] = useState(String(DEFAULT_INFLATION));
  const [extras, setExtras] = useState<ExtraIncome[]>(() => createExampleExtras(today));
  const [extraDraft, setExtraDraft] = useState<ExtraIncome | null>(null);
  const [editingExtraId, setEditingExtraId] = useState<number | null>(null);
  const [creatingExtra, setCreatingExtra] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>(() => createExampleEvents(today));
  const [eventEditorOpen, setEventEditorOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [eventDraft, setEventDraft] = useState<Omit<CalendarEvent, "id">>(() => createEventDraft(today));
  const [removedEvent, setRemovedEvent] = useState<CalendarEvent | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDraftAccountId, setSelectedDraftAccountId] = useState(DEFAULT_ACCOUNTS[0].id);
  const [removedDraftAccount, setRemovedDraftAccount] = useState<Account | null>(null);
  const [removedDraftWasEmergency, setRemovedDraftWasEmergency] = useState(false);
  const [backupStatus, setBackupStatus] = useState("");
  const [dataMode, setDataMode] = useState<DataMode>("example");
  const [theme, setTheme] = useState<Theme>("light");
  const [backupBusy, setBackupBusy] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const closeEditorButtonRef = useRef<HTMLButtonElement>(null);
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const total = sumAccounts(accounts);
  const reserve = selectedTotal(accounts, emergencyIds);
  const gbm = sumAccounts(accounts, "investment");
  const cash = sumAccounts(accounts, "cash");
  const target = Math.max(1, parseMoneyInput(targetText) || DEFAULT_TARGET);
  const monthlyExpenses = Math.max(0, parseMoneyInput(monthlyExpensesText));
  const recommendedTargetMin = monthlyExpenses * 3;
  const recommendedTargetMax = monthlyExpenses * 6;
  const coverageMonths = monthlyExpenses > 0 ? reserve / monthlyExpenses : null;
  const reserveRate = Number(reserveRateText) || 0;
  const gbmRate = Number(gbmRateText) || 0;
  const inflationRate = Math.max(0, Number(inflationRateText) || 0);
  const reserveProgress = Math.min(Math.round((reserve / target) * 100), 100);
  const activeExtras = extras.filter((extra) => extra.enabled);
  const projectedEventSeries = events.filter((event) => event.includeInProjection).length;
  const projection = useMemo(
    () => buildProjection(years, reserve, gbm, reserveRate, gbmRate, extras, events, target, today),
    [years, reserve, gbm, reserveRate, gbmRate, extras, events, target, today],
  );
  const comparisonPoints = useMemo(
    () => projection.points.map((point) => {
      const inflationFactor = Math.pow(1 + inflationRate / 100, point.month / 12);
      return { ...point, realTotal: (point.reserve + point.gbm) / inflationFactor };
    }),
    [projection.points, inflationRate],
  );
  const lastNominalPoint = projection.points.at(-1)!;
  const lastComparisonPoint = comparisonPoints.at(-1)!;
  const lastNominalTotal = lastNominalPoint.reserve + lastNominalPoint.gbm;
  const inflationImpact = Math.max(0, lastNominalTotal - lastComparisonPoint.realTotal);
  const projectedStartingTotal = reserve + gbm;
  const estimatedReturn = lastNominalTotal - projectedStartingTotal - projection.netContributions;
  const visibleEvents = useMemo(() => getEventOccurrences(events, calendarMonth), [events, calendarMonth]);
  const annualProjectionPoints = comparisonPoints.filter((point) => point.month === 0 || point.month % 12 === 0 || point.month === years * 12);
  const selectedDraftAccount = draftAccounts.find((account) => account.id === selectedDraftAccountId) ?? draftAccounts[0] ?? null;

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const savedTheme = window.localStorage.getItem(THEME_KEY);
      const preferredTheme: Theme = savedTheme === "dark" || savedTheme === "light"
        ? savedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      setTheme(preferredTheme);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      try {
        getNexoStorageKeys()
          .filter((key) => key !== STORAGE_KEY)
          .forEach((key) => window.localStorage.removeItem(key));
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const data = JSON.parse(saved) as {
            accounts?: Account[];
            emergencyIds?: string[];
            years?: number;
            targetText?: string;
            monthlyExpensesText?: string;
            reserveRateText?: string;
            gbmRateText?: string;
            inflationRateText?: string;
            extras?: ExtraIncome[];
            events?: CalendarEvent[];
            dataMode?: DataMode;
            savedAt?: number;
          };
          if (Array.isArray(data.accounts)) setAccounts(data.accounts);
          if (Array.isArray(data.emergencyIds)) setEmergencyIds(data.emergencyIds);
          if (typeof data.years === "number") setYears(Math.max(1, Math.min(MAX_YEARS, data.years)));
          if (typeof data.targetText === "string") setTargetText(formatNumberInput(parseMoneyInput(data.targetText)));
          if (typeof data.monthlyExpensesText === "string") setMonthlyExpensesText(formatNumberInput(parseMoneyInput(data.monthlyExpensesText)));
          if (typeof data.reserveRateText === "string") setReserveRateText(data.reserveRateText);
          if (typeof data.gbmRateText === "string") setGbmRateText(data.gbmRateText);
          if (typeof data.inflationRateText === "string") setInflationRateText(data.inflationRateText);
          if (Array.isArray(data.extras)) setExtras(data.extras);
          if (Array.isArray(data.events)) setEvents(data.events.map((event) => normalizeEvent(event)));
          if (data.dataMode === "imported") setDataMode("imported");
          if (typeof data.savedAt === "number") setLastSavedAt(data.savedAt);
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        setStorageReady(true);
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const savedAt = Date.now();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      accounts,
      emergencyIds,
      years,
      targetText,
      monthlyExpensesText,
      reserveRateText,
      gbmRateText,
      inflationRateText,
      extras,
      events,
      dataMode,
      savedAt,
    }));
    const statusTimer = window.setTimeout(() => setLastSavedAt(savedAt), 0);
    return () => window.clearTimeout(statusTimer);
  }, [storageReady, accounts, emergencyIds, years, targetText, monthlyExpensesText, reserveRateText, gbmRateText, inflationRateText, extras, events, dataMode]);

  useEffect(() => {
    if (!editing) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditing(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    closeEditorButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      editorTriggerRef.current?.focus();
    };
  }, [editing]);

  function openEditor() {
    editorTriggerRef.current = document.activeElement as HTMLElement | null;
    setDraftAccounts(accounts.map((account) => ({ ...account, amountText: formatNumberInput(account.amount) })));
    setDraftEmergencyIds([...emergencyIds]);
    setSelectedDraftAccountId(accounts[0]?.id ?? "");
    setRemovedDraftAccount(null);
    setRemovedDraftWasEmergency(false);
    setEditing(true);
  }

  function updateDraftAccount(id: string, patch: Partial<Account>) {
    setDraftAccounts((current) => current.map((account) => account.id === id ? { ...account, ...patch } : account));
  }

  function updateDraftAmount(id: string, value: string) {
    updateDraftAccount(id, { amountText: value, amount: parseMoneyInput(value) });
  }

  function addDraftAccount() {
    const id = `custom-${Date.now()}`;
    setDraftAccounts((current) => [...current, { id, label: "Nueva cuenta", amount: 0, amountText: "0", rate: "Por definir", group: "cash", note: "Agrega una nota" }]);
    setSelectedDraftAccountId(id);
  }

  function removeDraftAccount(id: string) {
    const removed = draftAccounts.find((account) => account.id === id) ?? null;
    setRemovedDraftAccount(removed);
    setRemovedDraftWasEmergency(draftEmergencyIds.includes(id));
    const remaining = draftAccounts.filter((account) => account.id !== id);
    setDraftAccounts(remaining);
    setDraftEmergencyIds((current) => current.filter((accountId) => accountId !== id));
    setSelectedDraftAccountId(remaining[0]?.id ?? "");
  }

  function undoDraftAccountRemoval() {
    if (!removedDraftAccount) return;
    setDraftAccounts((current) => [...current, removedDraftAccount]);
    if (removedDraftWasEmergency) setDraftEmergencyIds((current) => [...new Set([...current, removedDraftAccount.id])]);
    setSelectedDraftAccountId(removedDraftAccount.id);
    setRemovedDraftAccount(null);
    setRemovedDraftWasEmergency(false);
  }

  function saveAccounts() {
    setAccounts(draftAccounts.map((account) => ({ id: account.id, label: account.label, amount: account.amount, rate: account.rate, group: account.group, note: account.note })));
    setEmergencyIds(draftEmergencyIds);
    setEditing(false);
  }

  function updateExtra(id: number, patch: Partial<ExtraIncome>) {
    setExtras((current) => current.map((extra) => extra.id === id ? { ...extra, ...patch } : extra));
  }

  function addExtra() {
    const id = Math.max(0, ...extras.map((extra) => extra.id)) + 1;
    setExtraDraft({
      id,
      enabled: true,
      amount: 5000,
      recurring: true,
      frequency: "monthly",
      destination: "gbm",
      startMonth: 1,
      endMonth: null,
      monthOfYear: today.getMonth() + 1,
      oneTimeMonth: 1,
    });
    setEditingExtraId(id);
    setCreatingExtra(true);
  }

  function editExtra(item: ExtraIncome) {
    setExtraDraft({ ...item, amountText: formatNumberInput(item.amount) });
    setEditingExtraId(item.id);
    setCreatingExtra(false);
  }

  function updateExtraDraft(patch: Partial<ExtraIncome>) {
    setExtraDraft((current) => current ? { ...current, ...patch } : current);
  }

  function cancelExtraEdit() {
    setExtraDraft(null);
    setEditingExtraId(null);
    setCreatingExtra(false);
  }

  function saveExtra() {
    if (!extraDraft || extraDraft.amount <= 0) return;
    const savedExtra = { ...extraDraft, amountText: formatNumberInput(extraDraft.amount) };
    setExtras((current) => creatingExtra
      ? [...current, savedExtra]
      : current.map((extra) => extra.id === savedExtra.id ? savedExtra : extra));
    cancelExtraEdit();
  }

  function removeExtra(id: number) {
    setExtras((current) => current.filter((extra) => extra.id !== id));
  }

  function openNewEvent() {
    setEditingEventId(null);
    setEventDraft(createEventDraft(today));
    setEventEditorOpen(true);
  }

  function editEvent(id: number) {
    const event = events.find((item) => item.id === id);
    if (!event) return;
    setEditingEventId(id);
    setEventDraft({ ...event, amount: formatNumberInput(event.numericAmount) });
    setEventEditorOpen(true);
  }

  function saveEvent() {
    if (!eventDraft.title.trim() || !eventDraft.date) return;
    const normalizedDraft = { ...eventDraft, amount: eventDraft.numericAmount > 0 ? formatMoney(eventDraft.numericAmount) : "$0" };
    setEvents((current) => editingEventId === null
      ? [...current, { ...normalizedDraft, id: Math.max(0, ...current.map((event) => event.id)) + 1 }]
      : current.map((event) => event.id === editingEventId ? { ...normalizedDraft, id: editingEventId } : event));
    const nextMonth = new Date(`${eventDraft.date}T12:00:00`);
    setCalendarMonth(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1));
    setEventDraft(createEventDraft(today));
    setEditingEventId(null);
    setEventEditorOpen(false);
  }

  function toggleOccurrenceCompleted(event: CalendarOccurrence) {
    setEvents((current) => current.map((item) => item.id === event.sourceId
      ? { ...item, completedDates: item.completedDates.includes(event.date) ? item.completedDates.filter((date) => date !== event.date) : [...item.completedDates, event.date] }
      : item));
  }

  function skipOccurrence(event: CalendarOccurrence) {
    setEvents((current) => current.map((item) => item.id === event.sourceId
      ? { ...item, skippedDates: [...new Set([...item.skippedDates, event.date])] }
      : item));
  }

  function removeEventSeries(id: number) {
    const event = events.find((item) => item.id === id) ?? null;
    setRemovedEvent(event);
    setEvents((current) => current.filter((item) => item.id !== id));
  }

  function undoEventRemoval() {
    if (!removedEvent) return;
    setEvents((current) => [...current, removedEvent].sort((a, b) => a.date.localeCompare(b.date)));
    setRemovedEvent(null);
  }

  function describeExtra(item: ExtraIncome) {
    const destination = item.destination === "gbm" ? "inversión" : "reserva";
    if (!item.enabled) return "Escenario desactivado";
    if (!item.recurring) return `${formatMoney(item.amount)} una vez en ${monthLabelForIndex(item.oneTimeMonth, today)} a ${destination}`;
    if (item.frequency === "annual") return `${formatMoney(item.amount)} cada ${monthNames[item.monthOfYear - 1]} a ${destination}`;
    const end = item.endMonth === null ? "sin fecha final" : `hasta ${monthLabelForIndex(item.endMonth, today)}`;
    return `${formatMoney(item.amount)} al mes desde ${monthLabelForIndex(item.startMonth, today)}, ${end}, a ${destination}`;
  }

  function applyScenario(preset: "conservative" | "base" | "optimistic") {
    const values = preset === "conservative"
      ? { reserve: 7, gbm: 7, inflation: 4.5 }
      : preset === "optimistic"
        ? { reserve: 11, gbm: 13, inflation: 3 }
        : { reserve: RESERVE_RETURN, gbm: GBM_RETURN, inflation: DEFAULT_INFLATION };
    setReserveRateText(String(values.reserve));
    setGbmRateText(String(values.gbm));
    setInflationRateText(String(values.inflation));
  }

  function openBackupPanel() {
    window.requestAnimationFrame(() => document.querySelector("#respaldo")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function exportBackup() {
    setBackupBusy(true);
    setBackupStatus("Preparando el libro de Excel y sus capturas…");
    try {
      const screenshots = await captureNexoScreenshots();
      await exportNexoWorkbook({
        dataMode,
        accounts,
        emergencyIds,
        years,
        target,
        monthlyExpenses,
        reserveRate,
        investmentRate: gbmRate,
        inflationRate,
        extras,
        events,
      }, screenshots, `nexo-respaldo-${todayIso}.xlsx`);
      setBackupStatus(`Excel descargado con 6 hojas y 3 capturas: ${accounts.length} cuentas, ${events.length} movimientos y ${extras.length} ${extras.length === 1 ? "escenario" : "escenarios"}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Error desconocido";
      setBackupStatus(`No se pudo crear el Excel: ${detail}. Intenta de nuevo después de que termine de cargar la página.`);
    } finally {
      setBackupBusy(false);
    }
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBackupBusy(true);
    setBackupStatus("Leyendo y validando el libro de Excel…");
    try {
      if (!file.name.toLocaleLowerCase("es-MX").endsWith(".xlsx")) throw new Error("invalid file type");
      const data = await importNexoWorkbook(file);
      setAccounts(data.accounts);
      setEmergencyIds(data.emergencyIds);
      setYears(data.years);
      setTargetText(formatNumberInput(data.target));
      setMonthlyExpensesText(formatNumberInput(data.monthlyExpenses));
      setReserveRateText(String(data.reserveRate));
      setGbmRateText(String(data.investmentRate));
      setInflationRateText(String(data.inflationRate));
      setExtras(data.extras);
      setEvents(data.events.map((item) => normalizeEvent(item)));
      setDataMode("imported");
      setBackupStatus(`Excel importado: ${data.accounts.length} cuentas, ${data.events.length} movimientos y ${data.extras.length} ${data.extras.length === 1 ? "escenario" : "escenarios"}.`);
    } catch {
      setBackupStatus("No se pudo importar: selecciona un archivo .xlsx exportado por Nexo y conserva sus hojas y columnas.");
    } finally {
      setBackupBusy(false);
      event.target.value = "";
    }
  }

  function resetToExampleData() {
    const confirmed = window.confirm(
      "¿Restablecer todos los datos? Se reemplazarán las cuentas, movimientos, escenarios y configuración guardados en este navegador. Descarga un Excel antes si quieres conservarlos.",
    );
    if (!confirmed) return;

    const freshAccounts = DEFAULT_ACCOUNTS.map((account) => ({ ...account }));
    const freshEmergencyIds = [...DEFAULT_EMERGENCY_IDS];
    getNexoStorageKeys().forEach((key) => window.localStorage.removeItem(key));
    setAccounts(freshAccounts);
    setDraftAccounts(freshAccounts.map((account) => ({ ...account })));
    setEmergencyIds(freshEmergencyIds);
    setDraftEmergencyIds([...freshEmergencyIds]);
    setEditing(false);
    setYears(DEFAULT_YEARS);
    setTargetText(formatNumberInput(DEFAULT_TARGET));
    setMonthlyExpensesText(formatNumberInput(DEFAULT_MONTHLY_EXPENSES));
    setReserveRateText(String(RESERVE_RETURN));
    setGbmRateText(String(GBM_RETURN));
    setInflationRateText(String(DEFAULT_INFLATION));
    setExtras(createExampleExtras(today));
    setExtraDraft(null);
    setEditingExtraId(null);
    setCreatingExtra(false);
    setEvents(createExampleEvents(today));
    setEventEditorOpen(false);
    setEditingEventId(null);
    setEventDraft(createEventDraft(today));
    setRemovedEvent(null);
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setCalendarOpenMobile(false);
    setSelectedDraftAccountId(freshAccounts[0]?.id ?? "");
    setRemovedDraftAccount(null);
    setRemovedDraftWasEmergency(false);
    setDataMode("example");
    setLastSavedAt(null);
    setBackupStatus("Datos restablecidos. La app usa nuevamente información ficticia y eliminó los datos anteriores de este navegador.");
  }

  function renderExtraEditor(item: ExtraIncome, index: number) {
    return (
      <section className="extra-entry is-editing" key={`editor-${item.id}`} aria-labelledby={`extra-editor-${item.id}`}>
        <div className="extra-editor-head">
          <div>
            <span className="editing-badge">{creatingExtra ? "NUEVO" : "EDITANDO"}</span>
            <strong id={`extra-editor-${item.id}`}>{creatingExtra ? "Nuevo escenario" : `Escenario ${index + 1}`}</strong>
            <small>Cambios sin guardar</small>
          </div>
          <label className="switch"><input aria-label="Incluir escenario en la proyección" type="checkbox" checked={item.enabled} onChange={(event) => updateExtraDraft({ enabled: event.target.checked })} /><span />Activo</label>
        </div>
        <div className="extra-grid">
          <label>Monto<input type="text" inputMode="decimal" value={item.amountText ?? formatNumberInput(item.amount)} onChange={(event) => { const value = event.target.value; updateExtraDraft({ amountText: value, amount: parseMoneyInput(value) }); }} onBlur={() => updateExtraDraft({ amountText: formatNumberInput(item.amount) })} /></label>
          <label>Repetición<select value={item.recurring ? "recurring" : "once"} onChange={(event) => updateExtraDraft({ recurring: event.target.value === "recurring" })}><option value="recurring">Recurrente</option><option value="once">Una sola vez</option></select></label>
          {item.recurring && <label>Frecuencia<select value={item.frequency} onChange={(event) => updateExtraDraft({ frequency: event.target.value as ExtraIncome["frequency"] })}><option value="monthly">Mensual</option><option value="annual">Anual</option></select></label>}
          {item.recurring && item.frequency === "monthly" && <><label>Mes de inicio<input type="month" min={monthInputForIndex(1, today)} max={monthInputForIndex(MAX_YEARS * 12, today)} value={monthInputForIndex(item.startMonth, today)} onChange={(event) => { const startMonth = monthIndexFromInput(event.target.value, today); updateExtraDraft({ startMonth, endMonth: item.endMonth !== null && item.endMonth < startMonth ? startMonth : item.endMonth }); }} /></label><label>Mes final <span className="optional">opcional</span><input type="month" min={monthInputForIndex(item.startMonth, today)} max={monthInputForIndex(MAX_YEARS * 12, today)} value={item.endMonth === null ? "" : monthInputForIndex(item.endMonth, today)} onChange={(event) => updateExtraDraft({ endMonth: event.target.value ? monthIndexFromInput(event.target.value, today) : null })} /><small>Vacío = sin fecha final</small></label></>}
          {item.recurring && item.frequency === "annual" && <label>Mes del año<select value={item.monthOfYear} onChange={(event) => updateExtraDraft({ monthOfYear: Number(event.target.value) })}>{monthNames.map((month, monthIndex) => <option key={month} value={monthIndex + 1}>{month}</option>)}</select></label>}
          {!item.recurring && <label>Mes del depósito<input type="month" min={monthInputForIndex(1, today)} max={monthInputForIndex(MAX_YEARS * 12, today)} value={monthInputForIndex(item.oneTimeMonth, today)} onChange={(event) => updateExtraDraft({ oneTimeMonth: monthIndexFromInput(event.target.value, today) })} /></label>}
          <label>Destino<select value={item.destination} onChange={(event) => updateExtraDraft({ destination: event.target.value as ExtraIncome["destination"] })}><option value="gbm">Inversión</option><option value="cetes">CETES / reserva</option></select></label>
        </div>
        <p className="extra-summary">Vista previa: {describeExtra(item)}</p>
        <div className="extra-editor-actions"><button className="secondary-button" onClick={cancelExtraEdit}>Cancelar</button><button className="primary-button" disabled={item.amount <= 0} onClick={saveExtra}>Guardar escenario</button></div>
      </section>
    );
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <header className="topbar">
        <a className="brand" href="#inicio"><BrandMark /><span>Nexo</span></a>
        <nav className="top-nav" aria-label="Navegación principal">
          <a className="active" href="#inicio">Resumen</a><a href="#cuentas">Cuentas</a><a href="#agenda">Movimientos</a><a href="#proyeccion">Proyección</a>
        </nav>
        <div className="top-actions"><span className={`private-pill ${dataMode === "example" ? "example" : ""}`}><i /> {dataMode === "example" ? "Modo ejemplo" : "Datos importados"}</span><button className="theme-toggle" type="button" aria-label={`Cambiar a tema ${theme === "light" ? "oscuro" : "claro"}`} aria-pressed={theme === "dark"} onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}><span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span><b>{theme === "light" ? "Oscuro" : "Claro"}</b></button><button className="backup-button" onClick={openBackupPanel}>Respaldo</button><button className="primary-button edit-balances-button" onClick={openEditor}>Editar saldos</button></div>
      </header>

      <div className="page-wrap" id="contenido" tabIndex={-1}>
        <div id="export-overview">
          <section id="inicio" className="page-heading">
            <div><span className="eyebrow">{formatHeadingDate(today)}</span><h1>Buenos días.</h1><p>{dataMode === "example" ? "Explora Nexo con información ficticia y reemplázala cuando quieras." : "Este es el estado de tus finanzas hoy."}</p></div>
            <span className="currency-pill">MXN · {lastSavedAt ? "Guardado automáticamente" : "Preparando datos"}</span>
          </section>

          <section className="overview-grid" aria-label="Resumen financiero">
            <article className="net-worth-card"><div className="card-label"><span>Patrimonio total</span><span className="soft-badge">{accounts.length} cuentas</span></div><strong className="hero-amount">{formatMoney(total)}</strong><div className="net-worth-foot"><span><i className="status-dot green" /> {dataMode === "example" ? "Datos de ejemplo" : "Saldos al día"}</span><small>{dataMode === "example" ? "Montos ficticios para explorar" : "Datos guardados en este dispositivo"}</small></div></article>
            <article className="metric-card"><div className="metric-icon reserve-icon">R</div><div><span>Fondo de emergencia</span><strong>{formatMoney(reserve)}</strong><small>{reserveProgress}% de la meta</small></div></article>
            <article className="metric-card"><div className="metric-icon cash-icon">D</div><div><span>Disponible</span><strong>{formatMoney(cash)}</strong><small>Liquidez · no se proyecta</small></div></article>
            <article className="metric-card"><div className="metric-icon invest-icon">I</div><div><span>Inversiones</span><strong>{formatMoney(gbm)}</strong><small>{accounts.filter((account) => account.group === "investment").length} {accounts.filter((account) => account.group === "investment").length === 1 ? "cuenta" : "cuentas"} · largo plazo</small></div></article>
          </section>
        </div>

        <section className="dashboard-grid">
          <div className="main-column">
            <section id="cuentas" className="panel accounts-panel">
              <div className="panel-heading"><div><span className="eyebrow">DISTRIBUCIÓN</span><h2>Tus cuentas</h2></div><button className="text-button" onClick={openEditor}>Administrar</button></div>
              <div className="account-table">
                <div className="account-table-head"><span>Cuenta</span><span>Tipo</span><span>Rendimiento</span><span>Saldo</span></div>
                {accounts.map((account) => (
                  <div className="account-row" key={account.id}>
                    <div className="account-name"><span className={`account-monogram ${account.group}`}>{account.label.charAt(0).toUpperCase()}</span><div><strong>{account.label}</strong><small>{account.note || "Sin nota"}</small></div></div>
                    <span className={`type-pill ${account.group}`}>{account.group === "reserve" ? "Reserva" : account.group === "investment" ? "Inversión" : "Disponible"}</span>
                    <span className="account-rate">{account.rate}</span><strong className="account-balance">{formatMoney(account.amount)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="side-column">
            <section className="panel goal-card">
              <div className="panel-heading compact"><div><span className="eyebrow">OBJETIVO PRINCIPAL</span><h2>Reserva de emergencia</h2></div></div>
              <div className="goal-content"><GoalRing progress={reserveProgress} /><div className="goal-copy"><strong>{formatMoney(reserve)}</strong><span>de {formatMoney(target)}</span><small>Te faltan {formatMoney(Math.max(target - reserve, 0))}</small></div></div>
              <div className="progress-track"><span style={{ width: `${reserveProgress}%` }} /></div>
              <div className="goal-fields">
                <label className="target-field"><span>Gasto esencial mensual <em>no es un ingreso</em></span><div><b>$</b><input aria-label="Gasto esencial mensual para calcular meses de cobertura" aria-describedby="expense-purpose" type="text" inputMode="decimal" value={monthlyExpensesText} onChange={(event) => setMonthlyExpensesText(event.target.value)} onBlur={() => setMonthlyExpensesText(formatNumberInput(monthlyExpenses))} /></div></label>
                <p className="field-help" id="expense-purpose">Solo calcula la referencia de 3 a 6 meses y tu cobertura. No se suma al patrimonio ni a la proyección.</p>
                <label className="target-field"><span>Tu meta personalizada</span><div><b>$</b><input aria-label="Meta del fondo de emergencia" type="text" inputMode="decimal" value={targetText} onChange={(event) => setTargetText(event.target.value)} onBlur={() => setTargetText(formatNumberInput(target))} /></div></label>
              </div>
              <div className="coverage-card"><span>Cobertura actual</span><strong>{coverageMonths === null ? "—" : `${coverageMonths.toLocaleString("es-MX", { maximumFractionDigits: 1 })} meses`}</strong><small>{coverageMonths === null ? "Agrega tu gasto esencial para calcularla." : coverageMonths >= 6 ? "Supera la referencia amplia de 6 meses." : coverageMonths >= 3 ? "Dentro de la referencia habitual de 3 a 6 meses." : "Por debajo de la referencia inicial de 3 meses."}</small></div>
              <div className="goal-suggestions"><button onClick={() => setTargetText(formatNumberInput(recommendedTargetMin))}>Usar 3 meses</button><button onClick={() => setTargetText(formatNumberInput(recommendedTargetMax))}>Usar 6 meses</button></div>
              <p className="ideal-note"><strong>Referencia ideal:</strong> entre {formatMoney(recommendedTargetMin)} y {formatMoney(recommendedTargetMax)} según tus gastos actuales. Mantén una meta personalizada si tu situación requiere más cobertura.</p>
            </section>

          </aside>
        </section>

        <section id="agenda" className="section-wrap movements-section">
          <div className="section-heading"><div><span className="eyebrow">MOVIMIENTOS</span><h2>Tu agenda financiera</h2><p>Organiza ingresos, gastos, transferencias y aportaciones. Los movimientos que elijas también pueden alimentar la proyección.</p></div><button className="secondary-button" onClick={() => { if (eventEditorOpen) { setEventEditorOpen(false); setEditingEventId(null); } else { openNewEvent(); } }}>{eventEditorOpen ? "Cancelar" : "+ Agregar movimiento"}</button></div>
          {eventEditorOpen && (
            <div className="event-form panel">
              <div className="event-form-head"><div><span className="editing-badge">{editingEventId === null ? "NUEVO" : "EDITANDO SERIE"}</span><strong>Configura el movimiento</strong></div><span>{eventDraft.recurrence === "none" ? "Una sola fecha" : recurrenceLabel(eventDraft.recurrence)}</span></div>
              <div className="event-form-grid">
                <label>Primera fecha<input type="date" value={eventDraft.date} onChange={(event) => setEventDraft((current) => ({ ...current, date: event.target.value, recurrenceEnd: current.recurrenceEnd && current.recurrenceEnd < event.target.value ? event.target.value : current.recurrenceEnd }))} /></label>
                <label>Movimiento<input type="text" placeholder="Ej. Pagar tarjeta" value={eventDraft.title} onChange={(event) => setEventDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                <label>Tipo<select value={eventDraft.kind} onChange={(event) => { const kind = event.target.value as MovementKind; setEventDraft((current) => ({ ...current, kind, includeInProjection: kind === "transfer" ? false : current.includeInProjection, destination: kind === "transfer" ? "none" : current.destination })); }}><option value="expense">Gasto</option><option value="income">Ingreso</option><option value="transfer">Transferencia</option><option value="contribution">Aportación</option></select></label>
                <label>Monto<input type="text" inputMode="decimal" placeholder="Ej. 2,500" value={eventDraft.amount} onChange={(event) => setEventDraft((current) => ({ ...current, amount: event.target.value, numericAmount: parseMoneyInput(event.target.value) }))} onBlur={() => setEventDraft((current) => ({ ...current, amount: formatNumberInput(current.numericAmount) }))} /></label>
                <label>Nota <span className="optional">opcional</span><input type="text" placeholder="Ej. Servicios del mes" value={eventDraft.detail} onChange={(event) => setEventDraft((current) => ({ ...current, detail: event.target.value }))} /></label>
                <label>Repetición<select value={eventDraft.recurrence} onChange={(event) => setEventDraft((current) => ({ ...current, recurrence: event.target.value as EventRecurrence, recurrenceEnd: event.target.value === "none" ? null : current.recurrenceEnd }))}><option value="none">No se repite</option><option value="weekly">Cada semana</option><option value="monthly">Cada mes</option><option value="annual">Cada año</option></select></label>
                {eventDraft.recurrence !== "none" && <label>Termina <span className="optional">opcional</span><input type="date" min={eventDraft.date} value={eventDraft.recurrenceEnd ?? ""} onChange={(event) => setEventDraft((current) => ({ ...current, recurrenceEnd: event.target.value || null }))} /><small>Vacío = sin fecha final</small></label>}
                {eventDraft.kind !== "transfer" && <label>Destino en proyección<select value={eventDraft.destination} onChange={(event) => setEventDraft((current) => ({ ...current, destination: event.target.value as ProjectionDestination, includeInProjection: event.target.value !== "none" }))}><option value="none">No incluir</option><option value="cetes">Reserva / CETES</option><option value="gbm">Inversión</option></select></label>}
                <label>Color<select value={eventDraft.tone} onChange={(event) => setEventDraft((current) => ({ ...current, tone: event.target.value as EventTone }))}><option value="blue">Azul</option><option value="green">Verde</option><option value="orange">Naranja</option><option value="red">Rojo</option></select></label>
              </div>
              <div className="event-form-actions"><small>{eventDraft.recurrence === "none" ? "Se agregará un solo movimiento." : `${recurrenceLabel(eventDraft.recurrence)} desde ${eventDraft.date}${eventDraft.recurrenceEnd ? ` hasta ${eventDraft.recurrenceEnd}` : ", sin fecha final"}.`}{eventDraft.includeInProjection ? " Su monto se reflejará en la proyección." : ""}</small><button className="primary-button" disabled={!eventDraft.title.trim() || !eventDraft.date} onClick={saveEvent}>{editingEventId === null ? "Guardar movimiento" : "Guardar cambios"}</button></div>
            </div>
          )}
          {removedEvent && <div className="undo-banner" role="status"><span>Movimiento eliminado.</span><button onClick={undoEventRemoval}>Deshacer</button><button aria-label="Cerrar aviso" onClick={() => setRemovedEvent(null)}>×</button></div>}
          <div className="agenda-grid">
            <div className="events-card">
              <div className="events-head"><strong>{monthNames[calendarMonth.getMonth()]}</strong><span>{visibleEvents.length} movimiento{visibleEvents.length === 1 ? "" : "s"}</span></div>
              {visibleEvents.length === 0 ? <div className="events-empty">No hay eventos en este mes.</div> : visibleEvents.map((event) => {
                const eventDay = Number(event.date.slice(-2));
                const isCompleted = event.date < todayIso || event.completedDates.includes(event.date);
                return <div className={`event-row movement-row ${isCompleted ? "is-complete" : ""}`} key={event.occurrenceKey}><span className={`event-day event-${event.tone}`}>{eventDay}</span><div className="event-copy"><div><strong>{event.title}</strong><span className={`movement-kind kind-${event.kind}`}>{movementKindLabel(event.kind)}</span>{event.recurrence !== "none" && <span className="recurrence-chip">{recurrenceLabel(event.recurrence)}</span>}</div><small>{event.numericAmount > 0 ? formatMoney(event.numericAmount) : "Sin monto"}{event.detail ? ` · ${event.detail}` : ""}</small>{event.includeInProjection && <span className="projection-impact">Incluido en {event.destination === "gbm" ? "inversión" : "reserva"}</span>}</div><div className="event-actions movement-actions"><span className="event-state">{isCompleted ? "Completado" : "Pendiente"}</span><div>{event.date >= todayIso && <button onClick={() => toggleOccurrenceCompleted(event)}>{isCompleted ? "Reabrir" : "Hecho"}</button>}{event.recurrence !== "none" && event.date >= todayIso && <button onClick={() => skipOccurrence(event)}>Omitir</button>}<button onClick={() => editEvent(event.sourceId)}>Editar</button><button className="danger-link" aria-label={`${event.recurrence === "none" ? "Eliminar" : "Eliminar serie"} ${event.title}`} onClick={() => removeEventSeries(event.sourceId)}>{event.recurrence === "none" ? "Eliminar" : "Eliminar serie"}</button></div></div></div>;
              })}
            </div>
            <Calendar month={calendarMonth} onMonthChange={(delta) => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))} events={visibleEvents} today={today} />
          </div>
        </section>

        <section id="proyeccion" className="section-wrap projection-section">
          <div className="section-heading projection-heading">
            <div><span className="eyebrow">PROYECCIÓN</span><h2>Crecimiento y poder adquisitivo</h2><p>Compara en una sola vista los valores nominales y lo que realmente representarían en pesos de hoy.</p></div>
            <div className="projection-controls"><div className="horizon-presets" aria-label="Periodos rápidos">{[1, 5, 10, 20, 30].map((period) => <button className={years === period ? "active" : ""} key={period} onClick={() => setYears(period)}>{period}a</button>)}</div><div className="horizon-control"><button aria-label="Reducir horizonte" onClick={() => setYears((current) => Math.max(1, current - 1))}>−</button><div><strong>{years}</strong><span>{years === 1 ? "año" : "años"}</span></div><button aria-label="Aumentar horizonte" onClick={() => setYears((current) => Math.min(MAX_YEARS, current + 1))}>+</button><input aria-label="Horizonte de proyección" type="range" min="1" max={MAX_YEARS} value={years} onChange={(event) => setYears(Number(event.target.value))} /></div></div>
          </div>

          <div className="projection-grid">
            <div className="panel projection-card comparison-view">
              <div className="projection-summary-head"><div><span>Resultado al final del horizonte</span><strong>{years} {years === 1 ? "año" : "años"}</strong></div><span className="projection-badge success">3 líneas comparables</span></div>
              <div className="projection-story" aria-label="Cómo se forma la proyección">
                <div><span>Parte de hoy</span><strong>{formatMoney(projectedStartingTotal)}</strong><small>{formatMoney(reserve)} reserva + {formatMoney(gbm)} inversión</small></div>
                <i aria-hidden="true">+</i>
                <div><span>Aportaciones netas</span><strong>{formatMoney(projection.netContributions)}</strong><small>{projectedEventSeries} {projectedEventSeries === 1 ? "serie" : "series"} de agenda + {activeExtras.length} {activeExtras.length === 1 ? "escenario" : "escenarios"}</small></div>
                <i aria-hidden="true">+</i>
                <div><span>Rendimiento estimado</span><strong>{formatMoney(estimatedReturn)}</strong><small>Con los supuestos elegidos</small></div>
                <i aria-hidden="true">=</i>
                <div className="story-result"><span>Total nominal</span><strong>{formatMoney(lastNominalTotal)}</strong><small>Al final de {years} {years === 1 ? "año" : "años"}</small></div>
              </div>
              <p className="projection-scope"><strong>{formatMoney(cash)} disponibles no se proyectan.</strong> Conservan su función de liquidez y no reciben rendimiento hasta que los clasifiques como reserva o inversión.</p>
              <div className="projection-metrics">
                <div><span>Total nominal</span><strong>{formatMoney(lastNominalTotal)}</strong><small>Reserva + inversión</small></div>
                <div className="real-metric"><span>En pesos de hoy</span><strong>{formatMoney(lastComparisonPoint.realTotal)}</strong><small>Con inflación de {inflationRate}%</small></div>
                <div><span>Efecto de la inflación</span><strong>−{formatMoney(inflationImpact)}</strong><small>Diferencia de poder adquisitivo</small></div>
              </div>
              <ProjectionChart points={comparisonPoints} goalMonth={projection.goalMonth} years={years} target={target} baseDate={today} />
              <p className="chart-note">Los montos finales aparecen en la leyenda; explora la gráfica para consultar cada periodo. Las tasas son supuestos editables y no constituyen una garantía.</p>
              <details className="projection-data"><summary>Ver tabla anual accesible</summary><div><table><caption>Proyección anual en pesos mexicanos</caption><thead><tr><th>Periodo</th><th>Reserva</th><th>Inversión</th><th>Pesos de hoy</th></tr></thead><tbody>{annualProjectionPoints.map((point) => <tr key={point.month}><th>{point.month === 0 ? "Hoy" : formatDurationMonths(point.month)}</th><td>{formatMoney(point.reserve)}</td><td>{formatMoney(point.gbm)}</td><td>{formatMoney(point.realTotal)}</td></tr>)}</tbody></table></div></details>
            </div>

            <aside className="panel assumptions-card">
              <div className="panel-heading compact"><div><span className="eyebrow">ESCENARIO</span><h2>Supuestos</h2></div></div>
              <div className="scenario-presets"><button onClick={() => applyScenario("conservative")}>Conservador</button><button onClick={() => applyScenario("base")}>Base</button><button onClick={() => applyScenario("optimistic")}>Optimista</button></div>
              <label className="rate-field"><span>Reserva anual<small>Instrumentos de corto plazo</small></span><span className="rate-input"><input type="text" inputMode="decimal" value={reserveRateText} onChange={(event) => setReserveRateText(event.target.value)} onBlur={() => setReserveRateText(String(reserveRate))} /><b>%</b></span></label>
              <label className="rate-field"><span>Inversión anual<small>Cuenta de largo plazo</small></span><span className="rate-input"><input type="text" inputMode="decimal" value={gbmRateText} onChange={(event) => setGbmRateText(event.target.value)} onBlur={() => setGbmRateText(String(gbmRate))} /><b>%</b></span></label>
              <label className="rate-field inflation-rate-field"><span>Inflación anual<small>Convierte el total a pesos de hoy</small></span><span className="rate-input"><input aria-label="Inflación anual estimada" type="text" inputMode="decimal" value={inflationRateText} onChange={(event) => setInflationRateText(event.target.value)} onBlur={() => setInflationRateText(String(inflationRate))} /><b>%</b></span></label>
              <div className="assumptions-result"><span>Poder adquisitivo al final</span><strong>{formatMoney(lastComparisonPoint.realTotal)}</strong><small>El total nominal es {formatMoney(lastNominalTotal)}. La diferencia de {formatMoney(inflationImpact)} representa el efecto acumulado de una inflación de {inflationRate}% anual.</small></div>
            </aside>
          </div>

          <div className="panel extras-card compact-simulation">
            <div className="panel-heading"><div><span className="eyebrow">SIMULACIÓN</span><h2>Escenarios de aportación</h2><p>Prueba aportaciones hipotéticas sin convertirlas en movimientos reales de tu agenda.</p></div><button className="secondary-button" disabled={extraDraft !== null} onClick={addExtra}>{extraDraft ? "Edición en curso" : "+ Agregar escenario"}</button></div>
            {extras.length === 0 && !extraDraft ? <div className="empty-state"><span>+</span><div><strong>Aún no hay ingresos adicionales</strong><p>Agrega un escenario para ver su impacto en la proyección.</p></div></div> : (
              <div className="extra-list">
                {extras.map((item, index) => editingExtraId === item.id && !creatingExtra && extraDraft ? renderExtraEditor(extraDraft, index) : (
                  <article className={`extra-saved-card ${item.enabled ? "" : "is-off"}`} key={item.id}>
                    <div className="extra-saved-main">
                      <div><span className="saved-badge">GUARDADO</span><h3>Escenario {index + 1}</h3><p>{describeExtra(item)}</p></div>
                      <strong className="extra-saved-amount">{formatMoney(item.amount)}</strong>
                    </div>
                    <div className="extra-saved-meta"><span>{item.recurring ? item.frequency === "monthly" ? "Recurrente · mensual" : "Recurrente · anual" : "Una sola vez"}</span><span>{item.destination === "gbm" ? "Inversión" : "CETES / reserva"}</span></div>
                    <div className="extra-saved-actions"><label className="switch"><input aria-label={`Activar escenario ${index + 1}`} type="checkbox" checked={item.enabled} onChange={(event) => updateExtra(item.id, { enabled: event.target.checked })} /><span />{item.enabled ? "Activo" : "Inactivo"}</label><div><button className="secondary-button" onClick={() => editExtra(item)}>Editar</button><button className="danger-button" onClick={() => removeExtra(item.id)}>Eliminar</button></div></div>
                  </article>
                ))}
                {creatingExtra && extraDraft && renderExtraEditor(extraDraft, extras.length)}
              </div>
            )}
            {extras.length > 0 && <div className="extras-footer">{activeExtras.length} escenario{activeExtras.length === 1 ? " activo" : "s activos"} incluido{activeExtras.length === 1 ? "" : "s"} en la gráfica</div>}
          </div>
        </section>

        <section id="respaldo" className="panel backup-panel" aria-labelledby="backup-title">
          <div><span className="eyebrow">EXCEL Y RESPALDO</span><h2 id="backup-title">Un respaldo que sí puedes revisar</h2><p>Nexo crea un libro de Excel profesional, legible y listo para restaurarse en otro navegador.</p><p className="backup-includes"><strong>Incluye 6 hojas:</strong> resumen ejecutivo, cuentas, movimientos, escenarios, capturas visuales y configuración de restauración.</p></div>
          <div className="backup-actions"><button className="primary-button" disabled={backupBusy} onClick={exportBackup}>{backupBusy ? "Preparando Excel…" : "Descargar Excel (.xlsx)"}</button><button className="secondary-button" disabled={backupBusy} onClick={() => backupInputRef.current?.click()}>Importar Excel</button></div>
          <input ref={backupInputRef} hidden type="file" accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx" onChange={importBackup} />
          <div className="backup-reset"><div><strong>Restablecer datos de ejemplo</strong><p>Reemplaza toda la información guardada por cuentas y movimientos ficticios. Esta acción no modifica los archivos de Excel que ya descargaste.</p></div><button className="danger-button" disabled={backupBusy} onClick={resetToExampleData}>Restablecer datos</button></div>
          <p className="backup-status" aria-live="polite">{backupStatus || (lastSavedAt ? `Último guardado local: ${new Date(lastSavedAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}` : "Guardado automático activo.")}</p>
        </section>

        <footer className="footer"><a className="brand footer-brand" href="#inicio"><BrandMark /><span>Nexo</span></a><p>Tu panorama financiero, claro y en un solo lugar.</p><button className="footer-backup" onClick={openBackupPanel}>Respaldar datos</button><span>Uso personal · MXN</span></footer>
      </div>

      {editing && (
        <div className="modal-backdrop">
          <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title" aria-describedby="editor-description">
            <div className="editor-heading"><div><span className="eyebrow">DATOS BASE</span><h2 id="editor-title">Administrar cuentas y saldos</h2><p id="editor-description">Edita nombres, montos, rendimientos y notas. También puedes agregar o eliminar cuentas.</p></div><button className="close-button" ref={closeEditorButtonRef} onClick={() => setEditing(false)} aria-label="Cerrar editor">×</button></div>
            <div className="editor-toolbar"><span>{draftAccounts.length} cuentas</span><div>{removedDraftAccount && <button className="undo-account" onClick={undoDraftAccountRemoval}>Deshacer eliminación</button>}<button className="secondary-button" onClick={addDraftAccount}>+ Agregar cuenta</button></div></div>
            <div className="account-manager">
              <nav className="account-selector" aria-label="Seleccionar cuenta para editar">{draftAccounts.map((account) => <button className={selectedDraftAccountId === account.id ? "active" : ""} key={account.id} onClick={() => setSelectedDraftAccountId(account.id)}><span className={`account-monogram ${account.group}`}>{account.label.charAt(0).toUpperCase()}</span><span><strong>{account.label}</strong><small>{formatMoney(account.amount)}</small></span></button>)}</nav>
              {selectedDraftAccount ? <article className={`account-input account-detail ${selectedDraftAccount.group}`}>
                <div className="account-input-head"><input className="account-title-input" aria-label="Nombre de la cuenta" value={selectedDraftAccount.label} onChange={(event) => updateDraftAccount(selectedDraftAccount.id, { label: event.target.value })} /><button aria-label={`Eliminar ${selectedDraftAccount.label}`} onClick={() => removeDraftAccount(selectedDraftAccount.id)}>Eliminar cuenta</button></div>
                <div className="account-fields">
                  <label>Saldo<div className="amount-field"><b>$</b><input aria-label={`Saldo de ${selectedDraftAccount.label}`} type="text" inputMode="decimal" value={selectedDraftAccount.amountText ?? formatNumberInput(selectedDraftAccount.amount)} onChange={(event) => updateDraftAmount(selectedDraftAccount.id, event.target.value)} onBlur={() => updateDraftAccount(selectedDraftAccount.id, { amountText: formatNumberInput(selectedDraftAccount.amount) })} /></div></label>
                  <label>Tipo<select value={selectedDraftAccount.group} onChange={(event) => updateDraftAccount(selectedDraftAccount.id, { group: event.target.value as AccountGroup })}><option value="reserve">Reserva</option><option value="investment">Inversión</option><option value="cash">Disponible</option></select></label>
                  <label>Rendimiento / estado<input type="text" value={selectedDraftAccount.rate} onChange={(event) => updateDraftAccount(selectedDraftAccount.id, { rate: event.target.value })} /></label>
                  <label className="note-field">Nota<input type="text" value={selectedDraftAccount.note} onChange={(event) => updateDraftAccount(selectedDraftAccount.id, { note: event.target.value })} /></label>
                </div>
                <label className="reserve-check"><input type="checkbox" checked={draftEmergencyIds.includes(selectedDraftAccount.id)} onChange={(event) => setDraftEmergencyIds((current) => event.target.checked ? [...new Set([...current, selectedDraftAccount.id])] : current.filter((id) => id !== selectedDraftAccount.id))} /> Incluir en el fondo de emergencia</label>
              </article> : <div className="empty-account-detail"><strong>No hay cuentas</strong><p>Agrega una cuenta para empezar.</p></div>}
            </div>
            <div className="editor-actions sticky-actions"><span>Revisa una cuenta a la vez. Los cambios se guardan juntos.</span><div><button className="secondary-button" onClick={() => setEditing(false)}>Cancelar</button><button className="primary-button" onClick={saveAccounts}>Guardar cambios</button></div></div>
          </section>
        </div>
      )}
    </main>
  );
}
