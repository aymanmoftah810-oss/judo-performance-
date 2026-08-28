import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  getAccountById: vi.fn(), getAccountByPlayerProfileId: vi.fn(), getPlayerProfileById: vi.fn(), listPlayerProfilesForAccount: vi.fn(), canAccountAccessPlayerProfile: vi.fn(), listPlayerResultsForProfile: vi.fn(), upsertPlayerProfile: vi.fn(), upsertPlayerResult: vi.fn(), upsertPlayerAttendance: vi.fn(), upsertCentralTestSession: vi.fn(), setCoachPlayerAssignment: vi.fn(), listCoachPlayerAssignments: vi.fn(), listSyncConflictsForAccount: vi.fn(), resolveSyncConflict: vi.fn(), listAuditLogs: vi.fn(), writeAuditLog: vi.fn(),
}));
vi.mock("./db", () => mock);
import { appRouter } from "./routers";

const profileOne = { id: 101, syncId: "player-sync-101", sourceDeviceId: "device-1", sourceLocalId: 1, name: "لاعب أول", gender: "ذكر", birthYear: 2012, snapshot: "{}", createdByAccountId: 1, archivedAt: null, createdAt: new Date(), updatedAt: new Date() } as any;
const resultOne = { id: 10, syncId: "result-sync-101", playerProfileId: 101, sourceLocalId: 5, testId: 1, value: 24, score: 9, rating: "ممتاز", date: "2026-08-27", notes: "", snapshot: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date() } as any;
const account = (role: "ADMIN" | "COACH" | "PLAYER", playerId: number | null, mustChangePassword = false) => ({ id: role === "ADMIN" ? 1 : role === "COACH" ? 2 : 3, username: role.toLowerCase(), displayName: role, passwordHash: "scrypt$salt$deadbeef", role, playerId, isActive: true, mustChangePassword, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: null } as any);
const context = (currentAccount: any) => ({ user: null, account: currentAccount, req: { protocol: "https", headers: {} }, res: { cookie: vi.fn(), clearCookie: vi.fn() } } as any);

describe("عزل بيانات اللاعب في Phase C", () => {
  beforeEach(() => { vi.clearAllMocks(); mock.writeAuditLog.mockResolvedValue(undefined); mock.canAccountAccessPlayerProfile.mockResolvedValue(true); mock.getPlayerProfileById.mockResolvedValue(profileOne); mock.listPlayerResultsForProfile.mockResolvedValue([resultOne]); mock.listPlayerProfilesForAccount.mockResolvedValue([profileOne]); mock.upsertPlayerAttendance.mockResolvedValue({ id: 81, syncId: "attendance-81", revision: 1 }); mock.upsertCentralTestSession.mockResolvedValue({ id: 91, syncId: "session-91", revision: 1 }); mock.listCoachPlayerAssignments.mockResolvedValue([{ id: 3, coachAccountId: 2, playerProfileId: 101, assignedByAccountId: 1, isActive: true, createdAt: new Date(), updatedAt: new Date() }]); mock.listSyncConflictsForAccount.mockResolvedValue([{ id: 61, entity: "testResult", syncId: "result-sync-101", playerProfileId: 101, localPayload: "{local}", remotePayload: "{remote}", status: "PENDING", detectedByAccountId: 1, resolvedByAccountId: null, resolutionNote: null, createdAt: new Date(), resolvedAt: null }]); mock.resolveSyncConflict.mockResolvedValue({ id: 61, status: "KEEP_LOCAL", resolvedAt: new Date() }); });

  it("RBAC-C-001: يعيد /me هوية الحساب فقط ويمنع الحساب المؤقت من إجراءات البيانات", async () => {
    await expect(appRouter.createCaller(context(account("PLAYER", 101))).playerData.me()).resolves.toMatchObject({ role: "PLAYER", playerProfileId: 101 });
    await expect(appRouter.createCaller(context(account("COACH", null, true))).playerData.visibleProfiles()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("RBAC-C-002: لا يستطيع PLAYER الوصول إلى ملف لاعب آخر حتى عند تمرير معرفه صراحة", async () => {
    const caller = appRouter.createCaller(context(account("PLAYER", 101)));
    await expect(caller.playerData.myProfile({ playerProfileId: 202 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.playerData.myResults({ playerProfileId: 202 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.playerData.myProgress({ playerProfileId: 202 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mock.listPlayerResultsForProfile).not.toHaveBeenCalled();
  });

  it("RBAC-C-003: تقتصر نتائج وتقدم PLAYER على السجل المرتبط به على الخادم", async () => {
    const caller = appRouter.createCaller(context(account("PLAYER", 101)));
    await expect(caller.playerData.myResults({})).resolves.toMatchObject([{ playerProfileId: 101, syncId: "result-sync-101" }]);
    await expect(caller.playerData.myProgress({})).resolves.toEqual({ playerProfileId: 101, resultCount: 1, scoredResultCount: 1, averageScore: 9, latestResultAt: "2026-08-27" });
    expect(mock.canAccountAccessPlayerProfile).toHaveBeenCalledWith(expect.objectContaining({ role: "PLAYER", playerId: 101 }), 101);
    expect(mock.listPlayerResultsForProfile).toHaveBeenCalledWith(101);
  });

  it("RBAC-C-003B: لا يطلب العميل الموثوق بيانات مرئية باسم حساب آخر وتعود اللقطة المصرح بها فقط", async () => {
    const caller = appRouter.createCaller(context(account("PLAYER", 101)));
    await expect(caller.playerData.visibleData({ accountId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.playerData.visibleData({ accountId: 3 })).resolves.toMatchObject({ profiles: [expect.objectContaining({ id: 101, snapshot: "{}" })], results: [expect.objectContaining({ playerProfileId: 101 })] });
  });

  it("RBAC-C-004: يمنع PLAYER من إنشاء سجل لاعب أو كتابة نتيجة ولو غيّر معرّف الطلب", async () => {
    const caller = appRouter.createCaller(context(account("PLAYER", 101)));
    await expect(caller.playerData.upsertProfile({ syncId: "profile-new-101", name: "محاولة", gender: "ذكر", birthYear: 2012, snapshot: "{}" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    mock.upsertPlayerResult.mockRejectedValueOnce(new Error("PLAYER_RESULT_FORBIDDEN"));
    await expect(caller.playerData.upsertResult({ syncId: "result-new-202", playerProfileId: 202, testId: 1, value: 10, score: 2, rating: "مقبول", date: "2026-08-27" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("SYNC-D-003: يحول تعارض مراجعة نتيجة الاختبار إلى رفض واضح قابل للمراجعة", async () => {
    mock.upsertPlayerResult.mockRejectedValueOnce(new Error("SYNC_CONFLICT"));
    const caller = appRouter.createCaller(context(account("PLAYER", 101)));
    await expect(caller.playerData.upsertResult({ syncId: "result-conflict-101", baseRevision: 0, playerProfileId: 101, testId: 1, value: 25, score: 8, rating: "جيد جدا", date: "2026-08-27", snapshot: "{local}" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("SYNC-D-004: يمنع PLAYER من مزامنة حضور أو جلسة ويقبلها من ADMIN ضمن سجلاته", async () => {
    const playerCaller = appRouter.createCaller(context(account("PLAYER", 101)));
    await expect(playerCaller.playerData.upsertAttendance({ syncId: "attendance-101", playerProfileId: 101, date: "2026-08-27", season: "2026", month: "2026-08", club: "", status: "present" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(playerCaller.playerData.upsertSession({ syncId: "session-101", testId: 1, name: "جلسة", date: "2026-08-27", playerProfileIds: [101], batchSize: 10, currentBatch: 0, status: "active" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const adminCaller = appRouter.createCaller(context(account("ADMIN", null)));
    await expect(adminCaller.playerData.upsertAttendance({ syncId: "attendance-admin-101", playerProfileId: 101, date: "2026-08-27", season: "2026", month: "2026-08", club: "", status: "present" })).resolves.toMatchObject({ attendance: { revision: 1 } });
  });

  it("RBAC-C-005: ينفذ ADMIN ربط المدرب واللاعب بعد تحقق السجلات، ولا تمنح الواجهة وحدها الصلاحية", async () => {
    const adminCaller = appRouter.createCaller(context(account("ADMIN", null)));
    mock.getAccountById.mockResolvedValueOnce(account("COACH", null)); mock.getPlayerProfileById.mockResolvedValueOnce(profileOne);
    await expect(adminCaller.playerData.assignCoach({ coachAccountId: 2, playerProfileId: 101, isActive: true })).resolves.toEqual({ success: true });
    expect(mock.setCoachPlayerAssignment).toHaveBeenCalledWith(2, 101, 1, true);
  });

  it("COACH-D-001: يعيد تعيينات المدربين للمدير فقط", async () => {
    await expect(appRouter.createCaller(context(account("ADMIN", null))).playerData.coachAssignments()).resolves.toMatchObject([{ coachAccountId: 2, playerProfileId: 101, isActive: true }]);
    await expect(appRouter.createCaller(context(account("COACH", null))).playerData.coachAssignments()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("SYNC-D-001: يعرض التعارض ضمن نطاق الحساب بلا payload خام ويمنع PLAYER من حله", async () => {
    const playerCaller = appRouter.createCaller(context(account("PLAYER", 101)));
    const conflicts = await playerCaller.playerData.syncConflicts();
    expect(conflicts).toMatchObject([{ id: 61, syncId: "result-sync-101", status: "PENDING" }]); expect(JSON.stringify(conflicts)).not.toContain("{local}");
    await expect(playerCaller.playerData.resolveSyncConflict({ conflictId: 61, action: "KEEP_LOCAL" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("SYNC-D-002: يتيح للمدير حل التعارض فقط ويسجل قرارًا مضبوطًا", async () => {
    const adminCaller = appRouter.createCaller(context(account("ADMIN", null)));
    await expect(adminCaller.playerData.resolveSyncConflict({ conflictId: 61, action: "KEEP_REMOTE", resolutionNote: "اعتماد نتيجة الملعب" })).resolves.toMatchObject({ id: 61, status: "KEEP_LOCAL" });
    expect(mock.resolveSyncConflict).toHaveBeenCalledWith(61, 1, "KEEP_REMOTE", "اعتماد نتيجة الملعب");
  });
});
