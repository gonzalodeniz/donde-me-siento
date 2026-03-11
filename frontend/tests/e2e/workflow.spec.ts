import { expect, test, type Page } from "@playwright/test";

async function loginAsAdmin(page: Page) {
  await page.goto("/");
  await page.getByLabel("Usuario").fill("admin");
  await page.getByLabel("Contrasena").fill("admin1234");
  await page.getByRole("button", { name: "Abrir workspace" }).click();
  await expect(page.getByText("Backend autenticado")).toBeVisible();
}

test("flujo MVP: login, crear evento, asignar por drag and drop y recargar", async ({ page }) => {
  const eventName = `Boda E2E ${Date.now()}`;
  const guestOne = `Ana E2E ${Date.now()}`;
  const guestTwo = `Luis E2E ${Date.now()}`;

  await loginAsAdmin(page);

  await page.getByTestId("event-name-input").fill(eventName);
  await page.getByTestId("event-table-count-input").fill("2");
  await page.getByTestId("event-default-capacity-input").fill("4");
  await page.getByRole("button", { name: "Crear evento" }).click();

  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();

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

  await expect(page.getByTestId("table-card-table-1")).toContainText(guestOne);

  await secondGuestCard.dispatchEvent("dragstart", { dataTransfer: secondDataTransfer });
  await tableOneDropzone.dispatchEvent("dragenter", { dataTransfer: secondDataTransfer });
  await tableOneDropzone.dispatchEvent("dragover", { dataTransfer: secondDataTransfer });
  await tableOneDropzone.dispatchEvent("drop", { dataTransfer: secondDataTransfer });
  await secondGuestCard.dispatchEvent("dragend", { dataTransfer: secondDataTransfer });

  await expect(page.getByTestId("table-card-table-1")).toContainText(guestOne);
  await expect(page.getByTestId("table-card-table-1")).toContainText(guestTwo);

  await page.reload();

  await expect(page.getByText("Backend autenticado")).toBeVisible();
  await page.getByRole("button", { name: new RegExp(eventName) }).click();
  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();
  await expect(page.getByTestId("table-card-table-1")).toContainText(guestOne);
  await expect(page.getByTestId("table-card-table-1")).toContainText(guestTwo);
});

test("estados UX: alertas de conflicto y aforo, confirmacion de borrado y cancelacion", async ({ page }) => {
  const base = Date.now();
  const eventName = `Workshop UX ${base}`;
  const guestOne = `Clara ${base}`;
  const guestTwo = `Mario ${base}`;
  const sharedGroup = `familia-${base}`;

  await loginAsAdmin(page);

  await page.getByTestId("event-name-input").fill(eventName);
  await page.getByTestId("event-table-count-input").fill("2");
  await page.getByTestId("event-default-capacity-input").fill("1");
  await page.getByRole("button", { name: "Crear evento" }).click();

  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();
  const unassignedPanel = page.getByTestId("unassigned-guests-panel");

  await page.getByTestId("guest-name-input").fill(guestOne);
  await unassignedPanel.getByPlaceholder("opcional").fill(sharedGroup);
  await page.getByRole("button", { name: "Anadir invitado" }).click();
  await expect(unassignedPanel.getByText(guestOne)).toBeVisible();

  await page.getByTestId("guest-name-input").fill(guestTwo);
  await unassignedPanel.getByPlaceholder("opcional").fill(sharedGroup);
  await page.getByRole("button", { name: "Anadir invitado" }).click();
  await expect(unassignedPanel.getByText(guestTwo)).toBeVisible();

  const firstGuestCard = page.locator('[data-testid="unassigned-guests-panel"] .guest-card', {
    hasText: guestOne,
  });
  const secondGuestCard = page.locator('[data-testid="unassigned-guests-panel"] .guest-card', {
    hasText: guestTwo,
  });

  const tableOneDropzone = page.getByRole("button", { name: "Mesa 1", exact: true });
  const firstDataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await firstGuestCard.dispatchEvent("dragstart", { dataTransfer: firstDataTransfer });
  await tableOneDropzone.dispatchEvent("dragenter", { dataTransfer: firstDataTransfer });
  await expect(page.getByText(`Suelta a ${guestOne} sobre una mesa resaltada para sentarlo.`)).toBeVisible();
  await tableOneDropzone.dispatchEvent("dragover", { dataTransfer: firstDataTransfer });
  await tableOneDropzone.dispatchEvent("drop", { dataTransfer: firstDataTransfer });
  await firstGuestCard.dispatchEvent("dragend", { dataTransfer: firstDataTransfer });

  const tableTwoDropzone = page.getByRole("button", { name: "Mesa 2", exact: true });
  const secondDataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await secondGuestCard.dispatchEvent("dragstart", { dataTransfer: secondDataTransfer });
  await tableTwoDropzone.dispatchEvent("dragenter", { dataTransfer: secondDataTransfer });
  await tableTwoDropzone.dispatchEvent("dragover", { dataTransfer: secondDataTransfer });
  await tableTwoDropzone.dispatchEvent("drop", { dataTransfer: secondDataTransfer });
  await secondGuestCard.dispatchEvent("dragend", { dataTransfer: secondDataTransfer });

  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();
  await expect(page.locator(".attention-strip")).toContainText("Conflictos de agrupacion");
  await expect(page.locator(".attention-strip")).toContainText("Mesas sin margen");
  await expect(page.locator(".attention-strip")).toContainText("Mesas a revisar");
  await expect(page.locator(".attention-strip")).toContainText("2");
  await expect(page.locator(".table-summary-row--conflict")).toHaveCount(2);
  await expect(page.locator(".table-summary-row--full")).toHaveCount(2);

  await page.getByTestId("table-card-table-1").click();
  await expect(page.locator(".selected-table-panel__alerts")).toContainText(
    "Esta mesa tiene invitados con conflicto de agrupacion.",
  );
  await expect(page.locator(".selected-table-panel__alerts")).toContainText(
    "Esta mesa esta completa.",
  );
  await expect(page.getByText("Conflicto").first()).toBeVisible();

  const activeEventCard = page.locator(".event-card", { hasText: eventName }).filter({ hasText: "En edicion" });
  await activeEventCard.getByRole("button", { name: eventName }).click();
  await activeEventCard.getByRole("button", { name: "Preparar borrado" }).click();
  await expect(page.getByText("Esta accion elimina el evento y su seating guardado.")).toBeVisible();
  await activeEventCard.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText("Esta accion elimina el evento y su seating guardado.")).not.toBeVisible();
});
