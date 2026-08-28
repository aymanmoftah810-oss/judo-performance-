import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { accountAdminProcedure, accountWorkProcedure, router } from "./_core/trpc";
import * as db from "./db";

const profileInput = z.object({
  syncId: z.string().trim().min(8).max(64), baseRevision: z.number().int().min(0).optional(), sourceDeviceId: z.string().trim().min(3).max(128).nullable().optional(), sourceLocalId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(2).max(160), gender: z.enum(["ذكر", "أنثى"]), birthYear: z.number().int().min(1950).max(2100), snapshot: z.string().min(2).max(60_000), archivedAt: z.string().datetime().nullable().optional(),
});
const resultInput = z.object({
  syncId: z.string().trim().min(8).max(64), baseRevision: z.number().int().min(0).optional(), playerProfileId: z.number().int().positive(), sourceLocalId: z.number().int().positive().nullable().optional(), testId: z.number().int().positive(),
  value: z.number().finite(), score: z.number().finite().nullable(), rating: z.string().trim().max(32).nullable(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), notes: z.string().max(10_000).default(""), snapshot: z.string().max(60_000).nullable().optional(), deletedAt: z.string().datetime().nullable().optional(),
});
const attendanceInput = z.object({ syncId: z.string().trim().min(8).max(64), baseRevision: z.number().int().min(0).optional(), playerProfileId: z.number().int().positive(), sourceLocalId: z.number().int().positive().nullable().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), season: z.string().trim().max(32), month: z.string().regex(/^\d{4}-\d{2}$/), club: z.string().trim().max(160), status: z.enum(["present", "absent", "injured", "excused"]), notes: z.string().max(10_000).default(""), snapshot: z.string().max(60_000).nullable().optional() });
const sessionInput = z.object({ syncId: z.string().trim().min(8).max(64), baseRevision: z.number().int().min(0).optional(), sourceLocalId: z.number().int().positive().nullable().optional(), testId: z.number().int().positive(), name: z.string().trim().min(1).max(200), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), playerProfileIds: z.array(z.number().int().positive()).min(1).max(500), batchSize: z.number().int().positive().max(100), currentBatch: z.number().int().min(0), status: z.enum(["draft", "active", "completed"]), snapshot: z.string().max(60_000).nullable().optional() });
const profileIdInput = z.object({ playerProfileId: z.number().int().positive().optional() });

function profileDto(profile: NonNullable<Awaited<ReturnType<typeof db.getPlayerProfileById>>>, includeSnapshot = false) {
  return { id: profile.id, syncId: profile.syncId, revision: profile.revision, sourceDeviceId: profile.sourceDeviceId, sourceLocalId: profile.sourceLocalId, name: profile.name, gender: profile.gender, birthYear: profile.birthYear, archivedAt: profile.archivedAt, createdAt: profile.createdAt, updatedAt: profile.updatedAt, ...(includeSnapshot ? { snapshot: profile.snapshot } : {}) };
}

async function scopedProfileId(account: { role: "ADMIN" | "COACH" | "PLAYER"; playerId: number | null }, requestedId?: number) {
  if (account.role === "PLAYER") {
    if (!account.playerId) throw new TRPCError({ code: "FORBIDDEN", message: "حساب PLAYER غير مرتبط بسجل لاعب مركزي" });
    if (requestedId && requestedId !== account.playerId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن للاعب قراءة بيانات لاعب آخر" });
    return account.playerId;
  }
  if (!requestedId) throw new TRPCError({ code: "BAD_REQUEST", message: "اختر سجل اللاعب المطلوب" });
  return requestedId;
}

async function assertAccountCanAccessProfile(account: Parameters<typeof db.canAccountAccessPlayerProfile>[0], playerProfileId: number) {
  if (!(await db.canAccountAccessPlayerProfile(account, playerProfileId))) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الوصول إلى سجل هذا اللاعب" });
}

export const playerDataRouter = router({
  me: accountWorkProcedure.query(({ ctx }) => ({ id: ctx.account.id, username: ctx.account.username, displayName: ctx.account.displayName, role: ctx.account.role, playerProfileId: ctx.account.playerId })),
  visibleProfiles: accountWorkProcedure.query(async ({ ctx }) => (await db.listPlayerProfilesForAccount(ctx.account)).map((profile) => profileDto(profile))),
  visibleData: accountWorkProcedure.input(z.object({ accountId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    if (input.accountId !== ctx.account.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن طلب بيانات حساب آخر" });
    const profiles = await db.listPlayerProfilesForAccount(ctx.account);
    const resultSets = await Promise.all(profiles.map((profile) => db.listPlayerResultsForProfile(profile.id)));
    return { profiles: profiles.map((profile) => ({ ...profileDto(profile, true)!, snapshot: profile.snapshot })), results: resultSets.flat().map((result) => ({ id: result.id, syncId: result.syncId, revision: result.revision, playerProfileId: result.playerProfileId, sourceLocalId: result.sourceLocalId, testId: result.testId, value: result.value, score: result.score, rating: result.rating, date: result.date, notes: result.notes, deletedAt: result.deletedAt, createdAt: result.createdAt, updatedAt: result.updatedAt })) };
  }),
  myProfile: accountWorkProcedure.input(profileIdInput).query(async ({ ctx, input }) => {
    const playerProfileId = await scopedProfileId(ctx.account, input.playerProfileId); await assertAccountCanAccessProfile(ctx.account, playerProfileId);
    const profile = await db.getPlayerProfileById(playerProfileId); if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "سجل اللاعب غير موجود" }); return profileDto(profile);
  }),
  myResults: accountWorkProcedure.input(profileIdInput).query(async ({ ctx, input }) => {
    const playerProfileId = await scopedProfileId(ctx.account, input.playerProfileId); await assertAccountCanAccessProfile(ctx.account, playerProfileId);
    return (await db.listPlayerResultsForProfile(playerProfileId)).map((result) => ({ id: result.id, syncId: result.syncId, playerProfileId: result.playerProfileId, sourceLocalId: result.sourceLocalId, testId: result.testId, value: result.value, score: result.score, rating: result.rating, date: result.date, notes: result.notes, deletedAt: result.deletedAt, createdAt: result.createdAt, updatedAt: result.updatedAt }));
  }),
  myProgress: accountWorkProcedure.input(profileIdInput).query(async ({ ctx, input }) => {
    const playerProfileId = await scopedProfileId(ctx.account, input.playerProfileId); await assertAccountCanAccessProfile(ctx.account, playerProfileId);
    const rows = await db.listPlayerResultsForProfile(playerProfileId); const scored = rows.filter((row) => row.score !== null);
    return { playerProfileId, resultCount: rows.length, scoredResultCount: scored.length, averageScore: scored.length ? Math.round((scored.reduce((total, row) => total + (row.score ?? 0), 0) / scored.length) * 100) / 100 : null, latestResultAt: rows[0]?.date ?? null };
  }),
  upsertProfile: accountWorkProcedure.input(profileInput).mutation(async ({ ctx, input }) => {
    if (ctx.account.role === "PLAYER") throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن لحساب PLAYER إنشاء أو تعديل سجلات اللاعبين" });
    try { const profile = await db.upsertPlayerProfile(ctx.account, { ...input, sourceDeviceId: input.sourceDeviceId ?? null, sourceLocalId: input.sourceLocalId ?? null, archivedAt: input.archivedAt ? new Date(input.archivedAt) : null, createdByAccountId: ctx.account.id, updatedByAccountId: ctx.account.id }); return { profile: profileDto(profile) }; }
    catch (error) { if (error instanceof Error && error.message === "PLAYER_PROFILE_FORBIDDEN") throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تعديل سجل هذا اللاعب" }); if (error instanceof Error && error.message === "SYNC_CONFLICT") throw new TRPCError({ code: "CONFLICT", message: "تعارض مزامنة في سجل اللاعب؛ حُفظت النسختان للمراجعة" }); throw error; }
  }),
  upsertResult: accountWorkProcedure.input(resultInput).mutation(async ({ ctx, input }) => {
    try { const result = await db.upsertPlayerResult(ctx.account, { ...input, sourceLocalId: input.sourceLocalId ?? null, notes: input.notes || null, snapshot: input.snapshot ?? null, deletedAt: input.deletedAt ? new Date(input.deletedAt) : null, createdByAccountId: ctx.account.id, updatedByAccountId: ctx.account.id }); return { result: { id: result.id, syncId: result.syncId, revision: result.revision, playerProfileId: result.playerProfileId, sourceLocalId: result.sourceLocalId, testId: result.testId, value: result.value, score: result.score, rating: result.rating, date: result.date, notes: result.notes, deletedAt: result.deletedAt, createdAt: result.createdAt, updatedAt: result.updatedAt } }; }
    catch (error) { if (error instanceof Error && error.message === "PLAYER_RESULT_FORBIDDEN") throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية إضافة أو تعديل نتيجة لهذا اللاعب" }); if (error instanceof Error && error.message === "SYNC_CONFLICT") throw new TRPCError({ code: "CONFLICT", message: "تعارض مزامنة في نتيجة الاختبار؛ حُفظت النسختان للمراجعة" }); throw error; }
  }),
  upsertAttendance: accountWorkProcedure.input(attendanceInput).mutation(async ({ ctx, input }) => {
    if (ctx.account.role === "PLAYER") throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن لحساب PLAYER تسجيل الحضور" });
    try { const attendance = await db.upsertPlayerAttendance(ctx.account, { ...input, sourceLocalId: input.sourceLocalId ?? null, notes: input.notes || null, snapshot: input.snapshot ?? null, createdByAccountId: ctx.account.id, updatedByAccountId: ctx.account.id }); return { attendance: { id: attendance.id, syncId: attendance.syncId, revision: attendance.revision } }; }
    catch (error) { if (error instanceof Error && error.message === "PLAYER_ATTENDANCE_FORBIDDEN") throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تسجيل حضور هذا اللاعب" }); if (error instanceof Error && error.message === "SYNC_CONFLICT") throw new TRPCError({ code: "CONFLICT", message: "تعارض مزامنة في سجل الحضور؛ حُفظت النسختان للمراجعة" }); throw error; }
  }),
  upsertSession: accountWorkProcedure.input(sessionInput).mutation(async ({ ctx, input }) => {
    if (ctx.account.role === "PLAYER") throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن لحساب PLAYER إنشاء جلسة اختبار" });
    try { const session = await db.upsertCentralTestSession(ctx.account, { ...input, sourceLocalId: input.sourceLocalId ?? null, playerProfileIds: JSON.stringify(input.playerProfileIds), snapshot: input.snapshot ?? null, createdByAccountId: ctx.account.id, updatedByAccountId: ctx.account.id }); return { session: { id: session.id, syncId: session.syncId, revision: session.revision } }; }
    catch (error) { if (error instanceof Error && error.message === "TEST_SESSION_FORBIDDEN") throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية إدارة هذه الجلسة" }); if (error instanceof Error && error.message === "TEST_SESSION_PARTICIPANTS_INVALID") throw new TRPCError({ code: "BAD_REQUEST", message: "مشاركو الجلسة غير صالحين" }); if (error instanceof Error && error.message === "SYNC_CONFLICT") throw new TRPCError({ code: "CONFLICT", message: "تعارض مزامنة في الجلسة؛ حُفظت النسختان للمراجعة" }); throw error; }
  }),
  assignCoach: accountAdminProcedure.input(z.object({ coachAccountId: z.number().int().positive(), playerProfileId: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    const [coach, profile] = await Promise.all([db.getAccountById(input.coachAccountId), db.getPlayerProfileById(input.playerProfileId)]);
    if (!coach || coach.role !== "COACH") throw new TRPCError({ code: "BAD_REQUEST", message: "حساب المدرب غير صالح" }); if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "سجل اللاعب غير موجود" });
    await db.setCoachPlayerAssignment(coach.id, profile.id, ctx.account.id, input.isActive); return { success: true };
  }),
  coachAssignments: accountAdminProcedure.query(async () => (await db.listCoachPlayerAssignments()).map((item) => ({ id: item.id, coachAccountId: item.coachAccountId, playerProfileId: item.playerProfileId, assignedByAccountId: item.assignedByAccountId, isActive: item.isActive, createdAt: item.createdAt, updatedAt: item.updatedAt }))),
  linkPlayerAccount: accountAdminProcedure.input(z.object({ accountId: z.number().int().positive(), playerProfileId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const [account, profile, existingLink] = await Promise.all([db.getAccountById(input.accountId), db.getPlayerProfileById(input.playerProfileId), db.getAccountByPlayerProfileId(input.playerProfileId)]);
    if (!account || account.role !== "PLAYER") throw new TRPCError({ code: "BAD_REQUEST", message: "حساب PLAYER غير صالح" }); if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "سجل اللاعب غير موجود" }); if (existingLink && existingLink.id !== account.id) throw new TRPCError({ code: "CONFLICT", message: "هذا السجل مرتبط بالفعل بحساب PLAYER آخر" });
    const updated = await db.updateAccount(account.id, { playerId: profile.id }); await db.writeAuditLog(ctx.account.id, "LINK_PLAYER_ACCOUNT", "account", String(updated.id), { accountId: updated.id, playerProfileId: profile.id }); return { account: { id: updated.id, playerId: updated.playerId } };
  }),
  syncConflicts: accountWorkProcedure.query(async ({ ctx }) => (await db.listSyncConflictsForAccount(ctx.account)).map((item) => ({ id: item.id, entity: item.entity, syncId: item.syncId, playerProfileId: item.playerProfileId, status: item.status, detectedByAccountId: item.detectedByAccountId, resolvedByAccountId: item.resolvedByAccountId, resolutionNote: item.resolutionNote, createdAt: item.createdAt, resolvedAt: item.resolvedAt }))),
  resolveSyncConflict: accountAdminProcedure.input(z.object({ conflictId: z.number().int().positive(), action: z.enum(["KEEP_LOCAL", "KEEP_REMOTE", "MERGED"]), resolutionNote: z.string().trim().max(1_000).optional() })).mutation(async ({ ctx, input }) => {
    const resolved = await db.resolveSyncConflict(input.conflictId, ctx.account.id, input.action, input.resolutionNote ?? null);
    return { id: resolved.id, status: resolved.status, resolvedAt: resolved.resolvedAt };
  }),
  auditLog: accountAdminProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(100) })).query(async ({ input }) => (await db.listAuditLogs(input.limit)).map((item) => ({ id: item.id, actorAccountId: item.actorAccountId, action: item.action, entity: item.entity, entitySyncId: item.entitySyncId, metadata: item.metadata, createdAt: item.createdAt }))),
});
