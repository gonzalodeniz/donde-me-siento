import { expect, test } from "@playwright/test";

test("flujo MVP: login, crear evento, asignar por drag and drop y recargar", async ({ page }) => {
  const eventName = `Boda E2E ${Date.now()}`;
  const guestOne = `Ana E2E ${Date.now()}`;
  const guestTwo = `Luis E2E ${Date.now()}`;

  await page.goto("/");

  await page.getByLabel("Usuario").fill("admin");
  await page.getByLabel("Contrasena").fill("admin1234");
  await page.getByRole("button", { name: "Abrir workspace" }).click();

  await expect(page.getByText("Backend autenticado")).toBeVisible();

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
