import type { Guest } from "./types";

export const GUEST_TABLE_PAGE_SIZE = 20;
export const REQUIRED_GUEST_CSV_COLUMNS = ["nombre", "asistencia", "tipo", "familia"] as const;

export type SortDirection = "asc" | "desc";
export type SortState = {
  column: string;
  direction: SortDirection;
};

export type ImportedGuestDraft = {
  name: string;
  guest_type: string;
  confirmed: boolean;
  intolerance: string;
  menu: string;
  group_id: string | null;
};

export type GuestImportPreview = {
  fileName: string;
  guests: ImportedGuestDraft[];
};

export function normalizeText(value: string) {
  return value.trim();
}

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function getGuestTableTotalPages(totalItems: number) {
  return Math.max(1, Math.ceil(totalItems / GUEST_TABLE_PAGE_SIZE));
}

export function paginateGuestTableRows<T>(items: T[], page: number) {
  const totalItems = items.length;
  const totalPages = getGuestTableTotalPages(totalItems);
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (currentPage - 1) * GUEST_TABLE_PAGE_SIZE;

  return {
    rows: items.slice(startIndex, startIndex + GUEST_TABLE_PAGE_SIZE),
    currentPage,
    totalPages,
    startItem: totalItems === 0 ? 0 : startIndex + 1,
    endItem: Math.min(startIndex + GUEST_TABLE_PAGE_SIZE, totalItems),
    totalItems,
  };
}

export function compareValues(left: string | number | boolean, right: string | number | boolean) {
  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right), "es", { numeric: true, sensitivity: "base" });
}

export function sortRows<T>(items: T[], sort: SortState, getValue: (item: T, column: string) => string | number | boolean) {
  return [...items].sort((left, right) => {
    const comparison = compareValues(getValue(left, sort.column), getValue(right, sort.column));
    return sort.direction === "asc" ? comparison : -comparison;
  });
}

export function parseCsvLine(line: string) {
  const values: string[] = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === "\"") {
      if (insideQuotes && line[index + 1] === "\"") {
        currentValue += "\"";
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === "," && !insideQuotes) {
      values.push(currentValue);
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  values.push(currentValue);
  return values.map((value) => value.trim());
}

export function parseGuestCsvAttendance(rawValue: string, lineNumber: number) {
  const normalizedValue = normalizeSearchText(rawValue);
  if (normalizedValue === "confirmado" || normalizedValue === "si" || normalizedValue === "true") {
    return true;
  }
  if (
    normalizedValue === "no confirmado" ||
    normalizedValue === "pendiente" ||
    normalizedValue === "no" ||
    normalizedValue === "false"
  ) {
    return false;
  }

  throw new Error(`Línea ${lineNumber}: valor de asistencia no válido: "${rawValue || "vacío"}".`);
}

export function parseGuestCsvType(rawValue: string, lineNumber: number) {
  const normalizedValue = normalizeSearchText(rawValue);
  if (normalizedValue === "adulto" || normalizedValue === "adolescente" || normalizedValue === "nino") {
    return normalizedValue;
  }

  throw new Error(`Línea ${lineNumber}: tipo de invitado no válido: "${rawValue || "vacío"}".`);
}

export function parseGuestCsvMenu(rawValue: string, lineNumber: number) {
  const normalizedValue = normalizeSearchText(rawValue);
  if (!normalizedValue) {
    return "desconocido";
  }

  if (
    normalizedValue === "desconocido" ||
    normalizedValue === "carne" ||
    normalizedValue === "pescado" ||
    normalizedValue === "vegano"
  ) {
    return normalizedValue;
  }

  throw new Error(`Línea ${lineNumber}: valor de menú no válido: "${rawValue}".`);
}

export function parseGuestImportCsv(fileName: string, content: string): GuestImportPreview {
  const rows = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim() !== "");

  if (rows.length < 2) {
    throw new Error("El CSV debe incluir cabecera y al menos un invitado.");
  }

  const headerCells = parseCsvLine(rows[0].line).map((value) => normalizeSearchText(value));
  const missingColumns = REQUIRED_GUEST_CSV_COLUMNS.filter((column) => !headerCells.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`Faltan columnas obligatorias en el CSV: ${missingColumns.join(", ")}.`);
  }

  const headerIndexes = Object.fromEntries(
    REQUIRED_GUEST_CSV_COLUMNS.map((column) => [column, headerCells.indexOf(column)]),
  ) as Record<(typeof REQUIRED_GUEST_CSV_COLUMNS)[number], number>;
  const intoleranceColumnIndex = headerCells.indexOf("intolerancia");
  const menuColumnIndex = headerCells.indexOf("menu");

  const guests = rows.slice(1).map(({ line, lineNumber }) => {
    const cells = parseCsvLine(line);
    const name = normalizeText(cells[headerIndexes.nombre] ?? "");
    if (!name) {
      throw new Error(`Línea ${lineNumber}: el nombre del invitado es obligatorio.`);
    }

    const groupId = normalizeText(cells[headerIndexes.familia] ?? "") || null;

    return {
      name,
      confirmed: parseGuestCsvAttendance(cells[headerIndexes.asistencia] ?? "", lineNumber),
      guest_type: parseGuestCsvType(cells[headerIndexes.tipo] ?? "", lineNumber),
      intolerance: normalizeText(intoleranceColumnIndex >= 0 ? (cells[intoleranceColumnIndex] ?? "") : ""),
      menu: parseGuestCsvMenu(menuColumnIndex >= 0 ? (cells[menuColumnIndex] ?? "") : "", lineNumber),
      group_id: groupId,
    };
  });

  if (guests.length === 0) {
    throw new Error("El CSV no contiene invitados válidos para importar.");
  }

  return {
    fileName,
    guests,
  };
}

export function formatGuestTypeLabel(guestType: string) {
  switch (guestType) {
    case "adulto":
      return "Adulto";
    case "adolescente":
      return "Adolescente";
    case "nino":
      return "Niño";
    default:
      return guestType;
  }
}

export function formatMenuLabel(menu: string) {
  switch (menu) {
    case "carne":
      return "Carne";
    case "pescado":
      return "Pescado";
    case "vegano":
      return "Vegano";
    case "desconocido":
    default:
      return "Desconocido";
  }
}

export function matchesGuestSearch(guest: Guest, rawQuery: string) {
  const query = normalizeSearchText(rawQuery);
  if (!query) {
    return true;
  }

  const searchableFields = [
    guest.name,
    guest.group_id ?? "",
    guest.guest_type,
    guest.intolerance,
    guest.menu,
    guest.table_id ?? "",
    formatGuestTypeLabel(guest.guest_type),
    formatMenuLabel(guest.menu),
  ];

  return searchableFields.some((field) => normalizeSearchText(field).includes(query));
}
