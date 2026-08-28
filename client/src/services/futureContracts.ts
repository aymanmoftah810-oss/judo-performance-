export type FutureRole = "Super Admin" | "Club Admin" | "Coach" | "Viewer";

export interface LocalIdentityContract {
  userId: string;
  role: FutureRole;
  source: "local" | "cloud";
}

export interface SyncContract {
  operation: string;
  entity: string;
  recordId: string;
  timestamp: string;
  deviceId: string;
  userId: string;
  status: "Pending" | "Synced" | "Failed";
}

export const ROLE_CAPABILITIES: Record<FutureRole, readonly string[]> = {
  "Super Admin": ["manage_clubs", "manage_users", "manage_standards", "sync_all"],
  "Club Admin": ["manage_club_players", "manage_club_standards", "view_reports"],
  Coach: ["manage_players", "record_results", "record_attendance", "view_reports"],
  Viewer: ["view_reports", "view_players"],
};

export const LOCAL_IDENTITY: LocalIdentityContract = { userId: "local-user", role: "Super Admin", source: "local" };

export function can(role: FutureRole, capability: string) {
  return ROLE_CAPABILITIES[role].includes(capability);
}
