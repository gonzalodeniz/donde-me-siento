export type Guest = {
  id: string;
  name: string;
  guest_type: string;
  confirmed: boolean;
  intolerance: string;
  menu: string;
  group_id: string | null;
  table_id: string | null;
  seat_index: number | null;
};

export type WorkspaceTable = {
  id: string;
  number: number;
  capacity: number;
  position_x: number;
  position_y: number;
  table_kind: "round" | "couple";
  rotation_degrees: number;
  occupied: number;
  available: number;
  guests: Guest[];
};

export type ValidationTable = {
  table_id: string;
  table_number: number;
  capacity: number;
  occupied: number;
  available: number;
};

export type SavedSession = {
  id: string;
  name: string;
  created_at: string;
};

export type SessionBackup = {
  version: string;
  session: SavedSession;
  snapshot: Record<string, unknown>;
};

export type Workspace = {
  event_id: string;
  name: string;
  date: string | null;
  default_table_capacity: number;
  tables: WorkspaceTable[];
  guests: {
    assigned: Guest[];
    unassigned: Guest[];
  };
  validation: {
    grouping_conflicts: Record<string, string[]>;
    tables: ValidationTable[];
    assigned_guests: number;
    unassigned_guests: number;
  };
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  user: {
    id: string;
    username: string;
  };
};
