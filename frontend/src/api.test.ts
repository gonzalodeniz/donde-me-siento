import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteSession,
  downloadWorkspaceReport,
  fetchWorkspace,
  importSession,
  loadSession,
  login,
  resetWorkspace,
  saveSession,
} from "./api";

const fetchMock = vi.fn<typeof fetch>();

describe("api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envia el body JSON y los headers al hacer login", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "token-demo",
          user: { id: "user-1", username: "raquel" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await login("raquel", "héctor");

    expect(response.access_token).toBe("token-demo");
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "raquel", password: "héctor" }),
    });
  });

  it("incluye el token Bearer en fetchWorkspace", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          event_id: "workspace-main",
          name: "Workspace principal",
          date: null,
          default_table_capacity: 8,
          tables: [],
          guests: { assigned: [], unassigned: [] },
          validation: { grouping_conflicts: {}, tables: [], assigned_guests: 0, unassigned_guests: 0 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await fetchWorkspace("token-seguro");

    expect(fetchMock).toHaveBeenCalledWith("/api/workspace", {
      headers: {
        Authorization: "Bearer token-seguro",
      },
    });
  });

  it("devuelve undefined en respuestas 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(loadSession("session-1", "token-demo")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/session-1/load", {
      method: "POST",
      headers: {
        Authorization: "Bearer token-demo",
      },
    });
  });

  it("propaga el detail del backend cuando la respuesta falla", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "La sesión no existe." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(deleteSession("session-missing", "token-demo")).rejects.toThrow("La sesión no existe.");
  });

  it("usa un mensaje genérico cuando la respuesta errónea no trae JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("error interno", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    await expect(resetWorkspace("token-demo")).rejects.toThrow("No se pudo completar la operacion.");
  });

  it("descarga el PDF como blob cuando el reporte responde OK", async () => {
    const pdfBlob = new Blob(["%PDF-demo"], { type: "application/pdf" });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      blob: vi.fn().mockResolvedValue(pdfBlob),
    } as unknown as Response);

    const result = await downloadWorkspaceReport("token-demo");

    expect(result.type).toBe("application/pdf");
    expect(fetchMock).toHaveBeenCalledWith("/api/workspace/report.pdf", {
      headers: {
        Authorization: "Bearer token-demo",
      },
    });
  });

  it("propaga el detail del backend también al descargar el PDF", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "No se pudo generar el PDF." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(downloadWorkspaceReport("token-demo")).rejects.toThrow("No se pudo generar el PDF.");
  });

  it("serializa el backup completo al importar una sesión", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const backup = {
      version: "1",
      session: {
        id: "session-1",
        name: "Base",
        created_at: "2026-03-17T12:00:00Z",
      },
      snapshot: {
        id: "workspace-main",
        name: "Workspace principal",
        date: null,
        default_table_capacity: 8,
        tables: [],
        guests: [],
      },
    };

    await importSession(backup, "token-demo");

    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-demo",
      },
      body: JSON.stringify(backup),
    });
  });

  it("devuelve la sesión guardada cuando saveSession responde OK", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "session-1",
          name: "Base familiar",
          created_at: "2026-03-17T12:00:00Z",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await saveSession("Base familiar", "token-demo");

    expect(result).toEqual({
      id: "session-1",
      name: "Base familiar",
      created_at: "2026-03-17T12:00:00Z",
    });
  });
});
