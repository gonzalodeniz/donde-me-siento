import { describe, expect, it } from "vitest";

import {
  compareValues,
  matchesGuestSearch,
  paginateGuestTableRows,
  parseCsvLine,
  parseGuestImportCsv,
  sortRows,
} from "./appUtils";
import type { Guest } from "./types";

describe("appUtils", () => {
  it("parseCsvLine respeta comas dentro de comillas y comillas escapadas", () => {
    expect(parseCsvLine('Ana,"Familia, Gómez","dice ""hola"""')).toEqual([
      "Ana",
      "Familia, Gómez",
      'dice "hola"',
    ]);
  });

  it("parseGuestImportCsv importa un CSV válido con columnas opcionales", () => {
    const preview = parseGuestImportCsv(
      "invitados.csv",
      [
        "nombre,asistencia,tipo,familia,intolerancia,menu",
        "Ana,confirmado,adulto,Familia 1,gluten,carne",
        "Luis,pendiente,adolescente,Familia 1,,pescado",
      ].join("\n"),
    );

    expect(preview.fileName).toBe("invitados.csv");
    expect(preview.guests).toEqual([
      {
        name: "Ana",
        confirmed: true,
        guest_type: "adulto",
        intolerance: "gluten",
        menu: "carne",
        group_id: "Familia 1",
      },
      {
        name: "Luis",
        confirmed: false,
        guest_type: "adolescente",
        intolerance: "",
        menu: "pescado",
        group_id: "Familia 1",
      },
    ]);
  });

  it("parseGuestImportCsv rechaza cabeceras incompletas", () => {
    expect(() => parseGuestImportCsv("invitados.csv", "nombre,asistencia,tipo\nAna,confirmado,adulto")).toThrow(
      "Faltan columnas obligatorias en el CSV: familia.",
    );
  });

  it("parseGuestImportCsv rechaza valores inválidos", () => {
    expect(() =>
      parseGuestImportCsv(
        "invitados.csv",
        ["nombre,asistencia,tipo,familia", "Ana,quizá,adulto,Familia 1"].join("\n"),
      ),
    ).toThrow('Línea 2: valor de asistencia no válido: "quizá".');
  });

  it("sortRows ordena números, booleanos y texto en español", () => {
    const rows = [
      { name: "Álvaro", confirmed: true, index: 2 },
      { name: "Ana", confirmed: false, index: 10 },
      { name: "Zoé", confirmed: true, index: 1 },
    ];

    expect(sortRows(rows, { column: "name", direction: "asc" }, (row, column) => row[column as keyof typeof row])).toEqual([
      rows[0],
      rows[1],
      rows[2],
    ]);
    expect(sortRows(rows, { column: "confirmed", direction: "asc" }, (row, column) => row[column as keyof typeof row])[0]).toBe(rows[1]);
    expect(sortRows(rows, { column: "index", direction: "asc" }, (row, column) => row[column as keyof typeof row]).map((row) => row.index)).toEqual([1, 2, 10]);
    expect(compareValues("Álvaro", "Ana")).toBeLessThan(0);
  });

  it("paginateGuestTableRows calcula correctamente límites y páginas", () => {
    const items = Array.from({ length: 41 }, (_, index) => `item-${index + 1}`);

    const page3 = paginateGuestTableRows(items, 3);

    expect(page3.currentPage).toBe(3);
    expect(page3.totalPages).toBe(3);
    expect(page3.startItem).toBe(41);
    expect(page3.endItem).toBe(41);
    expect(page3.rows).toEqual(["item-41"]);
  });

  it("matchesGuestSearch busca por nombre, familia, menú y tipo normalizado", () => {
    const guest: Guest = {
      id: "guest-1",
      name: "María Gómez",
      guest_type: "adulto",
      confirmed: true,
      intolerance: "lácteos",
      menu: "pescado",
      group_id: "Familia Núñez",
      table_id: "table-3",
      seat_index: 1,
    };

    expect(matchesGuestSearch(guest, "maria")).toBe(true);
    expect(matchesGuestSearch(guest, "nunez")).toBe(true);
    expect(matchesGuestSearch(guest, "Pescado")).toBe(true);
    expect(matchesGuestSearch(guest, "adulto")).toBe(true);
    expect(matchesGuestSearch(guest, "vegano")).toBe(false);
  });
});
