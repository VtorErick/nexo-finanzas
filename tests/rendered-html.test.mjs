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
  assert.match(html, /<meta[^>]+name="description"[^>]+experiencia financiera clara/i);
  assert.match(html, /<link[^>]+rel="icon"[^>]+href="\/favicon\.svg"/i);
  assert.match(html, /Tu dinero hoy\./);
  assert.match(html, /Patrimonio total/);
  assert.match(html, /Modo ejemplo/);
  assert.match(html, /Cuenta diaria/);
  assert.match(html, /Balance del mes/);
  assert.match(html, /En qué se fue tu dinero/);
  assert.doesNotMatch(html, /Patrimonio distribuido en/);
  assert.doesNotMatch(html, /RECIENTE/);
  assert.match(html, /Tus movimientos/);
  assert.match(html, /Reserva/);
  assert.doesNotMatch(html, /Dinero final estimado/);
  assert.doesNotMatch(html, /Prueba una meta, un tiempo y una aportación/);
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
  assert.match(html, /aria-label="Inflación anual estimada"/);
  assert.match(html, /Ajustar meta/);
  assert.match(html, /aria-label="Cambiar a tema oscuro"/);
  assert.match(html, /no es un ingreso/);
  assert.match(html, /Cobertura actual/);
  assert.doesNotMatch(html, /Planear movimiento/);
  assert.match(html, /Abrir respaldo/);
  assert.match(html, /Aportar/);
  assert.match(html, /Ajustar meta/);
  assert.match(html, /Protege tus datos/);
  assert.match(html, /Privacidad local/);
  assert.match(html, /RUTA RÁPIDA/);
  assert.match(html, /Historial/);
  assert.match(html, /aria-label="Mes en vista"/);
  assert.match(html, /Aplicar/);
  assert.match(html, /Filtrar por categoría/);
  assert.match(html, /aria-label="Buscar concepto o categoría"/);
  assert.doesNotMatch(html, /activity-plan-link/);
  assert.match(html, /role="slider" aria-label="Explorar periodos de la proyección"/);
  assert.match(html, /Neto estimado al final/);
  assert.doesNotMatch(html, /Claridad para decidir mejor/);
  assert.doesNotMatch(html, /Uso personal · MXN/);
  assert.doesNotMatch(html, /aria-label="Sección 1 de 5"/);
  assert.match(html, /Preparando guardado local/);
});

test("includes the extended planning controls", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const contextRailSource = await readFile(new URL("../app/components/ui/ContextRail.tsx", import.meta.url), "utf8");
  const viewHeaderSource = await readFile(new URL("../app/components/ui/ViewHeader.tsx", import.meta.url), "utf8");
  const metricCardSource = await readFile(new URL("../app/components/ui/MetricCard.tsx", import.meta.url), "utf8");
  const nextBestActionSource = await readFile(new URL("../app/components/ui/NextBestAction.tsx", import.meta.url), "utf8");
  const filterChipsSource = await readFile(new URL("../app/components/ui/FilterChips.tsx", import.meta.url), "utf8");
  const statusMessageSource = await readFile(new URL("../app/components/ui/StatusMessage.tsx", import.meta.url), "utf8");
  const actionMenuSource = await readFile(new URL("../app/components/ui/ActionMenu.tsx", import.meta.url), "utf8");
  const emptyStateSource = await readFile(new URL("../app/components/ui/EmptyState.tsx", import.meta.url), "utf8");
  const modalShellSource = await readFile(new URL("../app/components/ui/ModalShell.tsx", import.meta.url), "utf8");

  assert.match(source, /const MAX_YEARS = 30/);
  assert.match(source, /Mes de inicio/);
  assert.match(source, /Mes final/);
  assert.match(source, /sin fecha final/);
  assert.match(source, /Agregar cuenta/);
  assert.match(source, /Inflación anual estimada/);
  assert.match(source, /aria-label="Meta del fondo de emergencia"/);
  assert.match(source, /Ajusta tu meta/);
  assert.match(source, /const formatCompact = \(value: number\) =>/);
  assert.match(source, /const labelStep = compactChart/);
  assert.match(source, /function getEventOccurrences\(/);
  assert.match(source, /function getMexicoToday\(/);
  assert.doesNotMatch(source, /const REFERENCE_DATE/);
  assert.match(source, /type MovementKind = "expense" \| "income" \| "transfer" \| "contribution"/);
  assert.match(source, /type TransactionKind = "expense" \| "income" \| "transfer"/);
  assert.match(source, /function saveTransaction\(\)/);
  assert.match(source, /function adjustAccountsForTransaction\(/);
  assert.match(source, /Nuevo gasto/);
  assert.match(source, /Nuevo ingreso/);
  assert.match(source, /Nueva transferencia/);
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /setConfirmationAction\(\{ kind: "delete-transaction", transaction \}\)/);
  assert.match(source, /setConfirmationAction\(\{ kind: "reset-example" \}\)/);
  assert.doesNotMatch(source, /window\.confirm\(/);
  assert.match(source, /savedMode === "example" \? createExampleTransactions\(today\) : \[\]/);
  assert.match(source, /skippedDates: item\.skippedDates\.filter\(\(date\) => date !== event\.date\)/);
  assert.match(source, /completedDates: item\.completedDates\.filter\(\(date\) => date !== event\.date\)/);
  assert.match(source, /group\.transactions\.length === 1 \? "" : "s"/);
  assert.match(source, /Cada semana/);
  assert.match(source, /Cada mes/);
  assert.match(source, /Cada año/);
  assert.match(source, /Neto en pesos de hoy/);
  assert.match(source, /const RESERVE_RETURN = 6\.5/);
  assert.match(source, /const GBM_RETURN = 9/);
  assert.match(source, /const TRADING_MX_COMMISSION = 0\.25/);
  assert.match(source, /const CAPITAL_GAINS_TAX = 10/);
  assert.match(source, /Math\.pow\(1 \+ sanitizeReturnRate\(annualRate\) \/ 100, 1 \/ 12\) - 1/);
  assert.match(source, /Comisión Trading MX/);
  assert.match(source, /ISR estimado sobre ganancia/);
  assert.match(source, /className="chart-line real-stroke"/);
  assert.match(source, /Guardar escenario/);
  assert.match(source, /extraEditorOpen/);
  assert.match(source, /extra-scenario-modal/);
  assert.match(source, /extras-add-button/);
  assert.match(source, /Personalizar proyección/);
  assert.doesNotMatch(source, /plan-add-scenario/);
  assert.match(source, /describeExtraSchedule/);
  assert.doesNotMatch(source, /Dinero final estimado/);
  assert.doesNotMatch(source, /Prueba una meta, un tiempo y una aportación/);
  assert.match(source, /Cambios sin guardar/);
  assert.doesNotMatch(source, /GUARDADO/);
  assert.doesNotMatch(source, /extra-saved-meta/);
  assert.match(source, /function cancelExtraEdit\(\)/);
  assert.doesNotMatch(source, /Ver tabla anual accesible/);
  assert.match(source, /function exportBackup\(\)/);
  assert.match(source, /function importBackup\(/);
  assert.match(source, /const DEFAULT_TARGET = 150000/);
  assert.match(source, /const DEFAULT_MONTHLY_EXPENSES = 25000/);
  assert.match(source, /const DEFAULT_YEARS = 5/);
  assert.match(source, /const STORAGE_KEY = "nexo-finanzas-demo-v5"/);
  assert.match(source, /dataMode/);
  assert.match(source, /Descargar respaldo/);
  assert.match(source, /captureNexoScreenshots/);
  assert.match(source, /importNexoWorkbook/);
  assert.doesNotMatch(source, /nexo-respaldo-\$\{todayIso\}\.json/);
  assert.match(source, /Restablecer datos de ejemplo/);
  assert.match(source, /const candidateKeys = \[/);
  assert.match(source, /Try the next preserved Nexo snapshot/);
  assert.doesNotMatch(source, /filter\(\(key\) => key !== STORAGE_KEY\)\s*\.forEach\(\(key\) => window\.localStorage\.removeItem/);
  assert.match(source, /function trapFocusInModal\(/);
  assert.match(source, /function viewFromLocation\(/);
  assert.match(source, /syncLocationState\(\);/);
  assert.match(source, /window\.history\[method\]/);
  assert.match(source, /<ViewHeader/);
  assert.match(contextRailSource, /className="context-rail"/);
  assert.match(viewHeaderSource, /view-header/);
  assert.match(metricCardSource, /metric-card/);
  assert.match(nextBestActionSource, /Siguiente mejor acción/);
  assert.match(filterChipsSource, /Filtros activos/);
  assert.match(statusMessageSource, /status-message/);
  assert.match(actionMenuSource, /aria-haspopup="menu"/);
  assert.match(actionMenuSource, /ArrowDown/);
  assert.match(actionMenuSource, /focusItem/);
  assert.match(emptyStateSource, /empty-state-actions/);
  assert.match(modalShellSource, /aria-modal="true"/);
  assert.match(viewHeaderSource, /sectionIndex/);
  assert.match(metricCardSource, /valueLabel/);
  assert.match(contextRailSource, /role="region"/);
  assert.match(source, /Cambios sin guardar/);
  assert.doesNotMatch(source, /className="form-stepper"/);
  assert.doesNotMatch(source, /transactionStep/);
  assert.doesNotMatch(source, /Vista previa del registro/);
  assert.match(source, /projection-breakdown/);
  assert.match(source, /account-group-heading/);
  assert.match(source, /Estado del respaldo/);
  assert.match(source, /const STORAGE_SCHEMA_VERSION = 1/);
  assert.match(source, /setImportPreview\(/);
  assert.match(source, /Importar y reemplazar/);
  assert.match(source, /aria-valuetext=\{chartValueText\}/);
  assert.match(source, /activityFiltersActive/);
  assert.doesNotMatch(source, /activityFiltersOpen/);
  assert.match(source, /id="activity-filter-panel" className="activity-filter-controls"/);
  assert.match(source, /const \[activityMonth, setActivityMonth\]/);
  assert.match(source, /const activityMonthOptions = useMemo/);
  assert.match(source, /setActivityMonth\(event\.date\.slice\(0, 7\)\)/);
  assert.match(source, /Movimiento aplicado: apareció en Actividad y actualizó tus cuentas/);
  assert.match(source, /appliedTransactionIds/);
  assert.match(source, /useDeferredValue/);
  assert.match(source, /scenarioLabel/);
  assert.match(source, /data-safety-summary/);
  assert.match(source, /aria-label="Monto del movimiento en pesos mexicanos"/);
  assert.match(source, /transactionTriggerRef\.current\?\.isConnected/);
  assert.match(source, /formatDurationMonths\(goalMonth\)/);
  assert.match(source, /const coverageMonths = monthlyExpenses > 0/);
  assert.match(source, /Ruta rápida para usar Plan/);
  assert.match(source, /Define el horizonte/);
  assert.match(source, /Categoría del movimiento/);
  assert.match(source, /Nota opcional/);
  assert.doesNotMatch(source, /Más información/);
  assert.doesNotMatch(source, /transaction-optional-details/);
  assert.match(source, /aria-label="Mes anterior"/);
  assert.match(source, /aria-label="Mes siguiente"/);
  assert.match(source, /Movimientos próximos y recurrentes/);
  assert.doesNotMatch(source, /aria-label="Vista del plan"/);
  assert.match(source, /Cómo se forma la proyección/);
  assert.match(source, /no entra en la proyección/);
  assert.doesNotMatch(source, /CATÁLOGO DE AHORRO/);
  assert.doesNotMatch(source, /La línea neta supone una venta/);
  assert.doesNotMatch(source, /SIGUIENTE ACCIÓN/);
  assert.doesNotMatch(source, /calendar-mobile-toggle/);
  assert.doesNotMatch(source, /backupOpen/);
});

test("defines accessible light and dark themes with distinguishable chart series", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const foundation = await readFile(new URL("../app/styles/foundation.css", import.meta.url), "utf8");

  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /--bg: #f7f7fa/);
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
  assert.match(css, /\.activity-month-selector/);
  assert.match(css, /\.metric-card-value/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /\.confirmation-modal/);
  assert.match(css, /\[hidden\] \{ display: none !important; \}/);
  assert.match(css, /\.assumptions-result \{ background: var\(--brand-surface\); color: #ffffff;/);
  assert.match(foundation, /--control-height: 46px/);
  assert.match(foundation, /\.tab-bar button:focus-visible/);
  assert.match(foundation, /\.import-preview-grid/);
  assert.match(foundation, /\.context-rail/);
  assert.match(foundation, /\.mobile-view-label/);
  assert.match(foundation, /\.form-stepper/);
  assert.match(foundation, /grid-template-columns: minmax\(0, 1fr\);[\s\S]*\.overview-grid \.metric-card/);
  assert.match(foundation, /\.projection-interpretation > div:first-child/);
  assert.doesNotMatch(css, /text-overflow: ellipsis/);
  assert.doesNotMatch(foundation, /text-overflow: ellipsis/);
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

test("clamps hostile and locale-formatted financial inputs", async () => {
  const source = await readFile(new URL("../app/lib/nexo-values.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  const values = await import(moduleUrl);

  assert.equal(values.parseMoneyInput("$1,234.50"), 1234.5);
  assert.equal(values.parseMoneyInput("1,5"), 1.5);
  assert.equal(values.parseMoneyInput("no es un monto"), 0);
  assert.equal(values.sanitizeReturnRate("6,5"), 6.5);
  assert.equal(values.sanitizeReturnRate("1e309"), 100);
  assert.equal(values.sanitizeReturnRate("-1e309"), -99);
  assert.equal(values.sanitizeInflationRate("1e309"), 100);
  assert.equal(values.sanitizePercentRate("-10"), 0);
  assert.equal(Number.isFinite(values.sanitizeMoney(Number.POSITIVE_INFINITY)), true);
});

test("validates the savings reference sheet and UDI protection math", async () => {
  const source = await readFile(new URL("../app/lib/savings-options.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  const catalog = await import(moduleUrl);
  const validation = catalog.calculateReferenceValidation(8.843769, 30);

  assert.equal(catalog.SAVINGS_OPTIONS.length, 19);
  assert.equal(validation.investedTotal, 250000);
  assert.equal(validation.weightedRate, 13.46);
  assert.equal(validation.rowInterestTotal, 2819.68);
  assert.equal(validation.rowTaxTotal, 77.7);
  assert.equal(validation.rowTotalDifference, 0.02);
  assert.equal(validation.simpleInterestTotal, 2765.75);
  assert.equal(validation.simpleInterestDifference, -53.91);
  assert.equal(validation.prosofipoProtection, 221094.23);
  assert.equal(validation.ipabProtection, 3537507.6);
  assert.match(source, /Klar garantía/);
  assert.match(source, /La hoja marca PROSOFIPO/);
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
  assert.match(source, /Categoria:\$\{category\.id\}/);
  assert.match(source, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(source, /sheet\.getCell\(5, column\)\.alignment = \{ horizontal: "right"/);
  assert.doesNotMatch(source, /JSON\.stringify|JSON\.parse/);
});

test("exports an Excel-compatible workbook and reimports all data", async () => {
  const sourceUrl = new URL("../app/lib/nexo-workbook.ts", import.meta.url);
  const temporaryUrl = new URL(`./.nexo-workbook-${process.pid}.mjs`, import.meta.url);
  const temporaryValuesName = `.nexo-values-${process.pid}.mjs`;
  const temporaryValuesUrl = new URL(`./${temporaryValuesName}`, import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  const valuesSource = await readFile(new URL("../app/lib/nexo-values.ts", import.meta.url), "utf8");
  const valuesCompiled = ts.transpileModule(valuesSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
    .replace("./xlsx-compat.js", "../app/lib/xlsx-compat.js")
    .replace("./nexo-values", `./${temporaryValuesName}`);
  await writeFile(temporaryValuesUrl, valuesCompiled, "utf8");
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
      events: [{ id: 1, date: "2026-08-15", title: "Movimiento de prueba", amount: "$3,000", detail: "Dato ficticio", numericAmount: 3000, tone: "green", kind: "contribution", accountId: "a1", toAccountId: "a2", destination: "gbm", includeInProjection: true, recurrence: "monthly", recurrenceEnd: null, completedDates: [], skippedDates: [], appliedTransactionIds: {} }],
      transactions: [{ id: "tx-1", date: "2026-08-13", title: "Nómina de prueba", amount: 18000, kind: "income", accountId: "a1", toAccountId: null, category: "Trabajo", note: "Dato ficticio" }],
      categories: [{ id: "trabajo", label: "Trabajo", icon: "work" }],
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
    assert.match(await archive.file("xl/worksheets/sheet4.xml").async("string"), /<autoFilter ref="A5:P6"\/>/);
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
    assert.equal(imported.categories.length, 1);
    assert.equal(imported.categories[0].label, "Trabajo");
    assert.equal(imported.transactions[0].title, "Nómina de prueba");
    assert.equal(imported.accounts[0].label, "Cuenta de prueba");
    assert.equal(imported.events[0].accountId, "a1");
    assert.equal(imported.events[0].toAccountId, "a2");

    const { default: ExcelJS } = await import("exceljs");
    const tamperedWorkbook = new ExcelJS.Workbook();
    await tamperedWorkbook.xlsx.load(buffer);
    tamperedWorkbook.getWorksheet("Cuentas").getCell("A7").value = "a1";
    const tamperedBuffer = await tamperedWorkbook.xlsx.writeBuffer();
    await assert.rejects(
      () => importNexoWorkbook({ size: tamperedBuffer.byteLength, arrayBuffer: async () => tamperedBuffer }),
      /IDs de cuenta duplicados/,
    );
  } finally {
    await unlink(temporaryUrl).catch(() => {});
    await unlink(temporaryValuesUrl).catch(() => {});
  }
});
