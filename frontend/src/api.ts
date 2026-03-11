import type { EventSummary, LoginResponse, Workspace } from "./types";

const API_HEADERS = {
  "Content-Type": "application/json",
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, options);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "No se pudo completar la operacion.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/api/auth/login", {
    method: "POST",
    headers: API_HEADERS,
    body: JSON.stringify({ username, password }),
  });
}

export async function fetchEvents(token: string): Promise<EventSummary[]> {
  return request<EventSummary[]>("/api/events", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchWorkspace(eventId: string, token: string): Promise<Workspace> {
  return request<Workspace>(`/api/events/${eventId}/workspace`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
