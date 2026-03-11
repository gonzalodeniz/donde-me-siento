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

export async function createGuest(
  eventId: string,
  token: string,
  payload: { name: string; guest_type: string; group_id: string | null },
): Promise<void> {
  await request(`/api/events/${eventId}/guests`, {
    method: "POST",
    headers: {
      ...API_HEADERS,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function updateGuest(
  eventId: string,
  guestId: string,
  token: string,
  payload: { name?: string; guest_type?: string; group_id?: string | null },
): Promise<void> {
  await request(`/api/events/${eventId}/guests/${guestId}`, {
    method: "PUT",
    headers: {
      ...API_HEADERS,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function deleteGuest(eventId: string, guestId: string, token: string): Promise<void> {
  await request(`/api/events/${eventId}/guests/${guestId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function assignGuest(
  eventId: string,
  guestId: string,
  tableId: string,
  token: string,
): Promise<void> {
  await request(`/api/events/${eventId}/guests/${guestId}/assignment`, {
    method: "PUT",
    headers: {
      ...API_HEADERS,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ table_id: tableId }),
  });
}

export async function unassignGuest(eventId: string, guestId: string, token: string): Promise<void> {
  await request(`/api/events/${eventId}/guests/${guestId}/assignment`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function updateTableCapacity(
  eventId: string,
  tableId: string,
  capacity: number,
  token: string,
): Promise<void> {
  await request(`/api/events/${eventId}/tables/${tableId}`, {
    method: "PUT",
    headers: {
      ...API_HEADERS,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ capacity }),
  });
}
