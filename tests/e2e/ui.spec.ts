import { expect, test, type Page } from "@playwright/test";

test.describe("Nexo UI flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => {
      const button = document.querySelector(".side-nav button");
      return button !== null && Object.keys(button).some((key) => key.startsWith("__reactProps"));
    });
  });

  test("navigates between views and preserves the browser URL", async ({ page }) => {
    test.skip(test.info().project.name === "mobile-chromium", "La navegación móvil se verifica en el test dedicado.");
    await expect(page.getByRole("heading", { name: "Tu dinero hoy." })).toBeVisible();

    await page.goto("/?view=accounts");
    await expect(page.getByRole("heading", { name: "Dónde está tu dinero." })).toBeVisible();
    await page.goto("/");
    await page.waitForFunction(() => document.querySelector(".side-nav button") && Object.keys(document.querySelector(".side-nav button")!).some((key) => key.startsWith("__reactProps")));

    const primaryNav = page.getByRole("navigation", { name: "Navegación principal" });
    await primaryNav.getByRole("button", { name: "Actividad" }).click();
    await expect(page).toHaveURL(/\?view=activity$/);
    await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Tu dinero hoy." })).toBeVisible();

    await primaryNav.getByRole("button", { name: "Plan" }).click();
    await expect(page).toHaveURL(/\?view=plan$/);
    await expect(page.getByRole("slider", { name: "Explorar periodos de la proyección" })).toBeVisible();
    await expect(page.locator(".view-page:not([hidden]) h1")).toBeFocused();
  });

  test("registers a movement through the accessible form", async ({ page }) => {
    test.skip(test.info().project.name === "mobile-chromium", "El formulario móvil comparte el mismo flujo y no duplica la prueba de escritorio.");
    await page.locator(".sidebar .edit-balances-button").click();
    const dialog = page.getByRole("dialog", { name: "Nuevo gasto" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".form-stepper")).toHaveCount(0);

    await page.getByLabel("Monto del movimiento en pesos mexicanos").fill("1234.50");
    await dialog.getByLabel("Descripción").fill("Prueba E2E");
    await dialog.getByRole("button", { name: "Guardar movimiento" }).click();

    await expect(page.getByRole("status")).toContainText("registrado");
    await primaryActivity(page).getByRole("button", { name: "Actividad" }).click();
    await expect(page.locator(".activity-month-groups .transaction-row").filter({ hasText: "Prueba E2E" })).toBeVisible();
  });

  test("makes activity filters readable and recoverable", async ({ page }) => {
    test.skip(test.info().project.name === "mobile-chromium", "Los filtros se validan en escritorio y la barra móvil se valida en el test dedicado.");
    await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("button", { name: "Actividad" }).click();
    await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();
    const search = page.locator("#activity-search");
    await search.fill("super");
    await expect(page.locator(".filter-chip")).toContainText("Busca: super");
    await expect(page.getByText(/de \d+ movimientos/).first()).toBeVisible();
    await page.getByRole("button", { name: "Limpiar filtros", exact: true }).click();
    await expect(search).toHaveValue("");
    await expect(page.locator(".filter-chip")).toHaveCount(0);
  });

  test("keeps activity filters visible on mobile", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile-chromium", "Este comportamiento solo aplica al layout móvil.");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=activity");

    const filterPanel = page.locator("#activity-filter-panel");
    await expect(filterPanel).toBeVisible();
    await expect(page.getByLabel("Filtrar por categoría")).toBeVisible();
    await expect(page.locator(".filter-toggle")).toHaveCount(0);
    await filterPanel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "review-captures/audit27-activity-filters-visible-mobile.png", fullPage: false });
  });

  test("opens planned movements in a modal, resets the section on navigation, and colors activity rows", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=activity");

    const plannedPanel = page.locator(".planned-movements-panel");
    const plannedToggle = plannedPanel.locator(".planned-movements-toggle");
    await expect(plannedToggle).toHaveAttribute("aria-expanded", "false");

    await page.getByRole("button", { name: "Planear movimiento", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Planear movimiento" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".event-form-grid")).toBeVisible();
    await expect(plannedPanel.locator(".event-form-grid")).toHaveCount(0);
    await page.screenshot({ path: "review-captures/audit26-activity-planned-modal-mobile.png", fullPage: false });

    const rowTones = await page.locator(".activity-transaction-row").evaluateAll(() => {
      const read = (selector: string) => {
        const row = document.querySelector<HTMLElement>(selector);
        const amount = row?.querySelector<HTMLElement>(".transaction-amount");
        return { background: row ? getComputedStyle(row).backgroundColor : "", amountColor: amount ? getComputedStyle(amount).color : "" };
      };
      return { income: read(".activity-transaction-row.income"), expense: read(".activity-transaction-row.expense"), transfer: read(".activity-transaction-row.transfer") };
    });
    expect(rowTones.income.background).not.toBe(rowTones.expense.background);
    expect(rowTones.expense.background).not.toBe(rowTones.transfer.background);
    expect(rowTones.income.amountColor).not.toBe(rowTones.expense.amountColor);

    await dialog.getByRole("button", { name: "Cerrar movimiento planeado" }).click();
    await page.locator(".activity-month-group").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: "review-captures/audit26-activity-colors-mobile.png", fullPage: false });

    await plannedToggle.click();
    await expect(plannedPanel.locator(".movement-actions").first()).toBeVisible();
    await plannedPanel.locator(".events-card").scrollIntoViewIfNeeded();
    const actionMetrics = await plannedPanel.locator(".movement-actions").evaluateAll((actions) => actions.map((action) => {
      const state = action.querySelector<HTMLElement>(".event-state");
      const primary = action.querySelector<HTMLElement>(".event-primary-action");
      return {
        stateWidth: state?.getBoundingClientRect().width ?? 0,
        primaryX: primary?.getBoundingClientRect().x ?? 0,
        primaryWidth: primary?.getBoundingClientRect().width ?? 0,
      };
    }));
    expect(actionMetrics.length).toBeGreaterThan(1);
    expect(new Set(actionMetrics.map((metric) => Math.round(metric.stateWidth))).size).toBe(1);
    expect(new Set(actionMetrics.map((metric) => Math.round(metric.primaryX))).size).toBe(1);
    expect(new Set(actionMetrics.map((metric) => Math.round(metric.primaryWidth))).size).toBe(1);
    await page.screenshot({ path: "review-captures/audit28-planned-action-alignment-mobile.png", fullPage: false });

    await page.getByRole("button", { name: "Hoy", exact: true }).click();
    await page.getByRole("button", { name: "Actividad", exact: true }).click();
    await expect(page.locator(".planned-movements-toggle")).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "Planear movimiento", exact: true })).toBeVisible();
  });

  test("keeps five clear mobile destinations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();

    const tabBar = page.getByRole("navigation", { name: "Navegación de secciones" });
    await expect(tabBar.locator(":scope > button")).toHaveCount(4);
    await expect(tabBar.locator(".mobile-more-nav")).toHaveCount(0);
    await expect(tabBar.locator(".quick-actions-toggle")).toBeVisible();
    await expect(tabBar).toBeVisible();
    const destinationWidths = await page.locator(".tab-bar > button, .tab-bar > .mobile-more-nav .more-nav-direct").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
    expect(destinationWidths).toHaveLength(4);
    expect(Math.max(...destinationWidths) - Math.min(...destinationWidths)).toBeLessThan(1);

    await expect(page.getByRole("button", { name: "Abrir datos" })).toBeVisible();
    await page.getByRole("button", { name: "Abrir datos" }).click();
    await expect(page).toHaveURL(/\?view=data$/);
    await expect(page.getByRole("heading", { name: "Tus datos." })).toBeVisible();
    await expect(page.locator(".backup-flow-steps li")).toHaveCount(3);
  });

  test("keeps activity filters shareable and recoverable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=activity");

    await page.getByRole("searchbox", { name: "Buscar concepto o categoría" }).fill("super");
    const categoryPicker = page.getByLabel("Filtrar por categoría");
    await categoryPicker.click();
    await page.getByRole("option", { name: "Alimentos", exact: true }).click();
    await expect(page).toHaveURL(/view=activity.*q=super/);
    await expect(page).toHaveURL(/category=Alimentos/);

    await page.reload();
    await expect(page.getByRole("searchbox", { name: "Buscar concepto o categoría" })).toHaveValue("super");
    await expect(page.getByLabel("Filtrar por categoría").locator(".picker-trigger-value")).toHaveText("Alimentos");
  });

  test("uses modern picker sheets instead of native option lists", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=activity");

    await expect(page.locator("select")).toHaveCount(0);
    const categoryPicker = page.locator(".view-page:not([hidden])").getByLabel("Filtrar por categoría");
    await categoryPicker.click();

    const picker = page.getByRole("dialog", { name: "Filtrar por categoría" });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("searchbox", { name: "Buscar Filtrar por categoría" })).toBeVisible();
    await expect(picker.getByRole("option", { name: "Alimentos", exact: true })).toBeVisible();
    await page.screenshot({ path: "review-captures/audit23-modern-picker-category-mobile.png", fullPage: false });

    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await expect(categoryPicker).toBeFocused();
  });

  test("keeps mobile touch targets and short landscape readable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const metricCards = page.locator(".overview-money-facts .metric-card");
    await expect(metricCards).toHaveCount(3);
    const metricLayout = await metricCards.evaluateAll((cards) => cards.map((card) => {
      const heading = card.querySelector<HTMLElement>(".metric-card-heading");
      const icon = card.querySelector<HTMLElement>(".metric-card-icon");
      const label = card.querySelector<HTMLElement>(".metric-card-label");
      const value = card.querySelector<HTMLElement>(".metric-card-value");
      const centerY = (element: HTMLElement | null) => element ? element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2 : 0;
      return {
        iconCenter: centerY(icon),
        labelCenter: centerY(label),
        valueTop: value?.getBoundingClientRect().top ?? 0,
        headingBackground: heading ? getComputedStyle(heading).backgroundColor : "",
      };
    }));
    expect(Math.max(...metricLayout.map((metric) => Math.abs(metric.iconCenter - metric.labelCenter)))).toBeLessThan(1);
    expect(Math.max(...metricLayout.map((metric) => metric.valueTop)) - Math.min(...metricLayout.map((metric) => metric.valueTop))).toBeLessThan(1);
    expect(new Set(metricLayout.map((metric) => metric.headingBackground))).toEqual(new Set(["rgba(0, 0, 0, 0)"]));

    const quickAction = page.locator(".mobile-data-button");
    const quickActionBox = await quickAction.boundingBox();
    expect(quickActionBox?.width).toBeGreaterThanOrEqual(44);
    expect(quickActionBox?.height).toBeGreaterThanOrEqual(44);

    const tabButtons = await page.getByRole("navigation", { name: "Navegación de secciones" }).getByRole("button").all();
    for (const button of tabButtons) {
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(48);
    }

    await page.setViewportSize({ width: 844, height: 390 });
    await page.reload();
    const tabBar = page.getByRole("navigation", { name: "Navegación de secciones" });
    const hero = page.locator(".net-worth-card");
    const tabBarBox = await tabBar.boundingBox();
    const heroBox = await hero.boundingBox();
    expect(heroBox?.y).toBeLessThan(tabBarBox?.y ?? 0);
    expect((heroBox?.y ?? 0) + (heroBox?.height ?? 0)).toBeLessThanOrEqual((tabBarBox?.y ?? 0) + 1);

    const dimensions = await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);
  });

  test("keeps the transaction sheet actionable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.locator(".quick-actions-toggle").click();
    await page.getByRole("button", { name: "Gasto", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: "Nuevo gasto" });
    const actions = dialog.locator(".transaction-actions");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/transaction-modal-expense/);
    const formSeparators = await dialog.locator(".transaction-form-grid label").evaluateAll((labels) => labels.map((label) => getComputedStyle(label).borderBottomWidth));
    expect(formSeparators.at(-1)).toBe("0px");
    await expect(dialog.locator(".transaction-optional-details")).toHaveCount(0);
    await expect(dialog.getByLabel("Categoría del movimiento")).toBeVisible();
    await expect(dialog.getByLabel("Nota opcional")).toBeVisible();
    await expect(dialog.getByText("Más información", { exact: true })).toHaveCount(0);
    const dialogBox = await dialog.boundingBox();
    const actionsBox = await actions.boundingBox();
    expect((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0)).toBeLessThanOrEqual(844);
    expect((actionsBox?.y ?? 0) + (actionsBox?.height ?? 0)).toBeLessThanOrEqual(844);
    await page.getByLabel("Monto del movimiento en pesos mexicanos").fill("1250");
    await expect(dialog.locator(".transaction-actions .primary-button")).toBeEnabled();
  });

  test("keeps transaction headers tinted and close controls centered on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const variants = [
      { action: "Gasto", dialog: "Nuevo gasto", modalClass: "transaction-modal-expense", screenshot: "audit17-transaction-expense-header-mobile.png" },
      { action: "Ingreso", dialog: "Nuevo ingreso", modalClass: "transaction-modal-income", screenshot: "audit17-transaction-income-header-mobile.png" },
      { action: "Transferencia", dialog: "Nueva transferencia", modalClass: "transaction-modal-transfer", screenshot: "audit17-transaction-transfer-header-mobile.png" },
    ];

    for (const [index, variant] of variants.entries()) {
      if (index > 0) {
        await page.getByRole("button", { name: "Cerrar movimiento" }).click();
      }
      await page.locator(".quick-actions-toggle").click();
      await page.getByRole("button", { name: variant.action, exact: true }).click();

      const dialog = page.getByRole("dialog", { name: variant.dialog });
      const header = dialog.locator(".transaction-modal-heading");
      const close = dialog.getByRole("button", { name: "Cerrar movimiento" });
      const glyph = close.locator("span");
      await expect(dialog).toHaveClass(new RegExp(variant.modalClass));

      const headerBackground = await header.evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(headerBackground).not.toBe("rgba(0, 0, 0, 0)");

      const closeBox = await close.boundingBox();
      const glyphBox = await glyph.boundingBox();
      expect(Math.abs((closeBox?.x ?? 0) + (closeBox?.width ?? 0) / 2 - ((glyphBox?.x ?? 0) + (glyphBox?.width ?? 0) / 2))).toBeLessThan(1);
      expect(Math.abs((closeBox?.y ?? 0) + (closeBox?.height ?? 0) / 2 - ((glyphBox?.y ?? 0) + (glyphBox?.height ?? 0) / 2))).toBeLessThan(1);
      await page.screenshot({ path: `review-captures/${variant.screenshot}`, fullPage: false });
    }
  });

  test("keeps emergency goal editing visible and focused", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const directGoalAction = page.locator("#export-overview .reserve-focus").getByRole("button", { name: /Ajustar meta/ });
    await expect(directGoalAction).toBeVisible();
    await directGoalAction.click();

    const dialog = page.getByRole("dialog", { name: "Ajusta tu meta" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Meta del fondo de emergencia")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Guardar meta" })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();

    await page.goto("/?view=plan");
    await page.getByRole("button", { name: "Personalizar proyección" }).click();
    await page.waitForTimeout(450);
    const assumptionsBox = await page.locator(".assumptions-card").boundingBox();
    expect(assumptionsBox?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect(assumptionsBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(844);
  });

  test("opens the planning scenario as a full-width mobile sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=plan");

    await expect(page.getByText("Dinero final estimado", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Prueba una meta, un tiempo y una aportación.", { exact: true })).toHaveCount(0);

    const controls = page.locator(".projection-controls");
    const adjustButton = page.getByRole("button", { name: "Personalizar proyección" });
    const addScenarioButton = page.getByRole("button", { name: "+ Añadir aporte" });
    await expect(addScenarioButton).toBeVisible();
    await expect(page.locator(".projection-heading .plan-add-scenario")).toHaveCount(0);
    const controlsBox = await controls.boundingBox();
    const adjustBox = await adjustButton.boundingBox();
    const addBox = await addScenarioButton.boundingBox();
    const simulationTitleBox = await page.locator(".extras-toggle-copy strong").boundingBox();
    expect(controlsBox?.width).toBeGreaterThanOrEqual(358);
    expect((addBox?.x ?? 0)).toBeGreaterThan(simulationTitleBox?.x ?? 0);
    expect((addBox?.y ?? 0)).toBeGreaterThan(adjustBox?.y ?? 0);
    await page.screenshot({ path: "review-captures/audit14-plan-horizon-mobile.png", fullPage: false });

    await addScenarioButton.click();
    const dialog = page.getByRole("dialog", { name: "Nuevo escenario" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Incluir escenario en la proyección")).toBeVisible();
    await expect(dialog.getByLabel("Monto")).toHaveValue("5,000");
    const dialogBox = await dialog.boundingBox();
    expect((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0)).toBeLessThanOrEqual(844);
    await page.screenshot({ path: "review-captures/audit14-plan-scenario-modal-mobile.png", fullPage: false });

    await dialog.getByRole("button", { name: "Guardar escenario" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(addScenarioButton).toBeFocused();
    await page.locator(".extras-toggle").click();
    await expect(page.locator(".extra-saved-card")).toHaveCount(2);

    await addScenarioButton.click();
    const reopenedDialog = page.getByRole("dialog", { name: "Nuevo escenario" });
    await expect(reopenedDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(reopenedDialog).toHaveCount(0);
    await expect(addScenarioButton).toBeFocused();
  });

  test("keeps expanded simulations compact and scannable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=plan");

    await page.locator(".extras-toggle").click();
    const cards = page.locator(".extra-saved-card");
    await expect(cards.first()).toBeVisible();
    await expect(page.locator(".saved-badge")).toHaveCount(0);
    await expect(page.locator(".extra-saved-meta")).toHaveCount(0);
    await expect(page.locator(".extra-saved-card h3")).toHaveCount(0);

    const cardMetrics = await cards.evaluateAll((items) => items.map((card) => {
      const amount = card.querySelector<HTMLElement>(".extra-saved-amount")?.textContent?.trim() ?? "";
      const amountCount = (card.textContent?.match(new RegExp(amount.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
      const rect = card.getBoundingClientRect();
      return { height: rect.height, amountCount };
    }));
    expect(Math.max(...cardMetrics.map((card) => card.height))).toBeLessThan(160);
    expect(Math.max(...cardMetrics.map((card) => card.amountCount))).toBe(1);
    const dimensions = await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);
    await page.screenshot({ path: "review-captures/audit15-plan-simulations-compact-mobile.png", fullPage: false });
  });

  test("keeps the projection summary focused on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=plan");

    const projectionCard = page.locator(".projection-card");
    await expect(projectionCard.getByText("Neto estimado al final", { exact: true })).toBeVisible();
    await expect(projectionCard.getByText("Resultado principal", { exact: true })).toHaveCount(0);
    await expect(projectionCard.locator(".chart-legend-toggle b")).toHaveCount(0);
    await expect(page.locator(".projection-data")).toHaveCount(0);
    await expect(page.locator(".reference-options-panel")).toHaveCount(0);
    await expect(page.getByText("La línea neta supone una venta", { exact: false })).toHaveCount(0);
    await expect(page.locator("footer")).toHaveCount(0);

    await projectionCard.locator(".projection-explanation > summary").click();
    await expect(projectionCard.locator(".projection-breakdown")).toBeVisible();
    await expect(projectionCard.locator(".projection-scope-copy")).toContainText("Cuenta disponible");
    await expect(projectionCard.locator(".projection-scope-copy")).toContainText("no entra en la proyección");
    await projectionCard.locator(".projection-breakdown").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "review-captures/audit18-plan-projection-simplified-mobile.png", fullPage: false });
  });

  test("keeps editable assumptions left aligned and visually quiet on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=plan");

    await page.getByRole("button", { name: "Personalizar proyección" }).click();
    const assumptions = page.locator(".assumptions-card");
    await expect(assumptions).toBeVisible();

    const inputAlignments = await assumptions.locator(".rate-input input").evaluateAll((inputs) => inputs.map((input) => getComputedStyle(input).textAlign));
    expect(new Set(inputAlignments)).toEqual(new Set(["left"]));

    const inflationStyles = await assumptions.locator(".inflation-rate-field").evaluate((element) => {
      const styles = getComputedStyle(element);
      return { backgroundColor: styles.backgroundColor, borderRadius: styles.borderRadius };
    });
    expect(inflationStyles.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(inflationStyles.borderRadius).toBe("0px");
    await assumptions.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "review-captures/audit19-plan-assumptions-mobile.png", fullPage: false });
  });

  test("keeps only one information tooltip open and closes it on navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=plan");

    await page.getByRole("button", { name: "Personalizar proyección" }).click();
    const assumptions = page.locator(".view-page:not([hidden]) .assumptions-card");
    const tips = assumptions.locator(".info-tip");
    await expect(tips).toHaveCount(5);

    await tips.nth(0).click();
    await expect(tips.nth(0)).toHaveAttribute("aria-expanded", "true");
    await tips.nth(1).click();
    await expect(tips.nth(0)).toHaveAttribute("aria-expanded", "false");
    await expect(tips.nth(1)).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".info-tip[aria-expanded=\"true\"]")).toHaveCount(1);
    await page.screenshot({ path: "review-captures/audit20-info-tip-exclusive-mobile.png", fullPage: false });

    await page.locator(".tab-bar").getByRole("button", { name: "Hoy", exact: true }).click();
    await expect(page.locator(".info-tip[aria-expanded=\"true\"]")).toHaveCount(0);
  });

  test("keeps Hoy focused on the emergency-fund actions", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.locator("#export-overview .heading-mode")).toHaveCount(0);
    await expect(page.locator("#export-overview .view-header-end")).toHaveCount(0);
    await expect(page.locator("#export-overview .context-rail")).toHaveCount(0);
    await expect(page.getByText("PRIORIDAD ACTUAL", { exact: true })).toHaveCount(0);
    await expect(page.getByText("SIGUIENTE PASO", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Aportar", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Ajustar meta/ })).toBeVisible();

    await page.getByRole("button", { name: "Aportar", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nueva transferencia" });
    await expect(dialog.locator(".transaction-kind-picker")).toHaveCount(0);
    await expect(dialog.getByLabel("Descripción")).toHaveValue("Aportación al fondo");
    await dialog.getByRole("button", { name: "Cerrar movimiento" }).click();
  });

  test("shows a compact monthly summary and categorized expense donut", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const monthlySummary = page.locator("#export-overview .overview-cashflow");
    await expect(monthlySummary).toHaveAttribute("open", "");
    await expect(monthlySummary).toContainText("Ingresos");
    await expect(monthlySummary).toContainText("Gastos");
    await expect(monthlySummary).toContainText("Balance");
    await expect(page.locator("#export-overview .recent-panel")).toHaveCount(0);
    await expect(monthlySummary).not.toContainText("Ver movimientos");
    await expect(monthlySummary).not.toContainText("Ver detalle");

    const expenseCard = page.locator("#export-overview .expense-category-card");
    await expenseCard.scrollIntoViewIfNeeded();
    await expect(expenseCard).toBeVisible();
    await expect(expenseCard.locator(".expense-category-donut")).toBeVisible();
    expect(await expenseCard.locator(".expense-category-item").count()).toBeGreaterThan(0);
    const spacing = await expenseCard.evaluate((card) => {
      const heading = card.querySelector<HTMLElement>(":scope > .panel-heading.compact > div");
      const layout = card.querySelector<HTMLElement>(":scope > .expense-category-layout");
      if (!heading || !layout) return { headingX: 0, contentX: 0 };
      const layoutStyle = getComputedStyle(layout);
      return { headingX: heading.getBoundingClientRect().x, contentX: layout.getBoundingClientRect().x + Number.parseFloat(layoutStyle.paddingLeft) };
    });
    expect(Math.abs(spacing.headingX - spacing.contentX)).toBeLessThanOrEqual(1);
    await page.waitForTimeout(350);
    await page.screenshot({ path: "review-captures/audit25-hoy-expenses-mobile.png", fullPage: false });
    await page.screenshot({ path: "review-captures/audit29-expense-card-spacing-mobile.png", fullPage: false });

    await page.goto("/?view=accounts");
    await expect(page.locator(".view-page:not([hidden]) h1")).toBeVisible();
    await expect(page.getByText(/Patrimonio distribuido en/)).toHaveCount(0);
    await page.waitForTimeout(350);
    await page.screenshot({ path: "review-captures/audit25-accounts-clean-mobile.png", fullPage: false });
  });

  test("opens the fixed radial movement menu without asking for the type again", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const toggle = page.locator(".quick-actions-toggle");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".quick-action")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Gasto", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ingreso", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Transferencia", exact: true })).toBeVisible();
    await page.waitForTimeout(260);
    const quickActionMetrics = await page.locator(".quick-action-icon").evaluateAll((icons) => icons.map((icon) => {
      const rect = icon.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    expect(Math.min(...quickActionMetrics.map((metric) => metric.width))).toBeGreaterThanOrEqual(60);
    expect(Math.min(...quickActionMetrics.map((metric) => metric.y))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...quickActionMetrics.map((metric) => metric.x + metric.width))).toBeLessThanOrEqual(390);
    const toggleBox = await toggle.boundingBox();
    const glyphBox = await toggle.locator("span").boundingBox();
    expect(Math.abs((toggleBox?.x ?? 0) + (toggleBox?.width ?? 0) / 2 - ((glyphBox?.x ?? 0) + (glyphBox?.width ?? 0) / 2))).toBeLessThan(1);
    expect(Math.abs((toggleBox?.y ?? 0) + (toggleBox?.height ?? 0) / 2 - ((glyphBox?.y ?? 0) + (glyphBox?.height ?? 0) / 2))).toBeLessThan(1);
    await page.screenshot({ path: "review-captures/audit22-radial-menu-mobile.png", fullPage: false });

    await page.getByRole("button", { name: "Ingreso", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nuevo ingreso" });
    await expect(dialog.locator(".transaction-kind-picker")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cerrar movimiento" }).click();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.locator(".quick-actions-backdrop").click({ position: { x: 12, y: 18 } });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".quick-action-list")).toHaveAttribute("aria-hidden", "true");
  });

  test("keeps the radial actions inside a narrow mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/");

    await page.locator(".quick-actions-toggle").click();
    await page.waitForTimeout(260);
    const metrics = await page.locator(".quick-action-icon").evaluateAll((icons) => icons.map((icon) => {
      const rect = icon.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    expect(Math.min(...metrics.map((metric) => metric.width))).toBeGreaterThanOrEqual(56);
    expect(Math.min(...metrics.map((metric) => metric.x))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...metrics.map((metric) => metric.x + metric.width))).toBeLessThanOrEqual(320);
    await page.screenshot({ path: "review-captures/audit22-radial-menu-narrow-mobile.png", fullPage: false });
  });

  test("keeps every screen readable without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const view of ["overview", "activity", "accounts", "plan", "data"]) {
      await page.goto(view === "overview" ? "/" : `/?view=${view}`);
      await expect(page.locator(".view-page:not([hidden]) h1")).toBeVisible();
      const dimensions = await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);
    }
  });

  test("uses a cool account palette in light and dark themes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=accounts");

    const accounts = page.locator(".dashboard-grid");
    await expect(accounts).toBeVisible();
    const lightPalette = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        cash: styles.getPropertyValue("--status-cash").trim(),
        cashBackground: styles.getPropertyValue("--status-cash-bg").trim(),
        background: styles.getPropertyValue("--bg").trim(),
      };
    });
    expect(lightPalette.cash).toBe("#138b8c");
    expect(lightPalette.cashBackground).toBe("#e8f7f6");
    expect(lightPalette.cash).not.toMatch(/b8860d|8a5a0a|e1aa53/i);
    await accounts.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "review-captures/audit21-accounts-light-mobile.png", fullPage: false });

    await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.waitForTimeout(250);
    const darkPalette = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        cash: styles.getPropertyValue("--status-cash").trim(),
        cashBackground: styles.getPropertyValue("--status-cash-bg").trim(),
        background: styles.getPropertyValue("--bg").trim(),
      };
    });
    expect(darkPalette.cash).toBe("#5fc4ba");
    expect(darkPalette.cashBackground).toBe("#173b3b");
    expect(darkPalette.background).toBe("#0b1220");
    await page.screenshot({ path: "review-captures/audit21-accounts-dark-mobile.png", fullPage: false });
  });

  test("keeps text fields modern and readable in dark theme", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
    await page.locator(".quick-actions-toggle").click();
    await page.getByRole("button", { name: "Gasto", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: "Nuevo gasto" });
    const fields = dialog.locator(".transaction-form-grid input, .transaction-amount-field > div");
    const styles = await fields.evaluateAll((items) => items.map((item) => {
      const computed = getComputedStyle(item);
      return {
        background: computed.backgroundColor,
        color: computed.color,
        borderRadius: Number.parseFloat(computed.borderRadius),
      };
    }));
    expect(styles.length).toBeGreaterThanOrEqual(4);
    expect(Math.min(...styles.map((style) => style.borderRadius))).toBeGreaterThanOrEqual(12);
    expect(styles.some((style) => style.background === "rgb(255, 255, 255)")).toBe(false);
    expect(styles.some((style) => style.color === "rgb(128, 128, 128)")).toBe(false);
    await page.screenshot({ path: "review-captures/audit24-modern-fields-dark-mobile.png", fullPage: false });
  });

  test("makes the theme and current section explicit", async ({ page }) => {
    test.skip(test.info().project.name === "mobile-chromium", "El comportamiento visual del tema se valida en escritorio.");
    await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Cambiar a tema claro" })).toBeVisible();
    await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("button", { name: "Plan" }).click();
    await expect(page.getByRole("heading", { name: "Tu futuro estimado." })).toBeVisible();
    await expect(page.locator('.context-rail[aria-label="Resumen del plan"]')).toHaveCount(0);
  });
});

function primaryActivity(page: Page) {
  return page.getByRole("navigation", { name: "Navegación principal" });
}
