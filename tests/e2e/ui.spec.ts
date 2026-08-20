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
    await expect(page.getByRole("heading", { name: "Tu dinero, en perspectiva." })).toBeVisible();

    await page.goto("/?view=accounts");
    await expect(page.getByRole("heading", { name: "Todo en su lugar." })).toBeVisible();
    await page.goto("/");
    await page.waitForFunction(() => document.querySelector(".side-nav button") && Object.keys(document.querySelector(".side-nav button")!).some((key) => key.startsWith("__reactProps")));

    const primaryNav = page.getByRole("navigation", { name: "Navegación principal" });
    await primaryNav.getByRole("button", { name: "Actividad" }).click();
    await expect(page).toHaveURL(/\?view=activity$/);
    await expect(page.getByRole("heading", { name: "Movimientos por mes" })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Tu dinero, en perspectiva." })).toBeVisible();

    await primaryNav.getByRole("button", { name: "Plan" }).click();
    await expect(page).toHaveURL(/\?view=plan$/);
    await expect(page.getByRole("slider", { name: "Explorar periodos de la proyección" })).toBeVisible();
    await expect(page.locator(".view-page:not([hidden]) h1")).toBeFocused();
  });

  test("registers a movement through the accessible form", async ({ page }) => {
    test.skip(test.info().project.name === "mobile-chromium", "El formulario móvil comparte el mismo flujo y no duplica la prueba de escritorio.");
    await page.getByRole("button", { name: "+ Registrar movimiento", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Registra un movimiento" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".form-stepper span")).toHaveCount(3);

    await page.getByLabel("Monto del movimiento en pesos mexicanos").fill("1234.50");
    await dialog.getByLabel("Concepto").fill("Prueba E2E");
    await dialog.getByRole("button", { name: "Registrar movimiento", exact: true }).click();

    await expect(page.getByRole("status")).toContainText("registrado");
    await primaryActivity(page).getByRole("button", { name: "Actividad" }).click();
    await expect(page.locator(".activity-month-groups .transaction-row").filter({ hasText: "Prueba E2E" })).toBeVisible();
  });

  test("makes activity filters readable and recoverable", async ({ page }) => {
    test.skip(test.info().project.name === "mobile-chromium", "Los filtros se validan en escritorio y la barra móvil se valida en el test dedicado.");
    await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("button", { name: "Actividad" }).click();
    await expect(page.getByRole("heading", { name: "Movimientos por mes" })).toBeVisible();
    const search = page.locator("#activity-search");
    await search.fill("super");
    await expect(page.locator(".filter-chip")).toContainText("Busca: super");
    await expect(page.getByText(/de \d+ movimientos/).first()).toBeVisible();
    await page.getByRole("button", { name: "Limpiar filtros", exact: true }).click();
    await expect(search).toHaveValue("");
    await expect(page.locator(".filter-chip")).toHaveCount(0);
  });

  test("keeps five clear destinations in the mobile navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();

    const tabBar = page.getByRole("navigation", { name: "Navegación de secciones" });
    await expect(tabBar.getByRole("button")).toHaveCount(5);
    await expect(tabBar).toBeVisible();

    await tabBar.getByRole("button", { name: "Datos" }).click();
    await expect(page).toHaveURL(/\?view=data$/);
    await expect(page.getByRole("heading", { name: "Una copia clara de tus finanzas" })).toBeVisible();
    await expect(page.locator(".backup-flow-steps li")).toHaveCount(3);
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

  test("makes the theme and current section explicit", async ({ page }) => {
    test.skip(test.info().project.name === "mobile-chromium", "El comportamiento visual del tema se valida en escritorio.");
    await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Cambiar a tema claro" })).toBeVisible();
    await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("button", { name: "Plan" }).click();
    await expect(page.locator('.context-rail[aria-label="Resumen del plan"]')).toContainText("Proyección actualizada");
  });
});

function primaryActivity(page: Page) {
  return page.getByRole("navigation", { name: "Navegación principal" });
}
