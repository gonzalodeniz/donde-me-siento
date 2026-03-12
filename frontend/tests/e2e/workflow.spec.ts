import { expect, test, type Page } from "@playwright/test";

async function loginAsAdmin(page: Page) {
  await page.goto("/");
  const username = await page.getByLabel("Usuario").inputValue();
  const password = username === "raquel" ? "hector" : "raquel";
  await page.getByLabel("Contrasena").fill(password);
  await page.getByRole("button", { name: "Abrir workspace" }).click();
  await expect(page.getByText("Backend autenticado")).toBeVisible();
}

test("flujo MVP con workspace unico: login, alta, drag and drop y recarga", async ({ page }) => {
  const guestOne = `Ana E2E ${Date.now()}`;
  const guestTwo = `Luis E2E ${Date.now()}`;

  await loginAsAdmin(page);

  await expect(page.getByText("Nuevo evento")).toHaveCount(0);
  await expect(page.getByText("Eventos existentes")).toHaveCount(0);

  await page.getByTestId("guest-name-input").fill(guestOne);
  await page.getByRole("button", { name: "Anadir invitado" }).click();
  await expect(page.getByText(guestOne)).toBeVisible();

  await page.getByTestId("guest-name-input").fill(guestTwo);
  await page.getByRole("button", { name: "Anadir invitado" }).click();
  await expect(page.getByText(guestTwo)).toBeVisible();

  const firstGuestCard = page.locator('[data-testid="unassigned-guests-panel"] .guest-card', {
    hasText: guestOne,
  });
  const secondGuestCard = page.locator('[data-testid="unassigned-guests-panel"] .guest-card', {
    hasText: guestTwo,
  });

  const tableOneDropzone = page.getByRole("button", { name: "Mesa 1", exact: true });
  const firstDataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const secondDataTransfer = await page.evaluateHandle(() => new DataTransfer());

  await firstGuestCard.dispatchEvent("dragstart", { dataTransfer: firstDataTransfer });
  await tableOneDropzone.dispatchEvent("dragenter", { dataTransfer: firstDataTransfer });
  await tableOneDropzone.dispatchEvent("dragover", { dataTransfer: firstDataTransfer });
  await tableOneDropzone.dispatchEvent("drop", { dataTransfer: firstDataTransfer });
  await firstGuestCard.dispatchEvent("dragend", { dataTransfer: firstDataTransfer });

  await secondGuestCard.dispatchEvent("dragstart", { dataTransfer: secondDataTransfer });
  await tableOneDropzone.dispatchEvent("dragenter", { dataTransfer: secondDataTransfer });
  await tableOneDropzone.dispatchEvent("dragover", { dataTransfer: secondDataTransfer });
  await tableOneDropzone.dispatchEvent("drop", { dataTransfer: secondDataTransfer });
  await secondGuestCard.dispatchEvent("dragend", { dataTransfer: secondDataTransfer });

  await expect(page.getByTestId("table-card-table-1")).toContainText(guestOne);
  await expect(page.getByTestId("table-card-table-1")).toContainText(guestTwo);
  const currentWorkspaceName = await page.locator(".workspace__hero h2").innerText();

  await page.reload();

  await expect(page.getByText("Backend autenticado")).toBeVisible();
  await expect(page.locator("main").getByRole("heading", { name: currentWorkspaceName })).toBeVisible();
  await expect(page.getByTestId("table-card-table-1")).toContainText(guestOne);
  await expect(page.getByTestId("table-card-table-1")).toContainText(guestTwo);
});

test("estados UX del workspace unico: alertas de conflicto y aforo", async ({ page }) => {
  const base = Date.now();
  const guestOne = `Clara ${base}`;
  const guestTwo = `Mario ${base}`;
  const sharedGroup = `familia-${base}`;

  await loginAsAdmin(page);

  const unassignedPanel = page.getByTestId("unassigned-guests-panel");

  await page.getByTestId("guest-name-input").fill(guestOne);
  await unassignedPanel.getByPlaceholder("opcional").fill(sharedGroup);
  await page.getByRole("button", { name: "Anadir invitado" }).click();
  await expect(unassignedPanel.getByText(guestOne)).toBeVisible();

  await page.getByTestId("guest-name-input").fill(guestTwo);
  await unassignedPanel.getByPlaceholder("opcional").fill(sharedGroup);
  await page.getByRole("button", { name: "Anadir invitado" }).click();
  await expect(unassignedPanel.getByText(guestTwo)).toBeVisible();

  await page.getByTestId("table-card-table-1").click();
  await expect(page.locator(".control-card").nth(1)).toContainText("Mesa 1");
  await page.getByLabel("Capacidad de trabajo").fill("1");
  await page.getByRole("button", { name: "Guardar capacidad" }).click();

  await page.getByTestId("table-card-table-2").click();
  await expect(page.locator(".control-card").nth(1)).toContainText("Mesa 2");
  await page.getByLabel("Capacidad de trabajo").fill("1");
  await page.getByRole("button", { name: "Guardar capacidad" }).click();

  const firstGuestCard = page.locator('[data-testid="unassigned-guests-panel"] .guest-card', {
    hasText: guestOne,
  });
  const secondGuestCard = page.locator('[data-testid="unassigned-guests-panel"] .guest-card', {
    hasText: guestTwo,
  });

  const tableOneDropzone = page.getByRole("button", { name: "Mesa 1", exact: true });
  const tableTwoDropzone = page.getByRole("button", { name: "Mesa 2", exact: true });
  const firstDataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const secondDataTransfer = await page.evaluateHandle(() => new DataTransfer());

  await firstGuestCard.dispatchEvent("dragstart", { dataTransfer: firstDataTransfer });
  await tableOneDropzone.dispatchEvent("dragenter", { dataTransfer: firstDataTransfer });
  await expect(page.getByText(`Suelta a ${guestOne} sobre una mesa resaltada para sentarlo.`)).toBeVisible();
  await tableOneDropzone.dispatchEvent("dragover", { dataTransfer: firstDataTransfer });
  await tableOneDropzone.dispatchEvent("drop", { dataTransfer: firstDataTransfer });
  await firstGuestCard.dispatchEvent("dragend", { dataTransfer: firstDataTransfer });

  await secondGuestCard.dispatchEvent("dragstart", { dataTransfer: secondDataTransfer });
  await tableTwoDropzone.dispatchEvent("dragenter", { dataTransfer: secondDataTransfer });
  await tableTwoDropzone.dispatchEvent("dragover", { dataTransfer: secondDataTransfer });
  await tableTwoDropzone.dispatchEvent("drop", { dataTransfer: secondDataTransfer });
  await secondGuestCard.dispatchEvent("dragend", { dataTransfer: secondDataTransfer });

  await expect(page.locator(".attention-strip")).toContainText("Conflictos de agrupacion");
  await expect(page.locator(".attention-strip")).toContainText("Mesas sin margen");
  await expect(page.locator(".attention-strip")).toContainText("Mesas a revisar");
  await expect(page.locator(".table-summary-row--conflict")).toHaveCount(2);
  await expect(page.locator(".table-summary-row--full").first()).toBeVisible();

  await page.getByTestId("table-card-table-1").click();
  await expect(page.locator(".selected-table-panel__alerts")).toContainText(
    "Esta mesa tiene invitados con conflicto de agrupacion.",
  );
});
