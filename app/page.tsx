"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { captureNexoScreenshots, exportNexoWorkbook, importNexoWorkbook } from "./lib/nexo-workbook";
import {
  calculateReferenceValidation,
  REFERENCE_SHEET,
  SAVINGS_OPTIONS,
  type ProtectionScheme,
  type SavingsOption,
} from "./lib/savings-options";
import {
  clampFiniteNumber,
  parseMoneyInput,
  sanitizeInflationRate,
  sanitizeMoney,
  sanitizePercentRate,
  sanitizeReturnRate,
  sanitizeSignedMoney,
} from "./lib/nexo-values";

const DEFAULT_TARGET = 150000;
const DEFAULT_MONTHLY_EXPENSES = 25000;
const DEFAULT_YEARS = 5;
const RESERVE_RETURN = 6.5;
const GBM_RETURN = 9;
const DEFAULT_INFLATION = 4;
const TRADING_MX_COMMISSION = 0.25;
const CAPITAL_GAINS_TAX = 10;
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
type DataMode = "example" | "personal" | "imported";
type Theme = "light" | "dark";
type AppView = "overview" | "activity" | "accounts" | "plan" | "data";
type TransactionKind = "expense" | "income" | "transfer";
type StoredSnapshot = {
  accounts?: Account[];
  emergencyIds?: string[];
  years?: number;
  targetText?: string;
  monthlyExpensesText?: string;
  reserveRateText?: string;
  gbmRateText?: string;
  inflationRateText?: string;
  brokerFeeText?: string;
  capitalGainsTaxText?: string;
  extras?: ExtraIncome[];
  events?: CalendarEvent[];
  transactions?: Transaction[];
  dataMode?: DataMode;
  savedAt?: number;
};
type ConfirmationAction =
  | { kind: "delete-transaction"; transaction: Transaction }
  | { kind: "reset-example" };
type Transaction = {
  id: string;
  date: string;
  title: string;
  amount: number;
  kind: TransactionKind;
  accountId: string;
  toAccountId: string | null;
  category: string;
  note: string;
};
type TransactionDraft = Omit<Transaction, "id" | "amount"> & { amount: number; amountText: string };
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
  { id: "demo-emergency", label: "Ahorro de emergencia", amount: 72000, rate: "6.5% anual estimado", group: "reserve", note: "Ejemplo de reserva disponible" },
  { id: "demo-cetes", label: "CETES de ejemplo", amount: 45000, rate: "6.5% anual estimado", group: "reserve", note: "Ejemplo de ahorro de corto plazo" },
  { id: "demo-index", label: "Inversión indexada", amount: 90000, rate: "9% anual estimado en MXN", group: "investment", note: "Ejemplo de VOO por Trading MX" },
];

const DEFAULT_EMERGENCY_IDS = ["demo-emergency", "demo-cetes"];

const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const preciseMoney = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const plainNumber = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const formatMoney = (value: number) => money.format(sanitizeSignedMoney(value));
const formatPreciseMoney = (value: number) => preciseMoney.format(sanitizeSignedMoney(value));
const formatNumberInput = (value: number) => plainNumber.format(Math.round(sanitizeMoney(value)));
const formatCompact = (value: number) => {
  const safeValue = sanitizeSignedMoney(value);
  const absolute = Math.abs(safeValue);
  const divisor = absolute >= 1000000 ? 1000000 : absolute >= 1000 ? 1000 : 1;
  const suffix = divisor === 1000000 ? " M" : divisor === 1000 ? " k" : "";
  const scaled = safeValue / divisor;
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

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseIsoDate(value);
  return Number.isFinite(date.getTime()) && toIsoDate(date) === value;
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
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

function normalizeEvent(event: Partial<CalendarEvent>, fallbackId = 1): CalendarEvent {
  const date = isValidIsoDate(event.date) ? event.date : toIsoDate(getMexicoToday());
  const numericAmount = sanitizeMoney(typeof event.numericAmount === "number" ? event.numericAmount : parseMoneyInput(safeText(event.amount)));
  const rawAmount = safeText(event.amount);
  const legacyDetail = numericAmount > 0 ? "" : rawAmount;
  const recurrence: EventRecurrence = event.recurrence === "weekly" || event.recurrence === "monthly" || event.recurrence === "annual" ? event.recurrence : "none";
  const recurrenceEnd = isValidIsoDate(event.recurrenceEnd) && event.recurrenceEnd >= date ? event.recurrenceEnd : null;
  const tone: EventTone = event.tone === "green" || event.tone === "orange" || event.tone === "red" ? event.tone : "blue";
  const kind: MovementKind = event.kind === "expense" || event.kind === "income" || event.kind === "contribution" ? event.kind : "transfer";
  const destination: ProjectionDestination = event.destination === "cetes" || event.destination === "gbm" ? event.destination : "none";
  return {
    id: Math.max(1, Math.trunc(clampFiniteNumber(event.id, 1, Number.MAX_SAFE_INTEGER, fallbackId))),
    date,
    title: safeText(event.title).trim() || "Movimiento sin nombre",
    amount: rawAmount || (numericAmount > 0 ? formatMoney(numericAmount) : "$0"),
    detail: safeText(event.detail, legacyDetail),
    numericAmount,
    tone,
    kind,
    destination,
    includeInProjection: event.includeInProjection === true && destination !== "none",
    recurrence,
    recurrenceEnd,
    completedDates: Array.isArray(event.completedDates) ? event.completedDates.filter(isValidIsoDate) : [],
    skippedDates: Array.isArray(event.skippedDates) ? event.skippedDates.filter(isValidIsoDate) : [],
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
  brokerFeeRate: number,
  capitalGainsTaxRate: number,
) {
  const safeStartingReserve = sanitizeMoney(startingReserve);
  const safeStartingGbm = sanitizeMoney(startingGbm);
  const monthlyRate = (annualRate: number) => Math.pow(1 + sanitizeReturnRate(annualRate) / 100, 1 / 12) - 1;
  const reserveMonthlyReturn = monthlyRate(reserveRate);
  const gbmMonthlyReturn = monthlyRate(gbmRate);
  const feeRate = sanitizePercentRate(brokerFeeRate) / 100;
  const taxRate = sanitizePercentRate(capitalGainsTaxRate) / 100;
  let gbmBasis = safeStartingGbm;
  let brokerFees = 0;
  const netLiquidationValue = (reserveValue: number, gbmValue: number, basis: number) => {
    const saleFee = sanitizeMoney(gbmValue * feeRate);
    const taxableGain = Math.max(0, gbmValue - saleFee - basis);
    const capitalGainsTax = sanitizeMoney(taxableGain * taxRate);
    return sanitizeMoney(reserveValue + gbmValue - saleFee - capitalGainsTax);
  };
  const points = [{ month: 0, reserve: safeStartingReserve, gbm: safeStartingGbm, netTotal: netLiquidationValue(safeStartingReserve, safeStartingGbm, gbmBasis) }];
  let reserve = safeStartingReserve;
  let gbm = safeStartingGbm;
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

    const grossGbmMovement = sanitizeSignedMoney(extraToGbm + movementToGbm);
    const buyFee = sanitizeMoney(Math.max(0, grossGbmMovement) * feeRate);
    reserve = sanitizeMoney(reserve * (1 + reserveMonthlyReturn) + extraToReserve + movementToReserve);
    gbm = sanitizeMoney(gbm * (1 + gbmMonthlyReturn) + grossGbmMovement - buyFee);
    gbmBasis = sanitizeMoney(gbmBasis + grossGbmMovement + Math.max(0, grossGbmMovement) * feeRate);
    brokerFees = sanitizeMoney(brokerFees + buyFee);
    netContributions = sanitizeSignedMoney(netContributions + extraToReserve + extraToGbm + movementToReserve + movementToGbm - buyFee);
    if (!goalMonth && reserve >= target) goalMonth = month;
    points.push({ month, reserve, gbm, netTotal: netLiquidationValue(reserve, gbm, gbmBasis) });
  }

  const finalGbm = points.at(-1)!.gbm;
  const exitSaleFee = sanitizeMoney(finalGbm * feeRate);
  const exitTaxableGain = Math.max(0, finalGbm - exitSaleFee - gbmBasis);
  const exitCapitalGainsTax = sanitizeMoney(exitTaxableGain * taxRate);
  const exitCosts = sanitizeMoney(exitSaleFee + exitCapitalGainsTax);
  return { points, goalMonth, netContributions, brokerFees, exitSaleFee, exitCapitalGainsTax, exitCosts };
}

function createExampleTransactions(today: Date): Transaction[] {
  const at = (monthsAgo: number, day: number) => {
    const value = new Date(today.getFullYear(), today.getMonth() - monthsAgo, Math.min(day, 28), 12);
    return toIsoDate(value > today ? today : value);
  };
  const transactions: Transaction[] = [
    { id: "demo-tx-1", date: at(0, Math.max(1, today.getDate() - 2)), title: "Nómina", amount: 32000, kind: "income", accountId: "demo-daily", toAccountId: null, category: "Trabajo", note: "Ingreso mensual de ejemplo" },
    { id: "demo-tx-2", date: at(0, Math.max(1, today.getDate() - 1)), title: "Aportación al fondo", amount: 6000, kind: "transfer", accountId: "demo-daily", toAccountId: "demo-emergency", category: "Ahorro", note: "Prioridad del mes" },
    { id: "demo-tx-3", date: at(0, Math.max(1, today.getDate() - 1)), title: "Supermercado", amount: 1860, kind: "expense", accountId: "demo-daily", toAccountId: null, category: "Alimentos", note: "Compra semanal" },
    { id: "demo-tx-4", date: at(0, Math.max(1, today.getDate() - 5)), title: "Internet", amount: 649, kind: "expense", accountId: "demo-daily", toAccountId: null, category: "Servicios", note: "" },
    { id: "demo-tx-5", date: at(1, 28), title: "Nómina", amount: 32000, kind: "income", accountId: "demo-daily", toAccountId: null, category: "Trabajo", note: "" },
    { id: "demo-tx-6", date: at(1, 22), title: "Renta", amount: 9800, kind: "expense", accountId: "demo-daily", toAccountId: null, category: "Vivienda", note: "" },
    { id: "demo-tx-7", date: at(1, 12), title: "Aportación a inversión", amount: 3000, kind: "transfer", accountId: "demo-daily", toAccountId: "demo-index", category: "Inversión", note: "VOO por Trading MX" },
    { id: "demo-tx-8", date: at(2, 28), title: "Nómina", amount: 31000, kind: "income", accountId: "demo-daily", toAccountId: null, category: "Trabajo", note: "" },
    { id: "demo-tx-9", date: at(2, 16), title: "Gastos del mes", amount: 13900, kind: "expense", accountId: "demo-daily", toAccountId: null, category: "General", note: "" },
    { id: "demo-tx-10", date: at(3, 28), title: "Nómina", amount: 31000, kind: "income", accountId: "demo-daily", toAccountId: null, category: "Trabajo", note: "" },
    { id: "demo-tx-11", date: at(3, 15), title: "Gastos del mes", amount: 15100, kind: "expense", accountId: "demo-daily", toAccountId: null, category: "General", note: "" },
    { id: "demo-tx-12", date: at(4, 28), title: "Nómina", amount: 30000, kind: "income", accountId: "demo-daily", toAccountId: null, category: "Trabajo", note: "" },
    { id: "demo-tx-13", date: at(4, 14), title: "Gastos del mes", amount: 14750, kind: "expense", accountId: "demo-daily", toAccountId: null, category: "General", note: "" },
    { id: "demo-tx-14", date: at(5, 28), title: "Nómina", amount: 30000, kind: "income", accountId: "demo-daily", toAccountId: null, category: "Trabajo", note: "" },
    { id: "demo-tx-15", date: at(5, 13), title: "Gastos del mes", amount: 16300, kind: "expense", accountId: "demo-daily", toAccountId: null, category: "General", note: "" },
  ];
  return transactions.sort((a, b) => b.date.localeCompare(a.date));
}

function normalizeTransaction(transaction: Partial<Transaction>, fallbackId = "tx-recovered"): Transaction {
  const kind: TransactionKind = transaction.kind === "income" || transaction.kind === "transfer" ? transaction.kind : "expense";
  return {
    id: safeText(transaction.id).trim() || fallbackId,
    date: isValidIsoDate(transaction.date) ? transaction.date : toIsoDate(getMexicoToday()),
    title: safeText(transaction.title).trim() || (kind === "income" ? "Ingreso" : kind === "transfer" ? "Transferencia" : "Gasto"),
    amount: sanitizeMoney(transaction.amount),
    kind,
    accountId: safeText(transaction.accountId),
    toAccountId: kind === "transfer" ? safeText(transaction.toAccountId) || null : null,
    category: safeText(transaction.category).trim() || (kind === "income" ? "Ingreso" : kind === "transfer" ? "Transferencia" : "General"),
    note: safeText(transaction.note),
  };
}

function normalizeStoredAccounts(value: unknown) {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const normalized: Account[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const account = item as Partial<Account>;
    const id = safeText(account.id).trim() || `recovered-account-${index + 1}`;
    if (ids.has(id)) return;
    ids.add(id);
    const group: AccountGroup = account.group === "reserve" || account.group === "investment" ? account.group : "cash";
    normalized.push({
      id,
      label: safeText(account.label).trim() || `Cuenta ${normalized.length + 1}`,
      amount: sanitizeMoney(account.amount),
      rate: safeText(account.rate).trim() || "Sin rendimiento definido",
      group,
      note: safeText(account.note),
    });
  });
  return normalized;
}

function normalizeStoredTransactions(value: unknown, accounts: Account[]) {
  if (!Array.isArray(value)) return [];
  const accountIds = new Set(accounts.map((account) => account.id));
  const transactionIds = new Set<string>();
  const normalized: Transaction[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const transaction = normalizeTransaction(item as Partial<Transaction>, `tx-recovered-${index + 1}`);
    if (transactionIds.has(transaction.id) || !accountIds.has(transaction.accountId)) return;
    if (transaction.kind === "transfer" && (!transaction.toAccountId || transaction.toAccountId === transaction.accountId || !accountIds.has(transaction.toAccountId))) return;
    transactionIds.add(transaction.id);
    normalized.push(transaction);
  });
  return normalized.sort((a, b) => b.date.localeCompare(a.date));
}

function normalizeStoredExtras(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index): ExtraIncome[] => {
    if (!item || typeof item !== "object") return [];
    const extra = item as Partial<ExtraIncome>;
    const startMonth = Math.trunc(clampFiniteNumber(extra.startMonth, 1, MAX_YEARS * 12, 1));
    const rawEndMonth = extra.endMonth === null || extra.endMonth === undefined ? null : Math.trunc(clampFiniteNumber(extra.endMonth, startMonth, MAX_YEARS * 12, startMonth));
    return [{
      id: Math.max(1, Math.trunc(clampFiniteNumber(extra.id, 1, Number.MAX_SAFE_INTEGER, index + 1))),
      enabled: extra.enabled !== false,
      amount: sanitizeMoney(extra.amount),
      recurring: extra.recurring !== false,
      frequency: extra.frequency === "annual" ? "annual" : "monthly",
      destination: extra.destination === "cetes" ? "cetes" : "gbm",
      startMonth,
      endMonth: rawEndMonth,
      monthOfYear: Math.trunc(clampFiniteNumber(extra.monthOfYear, 1, 12, 1)),
      oneTimeMonth: Math.trunc(clampFiniteNumber(extra.oneTimeMonth, 1, MAX_YEARS * 12, 1)),
    }];
  });
}

function normalizeStoredEvents(value: unknown) {
  if (!Array.isArray(value)) return [];
  const ids = new Set<number>();
  return value.flatMap((item, index): CalendarEvent[] => {
    if (!item || typeof item !== "object") return [];
    const event = normalizeEvent(item as Partial<CalendarEvent>, index + 1);
    if (ids.has(event.id)) return [];
    ids.add(event.id);
    return [event];
  });
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true">N</span>;
}

type IconName = "home" | "wallet" | "calendar" | "trend" | "database" | "sun" | "moon" | "shield" | "cash" | "download" | "target";
const ICONS: Record<IconName, ReactNode> = {
  home: (<><path d="M3.5 10.4 12 3.5l8.5 6.9" /><path d="M5.5 9.6V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.6" /><path d="M9.5 21v-5.5h5V21" /></>),
  wallet: (<><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" /><path d="M14.5 10.5H20v4h-5.5a2 2 0 0 1 0-4z" /></>),
  calendar: (<><path d="M7.5 3.5v3M16.5 3.5v3" /><path d="M4.5 9.5h15" /><path d="M6.5 5.5h11a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2z" /></>),
  trend: (<><path d="M3.5 17.5l5.5-5.5 3.5 3.5 7.5-7.5" /><path d="M15 8h5.5v5.5" /></>),
  database: (<><ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" /><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13" /><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>),
  moon: (<path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a7 7 0 0 0 9.7 9.7z" />),
  shield: (<><path d="M12 3.2 19 6v5.2c0 4.3-2.9 8.1-7 9.6-4.1-1.5-7-5.3-7-9.6V6z" /><path d="M9.2 12.1l2 2 3.6-3.7" /></>),
  cash: (<><rect x="3" y="6.5" width="18" height="11" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6.3 9.7v.01M17.7 14.3v.01" /></>),
  download: (<><path d="M12 3.5V15" /><path d="M7.5 10.5 12 15l4.5-4.5" /><path d="M4.5 20.5h15" /></>),
  target: (<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.8" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /></>),
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

function InfoTip({ text }: { text: string }) {
  return <button type="button" className="info-tip" aria-label={`Información: ${text}`}><span aria-hidden="true">i</span><span className="info-tip-content" role="tooltip">{text}</span></button>;
}

function protectionLabel(scheme: ProtectionScheme) {
  if (scheme === "ipab") return "IPAB";
  if (scheme === "prosofipo") return "PROSOFIPO";
  if (scheme === "none") return "No IPAB/Fondo";
  return "Por confirmar";
}

function validationLabel(status: SavingsOption["validationStatus"]) {
  if (status === "verified") return "Confirmado";
  if (status === "partial") return "Parcial";
  return "Revisar";
}

function parseReferenceNumber(value: string, fallback: number, minimum: number, maximum: number) {
  const numeric = Number(value.replace(",", "."));
  return Number.isFinite(numeric) ? Math.min(Math.max(numeric, minimum), maximum) : fallback;
}

function SavingsOptionsReference() {
  const [udiText, setUdiText] = useState(String(REFERENCE_SHEET.udiValue));
  const [daysText, setDaysText] = useState(String(REFERENCE_SHEET.days));
  const udiValue = parseReferenceNumber(udiText, REFERENCE_SHEET.udiValue, 0.000001, 100);
  const days = Math.round(parseReferenceNumber(daysText, REFERENCE_SHEET.days, 1, 365));
  const validation = calculateReferenceValidation(udiValue, days);
  const initialOptions = SAVINGS_OPTIONS.filter((option) => option.group === "initial");
  const otherOptions = SAVINGS_OPTIONS.filter((option) => option.group === "other");

  const renderOption = (option: SavingsOption) => {
    const displayedRate = option.currentRate ?? option.annualRate;
    const protectionAmount = option.validatedProtection === "ipab"
      ? validation.ipabProtection
      : option.validatedProtection === "prosofipo" ? validation.prosofipoProtection : null;
    const hasRateCorrection = option.currentRate !== undefined && option.annualRate !== option.currentRate;
    const hasProtectionCorrection = option.sheetProtection !== option.validatedProtection;

    return (
      <article className={`reference-option-card status-${option.validationStatus}`} key={option.id}>
        <div className="reference-option-head">
          <h4>{option.name}</h4>
          <span className={`reference-status ${option.validationStatus}`}>{validationLabel(option.validationStatus)}</span>
        </div>
        <div className="reference-option-metrics">
          <div><span>Tasa anual</span><strong>{displayedRate === null ? "—" : `${displayedRate.toFixed(2)}%`}</strong>{hasRateCorrection && <small>Hoja: {option.annualRate!.toFixed(2)}%</small>}</div>
          <div><span>Tope de la hoja</span><strong>{option.capText}</strong></div>
          <div><span>Protección validada</span><strong>{protectionLabel(option.validatedProtection)}</strong>{protectionAmount !== null && <small>{formatPreciseMoney(protectionAmount)}</small>}</div>
        </div>
        {option.invested !== null && <div className="reference-option-report"><span>Captura · {REFERENCE_SHEET.days} días</span><strong>{option.reportedInterest === null ? "—" : formatPreciseMoney(option.reportedInterest)}</strong><small>ISR de hoja: {option.reportedTax === null ? "—" : formatPreciseMoney(option.reportedTax)}</small></div>}
        <p className="reference-option-requirement"><strong>Requisito</strong>{option.requirement}</p>
        <p className="reference-option-note">{option.validationNote}{hasProtectionCorrection && ` La hoja marca ${protectionLabel(option.sheetProtection)}.`}</p>
        <a className="reference-option-source" href={option.sourceUrl} target="_blank" rel="noreferrer">Fuente: {option.sourceLabel}<span aria-hidden="true">↗</span></a>
      </article>
    );
  };

  return (
    <section className="panel reference-options-panel">
      <details>
        <summary className="reference-options-summary">
          <span className="reference-summary-copy"><span className="eyebrow">CATÁLOGO DE AHORRO</span><strong>Opciones, tasas y protección</strong><small>{SAVINGS_OPTIONS.length} opciones · datos de la hoja con revisión de fuentes</small></span>
          <span className="reference-summary-mark" aria-hidden="true">+</span>
        </summary>
        <div className="reference-options-body">
          <div className="reference-review-note">
            <span className="reference-review-icon" aria-hidden="true">i</span>
            <p><strong>Qué está validado</strong> Los límites de IPAB y Fondo de Protección, las conversiones de UDI y los totales de la hoja se revisan aquí. Las tasas, promociones y requisitos cambian; una marca “Parcial” o “Revisar” no debe usarse como confirmación contractual.</p>
          </div>

          <div className="reference-controls">
            <label><span>Plazo de cálculo</span><div className="reference-input"><input type="text" inputMode="numeric" value={daysText} onChange={(event) => setDaysText(event.target.value)} onBlur={() => setDaysText(String(days))} /><b>días</b></div></label>
            <label><span>UDI de referencia <small>editable</small></span><div className="reference-input"><input type="text" inputMode="decimal" value={udiText} onChange={(event) => setUdiText(event.target.value)} onBlur={() => setUdiText(udiValue.toFixed(6))} /><b>MXN</b></div></label>
          </div>

          <div className="reference-validation-grid" aria-label="Validación de la hoja">
            <article><span>Inversión total</span><strong>{formatMoney(validation.investedTotal)}</strong><small>Suma de las filas iniciales</small></article>
            <article><span>Tasa ponderada</span><strong>{validation.weightedRate.toFixed(2)}%</strong><small>Coincide con la hoja: {REFERENCE_SHEET.reportedWeightedRate.toFixed(2)}%</small></article>
            <article><span>Rendimiento reportado</span><strong>{formatPreciseMoney(REFERENCE_SHEET.reportedInterestTotal)}</strong><small>Filas suman {formatPreciseMoney(validation.rowInterestTotal)} · diferencia {formatPreciseMoney(validation.rowTotalDifference)}</small></article>
            <article><span>ISR reportado</span><strong>{formatPreciseMoney(REFERENCE_SHEET.reportedTaxTotal)}</strong><small>Filas suman {formatPreciseMoney(validation.rowTaxTotal)}</small></article>
            <article className={Math.abs(validation.simpleInterestDifference) > 0.01 ? "is-warning" : ""}><span>Fórmula simple 365</span><strong>{formatPreciseMoney(validation.simpleInterestTotal)}</strong><small>{days} días · diferencia contra la hoja {formatPreciseMoney(validation.simpleInterestDifference)}</small></article>
          </div>

          <div className="reference-protection-grid">
            <article><span>25,000 UDI · PROSOFIPO</span><strong>{formatPreciseMoney(validation.prosofipoProtection)}</strong><small>Fondo de Protección, si la entidad está autorizada y participa.</small></article>
            <article><span>400,000 UDI · IPAB</span><strong>{formatPreciseMoney(validation.ipabProtection)}</strong><small>Por persona y por institución, sujeto a operaciones garantizadas.</small></article>
          </div>

          <div className="reference-source-strip"><span>Fuentes marco:</span><a href="https://www.gob.mx/ipab" target="_blank" rel="noreferrer">IPAB</a><a href="https://www.fondodeproteccion.mx/" target="_blank" rel="noreferrer">Fondo de Protección</a><a href="https://www.banxico.org.mx/SieInternet/consultarDirectorioInternetAction.do?accion=consultarCuadro&idCuadro=CP150&sector=8&locale=es" target="_blank" rel="noreferrer">Banxico · UDI</a><span>Revisado 18 ago 2026</span></div>

          <div className="reference-option-group">
            <div className="reference-group-heading"><div><span className="eyebrow">CAPTURA PRINCIPAL</span><h3>Opciones iniciales</h3></div><span>{initialOptions.length} opciones</span></div>
            <div className="reference-option-grid">{initialOptions.map(renderOption)}</div>
          </div>
          <div className="reference-option-group">
            <div className="reference-group-heading"><div><span className="eyebrow">ALTERNATIVAS</span><h3>Otras opciones</h3></div><span>{otherOptions.length} opciones</span></div>
            <div className="reference-option-grid">{otherOptions.map(renderOption)}</div>
          </div>

          <p className="reference-maintenance-note">Para actualizar el catálogo de forma permanente, edita únicamente <code>app/lib/savings-options.ts</code>. El UDI también se puede ajustar aquí para recalcular los límites en pesos sin tocar el código.</p>
        </div>
      </details>
    </section>
  );
}

function GoalRing({ progress }: { progress: number }) {
  return (
    <div className="goal-ring" style={{ "--progress": `${progress * 3.6}deg` } as CSSProperties}>
      <div><strong>{progress}%</strong><span>completado</span></div>
    </div>
  );
}

type CashflowPoint = { key: string; label: string; income: number; expense: number };

function CashflowChart({ data }: { data: CashflowPoint[] }) {
  const maxValue = Math.max(1, ...data.flatMap((point) => [point.income, point.expense]));
  return (
    <div className="cashflow-chart" role="img" aria-label="Ingresos y gastos de los últimos seis meses">
      <div className="cashflow-scale" aria-hidden="true"><span>{formatCompact(maxValue)}</span><span>{formatCompact(maxValue / 2)}</span><span>$0</span></div>
      <div className="cashflow-grid">
        <i /><i /><i />
      </div>
      <div className="cashflow-columns">
        {data.map((point) => (
          <div className="cashflow-column" key={point.key} title={`${point.label}: ${formatMoney(point.income)} de ingresos y ${formatMoney(point.expense)} de gastos`}>
            <div className="cashflow-bars" aria-hidden="true">
              <span className="income-bar" style={{ height: `${Math.max(3, (point.income / maxValue) * 100)}%` }} />
              <span className="expense-bar" style={{ height: `${Math.max(3, (point.expense / maxValue) * 100)}%` }} />
            </div>
            <small>{point.label}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransactionMark({ kind }: { kind: TransactionKind }) {
  return <span className={`transaction-mark ${kind}`} aria-hidden="true">{kind === "income" ? "+" : kind === "expense" ? "−" : "↔"}</span>;
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
  const [frameWidth, setFrameWidth] = useState(920);
  const chartFrameRef = useRef<HTMLDivElement>(null);
  const compactChart = frameWidth < 640;
  const width = frameWidth;
  const height = compactChart ? 240 : 310;
  const padding = compactChart
    ? { top: 18, right: 12, bottom: 32, left: 46 }
    : { top: 22, right: 18, bottom: 38, left: 62 };
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
  const labelStep = compactChart
    ? years <= 5 ? 1 : years <= 12 ? 2 : years <= 20 ? 4 : 5
    : years <= 10 ? 1 : years <= 20 ? 2 : 5;
  const xLabels = Array.from({ length: years + 1 }, (_, year) => year)
    .filter((year) => year === 0 || year === years || year % labelStep === 0)
    .map((year) => (
      <text key={year} x={x(year * 12)} y={height - 11} textAnchor="middle">{year === 0 ? "Hoy" : `${year}a`}</text>
    ));

  useEffect(() => {
    const node = chartFrameRef.current;
    if (!node) return;
    const updateWidth = () => {
      if (node.clientWidth > 0) setFrameWidth(Math.round(node.clientWidth));
    };
    updateWidth();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handleMove = (event: ReactPointerEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX = Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width);
    setHoveredMonth(Math.round((relativeX / bounds.width) * (points.length - 1)));
  };

  // En táctil el punto queda fijado al soltar el dedo; con mouse se limpia al salir.
  const handleLeave = (event: ReactPointerEvent<SVGRectElement>) => {
    if (event.pointerType !== "touch") setHoveredMonth(null);
  };

  return (
    <div className="chart-shell">
      <div className="chart-legend">
        <span><i className="legend-line reserve-line" /><span>Reserva nominal<b>{formatMoney(points.at(-1)!.reserve)}</b></span></span>
        <span><i className="legend-line gbm-line" /><span>Inversión nominal<b>{formatMoney(points.at(-1)!.gbm)}</b></span></span>
        <span><i className="legend-line real-line" /><span>Neto liquidable en pesos de hoy<b>{formatMoney(points.at(-1)!.realTotal)}</b></span></span>
        {goalMonth && <span><i className="legend-marker" /> Meta en {formatDurationMonths(goalMonth)}</span>}
      </div>
      <div className="chart-frame" ref={chartFrameRef}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Comparación de reserva nominal, inversión nominal y patrimonio neto liquidable en pesos de hoy">
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
          <rect className="chart-hitbox" x={padding.left} y={padding.top} width={chartWidth} height={chartHeight} onPointerMove={handleMove} onPointerDown={handleMove} onPointerLeave={handleLeave} onContextMenu={(event) => event.preventDefault()} />
        </svg>
        {!compactChart && hoveredPoint && (
          <div className="chart-tooltip" style={{ left: `${(x(hoveredPoint.month) / width) * 100}%` }}>
            <b>{hoveredPoint.month === 0 ? "Hoy" : monthLabelForIndex(hoveredPoint.month, baseDate)}</b>
            <span><i className="tooltip-dot reserve" /> Reserva nominal {formatMoney(hoveredPoint.reserve)}</span>
            <span><i className="tooltip-dot investment" /> Inversión nominal {formatMoney(hoveredPoint.gbm)}</span>
            <span><i className="tooltip-dot real" /> Neto liquidable en pesos de hoy {formatMoney(hoveredPoint.realTotal)}</span>
            <small>Total antes de salida {formatMoney(hoveredPoint.reserve + hoveredPoint.gbm)}</small>
          </div>
        )}
        {compactChart && (
          <div className="chart-readout" aria-live="polite">
            {hoveredPoint ? (
              <>
                <div className="chart-readout-head">
                  <b>{hoveredPoint.month === 0 ? "Hoy" : monthLabelForIndex(hoveredPoint.month, baseDate)}</b>
                  <button type="button" className="chart-readout-close" aria-label="Cerrar el detalle del punto" onClick={() => setHoveredMonth(null)}>×</button>
                </div>
                <div className="chart-readout-grid">
                  <span><i className="tooltip-dot reserve" />Reserva<b>{formatMoney(hoveredPoint.reserve)}</b></span>
                  <span><i className="tooltip-dot investment" />Inversión<b>{formatMoney(hoveredPoint.gbm)}</b></span>
                  <span><i className="tooltip-dot real" />Pesos de hoy<b>{formatMoney(hoveredPoint.realTotal)}</b></span>
                </div>
                <small className="chart-readout-total">Total antes de salida {formatMoney(hoveredPoint.reserve + hoveredPoint.gbm)}</small>
              </>
            ) : (
              <p>Toca o desliza sobre la gráfica para ver los valores de cada mes.</p>
            )}
          </div>
        )}
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

function trapFocusInModal(event: KeyboardEvent, modal: HTMLElement | null) {
  if (event.key !== "Tab" || !modal) return;
  const focusable = Array.from(modal.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
  )).filter((element) => element.getAttribute("aria-hidden") !== "true");
  if (focusable.length === 0) {
    event.preventDefault();
    modal.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1)!;
  if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

function createClientId(prefix: string) {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`;
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
  const [brokerFeeText, setBrokerFeeText] = useState(String(TRADING_MX_COMMISSION));
  const [capitalGainsTaxText, setCapitalGainsTaxText] = useState(String(CAPITAL_GAINS_TAX));
  const [extras, setExtras] = useState<ExtraIncome[]>(() => createExampleExtras(today));
  const [extraDraft, setExtraDraft] = useState<ExtraIncome | null>(null);
  const [editingExtraId, setEditingExtraId] = useState<number | null>(null);
  const [creatingExtra, setCreatingExtra] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>(() => createExampleEvents(today));
  const [transactions, setTransactions] = useState<Transaction[]>(() => createExampleTransactions(today));
  const [transactionEditorOpen, setTransactionEditorOpen] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [transactionDraft, setTransactionDraft] = useState<TransactionDraft>(() => ({
    date: toIsoDate(today),
    title: "",
    amount: 0,
    amountText: "",
    kind: "expense",
    accountId: DEFAULT_ACCOUNTS[0].id,
    toAccountId: null,
    category: "General",
    note: "",
  }));
  const [transactionError, setTransactionError] = useState("");
  const [activityFilter, setActivityFilter] = useState<"all" | TransactionKind>("all");
  const [activitySearch, setActivitySearch] = useState("");
  const [planMode, setPlanMode] = useState<"projection" | "schedule">("projection");
  const [eventEditorOpen, setEventEditorOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [eventDraft, setEventDraft] = useState<Omit<CalendarEvent, "id">>(() => createEventDraft(today));
  const [removedEvent, setRemovedEvent] = useState<CalendarEvent | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDraftAccountId, setSelectedDraftAccountId] = useState(DEFAULT_ACCOUNTS[0].id);
  const [removedDraftAccount, setRemovedDraftAccount] = useState<Account | null>(null);
  const [removedDraftWasEmergency, setRemovedDraftWasEmergency] = useState(false);
  const [accountEditorNotice, setAccountEditorNotice] = useState("");
  const [toast, setToast] = useState<{ tone: "success" | "warning"; message: string } | null>(null);
  const [backupStatus, setBackupStatus] = useState("");
  const [dataMode, setDataMode] = useState<DataMode>("example");
  const [theme, setTheme] = useState<Theme>("light");
  const [backupBusy, setBackupBusy] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [activeView, setActiveView] = useState<AppView>("overview");
  const [confirmationAction, setConfirmationAction] = useState<ConfirmationAction | null>(null);
  const closeEditorButtonRef = useRef<HTMLButtonElement>(null);
  const closeTransactionButtonRef = useRef<HTMLButtonElement>(null);
  const closeConfirmationButtonRef = useRef<HTMLButtonElement>(null);
  const editorModalRef = useRef<HTMLElement>(null);
  const transactionModalRef = useRef<HTMLElement>(null);
  const confirmationModalRef = useRef<HTMLElement>(null);
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const transactionTriggerRef = useRef<HTMLElement | null>(null);
  const confirmationTriggerRef = useRef<HTMLElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const extrasCardRef = useRef<HTMLDivElement>(null);
  const themeResolvedRef = useRef(false);
  const storageWarningShownRef = useRef(false);

  const total = sumAccounts(accounts);
  const reserve = selectedTotal(accounts, emergencyIds);
  const gbm = sumAccounts(accounts, "investment");
  const cash = sumAccounts(accounts, "cash");
  const target = Math.max(1, parseMoneyInput(targetText) || DEFAULT_TARGET);
  const monthlyExpenses = Math.max(0, parseMoneyInput(monthlyExpensesText));
  const recommendedTargetMin = monthlyExpenses * 3;
  const recommendedTargetMax = monthlyExpenses * 6;
  const coverageMonths = monthlyExpenses > 0 ? reserve / monthlyExpenses : null;
  const reserveRate = sanitizeReturnRate(reserveRateText);
  const gbmRate = sanitizeReturnRate(gbmRateText);
  const inflationRate = sanitizeInflationRate(inflationRateText);
  const brokerFee = sanitizePercentRate(brokerFeeText);
  const capitalGainsTax = sanitizePercentRate(capitalGainsTaxText);
  const reserveProgress = Math.min(Math.round((reserve / target) * 100), 100);
  const activeExtras = extras.filter((extra) => extra.enabled);
  const projectedEventSeries = events.filter((event) => event.includeInProjection).length;
  const plannedMonthlyTotal = activeExtras
    .filter((extra) => extra.recurring && extra.frequency === "monthly")
    .reduce((total, extra) => total + extra.amount, 0);
  const extrasSummary = extras.length === 0
    ? "Sin escenarios guardados"
    : `${extras.length} ${extras.length === 1 ? "escenario" : "escenarios"} · ${activeExtras.length} ${activeExtras.length === 1 ? "activo" : "activos"}${plannedMonthlyTotal > 0 ? ` · ${formatMoney(plannedMonthlyTotal)} al mes` : ""}`;
  const projection = useMemo(
    () => buildProjection(years, reserve, gbm, reserveRate, gbmRate, extras, events, target, today, brokerFee, capitalGainsTax),
    [years, reserve, gbm, reserveRate, gbmRate, extras, events, target, today, brokerFee, capitalGainsTax],
  );
  const comparisonPoints = useMemo(
    () => projection.points.map((point) => {
      const inflationFactor = Math.pow(1 + inflationRate / 100, point.month / 12);
      return { ...point, realTotal: point.netTotal / inflationFactor };
    }),
    [projection.points, inflationRate],
  );
  const lastNominalPoint = projection.points.at(-1)!;
  const lastComparisonPoint = comparisonPoints.at(-1)!;
  const lastGrossNominalTotal = lastNominalPoint.reserve + lastNominalPoint.gbm;
  const lastNominalTotal = lastNominalPoint.netTotal;
  const inflationImpact = Math.max(0, lastNominalTotal - lastComparisonPoint.realTotal);
  const projectedStartingTotal = reserve + gbm;
  const estimatedReturn = lastNominalTotal - projectedStartingTotal - projection.netContributions;
  const visibleEvents = useMemo(() => getEventOccurrences(events, calendarMonth), [events, calendarMonth]);
  const annualProjectionPoints = comparisonPoints.filter((point) => point.month === 0 || point.month % 12 === 0 || point.month === years * 12);
  const selectedDraftAccount = draftAccounts.find((account) => account.id === selectedDraftAccountId) ?? draftAccounts[0] ?? null;
  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const currentMonthTransactions = transactions.filter((transaction) => transaction.date.startsWith(currentMonthKey));
  const monthIncome = currentMonthTransactions.filter((transaction) => transaction.kind === "income").reduce((sum, transaction) => sum + transaction.amount, 0);
  const monthExpense = currentMonthTransactions.filter((transaction) => transaction.kind === "expense").reduce((sum, transaction) => sum + transaction.amount, 0);
  const monthNet = monthIncome - monthExpense;
  const savingsRate = monthIncome > 0 ? Math.max(-100, Math.min(100, (monthNet / monthIncome) * 100)) : null;
  const reserveGap = Math.max(0, target - reserve);
  const cashflowData = useMemo<CashflowPoint[]>(() => Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1, 12);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const monthTransactions = transactions.filter((transaction) => transaction.date.startsWith(key));
    return {
      key,
      label: date.toLocaleDateString("es-MX", { month: "short" }).replace(".", ""),
      income: monthTransactions.filter((transaction) => transaction.kind === "income").reduce((sum, transaction) => sum + transaction.amount, 0),
      expense: monthTransactions.filter((transaction) => transaction.kind === "expense").reduce((sum, transaction) => sum + transaction.amount, 0),
    };
  }), [transactions, today]);
  const filteredTransactions = useMemo(() => {
    const query = activitySearch.trim().toLocaleLowerCase("es-MX");
    return transactions
      .filter((transaction) => activityFilter === "all" || transaction.kind === activityFilter)
      .filter((transaction) => !query || `${transaction.title} ${transaction.category} ${transaction.note}`.toLocaleLowerCase("es-MX").includes(query))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, activityFilter, activitySearch]);
  const allocation = [
    { key: "cash", label: "Disponible", value: cash, color: "var(--cash)" },
    { key: "reserve", label: "Reserva", value: reserve, color: "var(--reserve)" },
    { key: "investment", label: "Inversión", value: gbm, color: "var(--investment)" },
  ];
  const modeLabel = dataMode === "example" ? "Modo ejemplo" : dataMode === "imported" ? "Respaldo importado" : "Datos personales";
  const modeDescription = dataMode === "example" ? "Explora con información ficticia" : "Guardado privado en este dispositivo";

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      let savedTheme: string | null = null;
      try {
        savedTheme = window.localStorage.getItem(THEME_KEY);
      } catch {
        savedTheme = null;
      }
      const preferredTheme: Theme = savedTheme === "dark" || savedTheme === "light"
        ? savedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      themeResolvedRef.current = true;
      setTheme((current) => current === preferredTheme ? current : preferredTheme);
      document.documentElement.dataset.theme = preferredTheme;
      document.documentElement.style.colorScheme = preferredTheme;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!themeResolvedRef.current) return;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // The interface remains usable when private browsing blocks persistence.
    }
  }, [theme]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      try {
        const candidateKeys = [
          STORAGE_KEY,
          ...getNexoStorageKeys()
            .filter((key) => key !== STORAGE_KEY)
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true })),
        ];
        let data: StoredSnapshot | null = null;
        for (const key of candidateKeys) {
          const saved = window.localStorage.getItem(key);
          if (!saved) continue;
          try {
            const candidate = JSON.parse(saved) as StoredSnapshot;
            if (candidate && normalizeStoredAccounts(candidate.accounts).length > 0) {
              data = candidate;
              break;
            }
          } catch {
            // Try the next preserved Nexo snapshot instead of deleting recovery data.
          }
        }
        if (data) {
          const loadedAccounts = normalizeStoredAccounts(data.accounts);
          const loadedAccountIds = new Set(loadedAccounts.map((account) => account.id));
          setAccounts(loadedAccounts);
          setEmergencyIds(Array.isArray(data.emergencyIds) ? data.emergencyIds.filter((id) => loadedAccountIds.has(id)) : []);
          if (typeof data.years === "number") setYears(Math.trunc(clampFiniteNumber(data.years, 1, MAX_YEARS, DEFAULT_YEARS)));
          if (typeof data.targetText === "string") setTargetText(formatNumberInput(parseMoneyInput(data.targetText)));
          if (typeof data.monthlyExpensesText === "string") setMonthlyExpensesText(formatNumberInput(parseMoneyInput(data.monthlyExpensesText)));
          if (typeof data.reserveRateText === "string") setReserveRateText(String(sanitizeReturnRate(data.reserveRateText)));
          if (typeof data.gbmRateText === "string") setGbmRateText(String(sanitizeReturnRate(data.gbmRateText)));
          if (typeof data.inflationRateText === "string") setInflationRateText(String(sanitizeInflationRate(data.inflationRateText)));
          if (typeof data.brokerFeeText === "string") setBrokerFeeText(String(sanitizePercentRate(data.brokerFeeText)));
          if (typeof data.capitalGainsTaxText === "string") setCapitalGainsTaxText(String(sanitizePercentRate(data.capitalGainsTaxText)));
          if (Array.isArray(data.extras)) setExtras(normalizeStoredExtras(data.extras));
          if (Array.isArray(data.events)) setEvents(normalizeStoredEvents(data.events));
          const savedMode = data.dataMode === "imported" || data.dataMode === "personal" ? data.dataMode : "example";
          setTransactions(Array.isArray(data.transactions)
            ? normalizeStoredTransactions(data.transactions, loadedAccounts)
            : savedMode === "example" ? createExampleTransactions(today) : []);
          setDataMode(savedMode);
          if (typeof data.savedAt === "number" && Number.isFinite(data.savedAt)) setLastSavedAt(data.savedAt);
        }
      } catch {
        // Defaults remain available when browser storage cannot be read.
      } finally {
        setStorageReady(true);
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [today]);

  useEffect(() => {
    if (!storageReady) return;
    const savedAt = Date.now();
    let statusTimer: number | undefined;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        accounts,
        emergencyIds,
        years,
        targetText,
        monthlyExpensesText,
        reserveRateText,
        gbmRateText,
        inflationRateText,
        brokerFeeText,
        capitalGainsTaxText,
        extras,
        events,
        transactions,
        dataMode,
        savedAt,
      }));
      storageWarningShownRef.current = false;
      statusTimer = window.setTimeout(() => setLastSavedAt(savedAt), 0);
    } catch {
      const shouldNotify = !storageWarningShownRef.current;
      storageWarningShownRef.current = true;
      statusTimer = window.setTimeout(() => {
        setBackupStatus("El navegador bloqueó el guardado local. Descarga un Excel para no perder tus cambios.");
        if (shouldNotify) showToast("No se pudo guardar en este navegador. Crea un respaldo de Excel.", "warning");
      }, 0);
    }
    return () => window.clearTimeout(statusTimer);
  }, [storageReady, accounts, emergencyIds, years, targetText, monthlyExpensesText, reserveRateText, gbmRateText, inflationRateText, brokerFeeText, capitalGainsTaxText, extras, events, transactions, dataMode]);

  useEffect(() => {
    if (!editing) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditing(false);
      trapFocusInModal(event, editorModalRef.current);
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

  useEffect(() => {
    if (!transactionEditorOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTransactionEditorOpen(false);
      trapFocusInModal(event, transactionModalRef.current);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    closeTransactionButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (transactionTriggerRef.current?.isConnected) transactionTriggerRef.current.focus();
    };
  }, [transactionEditorOpen]);

  useEffect(() => {
    if (!confirmationAction) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmationAction(null);
      trapFocusInModal(event, confirmationModalRef.current);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    closeConfirmationButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (confirmationTriggerRef.current?.isConnected) confirmationTriggerRef.current.focus();
    };
  }, [confirmationAction]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function openEditor() {
    editorTriggerRef.current = document.activeElement as HTMLElement | null;
    setDraftAccounts(accounts.map((account) => ({ ...account, amountText: formatNumberInput(account.amount) })));
    setDraftEmergencyIds([...emergencyIds]);
    setSelectedDraftAccountId(accounts[0]?.id ?? "");
    setRemovedDraftAccount(null);
    setRemovedDraftWasEmergency(false);
    setAccountEditorNotice("");
    setEditing(true);
  }

  function markDataPersonal() {
    setDataMode((current) => current === "example" ? "personal" : current);
  }

  function showToast(message: string, tone: "success" | "warning" = "success") {
    setToast({ message, tone });
  }

  function startPersonalSetup() {
    const starterAccounts: Account[] = [{
      id: createClientId("personal-main"),
      label: "Cuenta principal",
      amount: 0,
      amountText: "0",
      rate: "Liquidez inmediata",
      group: "cash",
      note: "Cuenta para ingresos y gastos cotidianos",
    }];
    setAccounts(starterAccounts.map((account) => ({ ...account, amountText: undefined })));
    setDraftAccounts(starterAccounts);
    setEmergencyIds([]);
    setDraftEmergencyIds([]);
    setTransactions([]);
    setEvents([]);
    setExtras([]);
    setSelectedDraftAccountId(starterAccounts[0].id);
    setDataMode("personal");
    setAccountEditorNotice("Empieza con esta cuenta principal o agrega las que necesites. Puedes cambiar su tipo y saldo.");
    setEditing(true);
  }

  function accountLabel(id: string | null) {
    if (!id) return "Sin cuenta";
    return accounts.find((account) => account.id === id)?.label ?? "Cuenta eliminada";
  }

  function newTransactionDraft(kind: TransactionKind, destinationId?: string): TransactionDraft {
    const firstCash = accounts.find((account) => account.group === "cash") ?? accounts[0];
    const firstDestination = destinationId
      ? accounts.find((account) => account.id === destinationId)
      : accounts.find((account) => account.id !== firstCash?.id);
    return {
      date: todayIso,
      title: kind === "transfer" ? "Transferencia" : "",
      amount: 0,
      amountText: "",
      kind,
      accountId: firstCash?.id ?? "",
      toAccountId: kind === "transfer" ? firstDestination?.id ?? null : null,
      category: kind === "income" ? "Trabajo" : kind === "transfer" ? "Ahorro" : "General",
      note: "",
    };
  }

  function openNewTransaction(kind: TransactionKind = "expense", destinationId?: string) {
    transactionTriggerRef.current = document.activeElement as HTMLElement | null;
    setEditingTransactionId(null);
    setTransactionDraft(newTransactionDraft(kind, destinationId));
    setTransactionError("");
    setTransactionEditorOpen(true);
  }

  function openTransactionEditor(transaction: Transaction) {
    transactionTriggerRef.current = document.activeElement as HTMLElement | null;
    setEditingTransactionId(transaction.id);
    setTransactionDraft({ ...transaction, amountText: formatNumberInput(transaction.amount) });
    setTransactionError("");
    setTransactionEditorOpen(true);
  }

  function adjustAccountsForTransaction(current: Account[], transaction: Pick<Transaction, "kind" | "amount" | "accountId" | "toAccountId">, direction: 1 | -1) {
    return current.map((account) => {
      let delta = 0;
      if (transaction.kind === "income" && account.id === transaction.accountId) delta = transaction.amount;
      if (transaction.kind === "expense" && account.id === transaction.accountId) delta = -transaction.amount;
      if (transaction.kind === "transfer" && account.id === transaction.accountId) delta = -transaction.amount;
      if (transaction.kind === "transfer" && account.id === transaction.toAccountId) delta = transaction.amount;
      return delta === 0 ? account : { ...account, amount: Math.round((account.amount + delta * direction) * 100) / 100 };
    });
  }

  function saveTransaction() {
    const draft = { ...transactionDraft, amount: parseMoneyInput(transactionDraft.amountText) || transactionDraft.amount };
    if (!draft.accountId || !accounts.some((account) => account.id === draft.accountId)) {
      setTransactionError("Selecciona una cuenta válida.");
      return;
    }
    if (draft.amount <= 0) {
      setTransactionError("Ingresa un monto mayor a cero.");
      return;
    }
    if (draft.kind === "transfer" && (!draft.toAccountId || draft.toAccountId === draft.accountId)) {
      setTransactionError("Elige una cuenta de destino distinta.");
      return;
    }
    const previous = editingTransactionId ? transactions.find((transaction) => transaction.id === editingTransactionId) : null;
    const baseAccounts = previous ? adjustAccountsForTransaction(accounts, previous, -1) : accounts;
    const sourceBalance = baseAccounts.find((account) => account.id === draft.accountId)?.amount ?? 0;
    if ((draft.kind === "expense" || draft.kind === "transfer") && draft.amount > sourceBalance) {
      setTransactionError(`El saldo disponible en ${accountLabel(draft.accountId)} es ${formatMoney(sourceBalance)}.`);
      return;
    }
    const saved: Transaction = {
      id: editingTransactionId ?? createClientId("tx"),
      date: draft.date,
      title: draft.title.trim() || draft.category || (draft.kind === "income" ? "Ingreso" : draft.kind === "transfer" ? "Transferencia" : "Gasto"),
      amount: draft.amount,
      kind: draft.kind,
      accountId: draft.accountId,
      toAccountId: draft.kind === "transfer" ? draft.toAccountId : null,
      category: draft.category.trim() || "General",
      note: draft.note.trim(),
    };
    setAccounts(adjustAccountsForTransaction(baseAccounts, saved, 1));
    setTransactions((current) => previous
      ? current.map((transaction) => transaction.id === previous.id ? saved : transaction)
      : [saved, ...current]);
    markDataPersonal();
    showToast(editingTransactionId ? "Movimiento actualizado y saldos recalculados." : "Movimiento registrado y saldos actualizados.");
    setTransactionEditorOpen(false);
    setTransactionError("");
  }

  function removeTransaction(transaction: Transaction) {
    const reversedAccounts = adjustAccountsForTransaction(accounts, transaction, -1);
    if (reversedAccounts.some((account) => account.amount < 0)) {
      showToast("No se puede revertir este ingreso porque la cuenta ya no tiene saldo suficiente.", "warning");
      return;
    }
    confirmationTriggerRef.current = document.activeElement as HTMLElement | null;
    setConfirmationAction({ kind: "delete-transaction", transaction });
  }

  function confirmPendingAction() {
    if (!confirmationAction) return;
    if (confirmationAction.kind === "delete-transaction") {
      const transaction = confirmationAction.transaction;
      const reversedAccounts = adjustAccountsForTransaction(accounts, transaction, -1);
      if (reversedAccounts.some((account) => account.amount < 0)) {
        setConfirmationAction(null);
        showToast("No se puede revertir este ingreso porque la cuenta ya no tiene saldo suficiente.", "warning");
        return;
      }
      setAccounts(reversedAccounts);
      setTransactions((current) => current.filter((item) => item.id !== transaction.id));
      markDataPersonal();
      setConfirmationAction(null);
      showToast("Movimiento eliminado y saldo revertido.");
      return;
    }
    setConfirmationAction(null);
    applyExampleReset();
  }

  function updateDraftAccount(id: string, patch: Partial<Account>) {
    setDraftAccounts((current) => current.map((account) => account.id === id ? { ...account, ...patch } : account));
  }

  function updateDraftAmount(id: string, value: string) {
    updateDraftAccount(id, { amountText: value, amount: parseMoneyInput(value) });
  }

  function addDraftAccount() {
    const id = createClientId("custom");
    setDraftAccounts((current) => [...current, { id, label: "Nueva cuenta", amount: 0, amountText: "0", rate: "Por definir", group: "cash", note: "Agrega una nota" }]);
    setSelectedDraftAccountId(id);
  }

  function removeDraftAccount(id: string) {
    const usedByActivity = transactions.some((transaction) => transaction.accountId === id || transaction.toAccountId === id);
    if (usedByActivity) {
      setAccountEditorNotice("Esta cuenta tiene movimientos en el historial. Elimínalos o muévelos antes de borrar la cuenta.");
      return;
    }
    if (draftAccounts.length === 1) {
      setAccountEditorNotice("Nexo necesita al menos una cuenta para registrar actividad.");
      return;
    }
    setAccountEditorNotice("");
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
    setAccounts(draftAccounts.map((account, index) => ({ id: account.id, label: account.label.trim() || `Cuenta ${index + 1}`, amount: account.amount, rate: account.rate.trim() || "Sin rendimiento definido", group: account.group, note: account.note.trim() })));
    setEmergencyIds(draftEmergencyIds);
    markDataPersonal();
    showToast("Cuentas y saldos guardados.");
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
    setExtrasOpen(true);
  }

  function startExtraCreation() {
    addExtra();
    window.requestAnimationFrame(() => extrasCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function editExtra(item: ExtraIncome) {
    setExtraDraft({ ...item, amountText: formatNumberInput(item.amount) });
    setEditingExtraId(item.id);
    setCreatingExtra(false);
    setExtrasOpen(true);
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
    markDataPersonal();
    cancelExtraEdit();
  }

  function removeExtra(id: number) {
    setExtras((current) => current.filter((extra) => extra.id !== id));
    markDataPersonal();
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
    markDataPersonal();
    const nextMonth = new Date(`${eventDraft.date}T12:00:00`);
    setCalendarMonth(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1));
    setEventDraft(createEventDraft(today));
    setEditingEventId(null);
    setEventEditorOpen(false);
  }

  function toggleOccurrenceCompleted(event: CalendarOccurrence) {
    setEvents((current) => current.map((item) => item.id === event.sourceId
      ? {
        ...item,
        completedDates: item.completedDates.includes(event.date) ? item.completedDates.filter((date) => date !== event.date) : [...item.completedDates, event.date],
        skippedDates: item.skippedDates.filter((date) => date !== event.date),
      }
      : item));
    markDataPersonal();
  }

  function skipOccurrence(event: CalendarOccurrence) {
    setEvents((current) => current.map((item) => item.id === event.sourceId
      ? {
        ...item,
        completedDates: item.completedDates.filter((date) => date !== event.date),
        skippedDates: [...new Set([...item.skippedDates, event.date])],
      }
      : item));
    markDataPersonal();
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
      ? { reserve: 5, gbm: 7, inflation: 5 }
      : preset === "optimistic"
        ? { reserve: 8, gbm: 11, inflation: 3.5 }
        : { reserve: RESERVE_RETURN, gbm: GBM_RETURN, inflation: DEFAULT_INFLATION };
    setReserveRateText(String(values.reserve));
    setGbmRateText(String(values.gbm));
    setInflationRateText(String(values.inflation));
  }

  function openBackupPanel() {
    setActiveView("data");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        brokerFee,
        capitalGainsTax,
        extras,
        events,
        transactions,
      }, screenshots, `nexo-respaldo-${todayIso}.xlsx`);
      setBackupStatus(`Excel descargado: ${accounts.length} cuentas, ${transactions.length} operaciones, ${events.length} movimientos planeados y ${extras.length} ${extras.length === 1 ? "escenario" : "escenarios"}.`);
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
      setBrokerFeeText(String(data.brokerFee));
      setCapitalGainsTaxText(String(data.capitalGainsTax));
      setExtras(data.extras);
      setEvents(data.events.map((item) => normalizeEvent(item)));
      setTransactions(data.transactions.map((item) => normalizeTransaction(item)));
      setDataMode("imported");
      setBackupStatus(`Excel importado: ${data.accounts.length} cuentas, ${data.transactions.length} operaciones y ${data.events.length} movimientos planeados.`);
    } catch {
      setBackupStatus("No se pudo importar: selecciona un archivo .xlsx exportado por Nexo y conserva sus hojas y columnas.");
    } finally {
      setBackupBusy(false);
      event.target.value = "";
    }
  }

  function resetToExampleData() {
    confirmationTriggerRef.current = document.activeElement as HTMLElement | null;
    setConfirmationAction({ kind: "reset-example" });
  }

  function applyExampleReset() {
    const freshAccounts = DEFAULT_ACCOUNTS.map((account) => ({ ...account }));
    const freshEmergencyIds = [...DEFAULT_EMERGENCY_IDS];
    try {
      getNexoStorageKeys().forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // Reset the in-memory app even when this browser blocks local storage.
    }
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
    setBrokerFeeText(String(TRADING_MX_COMMISSION));
    setCapitalGainsTaxText(String(CAPITAL_GAINS_TAX));
    setExtras(createExampleExtras(today));
    setExtraDraft(null);
    setEditingExtraId(null);
    setCreatingExtra(false);
    setEvents(createExampleEvents(today));
    setTransactions(createExampleTransactions(today));
    setTransactionEditorOpen(false);
    setEditingTransactionId(null);
    setTransactionDraft(newTransactionDraft("expense"));
    setTransactionError("");
    setActivityFilter("all");
    setActivitySearch("");
    setEventEditorOpen(false);
    setEditingEventId(null);
    setEventDraft(createEventDraft(today));
    setRemovedEvent(null);
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDraftAccountId(freshAccounts[0]?.id ?? "");
    setRemovedDraftAccount(null);
    setRemovedDraftWasEmergency(false);
    setAccountEditorNotice("");
    setToast(null);
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

  const navItems: Array<{ id: AppView; label: string; icon: IconName }> = [
    { id: "overview", label: "Inicio", icon: "home" },
    { id: "activity", label: "Actividad", icon: "calendar" },
    { id: "accounts", label: "Cuentas", icon: "wallet" },
    { id: "plan", label: "Plan", icon: "trend" },
    { id: "data", label: "Datos", icon: "database" },
  ];

  function navigateTo(view: AppView) {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>

      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => navigateTo("overview")}><BrandMark /><span className="brand-text">Nexo<small>finanzas personales</small></span></button>
        <nav className="side-nav" aria-label="Navegación principal">
          {navItems.map((item) => (
            <button type="button" key={item.id} className={activeView === item.id ? "active" : ""} aria-current={activeView === item.id ? "page" : undefined} onClick={() => navigateTo(item.id)}>
              <Icon name={item.icon} size={19} /><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-status"><span className={`private-pill ${dataMode === "example" ? "example" : ""}`}><i /> {modeLabel}</span><small>{modeDescription}</small></div>
          <div className="sidebar-foot-row">
            <button className="theme-toggle" type="button" aria-label={`Cambiar a tema ${theme === "light" ? "oscuro" : "claro"}`} aria-pressed={theme === "dark"} onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}>
              <span className="theme-icon" aria-hidden="true"><Icon name={theme === "light" ? "moon" : "sun"} size={17} /></span><b>{theme === "light" ? "Oscuro" : "Claro"}</b>
            </button>
            <button className="backup-button" onClick={openBackupPanel}><Icon name="download" size={16} /><span>Respaldo</span></button>
          </div>
          <button className="primary-button edit-balances-button" onClick={() => openNewTransaction("expense")}>+ Movimiento</button>
        </div>
      </aside>

      <header className="mobile-topbar">
        <button className="brand" type="button" onClick={() => navigateTo("overview")}><BrandMark /><span className="brand-text">Nexo</span></button>
        <div className="top-actions">
          <button className="theme-toggle icon-only" type="button" aria-label={`Cambiar a tema ${theme === "light" ? "oscuro" : "claro"}`} aria-pressed={theme === "dark"} onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}>
            <span className="theme-icon" aria-hidden="true"><Icon name={theme === "light" ? "moon" : "sun"} size={18} /></span><b>{theme === "light" ? "Oscuro" : "Claro"}</b>
          </button>
          <button className="primary-button edit-balances-button" aria-label="Registrar movimiento" onClick={() => openNewTransaction("expense")}><span className="label-full">+ Movimiento</span><span className="label-short" aria-hidden="true">+</span></button>
        </div>
      </header>

      <div className="content-area">
      <div className="page-wrap" id="contenido" tabIndex={-1}>
        <div id="export-overview" className="view-page" hidden={activeView !== "overview"}>
          <section id="inicio" className="page-heading">
            <div><span className="eyebrow">{formatHeadingDate(today)}</span><h1>Tu dinero, en perspectiva.</h1><p>{dataMode === "example" ? "Explora Nexo con información ficticia y reemplázala cuando quieras." : "Lo importante de hoy, sin ruido ni hojas de cálculo."}</p></div>
            <div className="heading-meta">
              <span className={`private-pill heading-mode ${dataMode === "example" ? "example" : ""}`}><i /> {modeLabel}</span>
              <button className="primary-button" onClick={() => openNewTransaction("expense")}>+ Registrar movimiento</button>
            </div>
          </section>

          <section className="overview-grid" aria-label="Resumen financiero">
            <article className="net-worth-card"><div className="hero-orb orb-one" /><div className="hero-orb orb-two" /><div className="card-label"><span>Patrimonio total</span><span className="soft-badge">{accounts.length} cuentas</span></div><strong className="hero-amount">{formatMoney(total)}</strong><div className={`wealth-change ${monthNet >= 0 ? "positive" : "negative"}`}><span>{monthNet >= 0 ? "↗" : "↘"}</span><strong>{monthNet >= 0 ? "+" : "−"}{formatMoney(Math.abs(monthNet))}</strong><small>flujo neto este mes</small></div><div className="net-worth-foot"><span><i className="status-dot green" /> {dataMode === "example" ? "Datos de ejemplo" : "Saldos al día"}</span><small>MXN · {lastSavedAt ? "guardado automático" : "preparando datos"}</small></div></article>
            <article className="metric-card"><div className="metric-icon reserve-icon"><Icon name="shield" size={19} /></div><div><span>Reserva</span><strong>{formatMoney(reserve)}</strong><small>{reserveProgress}% de la meta</small></div></article>
            <article className="metric-card"><div className="metric-icon cash-icon"><Icon name="cash" size={19} /></div><div><span>Disponible</span><strong>{formatMoney(cash)}</strong><small>Liquidez · no se proyecta</small></div></article>
            <article className="metric-card"><div className="metric-icon invest-icon"><Icon name="trend" size={19} /></div><div><span>Inversiones</span><strong>{formatMoney(gbm)}</strong><small>{accounts.filter((account) => account.group === "investment").length} {accounts.filter((account) => account.group === "investment").length === 1 ? "cuenta" : "cuentas"} · largo plazo</small></div></article>
          </section>

          {dataMode === "example" && <aside className="demo-guide"><span className="demo-guide-mark">N</span><div><strong>Estás viendo una historia de ejemplo</strong><p>Cuando estés listo, crea un espacio limpio y agrega únicamente tus cuentas reales.</p></div><button className="secondary-button" onClick={startPersonalSetup}>Configurar mis datos</button></aside>}

          <section className="overview-insight-grid">
            <article className="panel cashflow-panel">
              <div className="panel-heading"><div><span className="eyebrow">RITMO FINANCIERO</span><h2>Flujo de efectivo</h2><p>Ingresos y gastos reales, sin contar transferencias.</p></div><button className="text-button" onClick={() => navigateTo("activity")}>Ver actividad <span aria-hidden="true">→</span></button></div>
              <div className="cashflow-summary"><div><span>Ingresos del mes</span><strong className="positive-value">{formatMoney(monthIncome)}</strong></div><div><span>Gastos del mes</span><strong>{formatMoney(monthExpense)}</strong></div><div><span>Tasa de ahorro</span><strong>{savingsRate === null ? "—" : `${savingsRate.toLocaleString("es-MX", { maximumFractionDigits: 0 })}%`}</strong></div></div>
              <CashflowChart data={cashflowData} />
              <div className="chart-key"><span><i className="key-income" />Ingresos</span><span><i className="key-expense" />Gastos</span></div>
            </article>

            <article className="panel reserve-focus">
              <div className="panel-heading compact"><div><span className="eyebrow">PRIORIDAD ACTUAL</span><h2>Fondo de emergencia</h2></div><span className="goal-icon"><Icon name="shield" size={21} /></span></div>
              <div className="reserve-focus-main"><GoalRing progress={reserveProgress} /><div><span>Has reunido</span><strong>{formatMoney(reserve)}</strong><small>de una meta de {formatMoney(target)}</small></div></div>
              <div className="progress-track"><span style={{ width: `${reserveProgress}%` }} /></div>
              <div className="reserve-next-step"><span>{reserveGap > 0 ? "Siguiente mejor paso" : "Meta alcanzada"}</span><strong>{reserveGap > 0 ? `Dirige el excedente de tu nómina aquí hasta completar ${formatMoney(reserveGap)}.` : "Tu siguiente aportación puede ir a inversión de largo plazo."}</strong></div>
              <button className="primary-button full-button" onClick={() => {
                const destination = reserveGap > 0
                  ? accounts.find((account) => emergencyIds.includes(account.id))
                  : accounts.find((account) => account.group === "investment");
                openNewTransaction("transfer", destination?.id);
              }}>{reserveGap > 0 ? "Aportar al fondo" : "Mover a inversión"}</button>
            </article>
          </section>

          <section className="panel recent-panel">
            <div className="panel-heading"><div><span className="eyebrow">RECIENTE</span><h2>Últimos movimientos</h2></div><button className="text-button" onClick={() => navigateTo("activity")}>Ver todos <span aria-hidden="true">→</span></button></div>
            <div className="transaction-list compact-list">
              {transactions.slice(0, 5).map((transaction) => (
                <button className="transaction-row" key={transaction.id} onClick={() => openTransactionEditor(transaction)}>
                  <TransactionMark kind={transaction.kind} />
                  <span className="transaction-copy"><strong>{transaction.title}</strong><small>{transaction.category} · {accountLabel(transaction.accountId)}{transaction.kind === "transfer" ? ` → ${accountLabel(transaction.toAccountId)}` : ""}</small></span>
                  <span className="transaction-date">{parseIsoDate(transaction.date).toLocaleDateString("es-MX", { day: "numeric", month: "short" }).replace(".", "")}</span>
                  <strong className={`transaction-amount ${transaction.kind}`}>{transaction.kind === "income" ? "+" : transaction.kind === "expense" ? "−" : ""}{formatMoney(transaction.amount)}</strong>
                </button>
              ))}
            </div>
          </section>
        </div>

        <section id="activity-view" className="view-page activity-view" hidden={activeView !== "activity"}>
          <div className="page-heading">
            <div><span className="eyebrow">ACTIVIDAD</span><h1>El pulso de tu dinero.</h1><p>Registra cada operación una vez; Nexo actualiza saldos, métricas y gráficas.</p></div>
            <div className="heading-meta"><span className="currency-pill">{transactions.length} {transactions.length === 1 ? "operación" : "operaciones"} · MXN</span><button className="primary-button" onClick={() => openNewTransaction("expense")}>+ Nuevo movimiento</button></div>
          </div>

          <section className="activity-stat-grid" aria-label="Resumen del mes">
            <article><span>Entró este mes</span><strong className="positive-value">+{formatMoney(monthIncome)}</strong><small>{currentMonthTransactions.filter((transaction) => transaction.kind === "income").length} {currentMonthTransactions.filter((transaction) => transaction.kind === "income").length === 1 ? "ingreso" : "ingresos"}</small></article>
            <article><span>Salió este mes</span><strong>−{formatMoney(monthExpense)}</strong><small>{currentMonthTransactions.filter((transaction) => transaction.kind === "expense").length} {currentMonthTransactions.filter((transaction) => transaction.kind === "expense").length === 1 ? "gasto" : "gastos"}</small></article>
            <article className={monthNet >= 0 ? "is-positive" : "is-negative"}><span>Flujo neto</span><strong>{monthNet >= 0 ? "+" : "−"}{formatMoney(Math.abs(monthNet))}</strong><small>{monthNet >= 0 ? "Disponible para tus prioridades" : "Gastaste más de lo que ingresó"}</small></article>
          </section>

          <section className="panel activity-chart-card">
            <div className="panel-heading"><div><span className="eyebrow">ÚLTIMOS 6 MESES</span><h2>Ingresos frente a gastos</h2></div><div className="chart-key"><span><i className="key-income" />Ingresos</span><span><i className="key-expense" />Gastos</span></div></div>
            <CashflowChart data={cashflowData} />
          </section>

          <section className="panel ledger-card">
            <div className="ledger-heading"><div><span className="eyebrow">HISTORIAL</span><h2>Todos los movimientos</h2></div><label className="search-field"><span aria-hidden="true">⌕</span><input type="search" placeholder="Buscar concepto o categoría" value={activitySearch} onChange={(event) => setActivitySearch(event.target.value)} /></label></div>
            <div className="ledger-toolbar">
              <div className="filter-tabs" aria-label="Filtrar actividad">
                {(["all", "income", "expense", "transfer"] as const).map((filter) => <button key={filter} className={activityFilter === filter ? "active" : ""} onClick={() => setActivityFilter(filter)}>{filter === "all" ? "Todo" : filter === "income" ? "Ingresos" : filter === "expense" ? "Gastos" : "Transferencias"}</button>)}
              </div>
              <span>{filteredTransactions.length} resultado{filteredTransactions.length === 1 ? "" : "s"}</span>
            </div>
            {filteredTransactions.length === 0 ? (
              <div className="empty-state"><span>⌕</span><div><strong>No encontramos movimientos</strong><p>Prueba otro filtro o registra una operación nueva.</p></div></div>
            ) : (
              <div className="transaction-list">
                {filteredTransactions.map((transaction) => (
                  <div className="transaction-row" key={transaction.id}>
                    <TransactionMark kind={transaction.kind} />
                    <span className="transaction-copy"><strong>{transaction.title}</strong><small>{transaction.category} · {accountLabel(transaction.accountId)}{transaction.kind === "transfer" ? ` → ${accountLabel(transaction.toAccountId)}` : ""}{transaction.note ? ` · ${transaction.note}` : ""}</small></span>
                    <span className="transaction-date">{parseIsoDate(transaction.date).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }).replace(".", "")}</span>
                    <strong className={`transaction-amount ${transaction.kind}`}>{transaction.kind === "income" ? "+" : transaction.kind === "expense" ? "−" : ""}{formatMoney(transaction.amount)}</strong>
                    <details className="movement-menu"><summary aria-label={`Acciones para ${transaction.title}`}><span aria-hidden="true">•••</span></summary><div className="movement-menu-items"><button onClick={() => openTransactionEditor(transaction)}>Editar</button><button className="danger-link" onClick={() => removeTransaction(transaction)}>Eliminar</button></div></details>
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>

        <section className="dashboard-grid view-page" hidden={activeView !== "accounts"}>
          <div className="page-heading accounts-view-heading">
            <div><span className="eyebrow">CUENTAS</span><h1>Todo en su lugar.</h1><p>Una vista limpia de dónde está tu dinero y qué función cumple.</p></div>
            <div className="heading-meta"><span className="currency-pill">{accounts.length} cuentas · {formatMoney(total)}</span><button className="primary-button" onClick={openEditor}>Administrar cuentas</button></div>
          </div>
          <div className="main-column">
            <section id="cuentas" className="panel accounts-panel">
              <div className="panel-heading"><div><span className="eyebrow">DISTRIBUCIÓN</span><h2>Tus cuentas</h2><p>Los saldos cambian automáticamente al registrar operaciones.</p></div><button className="text-button" onClick={openEditor}>Editar saldos <span aria-hidden="true">→</span></button></div>
              <div className="allocation-strip" aria-label="Distribución del patrimonio">{allocation.filter((item) => item.value > 0).map((item) => <span key={item.key} style={{ width: `${(item.value / Math.max(total, 1)) * 100}%`, background: item.color }} title={`${item.label}: ${formatMoney(item.value)}`} />)}</div>
              <div className="allocation-legend">{allocation.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}<strong>{total > 0 ? `${Math.round((item.value / total) * 100)}%` : "0%"}</strong></span>)}</div>
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
              <div className="panel-heading compact"><div><span className="eyebrow">OBJETIVO PRINCIPAL</span><h2>Reserva de emergencia</h2></div><span className="goal-icon" aria-hidden="true"><Icon name="target" size={21} /></span></div>
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

        <section className="plan-view-header view-page" hidden={activeView !== "plan"}>
          <div className="page-heading">
            <div><span className="eyebrow">PLAN</span><h1>Decide hoy. Mira más lejos.</h1><p>Configura el horizonte, prueba aportaciones opcionales y revisa el resultado.</p></div>
            <div className="heading-meta"><span className="currency-pill">Horizonte · {years} {years === 1 ? "año" : "años"}</span><button className="primary-button" onClick={planMode === "schedule" ? openNewEvent : startExtraCreation}>{planMode === "schedule" ? "+ Planear movimiento" : "+ Agregar escenario"}</button></div>
          </div>
          <div className="view-switcher" role="tablist" aria-label="Vista del plan"><button role="tab" aria-selected={planMode === "projection"} className={planMode === "projection" ? "active" : ""} onClick={() => setPlanMode("projection")}><Icon name="trend" size={18} /> Proyección</button><button role="tab" aria-selected={planMode === "schedule"} className={planMode === "schedule" ? "active" : ""} onClick={() => setPlanMode("schedule")}><Icon name="calendar" size={18} /> Agenda</button></div>
          <div className="plan-guide" aria-label="Ruta rápida para usar Plan">
            <div className="plan-guide-intro"><span className="eyebrow">RUTA RÁPIDA</span><strong>{planMode === "projection" ? "De la idea al resultado" : "De la fecha al seguimiento"}</strong></div>
            <ol className="plan-guide-steps">
              {(planMode === "projection"
                ? [["Define el horizonte", "1 a 30 años"], ["Agrega escenarios", "Opcional"], ["Revisa el resultado", "Gráfica y supuestos"]]
                : [["Planea movimientos", "Fechas e importes"], ["Marca lo hecho", "Seguimiento"], ["Proyecta lo necesario", "Solo lo incluido"]]
              ).map(([title, detail], index) => <li className="plan-guide-step" key={title}><b>{index + 1}</b><span><strong>{title}</strong><small>{detail}</small></span></li>)}
            </ol>
          </div>
        </section>

        <section id="agenda" className="section-wrap movements-section view-page" hidden={activeView !== "plan" || planMode !== "schedule"}>
          <div className="section-heading"><div><span className="eyebrow">MOVIMIENTOS</span><h2>Movimientos planeados</h2><p>Programa lo que viene y decide qué aportaciones entran en la proyección.</p></div><button className={eventEditorOpen ? "secondary-button" : "primary-button"} onClick={() => { if (eventEditorOpen) { setEventEditorOpen(false); setEditingEventId(null); } else { openNewEvent(); } }}>{eventEditorOpen ? "Cancelar" : "+ Agregar movimiento"}</button></div>
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
              </div>
              <div className="event-form-actions"><small>{eventDraft.recurrence === "none" ? "Se agregará un solo movimiento." : `${recurrenceLabel(eventDraft.recurrence)} desde ${eventDraft.date}${eventDraft.recurrenceEnd ? ` hasta ${eventDraft.recurrenceEnd}` : ", sin fecha final"}.`}{eventDraft.includeInProjection ? " Su monto se reflejará en la proyección." : ""}</small><button className="primary-button" disabled={!eventDraft.title.trim() || !eventDraft.date} onClick={saveEvent}>{editingEventId === null ? "Guardar movimiento" : "Guardar cambios"}</button></div>
            </div>
          )}
          {removedEvent && <div className="undo-banner" role="status"><span>Movimiento eliminado.</span><button onClick={undoEventRemoval}>Deshacer</button><button aria-label="Cerrar aviso" onClick={() => setRemovedEvent(null)}>×</button></div>}
          <div className="agenda-grid">
            <div className="events-card">
              <div className="events-head"><div className="events-period"><button onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="Mes anterior">‹</button><strong>{monthNames[calendarMonth.getMonth()]}</strong><button onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="Mes siguiente">›</button></div><span>{visibleEvents.length} movimiento{visibleEvents.length === 1 ? "" : "s"}</span></div>
              {visibleEvents.length === 0 ? <div className="events-empty">No hay eventos en este mes.</div> : visibleEvents.map((event) => {
                const eventDay = Number(event.date.slice(-2));
                const isPast = event.date < todayIso;
                const isCompleted = isPast || event.completedDates.includes(event.date);
                return <div className={`event-row movement-row ${isCompleted ? "is-complete" : ""}`} key={event.occurrenceKey}><span className={`event-day event-${event.tone}`}>{eventDay}</span><div className="event-copy"><div><strong>{event.title}</strong><span className={`movement-kind kind-${event.kind}`}>{movementKindLabel(event.kind)}</span>{event.recurrence !== "none" && <span className="recurrence-chip">{recurrenceLabel(event.recurrence)}</span>}</div><small>{event.numericAmount > 0 ? formatMoney(event.numericAmount) : "Sin monto"}{event.detail ? ` · ${event.detail}` : ""}</small>{event.includeInProjection && <span className="projection-impact">Incluido en {event.destination === "gbm" ? "inversión" : "reserva"}</span>}</div><div className="event-actions movement-actions"><span className="event-state">{isPast ? "Fecha pasada" : isCompleted ? "Completado" : "Pendiente"}</span>{!isPast && <button className="event-primary-action" onClick={() => toggleOccurrenceCompleted(event)}>{isCompleted ? "Reabrir" : "Hecho"}</button>}<details className="movement-menu"><summary aria-label={`Más acciones para ${event.title}`}><span aria-hidden="true">•••</span></summary><div className="movement-menu-items">{event.recurrence !== "none" && !isPast && !isCompleted && <button onClick={() => skipOccurrence(event)}>Omitir</button>}<button onClick={() => editEvent(event.sourceId)}>Editar</button><button className="danger-link" aria-label={`${event.recurrence === "none" ? "Eliminar" : "Eliminar serie"} ${event.title}`} onClick={() => removeEventSeries(event.sourceId)}>{event.recurrence === "none" ? "Eliminar" : "Eliminar serie"}</button></div></details></div></div>;
              })}
            </div>
          </div>
        </section>

        <section id="proyeccion" className="section-wrap projection-section view-page" hidden={activeView !== "plan" || planMode !== "projection"}>
          <div className="section-heading projection-heading">
            <div><span className="eyebrow">PROYECCIÓN</span><h2>Crecimiento y poder adquisitivo</h2><p>Compara en una sola vista los valores nominales y lo que realmente representarían en pesos de hoy.</p></div>
            <div className="projection-controls"><div className="horizon-presets" aria-label="Periodos rápidos">{[1, 5, 10, 20, 30].map((period) => <button className={years === period ? "active" : ""} key={period} onClick={() => setYears(period)}>{period}a</button>)}</div><div className="horizon-control" aria-label="Horizonte de proyección"><button aria-label="Reducir horizonte" onClick={() => setYears((current) => Math.max(1, current - 1))}>−</button><div aria-live="polite"><strong>{years}</strong><span>{years === 1 ? "año" : "años"}</span></div><button aria-label="Aumentar horizonte" onClick={() => setYears((current) => Math.min(MAX_YEARS, current + 1))}>+</button></div></div>
          </div>

          <div className="panel extras-card compact-simulation" ref={extrasCardRef}>
            <div className="extras-head">
              <button type="button" className="extras-toggle" aria-expanded={extrasOpen} aria-controls="extras-panel" onClick={() => setExtrasOpen((current) => !current)}>
                <span className="extras-toggle-copy">
                  <span className="eyebrow">SIMULACIÓN</span>
                  <strong>Escenarios de aportación</strong>
                  <small>{extrasSummary}</small>
                </span>
                <span className="extras-toggle-icon" aria-hidden="true">{extrasOpen ? "−" : "+"}</span>
              </button>
              {extrasOpen && <button className="primary-button extras-add-button" disabled={extraDraft !== null} onClick={addExtra}>{extraDraft ? "Edición en curso" : "+ Agregar escenario"}</button>}
            </div>
            {extrasOpen && (
              <div id="extras-panel">
                <p className="extras-hint">Prueba aportaciones hipotéticas sin convertirlas en movimientos reales de tu agenda. Los escenarios activos se reflejan en la gráfica de abajo.</p>
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
            )}
          </div>

          <div className="projection-grid">
            <div className="panel projection-card comparison-view">
              <div className="projection-summary-head"><div><span>Resultado al final del horizonte</span><strong>{years} {years === 1 ? "año" : "años"}</strong></div><span className="projection-badge success">3 líneas comparables</span></div>
              <div className="projection-story" hidden aria-label="Cómo se forma la proyección">
                <div><span>Parte de hoy</span><strong>{formatMoney(projectedStartingTotal)}</strong><small>{formatMoney(reserve)} reserva + {formatMoney(gbm)} inversión</small></div>
                <i aria-hidden="true">+</i>
                <div><span>Aportaciones netas</span><strong>{formatMoney(projection.netContributions)}</strong><small>{projectedEventSeries} {projectedEventSeries === 1 ? "serie" : "series"} de agenda + {activeExtras.length} {activeExtras.length === 1 ? "escenario" : "escenarios"}</small></div>
                <i aria-hidden="true">+</i>
                <div><span>Rendimiento estimado</span><strong>{formatMoney(estimatedReturn)}</strong><small>Con los supuestos elegidos</small></div>
                <i aria-hidden="true">=</i>
                <div className="story-result"><span>Total neto al salir</span><strong>{formatMoney(lastNominalTotal)}</strong><small>Al final de {years} {years === 1 ? "año" : "años"}</small></div>
              </div>
              <p className="projection-scope"><span className="projection-scope-icon" aria-hidden="true">i</span><span className="projection-scope-copy"><strong>{formatMoney(cash)} disponibles no se proyectan.</strong> Conservan su función de liquidez y no reciben rendimiento hasta que los clasifiques como reserva o inversión.</span></p>
              <div className="projection-metrics">
                <div className="projection-metric gross-metric"><span>Total antes de salida</span><strong>{formatMoney(lastGrossNominalTotal)}</strong><small>Reserva + inversión</small></div>
                <div className="projection-metric real-metric"><span>Neto al salir, en pesos de hoy</span><strong>{formatMoney(lastComparisonPoint.realTotal)}</strong><small>Después de costos e ISR estimados</small></div>
                <div className="projection-metric cost-metric"><span>Costos de salida</span><strong>−{formatMoney(projection.exitCosts)}</strong><small>Comisión + ISR sobre ganancia</small></div>
              </div>
              <ProjectionChart points={comparisonPoints} goalMonth={projection.goalMonth} years={years} target={target} baseDate={today} />
              <p className="chart-note">La línea neta supone una venta al final del horizonte y descuenta comisión de Trading MX e ISR sobre la ganancia. Las tasas son supuestos editables y no constituyen una garantía.</p>
              <details className="projection-data"><summary>Ver tabla anual accesible</summary><div><table><caption>Proyección anual en pesos mexicanos</caption><thead><tr><th>Periodo</th><th>Reserva</th><th>Inversión</th><th>Pesos de hoy</th></tr></thead><tbody>{annualProjectionPoints.map((point) => <tr key={point.month}><th>{point.month === 0 ? "Hoy" : formatDurationMonths(point.month)}</th><td>{formatMoney(point.reserve)}</td><td>{formatMoney(point.gbm)}</td><td>{formatMoney(point.realTotal)}</td></tr>)}</tbody></table></div></details>
            </div>

            <aside className="panel assumptions-card">
              <div className="panel-heading compact"><div><span className="eyebrow">ESCENARIO</span><h2>Supuestos</h2></div></div>
              <div className="scenario-presets"><button onClick={() => applyScenario("conservative")}>Conservador</button><button onClick={() => applyScenario("base")}>Base</button><button onClick={() => applyScenario("optimistic")}>Optimista</button></div>
              <label className="rate-field"><span className="rate-label">Reserva anual <InfoTip text="Supuesto para la reserva y los instrumentos de corto plazo. Es una estimación, no una tasa garantizada." /></span><span className="rate-input"><input aria-label="Reserva anual" type="text" inputMode="decimal" value={reserveRateText} onChange={(event) => setReserveRateText(event.target.value)} onBlur={() => setReserveRateText(String(reserveRate))} /><b>%</b></span></label>
              <label className="rate-field"><span className="rate-label">VOO anual en MXN <InfoTip text="Escenario total que combina el rendimiento de VOO en dólares y el efecto del tipo de cambio expresado en pesos." /></span><span className="rate-input"><input aria-label="VOO anual en MXN" type="text" inputMode="decimal" value={gbmRateText} onChange={(event) => setGbmRateText(event.target.value)} onBlur={() => setGbmRateText(String(gbmRate))} /><b>%</b></span></label>
              <label className="rate-field inflation-rate-field"><span className="rate-label">Inflación anual <InfoTip text="Se usa para convertir el resultado nominal a poder adquisitivo en pesos de hoy." /></span><span className="rate-input"><input aria-label="Inflación anual estimada" type="text" inputMode="decimal" value={inflationRateText} onChange={(event) => setInflationRateText(event.target.value)} onBlur={() => setInflationRateText(String(inflationRate))} /><b>%</b></span></label>
              <details className="projection-settings">
                <summary>Costos e impuestos</summary>
                <div className="goal-fields">
                  <label className="rate-field"><span className="rate-label">Comisión Trading MX <InfoTip text="Costo estimado por operación de compra o venta en Trading MX. Ajusta este valor si tu tarifa cambia." /></span><span className="rate-input"><input aria-label="Comisión de Trading MX" type="text" inputMode="decimal" value={brokerFeeText} onChange={(event) => setBrokerFeeText(event.target.value)} onBlur={() => setBrokerFeeText(String(brokerFee))} /><b>%</b></span></label>
                  <label className="rate-field"><span className="rate-label">ISR estimado sobre ganancia <InfoTip text="Estimación para una venta elegible de VOO en SIC. El tratamiento fiscal individual y los dividendos pueden requerir revisión contable." /></span><span className="rate-input"><input aria-label="ISR estimado sobre ganancia" type="text" inputMode="decimal" value={capitalGainsTaxText} onChange={(event) => setCapitalGainsTaxText(event.target.value)} onBlur={() => setCapitalGainsTaxText(String(capitalGainsTax))} /><b>%</b></span></label>
                </div>
              </details>
              <details className="projection-settings">
                <summary>Ajustar meta de reserva</summary>
                <div className="goal-fields">
                  <label className="target-field"><span>Gasto esencial mensual <InfoTip text="Solo calcula una referencia de cobertura de 3 a 6 meses. No se suma al patrimonio ni a la proyección." /></span><div><b>$</b><input aria-label="Gasto esencial mensual para calcular meses de cobertura" type="text" inputMode="decimal" value={monthlyExpensesText} onChange={(event) => setMonthlyExpensesText(event.target.value)} onBlur={() => setMonthlyExpensesText(formatNumberInput(monthlyExpenses))} /></div></label>
                  <label className="target-field"><span>Meta personalizada</span><div><b>$</b><input aria-label="Meta del fondo de emergencia" type="text" inputMode="decimal" value={targetText} onChange={(event) => setTargetText(event.target.value)} onBlur={() => setTargetText(formatNumberInput(target))} /></div></label>
                  <div className="coverage-card"><span>Cobertura actual</span><strong>{coverageMonths === null ? "—" : `${coverageMonths.toLocaleString("es-MX", { maximumFractionDigits: 1 })} meses`}</strong><small>{coverageMonths === null ? "Agrega tu gasto esencial para calcularla." : coverageMonths >= 6 ? "Supera la referencia amplia de 6 meses." : coverageMonths >= 3 ? "Dentro de la referencia habitual de 3 a 6 meses." : "Por debajo de la referencia inicial de 3 meses."}</small></div>
                  <div className="goal-suggestions"><button onClick={() => setTargetText(formatNumberInput(recommendedTargetMin))}>Usar 3 meses</button><button onClick={() => setTargetText(formatNumberInput(recommendedTargetMax))}>Usar 6 meses</button></div>
                </div>
              </details>
              <div className="assumptions-result"><span>Poder adquisitivo al final</span><strong>{formatMoney(lastComparisonPoint.realTotal)}</strong><small>El total neto al salir es {formatMoney(lastNominalTotal)}. La diferencia de {formatMoney(inflationImpact)} representa el efecto acumulado de una inflación de {inflationRate}% anual.</small></div>
            </aside>
          </div>

          <SavingsOptionsReference />

        </section>

        <section id="respaldo" className="backup-panel view-page" hidden={activeView !== "data"}>
          <div className="page-heading data-view-heading"><div><span className="eyebrow">DATOS Y PRIVACIDAD</span><h1>Tuyos. Portables. Privados.</h1><p>Nexo funciona sin cuentas bancarias conectadas y conserva la información en este navegador.</p></div><span className="private-hero-mark"><Icon name="shield" size={24} /> Privacidad local</span></div>
          <div className="backup-summary"><span className="backup-summary-copy"><span className="eyebrow">RESPALDO COMPLETO</span><strong>Guardar o restaurar tus datos</strong><small>Excel verificable para conservarlos o moverlos a otro navegador</small></span><span className="backup-summary-action"><Icon name="download" size={22} /></span></div>
          <div className="backup-body">
            <div className="backup-copy"><h2 id="backup-title">Una copia clara de tus finanzas</h2><p>Descarga un Excel con tus cuentas, actividad, agenda y proyecciones. Después puedes importarlo para continuar en otro navegador.</p><p className="backup-includes"><strong>Incluye:</strong> resumen, cuentas, actividad real, movimientos planeados, escenarios y configuración.</p></div>
            <div className="backup-actions"><button className="primary-button" disabled={backupBusy} onClick={exportBackup}>{backupBusy ? "Preparando Excel…" : "Descargar Excel"}</button><button className="secondary-button" disabled={backupBusy} onClick={() => backupInputRef.current?.click()}>Importar Excel</button></div>
          <input ref={backupInputRef} hidden type="file" accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx" onChange={importBackup} />
            <p className="backup-status" aria-live="polite">{backupStatus || (lastSavedAt ? `Último guardado local: ${new Date(lastSavedAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}` : "Guardado automático activo.")}</p>
            <details className="backup-advanced"><summary>Opciones avanzadas</summary><div className="backup-reset"><div><strong>Restablecer datos de ejemplo</strong><p>Reemplaza la información guardada por cuentas y movimientos ficticios. No modifica los archivos de Excel que ya descargaste.</p></div><button className="danger-button" disabled={backupBusy} onClick={resetToExampleData}>Restablecer datos</button></div></details>
          </div>
          <div className="data-principles">
            <article><span>01</span><strong>Sin credenciales bancarias</strong><p>No pedimos accesos ni enviamos movimientos a servicios de terceros.</p></article>
            <article><span>02</span><strong>Guardado automático</strong><p>Cada cambio se conserva localmente en este dispositivo.</p></article>
            <article><span>03</span><strong>Salida abierta</strong><p>Tu respaldo de Excel es legible y puede importarse de nuevo.</p></article>
          </div>
        </section>

        <footer className="footer"><button className="brand footer-brand" type="button" onClick={() => navigateTo("overview")}><BrandMark /><span className="brand-text">Nexo</span></button><p>Claridad para decidir mejor.</p><button className="footer-backup" onClick={openBackupPanel}>Abrir respaldo</button><span>Uso personal · MXN</span></footer>
      </div>
      </div>

      <nav className="tab-bar" aria-label="Navegación de secciones">
        {navItems.map((item) => (
          <button type="button" key={item.id} className={activeView === item.id ? "active" : ""} aria-current={activeView === item.id ? "page" : undefined} onClick={() => navigateTo(item.id)}>
            <Icon name={item.icon} size={21} /><span>{item.label}</span>
          </button>
        ))}
      </nav>

      {toast && <div className={`app-toast ${toast.tone}`} role="status"><span aria-hidden="true">{toast.tone === "success" ? "✓" : "!"}</span><p>{toast.message}</p><button aria-label="Cerrar notificación" onClick={() => setToast(null)}>×</button></div>}

      {confirmationAction && (
        <div className="modal-backdrop confirmation-backdrop">
          <section ref={confirmationModalRef} className="confirmation-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-description" tabIndex={-1}>
            <span className={`confirmation-mark ${confirmationAction.kind === "reset-example" ? "warning" : "danger"}`} aria-hidden="true">{confirmationAction.kind === "reset-example" ? "!" : "−"}</span>
            <div className="confirmation-copy">
              <span className="eyebrow">CONFIRMACIÓN</span>
              <h2 id="confirmation-title">{confirmationAction.kind === "reset-example" ? "¿Restablecer todos los datos?" : `¿Eliminar “${confirmationAction.transaction.title}”?`}</h2>
              <p id="confirmation-description">{confirmationAction.kind === "reset-example"
                ? "Se reemplazarán las cuentas, movimientos, escenarios y configuración guardados en este navegador. Descarga un Excel antes si quieres conservarlos."
                : "El movimiento desaparecerá del historial y los saldos de sus cuentas se ajustarán para revertirlo."}</p>
            </div>
            <div className="confirmation-actions">
              <button className="secondary-button" ref={closeConfirmationButtonRef} onClick={() => setConfirmationAction(null)}>Conservar datos</button>
              <button className="danger-button" onClick={confirmPendingAction}>{confirmationAction.kind === "reset-example" ? "Sí, restablecer" : "Sí, eliminar"}</button>
            </div>
          </section>
        </div>
      )}

      {transactionEditorOpen && (
        <div className="modal-backdrop transaction-backdrop">
          <section ref={transactionModalRef} className="transaction-modal" role="dialog" aria-modal="true" aria-labelledby="transaction-title" aria-describedby="transaction-description" tabIndex={-1}>
            <div className="editor-heading transaction-modal-heading">
              <div><span className="eyebrow">{editingTransactionId ? "EDITAR ACTIVIDAD" : "NUEVA ACTIVIDAD"}</span><h2 id="transaction-title">{editingTransactionId ? "Ajusta el movimiento" : "Registra un movimiento"}</h2><p id="transaction-description">El saldo y las visualizaciones se actualizarán al guardar.</p></div>
              <button className="close-button" ref={closeTransactionButtonRef} onClick={() => setTransactionEditorOpen(false)} aria-label="Cerrar movimiento">×</button>
            </div>

            <div className="transaction-kind-picker" aria-label="Tipo de movimiento">
              {(["expense", "income", "transfer"] as const).map((kind) => (
                <button type="button" key={kind} className={transactionDraft.kind === kind ? `active ${kind}` : ""} onClick={() => {
                  const source = accounts.find((account) => account.id === transactionDraft.accountId) ?? accounts[0];
                  const destination = accounts.find((account) => account.id !== source?.id);
                  setTransactionDraft((current) => ({
                    ...current,
                    kind,
                    title: current.title === "Transferencia" && kind !== "transfer" ? "" : current.title || (kind === "transfer" ? "Transferencia" : ""),
                    category: kind === "income" ? "Trabajo" : kind === "transfer" ? "Ahorro" : "General",
                    toAccountId: kind === "transfer" ? current.toAccountId && current.toAccountId !== source?.id ? current.toAccountId : destination?.id ?? null : null,
                  }));
                  setTransactionError("");
                }}><TransactionMark kind={kind} /><span><strong>{kind === "expense" ? "Gasto" : kind === "income" ? "Ingreso" : "Transferencia"}</strong><small>{kind === "expense" ? "Dinero que salió" : kind === "income" ? "Dinero que entró" : "Entre tus cuentas"}</small></span></button>
              ))}
            </div>

            <label className="transaction-amount-field"><span>Monto</span><div><b>$</b><input type="text" inputMode="decimal" placeholder="0" value={transactionDraft.amountText} onChange={(event) => setTransactionDraft((current) => ({ ...current, amountText: event.target.value, amount: parseMoneyInput(event.target.value) }))} onBlur={() => setTransactionDraft((current) => ({ ...current, amountText: current.amount > 0 ? formatNumberInput(current.amount) : "" }))} /><em>MXN</em></div></label>

            <div className="transaction-form-grid">
              <label>Concepto<input type="text" placeholder={transactionDraft.kind === "income" ? "Ej. Nómina" : transactionDraft.kind === "transfer" ? "Ej. Aportación al fondo" : "Ej. Supermercado"} value={transactionDraft.title} onChange={(event) => setTransactionDraft((current) => ({ ...current, title: event.target.value }))} /></label>
              <label>Fecha<input type="date" value={transactionDraft.date} onChange={(event) => setTransactionDraft((current) => ({ ...current, date: event.target.value }))} /></label>
              <label>{transactionDraft.kind === "transfer" ? "Desde" : "Cuenta"}<select value={transactionDraft.accountId} onChange={(event) => setTransactionDraft((current) => ({ ...current, accountId: event.target.value, toAccountId: current.toAccountId === event.target.value ? accounts.find((account) => account.id !== event.target.value)?.id ?? null : current.toAccountId }))}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {formatMoney(account.amount)}</option>)}</select></label>
              {transactionDraft.kind === "transfer" && <label>Hacia<select value={transactionDraft.toAccountId ?? ""} onChange={(event) => setTransactionDraft((current) => ({ ...current, toAccountId: event.target.value || null }))}><option value="">Selecciona destino</option>{accounts.filter((account) => account.id !== transactionDraft.accountId).map((account) => <option key={account.id} value={account.id}>{account.label} · {formatMoney(account.amount)}</option>)}</select></label>}
              <label>Categoría<input type="text" list="transaction-categories" placeholder="General" value={transactionDraft.category} onChange={(event) => setTransactionDraft((current) => ({ ...current, category: event.target.value }))} /><datalist id="transaction-categories"><option value="Alimentos" /><option value="Vivienda" /><option value="Transporte" /><option value="Servicios" /><option value="Salud" /><option value="Trabajo" /><option value="Ahorro" /><option value="Inversión" /><option value="Entretenimiento" /></datalist></label>
              <label className="transaction-note-field">Nota <span className="optional">opcional</span><input type="text" placeholder="Agrega contexto útil" value={transactionDraft.note} onChange={(event) => setTransactionDraft((current) => ({ ...current, note: event.target.value }))} /></label>
            </div>

            {transactionError && <p className="form-error" role="alert">{transactionError}</p>}
            <div className="transaction-preview"><span>Así quedará</span><strong>{transactionDraft.kind === "income" ? "+" : transactionDraft.kind === "expense" ? "−" : ""}{formatMoney(transactionDraft.amount)}</strong><small>{transactionDraft.kind === "transfer" ? `${accountLabel(transactionDraft.accountId)} → ${accountLabel(transactionDraft.toAccountId)}` : accountLabel(transactionDraft.accountId)}</small></div>
            <div className="editor-actions transaction-actions"><button className="secondary-button" onClick={() => setTransactionEditorOpen(false)}>Cancelar</button><button className="primary-button" onClick={saveTransaction}>{editingTransactionId ? "Guardar cambios" : "Registrar movimiento"}</button></div>
          </section>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop">
          <section ref={editorModalRef} className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title" aria-describedby="editor-description" tabIndex={-1}>
            <div className="editor-heading"><div><span className="eyebrow">DATOS BASE</span><h2 id="editor-title">Administrar cuentas y saldos</h2><p id="editor-description">Edita nombres, montos, rendimientos y notas. También puedes agregar o eliminar cuentas.</p></div><button className="close-button" ref={closeEditorButtonRef} onClick={() => setEditing(false)} aria-label="Cerrar editor">×</button></div>
            <div className="editor-toolbar"><span>{draftAccounts.length} cuentas</span><div>{removedDraftAccount && <button className="undo-account" onClick={undoDraftAccountRemoval}>Deshacer eliminación</button>}<button className="secondary-button" onClick={addDraftAccount}>+ Agregar cuenta</button></div></div>
            {accountEditorNotice && <p className="editor-notice" role="status">{accountEditorNotice}</p>}
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
