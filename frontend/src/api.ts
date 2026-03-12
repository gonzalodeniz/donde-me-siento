import type { LoginResponse, Workspace } from "./types";

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

export async function fetchWorkspace(token: string): Promise<Workspace> {
  return request<Workspace>("/api/workspace", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
export async function createGuest(
  token: string,
  payload: { name: string; guest_type: string; group_id: string | null },
): Promise<void> {
  await request("/api/guests", {
    method: "POST",
    headers: {
      ...API_HEADERS,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function updateGuest(
  guestId: string,
  token: string,
  payload: { name?: string; guest_type?: string; group_id?: string | null },
): Promise<void> {
  await request(`/api/guests/${guestId}`, {
    method: "PUT",
    headers: {
      ...API_HEADERS,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function deleteGuest(guestId: string, token: string): Promise<void> {
  await request(`/api/guests/${guestId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function assignGuest(
  guestId: string,
  tableId: string,
  token: string,
): Promise<void> {
  await request(`/api/guests/${guestId}/assignment`, {
    method: "PUT",
    headers: {
      ...API_HEADERS,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ table_id: tableId }),
  });
}

export async function unassignGuest(guestId: string, token: string): Promise<void> {
  await request(`/api/guests/${guestId}/assignment`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function updateTableCapacity(
  tableId: string,
  capacity: number,
  token: string,
): Promise<void> {
  await request(`/api/tables/${tableId}`, {
    method: "PUT",
    headers: {
      ...API_HEADERS,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ capacity }),
  });
}

export async function createTable(token: string): Promise<void> {
  await request("/api/tables", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function deleteTable(tableId: string, token: string): Promise<void> {
  await request(`/api/tables/${tableId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function updateDefaultTableCapacity(capacity: number, token: string): Promise<void> {
  await request("/api/workspace/default-table-capacity", {
    method: "PUT",
    headers: {
      ...API_HEADERS,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ capacity }),
  });
}
