import assert from "node:assert/strict";
import { readFile, unlink, writeFile } from "node:fs/promises";
import test from "node:test";
import JSZip from "jszip";
import ts from "typescript";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("https://nexo.test/", { headers: { accept: "text/html", host: "nexo.test", "x-forwarded-proto": "https" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Nexo financial dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang="es"/i);
  assert.match(html, /<title>Nexo · Tu dinero, en perspectiva<\/title>/i);
  assert.match(html, /Tu dinero, en perspectiva\./);
  assert.match(html, /Patrimonio total/);
  assert.match(html, /Modo ejemplo/);
  assert.match(html, /Cuenta diaria/);
  assert.match(html, /Flujo de efectivo/);
  assert.match(html, /El pulso de tu dinero/);
  assert.match(html, /Reserva/);
  assert.match(html, /Crecimiento y poder adquisitivo/);
  assert.match(html, /https:\/\/nexo\.test\/og-nexo-2026\.png/i);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("renders accessible navigation and controls", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /aria-label="Navegación principal"/);
  assert.match(html, /class="skip-link" href="#contenido">Saltar al contenido/);
  assert.match(html, /aria-label="Resumen financiero"/);
  assert.match(html, /aria-label="Ingresos y gastos de los últimos seis meses"/);
  assert.match(html, /aria-label="Filtrar actividad"/);
  assert.match(html, /aria-label="Horizonte de proyección"/);
  assert.match(html, /aria-label="Mes anterior"/);
  assert.match(html, /aria-label="Mes siguiente"/);
  assert.match(html, /aria-label="Inflación anual estimada"/);
  assert.match(html, /aria-label="Meta del fondo de emergencia"/);
  assert.match(html, /aria-label="Cambiar a tema oscuro"/);
  assert.match(html, /no es un ingreso/);
  assert.match(html, /Cobertura actual/);
  assert.match(html, /Agregar movimiento/);
  assert.match(html, /Abrir respaldo/);
  assert.match(html, /Ajustar meta de reserva/);
  assert.match(html, /Guardar o restaurar tus datos/);
  assert.match(html, /Privacidad local/);
});

test("includes the extended planning controls", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(source, /const MAX_YEARS = 30/);
  assert.match(source, /Mes de inicio/);
  assert.match(source, /Mes final/);
  assert.match(source, /sin fecha final/);
  assert.match(source, /Agregar cuenta/);
  assert.match(source, /Inflación anual estimada/);
  assert.match(source, /const formatCompact = \(value: number\) =>/);
  assert.match(source, /const labelStep = compactChart/);
  assert.match(source, /function getEventOccurrences\(/);
  assert.match(source, /function getMexicoToday\(/);
  assert.doesNotMatch(source, /const REFERENCE_DATE/);
  assert.match(source, /type MovementKind = "expense" \| "income" \| "transfer" \| "contribution"/);
  assert.match(source, /type TransactionKind = "expense" \| "income" \| "transfer"/);
  assert.match(source, /function saveTransaction\(\)/);
  assert.match(source, /function adjustAccountsForTransaction\(/);
  assert.match(source, /Registra un movimiento/);
  assert.match(source, /Cada semana/);
  assert.match(source, /Cada mes/);
  assert.match(source, /Cada año/);
  assert.match(source, /Neto liquidable en pesos de hoy/);
  assert.match(source, /const RESERVE_RETURN = 6\.5/);
  assert.match(source, /const GBM_RETURN = 9/);
  assert.match(source, /const TRADING_MX_COMMISSION = 0\.25/);
  assert.match(source, /const CAPITAL_GAINS_TAX = 10/);
  assert.match(source, /Math\.pow\(1 \+ Math\.max\(-99\.99, annualRate\) \/ 100, 1 \/ 12\) - 1/);
  assert.match(source, /Comisión Trading MX/);
  assert.match(source, /ISR estimado sobre ganancia/);
  assert.match(source, /className="chart-line real-stroke"/);
  assert.match(source, /Guardar escenario/);
  assert.match(source, /Cambios sin guardar/);
  assert.match(source, /GUARDADO/);
  assert.match(source, /function cancelExtraEdit\(\)/);
  assert.match(source, /Ver tabla anual accesible/);
  assert.match(source, /function exportBackup\(\)/);
  assert.match(source, /function importBackup\(/);
  assert.match(source, /const DEFAULT_TARGET = 150000/);
  assert.match(source, /const DEFAULT_MONTHLY_EXPENSES = 25000/);
  assert.match(source, /const DEFAULT_YEARS = 5/);
  assert.match(source, /const STORAGE_KEY = "nexo-finanzas-demo-v5"/);
  assert.match(source, /dataMode/);
  assert.match(source, /Descargar Excel/);
  assert.match(source, /captureNexoScreenshots/);
  assert.match(source, /importNexoWorkbook/);
  assert.doesNotMatch(source, /nexo-respaldo-\$\{todayIso\}\.json/);
  assert.match(source, /Restablecer datos de ejemplo/);
  assert.match(source, /getNexoStorageKeys\(\).*localStorage\.removeItem/s);
  assert.match(source, /formatDurationMonths\(goalMonth\)/);
  assert.match(source, /const coverageMonths = monthlyExpenses > 0/);
  assert.match(source, /Cómo se forma la proyección/);
  assert.match(source, /disponibles no se proyectan/);
  assert.doesNotMatch(source, /SIGUIENTE ACCIÓN/);
  assert.doesNotMatch(source, /calendar-mobile-toggle/);
  assert.doesNotMatch(source, /backupOpen/);
});

test("defines accessible light and dark themes with distinguishable chart series", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /--bg: #f5f5f5/);
  assert.match(css, /--bg: #0d0d0d/);
  assert.match(css, /\.gbm-stroke \{[^}]*stroke-dasharray: 11 6/s);
  assert.match(css, /\.real-stroke \{[^}]*stroke-dasharray: 3 7/s);
  assert.match(css, /\.marker-investment/);
  assert.match(css, /\.marker-real/);
  assert.match(css, /@keyframes ambient-one/);
  assert.match(css, /\.movements-section \.calendar-card \{ display: none/);
  assert.match(css, /Nexo · Product system 2026/);
  assert.match(css, /\.overview-insight-grid/);
  assert.match(css, /\.transaction-modal/);
  assert.match(css, /\[hidden\] \{ display: none !important; \}/);
});

test("defines a privacy-safe static build for Vercel", async () => {
  const builder = await readFile(new URL("../scripts/build-vercel.mjs", import.meta.url), "utf8");
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));

  assert.equal(config.outputDirectory, "dist/vercel");
  assert.equal(config.buildCommand, "npm run build:vercel");
  assert.match(builder, /dist\/client/);
  assert.match(builder, /dist\/vercel/);
  assert.doesNotMatch(builder, /localStorage|\.xlsx|número de cuenta|saldo real/i);
});

test("builds a formatted and reimportable Excel workbook", async () => {
  const source = await readFile(new URL("../app/lib/nexo-workbook.ts", import.meta.url), "utf8");

  assert.match(source, /workbook\.addWorksheet\("Resumen"/);
  assert.match(source, /workbook\.addWorksheet\("Cuentas"/);
  assert.match(source, /workbook\.addWorksheet\("Actividad"/);
  assert.match(source, /workbook\.addWorksheet\("Movimientos"/);
  assert.match(source, /workbook\.addWorksheet\("Escenarios"/);
  assert.match(source, /workbook\.addWorksheet\("Capturas"/);
  assert.match(source, /workbook\.addWorksheet\("Configuración"/);
  assert.doesNotMatch(source, /veryHidden/);
  assert.match(source, /NEXO_XLSX_BACKUP/);
  assert.match(source, /html2canvas/);
  assert.match(source, /workbook\.addImage/);
  assert.doesNotMatch(source, /sheet\.addTable/);
  assert.match(source, /makeExcelCompatible/);
  assert.match(source, /ComisionTradingMX/);
  assert.match(source, /ImpuestoGanancia/);
  assert.match(source, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.doesNotMatch(source, /JSON\.stringify|JSON\.parse/);
});

test("exports an Excel-compatible workbook and reimports all data", async () => {
  const sourceUrl = new URL("../app/lib/nexo-workbook.ts", import.meta.url);
  const temporaryUrl = new URL(`./.nexo-workbook-${process.pid}.mjs`, import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace("./xlsx-compat.js", "../app/lib/xlsx-compat.js");
  await writeFile(temporaryUrl, compiled, "utf8");

  try {
    const { buildNexoWorkbook, importNexoWorkbook } = await import(`${temporaryUrl.href}?${Date.now()}`);
    const data = {
      dataMode: "example",
      accounts: [
        { id: "a1", label: "Cuenta de prueba", amount: 25000, rate: "8%", group: "reserve", note: "Dato ficticio" },
        { id: "a2", label: "Inversión de prueba", amount: 40000, rate: "11%", group: "investment", note: "Dato ficticio" },
      ],
      emergencyIds: ["a1"], years: 15, target: 180000, monthlyExpenses: 30000,
      reserveRate: 6.5, investmentRate: 9, inflationRate: 4, brokerFee: 0.25, capitalGainsTax: 10,
      extras: [{ id: 1, enabled: true, amount: 2500, recurring: true, frequency: "monthly", destination: "gbm", startMonth: 1, endMonth: null, monthOfYear: 1, oneTimeMonth: 1 }],
      events: [{ id: 1, date: "2026-08-15", title: "Movimiento de prueba", amount: "$3,000", detail: "Dato ficticio", numericAmount: 3000, tone: "green", kind: "contribution", destination: "gbm", includeInProjection: true, recurrence: "monthly", recurrenceEnd: null, completedDates: [], skippedDates: [] }],
      transactions: [{ id: "tx-1", date: "2026-08-13", title: "Nómina de prueba", amount: 18000, kind: "income", accountId: "a1", toAccountId: null, category: "Trabajo", note: "Dato ficticio" }],
    };
    const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+5Q2dAAAAAElFTkSuQmCC";
    const screenshots = ["Resumen", "Cuentas", "Proyección"].map((title) => ({ title, dataUrl: image, width: 1, height: 1, extension: "png" }));
    const buffer = await buildNexoWorkbook(data, screenshots);
    if (process.env.NEXO_WORKBOOK_OUTPUT) await writeFile(process.env.NEXO_WORKBOOK_OUTPUT, new Uint8Array(buffer));
    const archive = await JSZip.loadAsync(buffer);
    const entries = Object.keys(archive.files);
    const styles = await archive.file("xl/styles.xml").async("string");
    assert.equal(entries.some((path) => path.startsWith("xl/tables/")), false);
    assert.match(styles, /rgb="1D4ED8"/);
    assert.match(styles, /rgb="17365D"/);
    assert.doesNotMatch(styles, /rgb="(?:0000FF|0F625A)"/);
    assert.match(await archive.file("xl/worksheets/sheet2.xml").async("string"), /<autoFilter ref="A5:G7"\/>/);
    assert.match(await archive.file("xl/worksheets/sheet3.xml").async("string"), /<autoFilter ref="A5:I6"\/>/);
    assert.match(await archive.file("xl/worksheets/sheet4.xml").async("string"), /<autoFilter ref="A5:M6"\/>/);
    assert.match(await archive.file("xl/worksheets/sheet5.xml").async("string"), /<autoFilter ref="A5:J6"\/>/);
    const drawing = await archive.file("xl/drawings/drawing1.xml").async("string");
    assert.doesNotMatch(drawing, /<a:ext cx="0" cy="0"\/>/);
    assert.doesNotMatch(drawing, /a16:creationId/);
    assert.equal((drawing.match(/<xdr:oneCellAnchor/g) ?? []).length, 3);

    const imported = await importNexoWorkbook({ arrayBuffer: async () => buffer });
    assert.equal(imported.accounts.length, 2);
    assert.equal(imported.events.length, 1);
    assert.equal(imported.extras.length, 1);
    assert.equal(imported.transactions.length, 1);
    assert.equal(imported.transactions[0].title, "Nómina de prueba");
    assert.equal(imported.accounts[0].label, "Cuenta de prueba");
  } finally {
    await unlink(temporaryUrl).catch(() => {});
  }
});
