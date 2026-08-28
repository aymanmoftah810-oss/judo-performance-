import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { REFERENCE_TESTS } from "@/data/referenceCatalog";
import { getAge, getAgeCategory, expectedExecutionTime } from "@/services/evaluation";
import { offlineApp } from "@/services/localAppService";
import { phaseA } from "@/services/phaseAService";
import { getSetting, resetOfflineDatabaseForTests } from "@/storage/localDatabase";
import { can, LOCAL_IDENTITY } from "@/services/futureContracts";
import type { Player, Standard } from "@/domain/types";

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

let storage: MemoryStorage;

beforeEach(async () => {
  await resetOfflineDatabaseForTests();
  storage = new MemoryStorage();
  Object.assign(globalThis, { window: { localStorage: storage } });
});

async function setup() { await offlineApp.initialize(); }

describe("المرحلة 1 — IndexedDB وترحيل اللاعبين", () => {
  it("DB-001..004: ينشئ المخازن ويحمل الاختبارات العشرة والمعايير المرجعية", async () => {
    await setup();
    const overview = await offlineApp.overview();
    expect(overview.tests).toHaveLength(10);
    expect(overview.standards).toHaveLength(600);
    expect(overview.tests.map((test) => test.nameAr)).toEqual(REFERENCE_TESTS.map((test) => test.nameAr));
    expect(overview.tests.reduce((sum, test) => sum + test.weight, 0)).toBe(1);
  });

  it("DB-005: يرحل بيانات LocalStorage القديمة من دون فقد اللاعب", async () => {
    storage.setItem("judo:group:1", JSON.stringify({ id: 1, name: "مجموعة الناشئين" }));
    storage.setItem("judo:player:7", JSON.stringify({ id: 7, name: "لاعب قديم", membershipNo: "M-7", gender: "ذكر", birthYear: 2012, status: "مقيد", groupId: 1, createdAt: "2026-01-01T00:00:00.000Z" }));
    await setup();
    const players = await offlineApp.players();
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({ id: 7, name: "لاعب قديم", status: "active", groupName: "مجموعة الناشئين" });
    expect(await getSetting("migration:localStorage:v2")).toBeTruthy();
  });

  it("PLAYER-001..003: يحفظ ويحدث ويحذف اللاعب حذفًا منطقيًا مع تسجيل عملية Pending", async () => {
    await setup();
    const player = await offlineApp.savePlayer({ name: "سارة أحمد", gender: "أنثى", birthYear: 2013, membershipNo: "A-1", status: "active" });
    expect(player.id).toBeTypeOf("number");
    await offlineApp.savePlayer({ ...player, club: "نادي الجودو" });
    expect((await offlineApp.players())[0]?.club).toBe("نادي الجودو");
    await offlineApp.deletePlayer(player.id!);
    expect(await offlineApp.players()).toHaveLength(0);
    const queue = await offlineApp.syncQueue();
    expect(queue.map((item) => item.operation)).toEqual(expect.arrayContaining(["CREATE_PLAYER", "UPDATE_PLAYER", "DELETE_PLAYER"]));
    expect(queue.every((item) => item.status === "Pending" && item.userId === "local-user")).toBe(true);
  });

  it("RBAC-C-006: يفصل ذاكرة IndexedDB بين الحسابات ويرحل بيانات الجهاز التاريخية إلى نطاق أول ADMIN فقط", async () => {
    await setup();
    const legacyPlayer = await offlineApp.savePlayer({ name: "لاعب تاريخي", gender: "ذكر", birthYear: 2012, membershipNo: "L-1", status: "active" });
    await offlineApp.activateAccountScope({ id: 11, role: "ADMIN" });
    expect((await offlineApp.players()).map((player) => player.name)).toEqual([legacyPlayer.name]);
    expect(await getSetting("userId")).toBe("account-11");
    await offlineApp.activateAccountScope({ id: 22, role: "COACH" });
    expect(await offlineApp.players()).toEqual([]);
    await offlineApp.savePlayer({ name: "لاعب مدرب", gender: "أنثى", birthYear: 2013, membershipNo: "C-1", status: "active" });
    await offlineApp.activateAccountScope({ id: 11, role: "ADMIN" });
    expect((await offlineApp.players()).map((player) => player.name)).toEqual([legacyPlayer.name]);
  });

  it("RBAC-C-008: يرطب نطاق الحساب فقط بسجل اللاعب ونتيجته اللذين أجازهما الخادم", async () => {
    await offlineApp.activateAccountScope({ id: 33, role: "PLAYER" });
    const snapshot = { name: "لاعب معزول", membershipNo: "P-33", playerCode: "P-33", gender: "ذكر" as const, birthYear: 2012, weight: null, belt: "", club: "", address: "", phone: "", status: "active" as const, groupName: "", joinDate: "2026-08-01", notes: "", deletedAt: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };
    await offlineApp.hydrateServerVisibleData({ profiles: [{ id: 501, syncId: "profile-sync-501", sourceLocalId: 91, snapshot: JSON.stringify(snapshot) }], results: [{ playerProfileId: 501, sourceLocalId: 71, testId: 1, value: 24, score: 9, rating: "ممتاز", date: "2026-08-27", notes: "نتيجة خاصة", createdAt: new Date("2026-08-27T00:00:00.000Z"), updatedAt: new Date("2026-08-27T00:00:00.000Z"), deletedAt: null }] });
    await expect(offlineApp.players()).resolves.toMatchObject([{ id: 91, name: "لاعب معزول", serverProfileId: 501 }]);
    await expect(offlineApp.results()).resolves.toMatchObject([{ id: 71, playerId: 91, notes: "نتيجة خاصة" }]);
  });
});

describe("المرحلة 2 — العمر والتقييم وزمن التنفيذ", () => {
  const player: Player = { id: 1, name: "محمد", membershipNo: "", playerCode: "", gender: "ذكر", birthYear: new Date().getFullYear() - 8, weight: null, belt: "", club: "", address: "", phone: "", status: "active", groupName: "", joinDate: "2026-01-01", notes: "", deletedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" };

  it("EVAL-001: يثبت حساب العمر على السنة الحالية ناقص سنة الميلاد", () => {
    expect(getAge(new Date().getFullYear() - 8)).toBe(8);
    expect(getAgeCategory(8, "ذكر")).toBe("تحت 9");
    expect(getAgeCategory(18, "أنثى")).toBe("آنسات");
  });

  it("EVAL-002..005: يقيم الضغط وفق الحدود المرجعية ويحسب التقدير النهائي", async () => {
    await setup();
    const saved = await offlineApp.savePlayer(player);
    const evaluated = await offlineApp.recordResult({ playerId: saved.id!, testId: 1, value: 22 });
    expect(evaluated.result.score).toBe(5);
    expect(evaluated.result.rating).toBe("ممتاز");
    expect(evaluated.executionTime).toBe(30);
    const card = await offlineApp.playerCard(saved.id!);
    expect(card.final.achievement).toBe(10);
    expect(card.final.finalGrade).toBe("ضعيف");
  });

  it("TIME-001..005: يحفظ الزمن والنوع والوحدة ويعكس تعديل المعيار في واجهة الإدخال", async () => {
    await setup();
    const standards = await offlineApp.standards();
    const tests = await offlineApp.tests();
    const target = standards.find((standard) => standard.testId === 1 && standard.gender === "ذكر" && standard.ageCategory === "تحت 9") as Standard;
    expect(target.executionTime).toBe(30);
    expect(target.executionType).toBe("repetitions");
    expect(target.executionUnit).toBe("ثانية");
    const amended = await offlineApp.saveStandard({ ...target, executionTime: 35 });
    expect(amended.executionTime).toBe(35);
    expect(expectedExecutionTime(tests[0]!, player, await offlineApp.standards())).toBe(35);
    expect((await offlineApp.standards()).filter((standard) => standard.sourceStatus === "needs_admin_setup")).toHaveLength(0);
  });
});

describe("المعايير والجلسات والنسخ الاحتياطي", () => {
  it("STD-001..005: يعطل المعيار تاريخيًا ولا يقبل نطاقًا فعالًا مكررًا", async () => {
    await setup();
    const standard = (await offlineApp.standards())[0]!;
    await expect(offlineApp.saveStandard({ ...standard, id: undefined, source: "admin" })).rejects.toThrow("يوجد معيار فعّال متداخل");
    await expect(offlineApp.saveStandard({ ...standard, id: undefined, min: standard.min + 1, max: standard.max + 2, source: "admin" })).rejects.toThrow("يوجد معيار فعّال متداخل");
    await offlineApp.deleteStandard(standard.id!);
    expect((await offlineApp.standards()).find((item) => item.id === standard.id)?.isActive).toBe(false);
  });

  it("TEST-001..007: ينشئ جلسة ويفصل اللاعبين إلى دفعات من عشرة", async () => {
    await setup();
    const ids: number[] = [];
    for (let index = 0; index < 11; index += 1) ids.push((await offlineApp.savePlayer({ name: `لاعب ${index}`, gender: "ذكر", birthYear: 2012, status: "active" })).id!);
    const session = await offlineApp.saveSession({ name: "جلسة جماعية", testId: 1, playerIds: ids });
    expect(session.batchSize).toBe(10);
    expect(Math.ceil(session.playerIds.length / session.batchSize)).toBe(2);
  });

  it("BACKUP-001..004: يصدر البيانات ويستعيدها كاملة", async () => {
    await setup();
    const player = await offlineApp.savePlayer({ name: "لاعب النسخ", gender: "ذكر", birthYear: 2012, status: "active" });
    const backup = await offlineApp.exportBackup();
    await resetOfflineDatabaseForTests();
    await offlineApp.importBackup(backup);
    expect((await offlineApp.players()).find((item) => item.id === player.id)?.name).toBe("لاعب النسخ");
    expect((await offlineApp.tests())).toHaveLength(10);
  });
});

describe("الحضور وبطاقة اللاعب ولوحة المتابعة والمزامنة", () => {
  it("ATT-001..005: ينشئ سجل حضور ويحدّثه بدل تكراره ويحسب النسبة", async () => {
    await setup();
    const player = await offlineApp.savePlayer({ name: "لاعبة حضور", gender: "أنثى", birthYear: 2013, status: "active" });
    await offlineApp.recordAttendance({ playerId: player.id!, date: "2026-08-01", status: "present", club: "النادي" });
    await offlineApp.recordAttendance({ playerId: player.id!, date: "2026-08-01", status: "injured", club: "النادي" });
    await offlineApp.recordAttendance({ playerId: player.id!, date: "2026-08-02", status: "present", club: "النادي" });
    const card = await offlineApp.playerCard(player.id!);
    expect(card.attendance).toHaveLength(2);
    expect(card.attendancePercentage).toBe(50);
    expect(card.attendance.find((row) => row.date === "2026-08-01")?.status).toBe("injured");
  });

  it("DASH-001..004: يقرأ Dashboard وبطاقة اللاعب من الخدمات والقاعدة المحلية", async () => {
    await setup();
    const player = await offlineApp.savePlayer({ name: "لاعب لوحة", gender: "ذكر", birthYear: new Date().getFullYear() - 8, status: "active" });
    await offlineApp.recordResult({ playerId: player.id!, testId: 1, value: 22 });
    const [overview, card] = await Promise.all([offlineApp.overview(), offlineApp.playerCard(player.id!)]);
    expect(overview.metrics.activePlayers).toBe(1);
    expect(overview.metrics.testRecords).toBe(1);
    expect(overview.latestResults[0]?.playerId).toBe(player.id);
    expect(card.results[0]?.rating).toBe("ممتاز");
  });

  it("SYNC-001..003: يهيئ معرف الجهاز ويسجل العمليات بحالة Pending", async () => {
    await setup();
    const player = await offlineApp.savePlayer({ name: "لاعب مزامنة", gender: "ذكر", birthYear: 2012, status: "active" });
    expect(await getSetting("deviceId")).toMatch(/^device-/);
    const item = (await offlineApp.syncQueue()).find((row) => row.recordId === String(player.id));
    expect(item).toMatchObject({ operation: "CREATE_PLAYER", entity: "player", status: "Pending", userId: "local-user" });
    const result = await offlineApp.recordResult({ playerId: player.id!, testId: 1, value: 24 });
    expect(result.result.syncId).toMatch(/.+/); expect(result.result.syncRevision).toBe(0);
    expect((await offlineApp.syncQueue()).find((row) => row.entity === "testResult")?.payload).toMatchObject({ syncId: result.result.syncId, baseRevision: 0 });
    const attendance = await offlineApp.recordAttendance({ playerId: player.id!, date: "2026-08-27", status: "present" });
    const session = await offlineApp.saveSession({ testId: 1, name: "جلسة مزامنة", date: "2026-08-27", playerIds: [player.id!] });
    expect(attendance).toMatchObject({ syncRevision: 0 }); expect(attendance.syncId).toMatch(/.+/);
    expect(session).toMatchObject({ syncRevision: 0 }); expect(session.syncId).toMatch(/.+/);
    const extendedQueue = await offlineApp.syncQueue();
    expect(extendedQueue.find((row) => row.entity === "attendance")?.payload).toMatchObject({ syncId: attendance.syncId, baseRevision: 0 });
    expect(extendedQueue.find((row) => row.entity === "session")?.payload).toMatchObject({ syncId: session.syncId, baseRevision: 0 });
  });

  it("AUTH-READY-001: يعرّف عقد الأدوار المحلي للاستعداد للمصادقة دون تشغيلها", () => {
    expect(LOCAL_IDENTITY).toMatchObject({ userId: "local-user", role: "Super Admin", source: "local" });
    expect(can("Coach", "record_results")).toBe(true);
    expect(can("Viewer", "record_results")).toBe(false);
  });
});

describe("Phase A — البيانات المرجعية والأرشفة والاستعادة", () => {
  it("PHASE-A-001: يرحل الأندية والأحزمة دون دمج الكتابات المتشابهة آليًا ويقترح مجموعة الفئة", async () => {
    const underNineYear = new Date().getFullYear() - 8;
    storage.setItem("judo:player:1", JSON.stringify({ id: 1, name: "لاعب مرجعي", membershipNo: "M-1", gender: "ذكر", birthYear: underNineYear, status: "مقيد", club: "نادي الوليدية", belt: "أبيض", createdAt: "2026-01-01T00:00:00.000Z" }));
    await setup(); await phaseA.initialize();
    expect((await phaseA.clubs()).map((item) => item.name)).toContain("نادي الوليدية");
    expect((await phaseA.belts()).map((item) => item.name)).toContain("أبيض");
    const suggested = await phaseA.suggestion({ birthYear: underNineYear, gender: "ذكر" });
    expect(suggested.ageCategory).toBe("تحت 9");
    expect(suggested.group?.ageGroupKey).toBe("تحت 9");
  });

  it("PHASE-A-001B: يربط اللاعب القديم بالمجموعة الموروثة عندما تكون فئتها مؤكدة", async () => {
    const underNineYear = new Date().getFullYear() - 8;
    storage.setItem("judo:player:4", JSON.stringify({ id: 4, name: "لاعب مجموعة قديمة", membershipNo: "G-4", gender: "ذكر", birthYear: underNineYear, status: "مقيد", groupName: "الناشئون أ", createdAt: "2026-01-01T00:00:00.000Z" }));
    await setup(); await phaseA.initialize();
    const player = (await offlineApp.players())[0]!;
    expect(player.groupName).toBe("الناشئون أ");
    expect(player.trainingGroupId).toBeTypeOf("number");
    expect((await phaseA.groups()).find((group) => group.id === player.trainingGroupId)?.ageGroupKey).toBe("تحت 9");
  });

  it("PHASE-A-001C: يحيل المجموعة القديمة المختلطة الفئات للمراجعة من دون ربط تلقائي", async () => {
    const year = new Date().getFullYear();
    storage.setItem("judo:player:8", JSON.stringify({ id: 8, name: "لاعب فئة صغرى", membershipNo: "G-8", gender: "ذكر", birthYear: year - 8, status: "مقيد", groupName: "مجموعة مختلطة", createdAt: "2026-01-01T00:00:00.000Z" }));
    storage.setItem("judo:player:9", JSON.stringify({ id: 9, name: "لاعب فئة أكبر", membershipNo: "G-9", gender: "ذكر", birthYear: year - 10, status: "مقيد", groupName: "مجموعة مختلطة", createdAt: "2026-01-01T00:00:00.000Z" }));
    await setup(); await phaseA.initialize();
    const migrated = await offlineApp.players(); const review = (await phaseA.reviews()).find((item) => item.entity === "trainingGroup" && item.sourceValue === "مجموعة مختلطة");
    expect(migrated.every((player) => player.groupName === "مجموعة مختلطة" && !player.trainingGroupId)).toBe(true);
    expect(review).toMatchObject({ entity: "trainingGroup", status: "pending" });
  });

  it("PHASE-A-002: يمنع تكرار النادي المكافئ كتابيًا ويحافظ على أرشفة واستعادة اللاعب", async () => {
    await setup(); await phaseA.initialize();
    await phaseA.saveClub({ name: "نادي الوليدية" });
    await expect(phaseA.saveClub({ name: "الوليديه" })).rejects.toThrow("يوجد نادٍ فعّال");
    const player = await offlineApp.savePlayer({ name: "لاعب أرشيف", gender: "ذكر", birthYear: 2012, status: "active" });
    await phaseA.archivePlayer(player.id!); expect(await offlineApp.players()).toHaveLength(0);
    await phaseA.restorePlayer(player.id!); expect((await offlineApp.players())[0]?.name).toBe("لاعب أرشيف");
  });

  it("PHASE-A-003: يستعيد المعيار المرجعي ويؤرشف المعيار الإداري المتداخل دون فقد السجل", async () => {
    await setup(); await phaseA.initialize();
    const target = (await offlineApp.standards()).find((item) => item.testId === 1 && item.gender === "ذكر" && item.ageCategory === "تحت 9")!;
    await offlineApp.deleteStandard(target.id!);
    await offlineApp.saveStandard({ ...target, id: undefined, source: "admin", isActive: true });
    const restored = await phaseA.restoreDefaults({ testId: 1, gender: "ذكر", ageCategory: "تحت 9" });
    expect(restored.restored).toBeGreaterThan(0); expect(restored.archived).toBeGreaterThan(0);
    const matching = (await offlineApp.standards()).filter((item) => item.testId === 1 && item.gender === "ذكر" && item.ageCategory === "تحت 9");
    expect(matching.some((item) => item.source === "reference" && item.isActive)).toBe(true);
    expect(matching.some((item) => item.source === "admin" && !item.isActive)).toBe(true);
  });

  it("PHASE-A-004: تؤرشف النتيجة وتستبعد من المؤشرات ثم تستعاد دون فقدها", async () => {
    await setup(); await phaseA.initialize();
    const player = await offlineApp.savePlayer({ name: "لاعب نتيجة", gender: "ذكر", birthYear: 2017, status: "active" });
    const recorded = await offlineApp.recordResult({ playerId: player.id!, testId: 1, value: 22 });
    await phaseA.archiveResult(recorded.result.id!); expect(await offlineApp.results(player.id!)).toHaveLength(0);
    await phaseA.restoreResult(recorded.result.id!); expect(await offlineApp.results(player.id!)).toHaveLength(1);
  });
});
