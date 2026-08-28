import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { Account, accounts, accountSettings, auditLogs, centralTestSessions, CentralTestSession, coachPlayerAssignments, InsertAccount, InsertCentralTestSession, InsertPlayerAttendance, InsertPlayerProfile, InsertPlayerResult, InsertUser, playerAttendances, PlayerAttendance, playerProfiles, playerResults, PlayerProfile, PlayerResult, syncConflicts, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getAccountById(id: number): Promise<Account | undefined> {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1); return result[0];
}

export async function getAccountByUsername(username: string): Promise<Account | undefined> {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(accounts).where(eq(accounts.username, username.toLowerCase())).limit(1); return result[0];
}

export async function getAccountByPlayerProfileId(playerProfileId: number): Promise<Account | undefined> {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(accounts).where(eq(accounts.playerId, playerProfileId)).limit(1); return result[0];
}

export async function listAccounts(): Promise<Account[]> { const db = await getDb(); return db ? db.select().from(accounts) : []; }

export async function createAccount(input: InsertAccount): Promise<Account> {
  const db = await getDb(); if (!db) throw new Error("قاعدة الحسابات غير متاحة");
  await db.insert(accounts).values({ ...input, username: input.username.toLowerCase() });
  const account = await getAccountByUsername(input.username); if (!account) throw new Error("تعذر إنشاء الحساب"); return account;
}

export async function bootstrapInitialAdmin(input: InsertAccount): Promise<Account> {
  const db = await getDb(); if (!db) throw new Error("قاعدة الحسابات غير متاحة");
  return db.transaction(async (tx) => {
    const locked = await tx.select().from(accountSettings).where(eq(accountSettings.key, "initial_admin_locked")).limit(1);
    if (locked.length) throw new Error("INITIAL_ADMIN_LOCKED");
    const existing = await tx.select().from(accounts).where(eq(accounts.username, input.username.toLowerCase())).limit(1);
    if (existing.length) throw new Error("ACCOUNT_USERNAME_EXISTS");
    await tx.insert(accountSettings).values({ key: "initial_admin_locked", value: "pending" });
    const created = await tx.insert(accounts).values({ ...input, username: input.username.toLowerCase() });
    const accountId = Number((created as unknown as Array<{ insertId: number }>)[0]?.insertId);
    const account = (await tx.select().from(accounts).where(eq(accounts.id, accountId)).limit(1))[0];
    if (!account) throw new Error("ACCOUNT_CREATION_FAILED");
    await tx.update(accountSettings).set({ value: JSON.stringify({ accountId: account.id, initializedAt: new Date().toISOString() }) }).where(eq(accountSettings.key, "initial_admin_locked"));
    return account;
  });
}

export async function updateAccount(id: number, patch: Partial<InsertAccount>): Promise<Account> {
  const db = await getDb(); if (!db) throw new Error("قاعدة الحسابات غير متاحة");
  await db.update(accounts).set({ ...patch, ...(patch.username ? { username: patch.username.toLowerCase() } : {}) }).where(eq(accounts.id, id));
  const account = await getAccountById(id); if (!account) throw new Error("الحساب غير موجود"); return account;
}

export async function getAccountSetting(key: string): Promise<string | null> { const db = await getDb(); if (!db) return null; const result = await db.select().from(accountSettings).where(eq(accountSettings.key, key)).limit(1); return result[0]?.value ?? null; }
export async function setAccountSetting(key: string, value: string): Promise<void> { const db = await getDb(); if (!db) throw new Error("قاعدة الحسابات غير متاحة"); await db.insert(accountSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } }); }

export async function getPlayerProfileById(id: number): Promise<PlayerProfile | undefined> { const db = await getDb(); if (!db) return undefined; return (await db.select().from(playerProfiles).where(eq(playerProfiles.id, id)).limit(1))[0]; }
export async function getPlayerProfileBySyncId(syncId: string): Promise<PlayerProfile | undefined> { const db = await getDb(); if (!db) return undefined; return (await db.select().from(playerProfiles).where(eq(playerProfiles.syncId, syncId)).limit(1))[0]; }

export async function canAccountAccessPlayerProfile(account: Account, playerProfileId: number): Promise<boolean> {
  if (account.role === "ADMIN") return Boolean(await getPlayerProfileById(playerProfileId));
  if (account.role === "PLAYER") return account.playerId === playerProfileId;
  const db = await getDb(); if (!db) return false;
  const assignment = await db.select().from(coachPlayerAssignments).where(eq(coachPlayerAssignments.coachAccountId, account.id));
  return assignment.some((item) => item.playerProfileId === playerProfileId && item.isActive);
}

export async function listPlayerProfilesForAccount(account: Account): Promise<PlayerProfile[]> {
  const db = await getDb(); if (!db) return [];
  if (account.role === "ADMIN") return (await db.select().from(playerProfiles)).filter((profile) => !profile.archivedAt);
  if (account.role === "PLAYER") return account.playerId ? (await db.select().from(playerProfiles).where(eq(playerProfiles.id, account.playerId)).limit(1)).filter((profile) => !profile.archivedAt) : [];
  const assignments = await db.select().from(coachPlayerAssignments).where(eq(coachPlayerAssignments.coachAccountId, account.id));
  const visibleIds = new Set(assignments.filter((item) => item.isActive).map((item) => item.playerProfileId));
  return (await db.select().from(playerProfiles)).filter((profile) => visibleIds.has(profile.id) && !profile.archivedAt);
}

export async function upsertPlayerProfile(account: Account, input: InsertPlayerProfile): Promise<PlayerProfile> {
  const db = await getDb(); if (!db) throw new Error("قاعدة بيانات اللاعبين غير متاحة");
  const existing = await getPlayerProfileBySyncId(input.syncId);
  if (existing) {
    if (!(await canAccountAccessPlayerProfile(account, existing.id))) throw new Error("PLAYER_PROFILE_FORBIDDEN");
    const baseRevision = (input as InsertPlayerProfile & { baseRevision?: number }).baseRevision;
    if (baseRevision !== undefined && baseRevision < existing.revision && input.snapshot !== existing.snapshot) { await createSyncConflict({ entity: "player", syncId: input.syncId, playerProfileId: existing.id, localPayload: input.snapshot, remotePayload: existing.snapshot, detectedByAccountId: account.id }); throw new Error("SYNC_CONFLICT"); }
    await db.update(playerProfiles).set({ name: input.name, gender: input.gender, birthYear: input.birthYear, snapshot: input.snapshot, sourceDeviceId: input.sourceDeviceId, sourceLocalId: input.sourceLocalId, archivedAt: input.archivedAt ?? null, updatedByAccountId: account.id, revision: existing.revision + 1 }).where(eq(playerProfiles.id, existing.id));
    await writeAuditLog(account.id, "UPDATE_PLAYER_PROFILE", "player", input.syncId, { playerProfileId: existing.id, revision: existing.revision + 1 });
    return (await getPlayerProfileById(existing.id))!;
  }
  await db.insert(playerProfiles).values(input);
  const created = await getPlayerProfileBySyncId(input.syncId); if (!created) throw new Error("PLAYER_PROFILE_CREATION_FAILED");
  if (account.role === "COACH") await setCoachPlayerAssignment(account.id, created.id, account.id, true);
  await writeAuditLog(account.id, "CREATE_PLAYER_PROFILE", "player", input.syncId, { playerProfileId: created.id, sourceLocalId: input.sourceLocalId ?? null });
  return created;
}

export async function setCoachPlayerAssignment(coachAccountId: number, playerProfileId: number, assignedByAccountId: number, isActive: boolean): Promise<void> {
  const db = await getDb(); if (!db) throw new Error("قاعدة بيانات اللاعبين غير متاحة");
  await db.insert(coachPlayerAssignments).values({ coachAccountId, playerProfileId, assignedByAccountId, isActive }).onDuplicateKeyUpdate({ set: { isActive, assignedByAccountId } });
  await writeAuditLog(assignedByAccountId, isActive ? "ASSIGN_COACH" : "UNASSIGN_COACH", "coachAssignment", String(playerProfileId), { coachAccountId, playerProfileId });
}

export async function listCoachPlayerAssignments() { const db = await getDb(); return db ? db.select().from(coachPlayerAssignments) : []; }

export async function listPlayerResultsForProfile(playerProfileId: number): Promise<PlayerResult[]> { const db = await getDb(); if (!db) return []; return (await db.select().from(playerResults).where(eq(playerResults.playerProfileId, playerProfileId))).filter((row) => !row.deletedAt).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.getTime() - a.createdAt.getTime()); }

export async function upsertPlayerResult(account: Account, input: InsertPlayerResult): Promise<PlayerResult> {
  if (!(await canAccountAccessPlayerProfile(account, input.playerProfileId))) throw new Error("PLAYER_RESULT_FORBIDDEN");
  const db = await getDb(); if (!db) throw new Error("قاعدة بيانات النتائج غير متاحة");
  const existing = (await db.select().from(playerResults).where(eq(playerResults.syncId, input.syncId)).limit(1))[0];
  if (existing) {
    if (existing.playerProfileId !== input.playerProfileId) throw new Error("PLAYER_RESULT_FORBIDDEN");
    const baseRevision = (input as InsertPlayerResult & { baseRevision?: number }).baseRevision;
    if (baseRevision !== undefined && baseRevision < existing.revision && (input.snapshot ?? "") !== (existing.snapshot ?? "")) { await createSyncConflict({ entity: "testResult", syncId: input.syncId, playerProfileId: existing.playerProfileId, localPayload: input.snapshot ?? JSON.stringify(input), remotePayload: existing.snapshot ?? JSON.stringify(existing), detectedByAccountId: account.id }); throw new Error("SYNC_CONFLICT"); }
    await db.update(playerResults).set({ playerProfileId: input.playerProfileId, sourceLocalId: input.sourceLocalId, testId: input.testId, value: input.value, score: input.score, rating: input.rating, date: input.date, notes: input.notes, snapshot: input.snapshot, deletedAt: input.deletedAt, updatedByAccountId: account.id, revision: existing.revision + 1 }).where(eq(playerResults.id, existing.id));
    await writeAuditLog(account.id, "UPDATE_TEST_RESULT", "testResult", input.syncId, { playerProfileId: existing.playerProfileId, revision: existing.revision + 1 });
    return (await db.select().from(playerResults).where(eq(playerResults.id, existing.id)).limit(1))[0]!;
  }
  await db.insert(playerResults).values(input); const created = (await db.select().from(playerResults).where(eq(playerResults.syncId, input.syncId)).limit(1))[0]; if (!created) throw new Error("PLAYER_RESULT_CREATION_FAILED"); await writeAuditLog(account.id, "CREATE_TEST_RESULT", "testResult", input.syncId, { playerProfileId: created.playerProfileId }); return created;
}

export async function upsertPlayerAttendance(account: Account, input: InsertPlayerAttendance): Promise<PlayerAttendance> {
  if (!(await canAccountAccessPlayerProfile(account, input.playerProfileId))) throw new Error("PLAYER_ATTENDANCE_FORBIDDEN");
  const db = await getDb(); if (!db) throw new Error("قاعدة بيانات الحضور غير متاحة");
  const existing = (await db.select().from(playerAttendances).where(eq(playerAttendances.syncId, input.syncId)).limit(1))[0];
  if (existing) {
    if (existing.playerProfileId !== input.playerProfileId) throw new Error("PLAYER_ATTENDANCE_FORBIDDEN"); const baseRevision = (input as InsertPlayerAttendance & { baseRevision?: number }).baseRevision;
    if (baseRevision !== undefined && baseRevision < existing.revision && (input.snapshot ?? "") !== (existing.snapshot ?? "")) { await createSyncConflict({ entity: "attendance", syncId: input.syncId, playerProfileId: existing.playerProfileId, localPayload: input.snapshot ?? JSON.stringify(input), remotePayload: existing.snapshot ?? JSON.stringify(existing), detectedByAccountId: account.id }); throw new Error("SYNC_CONFLICT"); }
    await db.update(playerAttendances).set({ playerProfileId: input.playerProfileId, sourceLocalId: input.sourceLocalId, date: input.date, season: input.season, month: input.month, club: input.club, status: input.status, notes: input.notes, snapshot: input.snapshot, updatedByAccountId: account.id, revision: existing.revision + 1 }).where(eq(playerAttendances.id, existing.id)); await writeAuditLog(account.id, "UPDATE_ATTENDANCE", "attendance", input.syncId, { playerProfileId: existing.playerProfileId, revision: existing.revision + 1 }); return (await db.select().from(playerAttendances).where(eq(playerAttendances.id, existing.id)).limit(1))[0]!;
  }
  await db.insert(playerAttendances).values({ ...input, createdByAccountId: account.id, updatedByAccountId: account.id }); const created = (await db.select().from(playerAttendances).where(eq(playerAttendances.syncId, input.syncId)).limit(1))[0]; if (!created) throw new Error("PLAYER_ATTENDANCE_CREATION_FAILED"); await writeAuditLog(account.id, "CREATE_ATTENDANCE", "attendance", input.syncId, { playerProfileId: created.playerProfileId }); return created;
}

export async function upsertCentralTestSession(account: Account, input: InsertCentralTestSession): Promise<CentralTestSession> {
  if (account.role === "PLAYER") throw new Error("TEST_SESSION_FORBIDDEN"); const participantIds = JSON.parse(input.playerProfileIds) as unknown;
  if (!Array.isArray(participantIds) || !participantIds.every((id) => Number.isInteger(id) && id > 0)) throw new Error("TEST_SESSION_PARTICIPANTS_INVALID");
  if (!(await Promise.all(participantIds.map((id) => canAccountAccessPlayerProfile(account, id as number)))).every(Boolean)) throw new Error("TEST_SESSION_FORBIDDEN");
  const db = await getDb(); if (!db) throw new Error("قاعدة بيانات الجلسات غير متاحة"); const existing = (await db.select().from(centralTestSessions).where(eq(centralTestSessions.syncId, input.syncId)).limit(1))[0];
  if (existing) {
    const baseRevision = (input as InsertCentralTestSession & { baseRevision?: number }).baseRevision;
    if (baseRevision !== undefined && baseRevision < existing.revision && (input.snapshot ?? "") !== (existing.snapshot ?? "")) { await createSyncConflict({ entity: "testSession", syncId: input.syncId, playerProfileId: null, localPayload: input.snapshot ?? JSON.stringify(input), remotePayload: existing.snapshot ?? JSON.stringify(existing), detectedByAccountId: account.id }); throw new Error("SYNC_CONFLICT"); }
    await db.update(centralTestSessions).set({ sourceLocalId: input.sourceLocalId, testId: input.testId, name: input.name, date: input.date, playerProfileIds: input.playerProfileIds, batchSize: input.batchSize, currentBatch: input.currentBatch, status: input.status, snapshot: input.snapshot, updatedByAccountId: account.id, revision: existing.revision + 1 }).where(eq(centralTestSessions.id, existing.id)); await writeAuditLog(account.id, "UPDATE_TEST_SESSION", "testSession", input.syncId, { revision: existing.revision + 1 }); return (await db.select().from(centralTestSessions).where(eq(centralTestSessions.id, existing.id)).limit(1))[0]!;
  }
  await db.insert(centralTestSessions).values({ ...input, createdByAccountId: account.id, updatedByAccountId: account.id }); const created = (await db.select().from(centralTestSessions).where(eq(centralTestSessions.syncId, input.syncId)).limit(1))[0]; if (!created) throw new Error("TEST_SESSION_CREATION_FAILED"); await writeAuditLog(account.id, "CREATE_TEST_SESSION", "testSession", input.syncId, { participantCount: participantIds.length }); return created;
}

const sensitiveMetadataKey = /password|token|secret|authorization|cookie/i;
export function sanitizeAuditMetadata(metadata: Record<string, unknown>) { return JSON.stringify(Object.fromEntries(Object.entries(metadata).filter(([key]) => !sensitiveMetadataKey.test(key)).map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 500) : value]))); }
export async function writeAuditLog(actorAccountId: number, action: string, entity: string, entitySyncId: string | null, metadata: Record<string, unknown>): Promise<void> { const db = await getDb(); if (!db) throw new Error("قاعدة بيانات التدقيق غير متاحة"); await db.insert(auditLogs).values({ actorAccountId, action, entity, entitySyncId, metadata: sanitizeAuditMetadata(metadata) }); }
export async function createSyncConflict(input: { entity: string; syncId: string; playerProfileId: number | null; localPayload: string; remotePayload: string; detectedByAccountId: number }) { const db = await getDb(); if (!db) throw new Error("قاعدة بيانات التعارضات غير متاحة"); await db.insert(syncConflicts).values({ ...input, status: "PENDING" }); }
export async function listSyncConflictsForAccount(account: Account) {
  const db = await getDb(); if (!db) return [];
  const all = await db.select().from(syncConflicts);
  if (account.role === "ADMIN") return all;
  if (account.role === "PLAYER") return all.filter((item) => item.playerProfileId === account.playerId);
  const assignments = await db.select().from(coachPlayerAssignments).where(eq(coachPlayerAssignments.coachAccountId, account.id));
  const permitted = new Set(assignments.filter((item) => item.isActive).map((item) => item.playerProfileId));
  return all.filter((item) => item.playerProfileId !== null && permitted.has(item.playerProfileId));
}
export async function listAuditLogs(limit = 100) { const db = await getDb(); return db ? (await db.select().from(auditLogs)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit) : []; }
export async function resolveSyncConflict(id: number, resolvedByAccountId: number, status: "KEEP_LOCAL" | "KEEP_REMOTE" | "MERGED", resolutionNote: string | null) { const db = await getDb(); if (!db) throw new Error("قاعدة بيانات التعارضات غير متاحة"); await db.update(syncConflicts).set({ status, resolvedByAccountId, resolutionNote, resolvedAt: new Date() }).where(eq(syncConflicts.id, id)); const item = (await db.select().from(syncConflicts).where(eq(syncConflicts.id, id)).limit(1))[0]; if (!item) throw new Error("التعارض غير موجود"); await writeAuditLog(resolvedByAccountId, "RESOLVE_SYNC_CONFLICT", "syncConflict", item.syncId, { conflictId: item.id, status }); return item; }
