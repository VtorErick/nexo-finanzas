import type { CellValue, Worksheet } from "exceljs";
import { makeExcelCompatible } from "./xlsx-compat.js";
import {
  clampFiniteNumber,
  sanitizeInflationRate,
  sanitizeMoney,
  sanitizePercentRate,
  sanitizeReturnRate,
  sanitizeSignedMoney,
} from "./nexo-values";

export type WorkbookAccount = {
  id: string;
  label: string;
  amount: number;
  rate: string;
  group: "reserve" | "investment" | "cash";
  note: string;
};

export type WorkbookEvent = {
  id: number;
  date: string;
  title: string;
  amount: string;
  detail: string;
  numericAmount: number;
  tone: "blue" | "green" | "orange" | "red";
  kind: "expense" | "income" | "transfer" | "contribution";
  destination: "none" | "cetes" | "gbm";
  includeInProjection: boolean;
  recurrence: "none" | "weekly" | "monthly" | "annual";
  recurrenceEnd: string | null;
  completedDates: string[];
  skippedDates: string[];
};

export type WorkbookExtra = {
  id: number;
  enabled: boolean;
  amount: number;
  recurring: boolean;
  frequency: "monthly" | "annual";
  destination: "cetes" | "gbm";
  startMonth: number;
  endMonth: number | null;
  monthOfYear: number;
  oneTimeMonth: number;
};

export type WorkbookTransaction = {
  id: string;
  date: string;
  title: string;
  amount: number;
  kind: "expense" | "income" | "transfer";
  accountId: string;
  toAccountId: string | null;
  category: string;
  note: string;
};

export type WorkbookCategory = {
  id: string;
  label: string;
  icon: string;
};

export type WorkbookBackup = {
  dataMode: "example" | "personal" | "imported";
  accounts: WorkbookAccount[];
  emergencyIds: string[];
  years: number;
  target: number;
  monthlyExpenses: number;
  reserveRate: number;
  investmentRate: number;
  inflationRate: number;
  brokerFee: number;
  capitalGainsTax: number;
  extras: WorkbookExtra[];
  events: WorkbookEvent[];
  transactions: WorkbookTransaction[];
  categories?: WorkbookCategory[];
};

export type WorkbookScreenshot = {
  title: string;
  dataUrl: string;
  width: number;
  height: number;
  extension?: "png" | "jpeg";
};

const COLORS = {
  teal: "1D4ED8",
  tealDark: "17365D",
  tealSoft: "E7F0FF",
  cream: "F7F9FC",
  white: "FFFFFF",
  ink: "17233D",
  muted: "52627A",
  line: "CBD6E5",
  gold: "92400E",
  red: "991B1B",
  blue: "1D4ED8",
  green: "166534",
};

const CURRENCY_FORMAT = '"$"#,##0;[Red]("$"#,##0);-';
const RATE_FORMAT = "0.00%";

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function toIsoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function groupLabel(group: WorkbookAccount["group"]) {
  if (group === "reserve") return "Reserva";
  if (group === "investment") return "Inversión";
  return "Disponible";
}

function groupValue(value: unknown): WorkbookAccount["group"] {
  if (value === "Reserva") return "reserve";
  if (value === "Inversión") return "investment";
  return "cash";
}

function kindLabel(kind: WorkbookEvent["kind"]) {
  if (kind === "expense") return "Gasto";
  if (kind === "income") return "Ingreso";
  if (kind === "contribution") return "Aportación";
  return "Transferencia";
}

function kindValue(value: unknown): WorkbookEvent["kind"] {
  if (value === "Gasto") return "expense";
  if (value === "Ingreso") return "income";
  if (value === "Aportación") return "contribution";
  return "transfer";
}

function transactionKindLabel(kind: WorkbookTransaction["kind"]) {
  if (kind === "expense") return "Gasto";
  if (kind === "income") return "Ingreso";
  return "Transferencia";
}

function transactionKindValue(value: unknown): WorkbookTransaction["kind"] {
  if (textValue(value) === "Ingreso") return "income";
  if (textValue(value) === "Transferencia") return "transfer";
  return "expense";
}

function recurrenceLabel(value: WorkbookEvent["recurrence"]) {
  if (value === "weekly") return "Semanal";
  if (value === "monthly") return "Mensual";
  if (value === "annual") return "Anual";
  return "Una vez";
}

function recurrenceValue(value: unknown): WorkbookEvent["recurrence"] {
  if (value === "Semanal") return "weekly";
  if (value === "Mensual") return "monthly";
  if (value === "Anual") return "annual";
  return "none";
}

function destinationLabel(value: WorkbookEvent["destination"] | WorkbookExtra["destination"]) {
  if (value === "gbm") return "Inversión";
  if (value === "cetes") return "Reserva / CETES";
  return "No incluir";
}

function destinationValue(value: unknown): WorkbookEvent["destination"] {
  if (value === "Inversión") return "gbm";
  if (value === "Reserva / CETES") return "cetes";
  return "none";
}

function excelValue(value: unknown) {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "result" in value) return (value as { result?: unknown }).result;
  if (value && typeof value === "object" && "richText" in value) {
    return (value as { richText: { text: string }[] }).richText.map((part) => part.text).join("");
  }
  return value;
}

function textValue(value: unknown) {
  const normalized = excelValue(value);
  return normalized === null || normalized === undefined ? "" : String(normalized).trim();
}

function numberValue(value: unknown) {
  const normalized = excelValue(value);
  if (typeof normalized === "number") return sanitizeSignedMoney(normalized);
  return sanitizeSignedMoney(Number(String(normalized ?? "").replace(/[^\d.-]/g, "")) || 0);
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseIsoDate(value);
  return Number.isFinite(date.getTime()) && toIsoDate(date) === value;
}

function booleanValue(value: unknown) {
  return ["sí", "si", "true", "1", "activo"].includes(textValue(value).toLocaleLowerCase("es-MX"));
}

function dateValue(value: unknown) {
  const normalized = excelValue(value);
  if (normalized instanceof Date) return toIsoDate(normalized);
  return textValue(normalized);
}

function configureSheet(sheet: Worksheet, freezeRow = 4) {
  sheet.views = [{ state: "frozen", ySplit: freezeRow, showGridLines: false }];
  sheet.properties.defaultRowHeight = 20;
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

function addSheetTitle(sheet: Worksheet, title: string, subtitle: string, lastColumn: string) {
  sheet.mergeCells(`A1:${lastColumn}2`);
  const titleCell = sheet.getCell("A1");
  titleCell.value = title;
  titleCell.font = { name: "Aptos Display", size: 22, bold: true, color: { argb: COLORS.white } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.teal } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.mergeCells(`A3:${lastColumn}3`);
  const subtitleCell = sheet.getCell("A3");
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: "Aptos", size: 10, color: { argb: COLORS.muted } };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.cream } };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 29;
  sheet.getRow(2).height = 20;
  sheet.getRow(3).height = 25;
}

function styleTableSheet(sheet: Worksheet, currencyColumns: number[], dateColumns: number[] = []) {
  sheet.getRow(5).height = 26;
  sheet.getRow(5).font = { name: "Aptos", bold: true, color: { argb: COLORS.white } };
  sheet.getRow(5).alignment = { vertical: "middle" };
  sheet.getRow(5).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.teal } };
  });
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 6) return;
    row.font = { name: "Aptos", size: 10, color: { argb: COLORS.ink } };
    row.alignment = { vertical: "top", wrapText: false };
    row.height = 23;
    row.eachCell((cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: COLORS.line } } };
      if (rowNumber % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.cream } };
    });
  });
  currencyColumns.forEach((column) => {
    sheet.getColumn(column).numFmt = CURRENCY_FORMAT;
    sheet.getColumn(column).alignment = { horizontal: "right", vertical: "top" };
    sheet.getCell(5, column).alignment = { horizontal: "right", vertical: "middle" };
  });
  dateColumns.forEach((column) => {
    sheet.getColumn(column).numFmt = "yyyy-mm-dd";
    sheet.getColumn(column).alignment = { horizontal: "center", vertical: "top" };
    sheet.getCell(5, column).alignment = { horizontal: "center", vertical: "middle" };
  });
  sheet.autoFilter = { from: "A5", to: sheet.getRow(sheet.rowCount).getCell(sheet.columnCount).address };
}

function writeDataGrid(sheet: Worksheet, headers: string[], rows: CellValue[][], emptyRow: CellValue[]) {
  sheet.getRow(5).values = headers;
  (rows.length ? rows : [emptyRow]).forEach((row, index) => {
    sheet.getRow(6 + index).values = row;
  });
}

function addSummarySheet(workbook: import("exceljs").Workbook, data: WorkbookBackup, exportedAt: Date) {
  const sheet = workbook.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
  sheet.columns = Array.from({ length: 8 }, () => ({ width: 16 }));
  addSheetTitle(sheet, "Nexo · Respaldo financiero", `Exportado el ${exportedAt.toLocaleString("es-MX")} · MXN · Libro reimportable`, "H");

  const total = data.accounts.reduce((sum, account) => sum + account.amount, 0);
  const reserve = data.accounts.filter((account) => data.emergencyIds.includes(account.id)).reduce((sum, account) => sum + account.amount, 0);
  const cash = data.accounts.filter((account) => account.group === "cash").reduce((sum, account) => sum + account.amount, 0);
  const investments = data.accounts.filter((account) => account.group === "investment").reduce((sum, account) => sum + account.amount, 0);
  const accountEnd = Math.max(data.accounts.length + 5, 6);
  const cards = [
    { labelRange: "A5:B5", valueRange: "A6:B7", label: "PATRIMONIO TOTAL", formula: `SUM('Cuentas'!$D$6:$D$${accountEnd})`, result: total },
    { labelRange: "C5:D5", valueRange: "C6:D7", label: "FONDO DE EMERGENCIA", formula: `SUMIF('Cuentas'!$G$6:$G$${accountEnd},"Sí",'Cuentas'!$D$6:$D$${accountEnd})`, result: reserve },
    { labelRange: "E5:F5", valueRange: "E6:F7", label: "DISPONIBLE", formula: `SUMIF('Cuentas'!$C$6:$C$${accountEnd},"Disponible",'Cuentas'!$D$6:$D$${accountEnd})`, result: cash },
    { labelRange: "G5:H5", valueRange: "G6:H7", label: "INVERSIONES", formula: `SUMIF('Cuentas'!$C$6:$C$${accountEnd},"Inversión",'Cuentas'!$D$6:$D$${accountEnd})`, result: investments },
  ];
  cards.forEach((card, index) => {
    const fillColor = index === 0 ? COLORS.teal : COLORS.tealSoft;
    const fontColor = index === 0 ? COLORS.white : COLORS.tealDark;
    sheet.mergeCells(card.labelRange);
    const labelCell = sheet.getCell(card.labelRange.split(":")[0]);
    labelCell.value = card.label;
    labelCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: fontColor } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
    labelCell.alignment = { vertical: "middle", horizontal: "center" };
    sheet.mergeCells(card.valueRange);
    const valueCell = sheet.getCell(card.valueRange.split(":")[0]);
    valueCell.value = { formula: card.formula, result: card.result };
    valueCell.numFmt = CURRENCY_FORMAT;
    valueCell.font = { name: "Aptos Display", size: 18, bold: true, color: { argb: fontColor } };
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
    valueCell.alignment = { vertical: "middle", horizontal: "center" };
  });
  sheet.getRow(5).height = 30;
  sheet.getRow(6).height = 30;
  sheet.getRow(7).height = 30;

  sheet.mergeCells("A9:H9");
  sheet.getCell("A9").value = "SUPUESTOS Y META";
  sheet.getCell("A9").font = { bold: true, color: { argb: COLORS.white } };
  sheet.getCell("A9").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.tealDark } };
  const assumptions: Array<[string, number, string]> = [
    ["Meta del fondo de emergencia", data.target, CURRENCY_FORMAT],
    ["Gasto esencial mensual (base para 3–6 meses)", data.monthlyExpenses, CURRENCY_FORMAT],
    ["Horizonte de proyección", data.years, '0 "años"'],
    ["Rendimiento anual de reserva", data.reserveRate / 100, RATE_FORMAT],
    ["Rendimiento anual de VOO en MXN", data.investmentRate / 100, RATE_FORMAT],
    ["Inflación anual estimada", data.inflationRate / 100, RATE_FORMAT],
    ["Comisión Trading MX", data.brokerFee / 100, RATE_FORMAT],
    ["ISR estimado sobre ganancia", data.capitalGainsTax / 100, RATE_FORMAT],
  ];
  assumptions.forEach(([label, value, numberFormat], index) => {
    const row = 10 + index;
    sheet.mergeCells(`A${row}:D${row}`);
    sheet.getCell(`A${row}`).value = label;
    sheet.getCell(`A${row}`).font = { color: { argb: COLORS.ink } };
    sheet.mergeCells(`E${row}:H${row}`);
    const valueCell = sheet.getCell(`E${row}`);
    valueCell.value = value;
    valueCell.numFmt = numberFormat;
    if (label === "Rendimiento anual de VOO en MXN") valueCell.note = "Supuesto editable. VOO sigue al S&P 500 en USD; este porcentaje modela una expectativa total expresada en MXN e incorpora, de forma simplificada, mercado y tipo de cambio. Fuente de referencia: https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/fact-sheet/F0968.pdf";
    if (label === "Inflación anual estimada") valueCell.note = "Supuesto editable. Referencia macroeconómica: INEGI INPC, https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2026/inpc/inpc_2q2026_07.pdf";
    if (label === "Comisión Trading MX") valueCell.note = "Supuesto editable. GBM publica una comisión de corretaje de 0.25% para montos operados de hasta $1,000,000 MXN: https://gbm.com/faqs/que-comisiones-cobran-al-invertir-en-gbm";
    if (label === "ISR estimado sobre ganancia") valueCell.note = "Supuesto editable. El artículo 129 de la LISR contempla una tasa de 10% sobre ganancias en operaciones elegibles: https://wwwmatnp.sat.gob.mx/articulo/59621/articulo-129. La situación fiscal individual debe validarse con un contador.";
    valueCell.font = { bold: true, color: { argb: COLORS.blue } };
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F1F6FF" } };
    valueCell.alignment = { horizontal: "right" };
    sheet.getRow(row).height = 24;
  });

  sheet.mergeCells("A18:H20");
  sheet.getCell("A18").value = "Este libro es el respaldo completo de Nexo. Puedes revisar y editar las tablas; para restaurarlo, importa el archivo desde la app sin cambiar los nombres de las hojas ni de las columnas.";
  sheet.getCell("A18").alignment = { wrapText: true, vertical: "middle" };
  sheet.getCell("A18").font = { italic: true, color: { argb: COLORS.muted } };
  sheet.getCell("A18").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.cream } };
  return sheet;
}

function addAccountsSheet(workbook: import("exceljs").Workbook, data: WorkbookBackup) {
  const sheet = workbook.addWorksheet("Cuentas");
  configureSheet(sheet, 5);
  addSheetTitle(sheet, "Cuentas y saldos", "Cada fila conserva el saldo, tipo, rendimiento, nota y pertenencia al fondo de emergencia.", "G");
  const headers = ["ID", "Cuenta", "Tipo", "Saldo (MXN)", "Rendimiento / estado", "Nota", "Fondo de emergencia"];
  const rows = data.accounts.map((account) => [account.id, account.label, groupLabel(account.group), account.amount, account.rate, account.note, data.emergencyIds.includes(account.id) ? "Sí" : "No"]);
  writeDataGrid(sheet, headers, rows, ["", "", "", 0, "", "", "No"]);
  const lastRow = Math.max(5 + data.accounts.length, 6);
  sheet.columns = [{ width: 24 }, { width: 30 }, { width: 17 }, { width: 19 }, { width: 29 }, { width: 42 }, { width: 24 }];
  styleTableSheet(sheet, [4]);
  sheet.getColumn(7).alignment = { horizontal: "center" };
  sheet.getCell(`D${lastRow}`).numFmt = CURRENCY_FORMAT;
}

function addTransactionsSheet(workbook: import("exceljs").Workbook, data: WorkbookBackup) {
  const sheet = workbook.addWorksheet("Actividad");
  configureSheet(sheet, 5);
  addSheetTitle(sheet, "Actividad real", "Ingresos, gastos y transferencias que actualizan los saldos de Nexo.", "I");
  const headers = ["ID", "Fecha", "Concepto", "Tipo", "Monto (MXN)", "Cuenta", "Cuenta destino", "Categoría", "Nota"];
  const rows = (data.transactions ?? []).map((transaction) => [
    transaction.id,
    parseIsoDate(transaction.date),
    transaction.title,
    transactionKindLabel(transaction.kind),
    transaction.amount,
    transaction.accountId,
    transaction.toAccountId,
    transaction.category,
    transaction.note || null,
  ]);
  writeDataGrid(sheet, headers, rows, [null, null, null, "Gasto", 0, null, null, "General", null]);
  sheet.columns = [{ width: 24 }, { width: 17 }, { width: 34 }, { width: 18 }, { width: 20 }, { width: 25 }, { width: 25 }, { width: 22 }, { width: 40 }];
  styleTableSheet(sheet, [5], [2]);
  sheet.getColumn(4).alignment = { horizontal: "center" };
}

function addEventsSheet(workbook: import("exceljs").Workbook, data: WorkbookBackup) {
  const sheet = workbook.addWorksheet("Movimientos");
  configureSheet(sheet, 5);
  addSheetTitle(sheet, "Agenda de movimientos", "Incluye movimientos únicos y recurrentes, su impacto en la proyección y su historial de ocurrencias.", "M");
  const headers = ["ID", "Primera fecha", "Movimiento", "Tipo", "Monto (MXN)", "Nota", "Repetición", "Fecha final", "Destino", "En proyección", "Color", "Completados", "Omitidos"];
  const rows = data.events.map((event) => [event.id, parseIsoDate(event.date), event.title, kindLabel(event.kind), event.numericAmount, event.detail || null, recurrenceLabel(event.recurrence), event.recurrenceEnd ? parseIsoDate(event.recurrenceEnd) : null, destinationLabel(event.destination), event.includeInProjection ? "Sí" : "No", event.tone, event.completedDates.join(", ") || null, event.skippedDates.join(", ") || null]);
  writeDataGrid(sheet, headers, rows, [null, null, null, null, 0, null, "Una vez", null, "No incluir", "No", "blue", null, null]);
  sheet.columns = [{ width: 10 }, { width: 17 }, { width: 32 }, { width: 17 }, { width: 19 }, { width: 40 }, { width: 17 }, { width: 17 }, { width: 22 }, { width: 17 }, { width: 13 }, { width: 28 }, { width: 28 }];
  styleTableSheet(sheet, [5], [2, 8]);
  [10, 11].forEach((column) => { sheet.getColumn(column).alignment = { horizontal: "center" }; });
}

function addExtrasSheet(workbook: import("exceljs").Workbook, data: WorkbookBackup) {
  const sheet = workbook.addWorksheet("Escenarios");
  configureSheet(sheet, 5);
  addSheetTitle(sheet, "Escenarios de aportación", "Simulaciones de ingresos adicionales que alimentan la proyección de Nexo.", "J");
  const headers = ["ID", "Activo", "Monto (MXN)", "Recurrente", "Frecuencia", "Destino", "Mes inicio", "Mes final", "Mes del año", "Mes único"];
  const rows = data.extras.map((extra) => [extra.id, extra.enabled ? "Sí" : "No", extra.amount, extra.recurring ? "Sí" : "No", extra.frequency === "monthly" ? "Mensual" : "Anual", destinationLabel(extra.destination), extra.startMonth, extra.endMonth, extra.monthOfYear, extra.oneTimeMonth]);
  writeDataGrid(sheet, headers, rows, [null, "No", 0, "No", "Mensual", "Inversión", 1, null, 1, 1]);
  sheet.columns = [{ width: 9 }, { width: 12 }, { width: 18 }, { width: 15 }, { width: 16 }, { width: 21 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 }];
  styleTableSheet(sheet, [3]);
  [2, 4, 5, 7, 8, 9, 10].forEach((column) => { sheet.getColumn(column).alignment = { horizontal: "center" }; });
}

function addScreenshotsSheet(workbook: import("exceljs").Workbook, screenshots: WorkbookScreenshot[]) {
  const sheet = workbook.addWorksheet("Capturas", { views: [{ showGridLines: false }] });
  addSheetTitle(sheet, "Capturas de la app", "Vista visual del estado de Nexo al momento de crear este respaldo.", "O");
  sheet.columns = Array.from({ length: 15 }, () => ({ width: 10 }));
  let startRow = 5;
  screenshots.forEach((screenshot) => {
    sheet.mergeCells(`A${startRow}:O${startRow}`);
    const label = sheet.getCell(`A${startRow}`);
    label.value = screenshot.title;
    label.font = { bold: true, size: 13, color: { argb: COLORS.tealDark } };
    label.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.tealSoft } };
    label.alignment = { vertical: "middle" };
    sheet.getRow(startRow).height = 27;
    const maxWidth = 1020;
    const imageWidth = Math.min(maxWidth, screenshot.width);
    const imageHeight = Math.max(120, Math.round(screenshot.height * (imageWidth / screenshot.width)));
    const imageId = workbook.addImage({ base64: screenshot.dataUrl, extension: screenshot.extension ?? "png" });
    sheet.addImage(imageId, { tl: { col: 0, row: startRow }, ext: { width: imageWidth, height: imageHeight } });
    const imageRows = Math.ceil(imageHeight / 20);
    for (let row = startRow + 1; row <= startRow + imageRows; row += 1) sheet.getRow(row).height = 15;
    startRow += imageRows + 4;
  });
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

function addConfigSheet(workbook: import("exceljs").Workbook, data: WorkbookBackup, exportedAt: Date) {
  const sheet = workbook.addWorksheet("Configuración");
  configureSheet(sheet, 5);
  addSheetTitle(sheet, "Configuración de restauración", "Supuestos y metadatos que Nexo utiliza para reconstruir el respaldo. Conserva los nombres de estos campos.", "B");
  sheet.getRow(5).values = ["Campo", "Valor"];
  const rows: Array<[string, string | number]> = [
    ["Formato", "NEXO_XLSX_BACKUP"],
    ["Versión", 7],
    ["Exportado", exportedAt.toISOString()],
    ["Modo", data.dataMode],
    ["Horizonte", data.years],
    ["Meta", data.target],
    ["GastoMensual", data.monthlyExpenses],
    ["TasaReserva", data.reserveRate],
    ["TasaInversion", data.investmentRate],
    ["Inflacion", data.inflationRate],
    ["ComisionTradingMX", data.brokerFee],
    ["ImpuestoGanancia", data.capitalGainsTax],
    ...(data.categories ?? []).map((category) => [`Categoria:${category.id}`, `${category.label}|${category.icon}`] as [string, string]),
  ];
  rows.forEach((row, index) => { sheet.getRow(index + 6).values = row; });
  sheet.columns = [{ width: 28 }, { width: 38 }];
  styleTableSheet(sheet, []);
  sheet.getCell("A3").alignment = { wrapText: true, vertical: "middle", horizontal: "left" };
  sheet.getRow(3).height = 34;
  rows.forEach((_, index) => {
    const valueCell = sheet.getCell(index + 6, 2);
    valueCell.font = { name: "Aptos", size: 10, bold: true, color: { argb: COLORS.blue } };
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F1F6FF" } };
  });
}

async function captureElement(title: string, element: HTMLElement): Promise<WorkbookScreenshot> {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(element, {
    backgroundColor: getComputedStyle(document.body).backgroundColor || "#f5f8ff",
    scale: Math.min(window.devicePixelRatio || 1, 1.5),
    logging: false,
    useCORS: true,
    windowWidth: Math.max(document.documentElement.clientWidth, element.scrollWidth),
    windowHeight: Math.max(document.documentElement.clientHeight, element.scrollHeight),
  });
  return { title, dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

export async function captureNexoScreenshots() {
  const sections = [
    { title: "Vista de Nexo al exportar", selector: "#contenido" },
  ];
  const screenshots: WorkbookScreenshot[] = [];
  for (const section of sections) {
    const element = document.querySelector<HTMLElement>(section.selector);
    if (!element) throw new Error(`No se encontró la sección ${section.title}`);
    screenshots.push(await captureElement(section.title, element));
  }
  return screenshots;
}

export async function buildNexoWorkbook(data: WorkbookBackup, screenshots: WorkbookScreenshot[]) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const exportedAt = new Date();
  workbook.creator = "Nexo";
  workbook.lastModifiedBy = "Nexo";
  workbook.created = exportedAt;
  workbook.modified = exportedAt;
  workbook.title = "Respaldo financiero Nexo";
  workbook.subject = "Cuentas, actividad, movimientos planeados, escenarios, supuestos y capturas";
  workbook.company = "Nexo";
  workbook.calcProperties.fullCalcOnLoad = true;
  addSummarySheet(workbook, data, exportedAt);
  addAccountsSheet(workbook, data);
  addTransactionsSheet(workbook, data);
  addEventsSheet(workbook, data);
  addExtrasSheet(workbook, data);
  addScreenshotsSheet(workbook, screenshots);
  addConfigSheet(workbook, data, exportedAt);
  return makeExcelCompatible(await workbook.xlsx.writeBuffer());
}

export async function exportNexoWorkbook(data: WorkbookBackup, screenshots: WorkbookScreenshot[], fileName: string) {
  const output = await buildNexoWorkbook(data, screenshots);
  const blob = new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function tableRows(sheet: Worksheet, expectedHeaders: string[]) {
  const headerRow = Array.from({ length: 10 }, (_, index) => index + 1).find((rowNumber) => textValue(sheet.getCell(rowNumber, 1).value) === expectedHeaders[0]);
  if (!headerRow) throw new Error(`No se encontró la tabla de ${sheet.name}`);
  const actualHeaders = expectedHeaders.map((_, index) => textValue(sheet.getCell(headerRow, index + 1).value));
  if (actualHeaders.some((header, index) => header !== expectedHeaders[index])) throw new Error(`Las columnas de ${sheet.name} fueron modificadas`);
  const rows: unknown[][] = [];
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const values = expectedHeaders.map((_, index) => sheet.getCell(rowNumber, index + 1).value);
    if (values.every((value) => textValue(value) === "")) continue;
    if (textValue(values[0]) === "") continue;
    rows.push(values);
  }
  return rows;
}

export async function importNexoWorkbook(file: File): Promise<WorkbookBackup> {
  if (typeof file.size === "number" && file.size > 25 * 1024 * 1024) throw new Error("El respaldo supera el límite de 25 MB");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const configSheet = workbook.getWorksheet("Configuración");
  const accountsSheet = workbook.getWorksheet("Cuentas");
  const transactionsSheet = workbook.getWorksheet("Actividad");
  const eventsSheet = workbook.getWorksheet("Movimientos");
  const extrasSheet = workbook.getWorksheet("Escenarios");
  if (!configSheet || !accountsSheet || !eventsSheet || !extrasSheet) throw new Error("El libro no contiene todas las hojas de Nexo");
  const config = new Map<string, unknown>();
  configSheet.eachRow((row) => config.set(textValue(row.getCell(1).value), excelValue(row.getCell(2).value)));
  if (config.get("Formato") !== "NEXO_XLSX_BACKUP" || numberValue(config.get("Versión")) < 5) throw new Error("Formato de respaldo no compatible");
  const categories = Array.from(config.entries()).flatMap(([key, value]) => {
    if (!key.startsWith("Categoria:")) return [];
    const [label, icon] = textValue(value).split("|");
    if (!label) return [];
    return [{ id: key.slice("Categoria:".length), label, icon: icon || "general" }];
  });

  const accountHeaders = ["ID", "Cuenta", "Tipo", "Saldo (MXN)", "Rendimiento / estado", "Nota", "Fondo de emergencia"];
  const accountRows = tableRows(accountsSheet, accountHeaders);
  const accounts = accountRows.map((row) => ({ id: textValue(row[0]), label: textValue(row[1]), group: groupValue(excelValue(row[2])), amount: sanitizeMoney(numberValue(row[3])), rate: textValue(row[4]), note: textValue(row[5]) }));
  if (accounts.length === 0) throw new Error("El respaldo no contiene cuentas");
  if (accounts.some((account) => !account.id || !account.label)) throw new Error("Todas las cuentas necesitan ID y nombre");
  const accountIds = new Set(accounts.map((account) => account.id));
  if (accountIds.size !== accounts.length) throw new Error("El respaldo contiene IDs de cuenta duplicados");
  const emergencyIds = accountRows.filter((row) => booleanValue(row[6])).map((row) => textValue(row[0]));

  const transactionHeaders = ["ID", "Fecha", "Concepto", "Tipo", "Monto (MXN)", "Cuenta", "Cuenta destino", "Categoría", "Nota"];
  const transactions = transactionsSheet ? tableRows(transactionsSheet, transactionHeaders).map((row) => ({
    id: textValue(row[0]),
    date: dateValue(row[1]),
    title: textValue(row[2]),
    kind: transactionKindValue(excelValue(row[3])),
    amount: sanitizeMoney(numberValue(row[4])),
    accountId: textValue(row[5]),
    toAccountId: textValue(row[6]) || null,
    category: textValue(row[7]) || "General",
    note: textValue(row[8]),
  })) : [];
  const transactionIds = new Set(transactions.map((transaction) => transaction.id));
  if (transactionIds.size !== transactions.length || transactions.some((transaction) => !transaction.id)) throw new Error("El historial contiene IDs duplicados o vacíos");
  if (transactions.some((transaction) => !isIsoDate(transaction.date) || transaction.amount <= 0 || !accountIds.has(transaction.accountId))) throw new Error("El historial contiene fechas, montos o cuentas inválidas");
  if (transactions.some((transaction) => transaction.kind === "transfer" && (!transaction.toAccountId || transaction.toAccountId === transaction.accountId || !accountIds.has(transaction.toAccountId)))) throw new Error("El historial contiene una transferencia inválida");

  const eventHeaders = ["ID", "Primera fecha", "Movimiento", "Tipo", "Monto (MXN)", "Nota", "Repetición", "Fecha final", "Destino", "En proyección", "Color", "Completados", "Omitidos"];
  const events = tableRows(eventsSheet, eventHeaders).map((row) => {
    const numericAmount = sanitizeMoney(numberValue(row[4]));
    const destination = destinationValue(excelValue(row[8]));
    const tone = textValue(row[10]);
    return {
      id: Math.trunc(clampFiniteNumber(numberValue(row[0]), 1, Number.MAX_SAFE_INTEGER, 1)),
      date: dateValue(row[1]),
      title: textValue(row[2]),
      kind: kindValue(excelValue(row[3])),
      numericAmount,
      amount: numericAmount > 0 ? `$${Math.round(numericAmount).toLocaleString("es-MX")}` : "$0",
      detail: textValue(row[5]),
      recurrence: recurrenceValue(excelValue(row[6])),
      recurrenceEnd: dateValue(row[7]) || null,
      destination,
      includeInProjection: booleanValue(row[9]) && destination !== "none",
      tone: (["blue", "green", "orange", "red"].includes(tone) ? tone : "blue") as WorkbookEvent["tone"],
      completedDates: textValue(row[11]).split(",").map((value) => value.trim()).filter(Boolean),
      skippedDates: textValue(row[12]).split(",").map((value) => value.trim()).filter(Boolean),
    };
  });
  const eventIds = new Set(events.map((event) => event.id));
  if (eventIds.size !== events.length) throw new Error("La agenda contiene IDs duplicados");
  if (events.some((event) => !isIsoDate(event.date) || (event.recurrenceEnd !== null && (!isIsoDate(event.recurrenceEnd) || event.recurrenceEnd < event.date)))) throw new Error("La agenda contiene fechas inválidas");
  if (events.some((event) => event.completedDates.some((date) => !isIsoDate(date)) || event.skippedDates.some((date) => !isIsoDate(date)))) throw new Error("La agenda contiene estados con fechas inválidas");

  const extraHeaders = ["ID", "Activo", "Monto (MXN)", "Recurrente", "Frecuencia", "Destino", "Mes inicio", "Mes final", "Mes del año", "Mes único"];
  const extras = tableRows(extrasSheet, extraHeaders).map((row) => ({
    id: Math.trunc(clampFiniteNumber(numberValue(row[0]), 1, Number.MAX_SAFE_INTEGER, 1)),
    enabled: booleanValue(row[1]),
    amount: sanitizeMoney(numberValue(row[2])),
    recurring: booleanValue(row[3]),
    frequency: (textValue(row[4]) === "Anual" ? "annual" : "monthly") as WorkbookExtra["frequency"],
    destination: (destinationValue(excelValue(row[5])) === "cetes" ? "cetes" : "gbm") as WorkbookExtra["destination"],
    startMonth: Math.trunc(clampFiniteNumber(numberValue(row[6]), 1, 360, 1)),
    endMonth: textValue(row[7]) === "" ? null : Math.trunc(clampFiniteNumber(numberValue(row[7]), 1, 360, 1)),
    monthOfYear: Math.trunc(clampFiniteNumber(numberValue(row[8]), 1, 12, 1)),
    oneTimeMonth: Math.trunc(clampFiniteNumber(numberValue(row[9]), 1, 360, 1)),
  }));
  const extraIds = new Set(extras.map((extra) => extra.id));
  if (extraIds.size !== extras.length) throw new Error("Los escenarios contienen IDs duplicados");
  if (extras.some((extra) => extra.endMonth !== null && extra.endMonth < extra.startMonth)) throw new Error("Un escenario termina antes de iniciar");

  return {
    dataMode: "imported",
    accounts,
    emergencyIds,
    years: Math.trunc(clampFiniteNumber(numberValue(config.get("Horizonte")), 1, 30, 15)),
    target: Math.max(1, sanitizeMoney(numberValue(config.get("Meta")))),
    monthlyExpenses: sanitizeMoney(numberValue(config.get("GastoMensual"))),
    reserveRate: sanitizeReturnRate(numberValue(config.get("TasaReserva"))),
    investmentRate: sanitizeReturnRate(numberValue(config.get("TasaInversion"))),
    inflationRate: sanitizeInflationRate(numberValue(config.get("Inflacion"))),
    brokerFee: config.has("ComisionTradingMX") ? sanitizePercentRate(numberValue(config.get("ComisionTradingMX"))) : 0.25,
    capitalGainsTax: config.has("ImpuestoGanancia") ? sanitizePercentRate(numberValue(config.get("ImpuestoGanancia"))) : 10,
    extras,
    events,
    transactions,
    categories,
  };
}
