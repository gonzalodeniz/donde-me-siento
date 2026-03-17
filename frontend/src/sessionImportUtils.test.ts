import { describe, expect, it } from "vitest";

import { sortGuestImportPreviewRows, sortSessions } from "./sessionImportUtils";

describe("sessionImportUtils", () => {
  it("sortSessions ordena por fecha y por nombre", () => {
    const sessions = [
      { id: "s2", name: "Boda B", created_at: "2026-03-17T12:00:00Z" },
      { id: "s1", name: "Boda A", created_at: "2026-03-16T12:00:00Z" },
      { id: "s3", name: "Boda C", created_at: "2026-03-18T12:00:00Z" },
    ];

    expect(sortSessions(sessions, { column: "created_at", direction: "desc" }).map((session) => session.id)).toEqual([
      "s3",
      "s2",
      "s1",
    ]);
    expect(sortSessions(sessions, { column: "name", direction: "asc" }).map((session) => session.id)).toEqual([
      "s1",
      "s2",
      "s3",
    ]);
  });

  it("sortGuestImportPreviewRows ordena y limita la preview a 8 filas", () => {
    const guests = Array.from({ length: 10 }, (_, index) => ({
      name: `Invitado ${10 - index}`,
      guest_type: index % 3 === 0 ? "adulto" : index % 3 === 1 ? "adolescente" : "nino",
      confirmed: index % 2 === 0,
      intolerance: index % 4 === 0 ? "gluten" : "",
      menu: index % 3 === 0 ? "carne" : index % 3 === 1 ? "pescado" : "vegano",
      group_id: index % 2 === 0 ? "Familia A" : "Familia B",
    }));

    const byName = sortGuestImportPreviewRows(guests, { column: "name", direction: "asc" });
    const byConfirmed = sortGuestImportPreviewRows(guests, { column: "confirmed", direction: "asc" });

    expect(byName).toHaveLength(8);
    expect(byName[0]?.name).toBe("Invitado 1");
    expect(byConfirmed[0]?.confirmed).toBe(false);
  });

  it("sortGuestImportPreviewRows ordena por grupo y menú con etiquetas visibles", () => {
    const guests = [
      {
        name: "Luis",
        guest_type: "adulto",
        confirmed: true,
        intolerance: "",
        menu: "vegano",
        group_id: "Familia B",
      },
      {
        name: "Ana",
        guest_type: "nino",
        confirmed: false,
        intolerance: "gluten",
        menu: "carne",
        group_id: "Familia A",
      },
      {
        name: "Marta",
        guest_type: "adolescente",
        confirmed: true,
        intolerance: "",
        menu: "pescado",
        group_id: null,
      },
    ];

    expect(sortGuestImportPreviewRows(guests, { column: "group", direction: "asc" }).map((guest) => guest.name)).toEqual([
      "Ana",
      "Luis",
      "Marta",
    ]);
    expect(sortGuestImportPreviewRows(guests, { column: "menu", direction: "asc" }).map((guest) => guest.name)).toEqual([
      "Ana",
      "Marta",
      "Luis",
    ]);
  });
});
