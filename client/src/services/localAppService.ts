import { expectedExecutionTime, finalEvaluation, evaluateValue, getAge, getAgeCategory } from "@/services/evaluation";
import { adoptLegacyDataIntoCurrentScope, exportOfflineDatabase, getSetting, importOfflineDatabase, initializeOfflineDatabase, list, put, remove, replaceStore, setOfflineDatabaseScope, setSetting } from "@/storage/localDatabase";
import type { AgeGroupRule, AttendanceRecord, AttendanceStatus, Belt, Club, LocalSyncConflict, MigrationReview, Player, Standard, SyncQueueItem, TestDefinition, TestResult, TestSession, TrainingGroup } from "@/domain/types";

const now = () => new Date().toISOString();
const dateToday = () => now().slice(0, 10);
const clone = <T,>(value: T): T => structuredClone(value);

async function queue(operation: string, entity: string, recordId: string | number, payload: Record<string, unknown>) {
  const deviceId = (await getSetting<string>("deviceId")) ?? "device-uninitialized";
  const userId = (await getSetting<string>("userId")) ?? "local-user";
  await put("syncQueue", { operation, entity, recordId: String(recordId), timestamp: now(), deviceId, userId, status: "Pending", payload } satisfies SyncQueueItem);
}

function normalizePlayer(raw: Partial<Player>): Player {
  const createdAt = raw.createdAt ?? now();
  const year = Number(String(raw.birthYear ?? "").replace(/[٠-٩]/g, (char) => String("٠١٢٣٤٥٦٧٨٩".indexOf(char))));
  if (!raw.name?.trim()) throw new Error("الرجاء إدخال اسم اللاعب");
  if (!Number.isInteger(year) || year < 1950 || year > 2100) throw new Error("سنة الميلاد غير صحيحة");
  return {
    id: raw.id, syncId: raw.syncId ?? crypto.randomUUID?.() ?? `player-${Date.now()}-${Math.random().toString(16).slice(2)}`, serverProfileId: raw.serverProfileId ?? null, syncRevision: raw.syncRevision ?? 0, createdByAccountId: raw.createdByAccountId ?? null, updatedByAccountId: raw.updatedByAccountId ?? null,
    name: raw.name.trim(), membershipNo: raw.membershipNo?.trim() ?? "", playerCode: raw.playerCode?.trim() || raw.membershipNo?.trim() || "",
    gender: raw.gender === "أنثى" ? "أنثى" : "ذكر", birthYear: year, birthDate: raw.birthDate || null,
    weight: raw.weight === null || raw.weight === undefined || raw.weight === ("" as never) ? null : Number(raw.weight),
    belt: raw.belt?.trim() ?? "", beltId: raw.beltId ?? null, club: raw.club?.trim() ?? "", clubId: raw.clubId ?? null, address: raw.address?.trim() ?? "", phone: raw.phone?.trim() ?? "",
    status: raw.status === "new" || raw.status === "suspended" ? raw.status : "active", groupName: raw.groupName?.trim() ?? "", trainingGroupId: raw.trainingGroupId ?? null,
    joinDate: raw.joinDate || dateToday(), notes: raw.notes?.trim() ?? "", deletedAt: raw.deletedAt ?? null,
    createdAt, updatedAt: now(),
  };
}

function normalizeStandard(raw: Partial<Standard>, existing?: Standard): Standard {
  if (!raw.testId || !raw.gender || !raw.ageCategory || raw.min === undefined || raw.max === undefined || !raw.grade || !raw.score) {
    throw new Error("بيانات المعيار غير مكتملة");
  }
  if (Number(raw.min) > Number(raw.max)) throw new Error("الحد الأدنى يجب ألا يتجاوز الحد الأقصى");
  const timestamp = existing?.createdAt ?? now();
  return {
    ...existing,
    ...raw,
    standardSetId: raw.standardSetId ?? existing?.standardSetId ?? `${raw.testId}:${raw.gender}:${raw.ageCategory}`,
    testId: Number(raw.testId), min: Number(raw.min), max: Number(raw.max), score: Number(raw.score),
    executionType: raw.executionType ?? existing?.executionType ?? "measurement",
    executionUnit: raw.executionUnit ?? existing?.executionUnit ?? "",
    executionTime: raw.executionTime === null || raw.executionTime === undefined || raw.executionTime === ("" as never) ? null : Number(raw.executionTime),
    attempts: Number(raw.attempts ?? existing?.attempts ?? 1), isActive: raw.isActive ?? existing?.isActive ?? true,
    source: raw.source ?? existing?.source ?? "admin", sourceStatus: raw.sourceStatus ?? existing?.sourceStatus ?? "documented",
    createdAt: timestamp, updatedAt: now(),
  } as Standard;
}

export const offlineApp = {
  initialize: initializeOfflineDatabase,
  async activateAccountScope(account: { id: number; role: "ADMIN" | "COACH" | "PLAYER" } | null) {
    await setOfflineDatabaseScope(account ? `account-${account.id}` : "unauthenticated");
    await initializeOfflineDatabase();
    if (account?.role === "ADMIN" && !(await getSetting<boolean>("migration:accountScope:legacy:v1"))) {
      await adoptLegacyDataIntoCurrentScope();
      await setSetting("migration:accountScope:legacy:v1", true);
    }
    await setSetting("userId", account ? `account-${account.id}` : "unauthenticated");
  },
  async hydrateServerVisibleData(payload: { profiles: Array<{ id: number; syncId: string; sourceLocalId: number | null; snapshot: string }>; results: Array<{ playerProfileId: number; sourceLocalId: number | null; testId: number; value: number; score: number | null; rating: string | null; date: string; notes: string | null; createdAt: Date; updatedAt: Date; deletedAt: Date | null }> }) {
    if (!payload.profiles.length) return;
    const existing = await list<Player>("players"); const mappedIds = new Map<number, number>(); const profiles: Player[] = [];
    for (const remote of payload.profiles) {
      let parsed: Partial<Player> = {};
      try { parsed = JSON.parse(remote.snapshot) as Partial<Player>; } catch { /* server validates key fields; malformed historical snapshot is ignored below */ }
      const localId = remote.sourceLocalId ?? existing.find((player) => player.serverProfileId === remote.id)?.id;
      if (!localId) continue;
      mappedIds.set(remote.id, localId);
      profiles.push({ ...normalizePlayer({ ...parsed, id: localId, syncId: remote.syncId, serverProfileId: remote.id }), id: localId });
    }
    if (!profiles.length) return;
    await replaceStore("players", profiles);
    const results = payload.results.flatMap((remote) => {
      const playerId = mappedIds.get(remote.playerProfileId); if (!playerId) return [];
      const asIso = (value: Date | string | null) => value ? (value instanceof Date ? value : new Date(value)).toISOString() : null;
      const saved: TestResult = { id: remote.sourceLocalId ?? undefined, playerId, testId: remote.testId, value: remote.value, score: remote.score, rating: remote.rating as TestResult["rating"], date: remote.date, notes: remote.notes ?? "", createdAt: asIso(remote.createdAt)!, updatedAt: asIso(remote.updatedAt)!, deletedAt: asIso(remote.deletedAt) };
      return [saved];
    });
    await replaceStore("testResults", results);
  },
  async overview() {
    const [players, tests, results, attendance, queueItems, standards, clubs, belts, ageGroups, trainingGroups, migrationReviews] = await Promise.all([
      list<Player>("players"), list<TestDefinition>("tests"), list<TestResult>("testResults"), list<AttendanceRecord>("attendance"), list<SyncQueueItem>("syncQueue"), list<Standard>("standards"), list<Club>("clubs"), list<Belt>("belts"), list<AgeGroupRule>("ageGroupRules"), list<TrainingGroup>("trainingGroups"), list<MigrationReview>("migrationReviews"),
    ]);
    const activePlayers = players.filter((player) => !player.deletedAt && player.status === "active");
    const latestResults = results.filter((result) => !result.deletedAt && result.score !== null);
    const teamAchievement = activePlayers.length
      ? Math.round((await Promise.all(activePlayers.map(async (player) => finalEvaluation(results.filter((result) => result.playerId === player.id), tests).achievement))).reduce((sum, value) => sum + value, 0) / activePlayers.length * 10) / 10
      : 0;
    const excellentCount = await Promise.all(activePlayers.map(async (player) => finalEvaluation(results.filter((result) => result.playerId === player.id), tests).finalGrade === "ممتاز")).then((values) => values.filter(Boolean).length);
    const todayRows = attendance.filter((row) => row.date === dateToday());
    return {
      players, tests, results: results.filter((result) => !result.deletedAt), attendance, standards, queueItems, clubs, belts, ageGroups, trainingGroups, migrationReviews,
      metrics: {
        activePlayers: activePlayers.length, testRecords: results.length, averageTeamAchievement: teamAchievement,
        excellentPercentage: activePlayers.length ? Math.round((excellentCount / activePlayers.length) * 1000) / 10 : 0,
        absentToday: todayRows.filter((row) => row.status === "absent").length,
        injuredToday: todayRows.filter((row) => row.status === "injured").length,
        pendingSync: queueItems.filter((item) => item.status === "Pending").length,
        documentedStandards: standards.filter((standard) => standard.sourceStatus === "documented").length,
      },
      latestResults: [...latestResults].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    };
  },
  async players(includeDeleted = false) {
    const players = await list<Player>("players");
    return players.filter((player) => includeDeleted || !player.deletedAt).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  },
  async savePlayer(raw: Partial<Player>) {
    let player = normalizePlayer(raw);
    const [clubs, belts, groups] = await Promise.all([list<Club>("clubs"), list<Belt>("belts"), list<TrainingGroup>("trainingGroups")]);
    const club = player.clubId ? clubs.find((item) => item.id === player.clubId) : undefined;
    const belt = player.beltId ? belts.find((item) => item.id === player.beltId) : undefined;
    if (!player.trainingGroupId) {
      const category = getAgeCategory(getAge(player.birthYear), player.gender);
      const suggested = groups.find((item) => item.isActive && !item.archivedAt && item.ageGroupKey === category && item.clubId === (player.clubId ?? null)) ?? groups.find((item) => item.isActive && !item.archivedAt && item.ageGroupKey === category && item.clubId === null);
      if (suggested) player = { ...player, trainingGroupId: suggested.id ?? null, groupName: suggested.name };
    }
    player = { ...player, club: club?.name ?? player.club, belt: belt?.name ?? player.belt };
    const id = await put("players", player);
    const saved = { ...player, id: Number(id) };
    await queue(player.id ? "UPDATE_PLAYER" : "CREATE_PLAYER", "player", saved.id!, clone({ ...saved, baseRevision: saved.syncRevision ?? 0 }) as unknown as Record<string, unknown>);
    return saved;
  },
  async deletePlayer(id: number) {
    const players = await list<Player>("players");
    const existing = players.find((player) => player.id === id);
    if (!existing) throw new Error("اللاعب غير موجود");
    const updated = { ...existing, deletedAt: now(), updatedAt: now() };
    await put("players", updated);
    await queue("DELETE_PLAYER", "player", id, clone(updated) as unknown as Record<string, unknown>);
  },
  async linkPlayerToServerProfile(playerId: number, serverProfileId: number) {
    const player = (await list<Player>("players")).find((item) => item.id === playerId);
    if (!player) throw new Error("اللاعب غير موجود");
    await put("players", { ...player, serverProfileId, updatedAt: now() });
    return { ...player, serverProfileId };
  },
  async tests() { return (await list<TestDefinition>("tests")).sort((a, b) => a.id - b.id); },
  async saveTest(raw: TestDefinition) {
    await put("tests", { ...raw, weight: Number(raw.weight) });
    await queue("UPDATE_TEST", "test", raw.id, clone(raw) as unknown as Record<string, unknown>);
    return raw;
  },
  async standards() { return (await list<Standard>("standards")).sort((a, b) => a.testId - b.testId || a.gender.localeCompare(b.gender) || a.ageCategory.localeCompare(b.ageCategory) || a.score - b.score); },
  async saveStandard(raw: Partial<Standard>) {
    const existing = raw.id ? (await list<Standard>("standards")).find((standard) => standard.id === raw.id) : undefined;
    const standard = normalizeStandard(raw, existing);
    const all = await list<Standard>("standards");
    const duplicate = all.find((item) => item.id !== standard.id && item.isActive && standard.isActive && item.testId === standard.testId && item.gender === standard.gender && item.ageCategory === standard.ageCategory && Math.max(item.min, standard.min) <= Math.min(item.max, standard.max));
    if (duplicate) throw new Error("يوجد معيار فعّال متداخل لهذه التركيبة. عطّل السجل السابق أو عدّل حدود النطاق.");
    const id = await put("standards", standard);
    const saved = { ...standard, id: Number(id) };
    await queue(standard.id ? "UPDATE_STANDARD" : "CREATE_STANDARD", "standard", saved.id!, clone(saved) as unknown as Record<string, unknown>);
    return saved;
  },
  async deleteStandard(id: number) {
    const item = (await list<Standard>("standards")).find((standard) => standard.id === id);
    if (!item) throw new Error("المعيار غير موجود");
    await put("standards", { ...item, isActive: false, updatedAt: now() });
    await queue("DELETE_STANDARD", "standard", id, { id });
  },
  async results(playerId?: number) {
    const results = await list<TestResult>("testResults");
    return results.filter((result) => !result.deletedAt && (playerId === undefined || result.playerId === playerId)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  },
  async recordResult(input: { playerId: number; testId: number; value: number; date?: string; notes?: string; sessionId?: number | null }) {
    const [players, tests, standards] = await Promise.all([list<Player>("players"), list<TestDefinition>("tests"), list<Standard>("standards")]);
    const player = players.find((item) => item.id === input.playerId);
    const test = tests.find((item) => item.id === input.testId);
    if (!player || player.deletedAt) throw new Error("اللاعب غير موجود أو محذوف");
    if (!test?.active) throw new Error("الاختبار غير موجود أو غير مفعّل");
    if (!Number.isFinite(Number(input.value))) throw new Error("أدخل نتيجة رقمية صحيحة");
    const evaluation = evaluateValue(player, input.testId, Number(input.value), standards);
    if (!evaluation.standard) throw new Error(evaluation.reason ?? "لا يوجد معيار مطابق");
    const timestamp = now();
    const result: TestResult = { syncId: crypto.randomUUID?.() ?? `result-${Date.now()}-${Math.random().toString(16).slice(2)}`, syncRevision: 0, playerId: input.playerId, testId: input.testId, sessionId: input.sessionId ?? null, value: Number(input.value), score: evaluation.score, rating: evaluation.rating, date: input.date || dateToday(), notes: input.notes?.trim() ?? "", createdAt: timestamp, updatedAt: timestamp };
    const id = await put("testResults", result);
    const saved = { ...result, id: Number(id) };
    await queue("CREATE_TEST_RESULT", "testResult", saved.id!, clone({ ...saved, serverProfileId: player.serverProfileId ?? null, baseRevision: saved.syncRevision ?? 0 }) as unknown as Record<string, unknown>);
    return { result: saved, evaluation, executionTime: expectedExecutionTime(test, player, standards) };
  },
  async playerCard(playerId: number) {
    const [players, tests, results, attendance] = await Promise.all([list<Player>("players"), list<TestDefinition>("tests"), list<TestResult>("testResults"), list<AttendanceRecord>("attendance")]);
    const player = players.find((item) => item.id === playerId);
    if (!player) throw new Error("اللاعب غير موجود");
    const playerResults = results.filter((item) => item.playerId === playerId && !item.deletedAt);
    const playerAttendance = attendance.filter((item) => item.playerId === playerId);
    const present = playerAttendance.filter((item) => item.status === "present").length;
    return { player, age: getAge(player.birthYear), ageCategory: getAgeCategory(getAge(player.birthYear), player.gender), results: playerResults, attendance: playerAttendance, attendancePercentage: playerAttendance.length ? Math.round((present / playerAttendance.length) * 1000) / 10 : null, final: finalEvaluation(playerResults, tests) };
  },
  async recordAttendance(input: { playerId: number; date: string; status: AttendanceStatus; notes?: string; season?: string; club?: string }) {
    const rows = await list<AttendanceRecord>("attendance");
    const existing = rows.find((row) => row.playerId === input.playerId && row.date === input.date);
    const timestamp = now();
    const record: AttendanceRecord = { id: existing?.id, syncId: existing?.syncId ?? crypto.randomUUID?.() ?? `attendance-${Date.now()}-${Math.random().toString(16).slice(2)}`, syncRevision: existing?.syncRevision ?? 0, playerId: input.playerId, date: input.date, status: input.status, notes: input.notes ?? "", season: input.season ?? String(new Date(input.date).getFullYear()), month: input.date.slice(0, 7), club: input.club ?? "", createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
    const id = await put("attendance", record);
    const saved = { ...record, id: Number(id) };
    const player = (await list<Player>("players")).find((item) => item.id === saved.playerId);
    await queue(existing ? "UPDATE_ATTENDANCE" : "CREATE_ATTENDANCE", "attendance", saved.id!, clone({ ...saved, serverProfileId: player?.serverProfileId ?? null, baseRevision: saved.syncRevision ?? 0 }) as unknown as Record<string, unknown>);
    return saved;
  },
  async sessions() { return (await list<TestSession>("sessions")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
  async saveSession(raw: Partial<TestSession>) {
    if (!raw.testId || !raw.playerIds?.length) throw new Error("اختر اختبارًا ولاعبًا واحدًا على الأقل للجلسة");
    const timestamp = now();
    const session: TestSession = { id: raw.id, syncId: raw.syncId ?? crypto.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(16).slice(2)}`, syncRevision: raw.syncRevision ?? 0, testId: raw.testId, name: raw.name?.trim() || "جلسة اختبار", date: raw.date || dateToday(), playerIds: raw.playerIds, batchSize: 10, currentBatch: raw.currentBatch ?? 0, status: raw.status ?? "active", createdAt: raw.createdAt ?? timestamp, updatedAt: timestamp };
    const id = await put("sessions", session);
    const saved = { ...session, id: Number(id) };
    await queue(session.id ? "UPDATE_TEST_SESSION" : "CREATE_TEST_SESSION", "session", saved.id!, clone({ ...saved, baseRevision: saved.syncRevision ?? 0 }) as unknown as Record<string, unknown>);
    return saved;
  },
  async exportBackup() { return exportOfflineDatabase(); },
  async importBackup(backup: Parameters<typeof importOfflineDatabase>[0]) { return importOfflineDatabase(backup); },
  async syncQueue() { return (await list<SyncQueueItem>("syncQueue")).sort((a, b) => b.timestamp.localeCompare(a.timestamp)); },
  async updateSyncQueueItem(id: number, patch: Partial<SyncQueueItem>) {
    const item = (await list<SyncQueueItem>("syncQueue")).find((row) => row.id === id); if (!item) throw new Error("عملية المزامنة غير موجودة");
    await put("syncQueue", { ...item, ...patch });
  },
  async applyPlayerSync(localPlayerId: number, serverProfileId: number, revision: number) {
    const player = (await list<Player>("players")).find((item) => item.id === localPlayerId); if (!player) return;
    await put("players", { ...player, serverProfileId, syncRevision: revision, updatedAt: now() });
  },
  async applyResultSync(localResultId: number, revision: number) {
    const result = (await list<TestResult>("testResults")).find((item) => item.id === localResultId); if (!result) return;
    await put("testResults", { ...result, syncRevision: revision, updatedAt: now() });
  },
  async applyAttendanceSync(localAttendanceId: number, revision: number) {
    const record = (await list<AttendanceRecord>("attendance")).find((item) => item.id === localAttendanceId); if (!record) return;
    await put("attendance", { ...record, syncRevision: revision, updatedAt: now() });
  },
  async applySessionSync(localSessionId: number, revision: number) {
    const session = (await list<TestSession>("sessions")).find((item) => item.id === localSessionId); if (!session) return;
    await put("sessions", { ...session, syncRevision: revision, updatedAt: now() });
  },
  async saveSyncConflict(conflict: Omit<LocalSyncConflict, "id">) { await put("syncConflicts", conflict); },
  async syncConflicts() { return (await list<LocalSyncConflict>("syncConflicts")).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)); },
  async clearLocalDataForTest() {
    const backup = await exportOfflineDatabase();
    for (const store of ["players", "tests", "standards", "testResults", "attendance", "sessions", "syncQueue", "settings", "legacyGroups"] as const) await removeAll(store);
    return backup;
  },
};

async function removeAll(store: "players" | "tests" | "standards" | "testResults" | "attendance" | "sessions" | "syncQueue" | "settings" | "legacyGroups") {
  const rows = await list<{ id?: number; key?: string }>(store);
  for (const row of rows) {
    const key = store === "settings" ? row.key : row.id;
    if (key !== undefined) await remove(store, key);
  }
}
