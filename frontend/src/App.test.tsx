import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { SavedSession, Workspace } from "./types";
import { TOKEN_STORAGE_KEY } from "./uiStateUtils";
import * as api from "./api";

vi.mock("./api", () => ({
  assignGuest: vi.fn(),
  createGuest: vi.fn(),
  createTablesBatch: vi.fn(),
  deleteGuest: vi.fn(),
  deleteSession: vi.fn(),
  deleteTable: vi.fn(),
  downloadWorkspaceReport: vi.fn(),
  duplicateTable: vi.fn(),
  exportSession: vi.fn(),
  fetchSessions: vi.fn(),
  fetchWorkspace: vi.fn(),
  importGuests: vi.fn(),
  importSession: vi.fn(),
  loadSession: vi.fn(),
  login: vi.fn(),
  resetWorkspace: vi.fn(),
  saveSession: vi.fn(),
  unassignGuest: vi.fn(),
  updateGuest: vi.fn(),
  updateTableCapacity: vi.fn(),
  updateTablePosition: vi.fn(),
}));

vi.mock("./components/SeatingPlan", () => ({
  SeatingPlan: () => <div data-testid="seating-plan-mock">Plano mock</div>,
}));

function createWorkspace(): Workspace {
  return {
    event_id: "workspace-main",
    name: "Workspace principal",
    date: null,
    default_table_capacity: 8,
    tables: [
      {
        id: "table-1",
        number: 1,
        capacity: 8,
        position_x: 240,
        position_y: 200,
        table_kind: "round",
        rotation_degrees: 0,
        occupied: 1,
        available: 7,
        guests: [],
      },
    ],
    guests: {
      assigned: [],
      unassigned: [
        {
          id: "guest-1",
          name: "Ana María",
          guest_type: "adulto",
          confirmed: true,
          intolerance: "",
          menu: "carne",
          group_id: "Familia Núñez",
          table_id: null,
          seat_index: null,
        },
      ],
    },
    validation: {
      grouping_conflicts: {},
      tables: [],
      assigned_guests: 0,
      unassigned_guests: 1,
    },
  };
}

function createSessions(): SavedSession[] {
  return [
    {
      id: "session-1",
      name: "Base familiar",
      created_at: "2026-03-17T12:00:00Z",
    },
    {
      id: "session-2",
      name: "Versión jardín",
      created_at: "2026-03-16T09:30:00Z",
    },
  ];
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

describe("App integración", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("carga el workspace automáticamente cuando existe un token persistido", async () => {
    const workspaceDeferred = createDeferred<Workspace>();
    const sessionsDeferred = createDeferred<SavedSession[]>();
    vi.mocked(api.fetchWorkspace).mockReturnValueOnce(workspaceDeferred.promise);
    vi.mocked(api.fetchSessions).mockReturnValueOnce(sessionsDeferred.promise);
    localStorage.setItem(TOKEN_STORAGE_KEY, "token-persistido");

    render(<App />);

    expect(screen.getByText("Actualizando workspace...")).not.toBeNull();
    expect(api.fetchWorkspace).toHaveBeenCalledWith("token-persistido");
    expect(api.fetchSessions).toHaveBeenCalledWith("token-persistido");

    workspaceDeferred.resolve(createWorkspace());
    sessionsDeferred.resolve(createSessions());

    expect(await screen.findByRole("button", { name: "Salir" })).not.toBeNull();
    expect(await screen.findByText("Base familiar")).not.toBeNull();
    expect(screen.getByTestId("seating-plan-mock")).not.toBeNull();
  });

  it("permite iniciar sesión manualmente y guarda el token en localStorage", async () => {
    const user = userEvent.setup();
    vi.mocked(api.login).mockResolvedValueOnce({
      access_token: "token-login",
      token_type: "bearer",
      user: {
        id: "user-1",
        username: "raquel",
      },
    });
    vi.mocked(api.fetchWorkspace).mockResolvedValueOnce(createWorkspace());
    vi.mocked(api.fetchSessions).mockResolvedValueOnce(createSessions());

    render(<App />);

    const passwordInput = screen.getByLabelText("Tu llave");
    await user.type(passwordInput, "secreto-bonito");
    await user.click(screen.getByRole("button", { name: "Repartir amor en las mesas" }));

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(api.login).mock.calls[0]?.[1]).toBe("secreto-bonito");
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe("token-login");
    expect(await screen.findByRole("button", { name: "Salir" })).not.toBeNull();
    expect(await screen.findByText("Base familiar")).not.toBeNull();
  });

  it("muestra el error de validación cuando se selecciona un CSV inválido", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "token-demo");
    vi.mocked(api.fetchWorkspace).mockResolvedValueOnce(createWorkspace());
    vi.mocked(api.fetchSessions).mockResolvedValueOnce(createSessions());

    const { container } = render(<App />);

    expect(await screen.findByRole("button", { name: "Seleccionar fichero CSV" })).not.toBeNull();

    const csvInput = container.querySelector('input[type="file"][accept=".csv,text/csv"]');
    const invalidCsv = new File(
      ["nombre,asistencia,tipo\nAna,si,adulto"],
      "invitados.csv",
      { type: "text/csv" },
    );

    if (!(csvInput instanceof HTMLInputElement)) {
      throw new Error("No se encontró el input de importación CSV.");
    }

    fireEvent.change(csvInput, { target: { files: [invalidCsv] } });

    expect(await screen.findByText("Faltan columnas obligatorias en el CSV: familia.")).not.toBeNull();
    expect((screen.getByRole("button", { name: "Importar invitados" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("guarda una sesión desde la UI y refresca la biblioteca", async () => {
    const user = userEvent.setup();
    localStorage.setItem(TOKEN_STORAGE_KEY, "token-demo");
    vi.mocked(api.fetchWorkspace)
      .mockResolvedValueOnce(createWorkspace())
      .mockResolvedValueOnce(createWorkspace());
    vi.mocked(api.fetchSessions)
      .mockResolvedValueOnce(createSessions())
      .mockResolvedValueOnce([
        {
          id: "session-3",
          name: "Banquete final",
          created_at: "2026-03-18T18:45:00Z",
        },
        ...createSessions(),
      ]);
    vi.mocked(api.saveSession).mockResolvedValueOnce({
      id: "session-3",
      name: "Banquete final",
      created_at: "2026-03-18T18:45:00Z",
    });

    render(<App />);

    expect(await screen.findByText("Base familiar")).not.toBeNull();

    const sessionNameInput = screen.getByPlaceholderText("Ej. banquete familiar");
    await user.type(sessionNameInput, "Banquete final");
    await user.click(screen.getByRole("button", { name: "Guardar sesión" }));

    await waitFor(() => {
      expect(api.saveSession).toHaveBeenCalledWith("Banquete final", "token-demo");
    });
    expect(await screen.findByRole("status", { name: "" })).not.toBeNull();
    expect(await screen.findByText('Sesión "Banquete final" guardada.')).not.toBeNull();
    expect(await screen.findByText("Banquete final")).not.toBeNull();
    expect((screen.getByPlaceholderText("Ej. banquete familiar") as HTMLInputElement).value).toBe("");
  });

  it("carga una sesión guardada desde la biblioteca", async () => {
    const user = userEvent.setup();
    localStorage.setItem(TOKEN_STORAGE_KEY, "token-demo");
    vi.mocked(api.fetchWorkspace)
      .mockResolvedValueOnce(createWorkspace())
      .mockResolvedValueOnce({
        ...createWorkspace(),
        guests: {
          assigned: [
            {
              id: "guest-2",
              name: "Carlos",
              guest_type: "adulto",
              confirmed: true,
              intolerance: "",
              menu: "pescado",
              group_id: "Familia Costa",
              table_id: "table-1",
              seat_index: 0,
            },
          ],
          unassigned: [],
        },
        validation: {
          grouping_conflicts: {},
          tables: [],
          assigned_guests: 1,
          unassigned_guests: 0,
        },
      });
    vi.mocked(api.fetchSessions)
      .mockResolvedValueOnce(createSessions())
      .mockResolvedValueOnce(createSessions());
    vi.mocked(api.loadSession).mockResolvedValueOnce(undefined);

    render(<App />);

    expect(await screen.findByText("Versión jardín")).not.toBeNull();

    const loadButtons = screen.getAllByRole("button", { name: "Cargar sesión" });
    await user.click(loadButtons[1]);

    await waitFor(() => {
      expect(api.loadSession).toHaveBeenCalledWith("session-2", "token-demo");
    });
    expect(await screen.findByText('Sesión "Versión jardín" cargada.')).not.toBeNull();
    expect(await screen.findByText("1 de 1 invitados sentados")).not.toBeNull();
  });

  it("elimina una sesión desde la biblioteca y refresca la lista", async () => {
    const user = userEvent.setup();
    localStorage.setItem(TOKEN_STORAGE_KEY, "token-demo");
    vi.mocked(api.fetchWorkspace)
      .mockResolvedValueOnce(createWorkspace())
      .mockResolvedValueOnce(createWorkspace());
    vi.mocked(api.fetchSessions)
      .mockResolvedValueOnce(createSessions())
      .mockResolvedValueOnce([
        {
          id: "session-1",
          name: "Base familiar",
          created_at: "2026-03-17T12:00:00Z",
        },
      ]);
    vi.mocked(api.deleteSession).mockResolvedValueOnce(undefined);

    render(<App />);

    expect(await screen.findByText("Versión jardín")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Eliminar sesión Versión jardín" }));

    await waitFor(() => {
      expect(api.deleteSession).toHaveBeenCalledWith("session-2", "token-demo");
    });
    expect(await screen.findByText('Sesión "Versión jardín" eliminada.')).not.toBeNull();
    await waitFor(() => {
      expect(screen.queryByText("Versión jardín")).toBeNull();
    });
  });

  it("exporta una sesión y dispara la descarga del JSON", async () => {
    const user = userEvent.setup();
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:session-export");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const appendSpy = vi.spyOn(document.body, "append");
    localStorage.setItem(TOKEN_STORAGE_KEY, "token-demo");
    vi.mocked(api.fetchWorkspace).mockResolvedValueOnce(createWorkspace());
    vi.mocked(api.fetchSessions).mockResolvedValueOnce(createSessions());
    vi.mocked(api.exportSession).mockResolvedValueOnce({
      version: "1",
      session: {
        id: "session-2",
        name: "Versión jardín",
        created_at: "2026-03-16T09:30:00Z",
      },
      snapshot: {
        event_id: "workspace-main",
      },
    });

    render(<App />);

    expect(await screen.findByText("Versión jardín")).not.toBeNull();

    const downloadButtons = screen.getAllByRole("button", { name: "Descargar" });
    await user.click(downloadButtons[1]);

    await waitFor(() => {
      expect(api.exportSession).toHaveBeenCalledWith("session-2", "token-demo");
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:session-export");
    const generatedLink = appendSpy.mock.calls[0]?.[0];
    expect(generatedLink instanceof HTMLAnchorElement).toBe(true);
    expect((generatedLink as HTMLAnchorElement).download).toBe("Versión-jardín.json");
    expect((generatedLink as HTMLAnchorElement).href).toContain("blob:session-export");
    expect(await screen.findByText('Sesión "Versión jardín" descargada.')).not.toBeNull();

    appendSpy.mockRestore();
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it("importa una sesión desde fichero y refresca la biblioteca", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "token-demo");
    vi.mocked(api.fetchWorkspace)
      .mockResolvedValueOnce(createWorkspace())
      .mockResolvedValueOnce({
        ...createWorkspace(),
        guests: {
          assigned: [
            {
              id: "guest-9",
              name: "Lucía",
              guest_type: "adulto",
              confirmed: true,
              intolerance: "",
              menu: "vegano",
              group_id: "Familia Sol",
              table_id: "table-1",
              seat_index: 0,
            },
          ],
          unassigned: [],
        },
        validation: {
          grouping_conflicts: {},
          tables: [],
          assigned_guests: 1,
          unassigned_guests: 0,
        },
      });
    vi.mocked(api.fetchSessions)
      .mockResolvedValueOnce(createSessions())
      .mockResolvedValueOnce([
        {
          id: "session-9",
          name: "Plano importado",
          created_at: "2026-03-19T09:00:00Z",
        },
        ...createSessions(),
      ]);
    vi.mocked(api.importSession).mockResolvedValueOnce(undefined);

    const backup = {
      version: "1",
      session: {
        id: "session-9",
        name: "Plano importado",
        created_at: "2026-03-19T09:00:00Z",
      },
      snapshot: {
        event_id: "workspace-main",
      },
    };

    const { container } = render(<App />);

    expect(await screen.findByText("Base familiar")).not.toBeNull();

    const sessionImportInput = container.querySelector('input[type="file"][accept="application/json,.json"]');
    if (!(sessionImportInput instanceof HTMLInputElement)) {
      throw new Error("No se encontró el input de importación de sesiones.");
    }

    const importFile = new File(
      [JSON.stringify(backup)],
      "plano-importado.json",
      { type: "application/json" },
    );

    fireEvent.change(sessionImportInput, { target: { files: [importFile] } });

    await waitFor(() => {
      expect(api.importSession).toHaveBeenCalledWith(backup, "token-demo");
    });
    expect(await screen.findByText('Sesión "Plano importado" cargada desde fichero.')).not.toBeNull();
    expect(await screen.findByText("Plano importado")).not.toBeNull();
    expect(await screen.findByText("1 de 1 invitados sentados")).not.toBeNull();
  });

  it("sale de la sesión y vuelve a mostrar el formulario de acceso", async () => {
    const user = userEvent.setup();
    localStorage.setItem(TOKEN_STORAGE_KEY, "token-demo");
    vi.mocked(api.fetchWorkspace).mockResolvedValueOnce(createWorkspace());
    vi.mocked(api.fetchSessions).mockResolvedValueOnce(createSessions());

    render(<App />);

    expect(await screen.findByRole("button", { name: "Salir" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Salir" }));

    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(await screen.findByRole("button", { name: "Repartir amor en las mesas" })).not.toBeNull();
    expect(screen.getByLabelText("Tu llave")).not.toBeNull();
  });

  it("crea un invitado manualmente y refresca la lista de invitados sin sentar", async () => {
    const user = userEvent.setup();
    localStorage.setItem(TOKEN_STORAGE_KEY, "token-demo");
    vi.mocked(api.fetchWorkspace)
      .mockResolvedValueOnce(createWorkspace())
      .mockResolvedValueOnce({
        ...createWorkspace(),
        guests: {
          assigned: [],
          unassigned: [
            ...createWorkspace().guests.unassigned,
            {
              id: "guest-2",
              name: "Lucía",
              guest_type: "adulto",
              confirmed: true,
              intolerance: "",
              menu: "desconocido",
              group_id: "Familia Sol",
              table_id: null,
              seat_index: null,
            },
          ],
        },
        validation: {
          grouping_conflicts: {},
          tables: [],
          assigned_guests: 0,
          unassigned_guests: 2,
        },
      });
    vi.mocked(api.fetchSessions)
      .mockResolvedValueOnce(createSessions())
      .mockResolvedValueOnce(createSessions());
    vi.mocked(api.createGuest).mockResolvedValueOnce(undefined);

    render(<App />);

    expect(await screen.findByText("Ana María")).not.toBeNull();

    await user.click(screen.getByText("Añadir invitado", { selector: ".guest-composer__trigger" }));

    const guestNameInput = await screen.findByTestId("guest-name-input");
    const guestForm = guestNameInput.closest("form");
    if (!(guestForm instanceof HTMLFormElement)) {
      throw new Error("No se encontró el formulario de alta de invitados.");
    }

    const familyInput = guestForm.querySelector('input[placeholder="opcional"]');
    if (!(familyInput instanceof HTMLInputElement)) {
      throw new Error("No se encontró el campo de familia.");
    }

    await user.type(familyInput, "Familia Sol");
    await user.type(guestNameInput, "Lucía");
    await user.click(screen.getByRole("button", { name: "Añadir invitado" }));

    await waitFor(() => {
      expect(api.createGuest).toHaveBeenCalledWith("token-demo", {
        name: "Lucía",
        guest_type: "adulto",
        confirmed: true,
        intolerance: "",
        menu: "desconocido",
        group_id: "Familia Sol",
      });
    });
    expect(await screen.findByText("Invitado añadido al workspace.")).not.toBeNull();
    expect(await screen.findByText("Lucía")).not.toBeNull();
  });

  it("importa invitados válidos desde CSV y limpia la previsualización", async () => {
    const user = userEvent.setup();
    localStorage.setItem(TOKEN_STORAGE_KEY, "token-demo");
    vi.mocked(api.fetchWorkspace)
      .mockResolvedValueOnce(createWorkspace())
      .mockResolvedValueOnce({
        ...createWorkspace(),
        guests: {
          assigned: [],
          unassigned: [
            ...createWorkspace().guests.unassigned,
            {
              id: "guest-3",
              name: "Bruno",
              guest_type: "adulto",
              confirmed: true,
              intolerance: "",
              menu: "carne",
              group_id: "Familia Río",
              table_id: null,
              seat_index: null,
            },
            {
              id: "guest-4",
              name: "Marta",
              guest_type: "nino",
              confirmed: false,
              intolerance: "gluten",
              menu: "vegano",
              group_id: "Familia Río",
              table_id: null,
              seat_index: null,
            },
          ],
        },
        validation: {
          grouping_conflicts: {},
          tables: [],
          assigned_guests: 0,
          unassigned_guests: 3,
        },
      });
    vi.mocked(api.fetchSessions)
      .mockResolvedValueOnce(createSessions())
      .mockResolvedValueOnce(createSessions());
    vi.mocked(api.importGuests).mockResolvedValueOnce(undefined);

    const { container } = render(<App />);

    expect(await screen.findByRole("button", { name: "Seleccionar fichero CSV" })).not.toBeNull();

    const csvInput = container.querySelector('input[type="file"][accept=".csv,text/csv"]');
    if (!(csvInput instanceof HTMLInputElement)) {
      throw new Error("No se encontró el input de importación CSV.");
    }

    const csvFile = new File(
      [
        "nombre,asistencia,tipo,familia,intolerancia,menu\nBruno,si,adulto,Familia Río,,carne\nMarta,no,nino,Familia Río,gluten,vegano",
      ],
      "invitados-validos.csv",
      { type: "text/csv" },
    );

    fireEvent.change(csvInput, { target: { files: [csvFile] } });

    expect(await screen.findByText("invitados-validos.csv")).not.toBeNull();
    expect(await screen.findByText("2 invitados listos para importar.")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Importar invitados" }));

    await waitFor(() => {
      expect(api.importGuests).toHaveBeenCalledWith("token-demo", [
        {
          name: "Bruno",
          confirmed: true,
          guest_type: "adulto",
          intolerance: "",
          menu: "carne",
          group_id: "Familia Río",
        },
        {
          name: "Marta",
          confirmed: false,
          guest_type: "nino",
          intolerance: "gluten",
          menu: "vegano",
          group_id: "Familia Río",
        },
      ]);
    });
    expect(await screen.findByText("2 invitados importados desde el CSV.")).not.toBeNull();
    await waitFor(() => {
      expect(screen.queryByText("invitados-validos.csv")).toBeNull();
    });
  });
});
