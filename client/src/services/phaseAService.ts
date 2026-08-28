import { STANDARDS_SEED_BY_TEST_NAME_AR } from "@/data/referenceStandards";
import { getAge, getAgeCategory } from "@/services/evaluation";
import { getSetting, list, normalizeReferenceName, put, setSetting } from "@/storage/localDatabase";
import type { AgeCategory, AgeGroupRule, Belt, Club, MigrationReview, Player, Standard, SyncQueueItem, TestDefinition, TestResult, TrainingGroup } from "@/domain/types";

const now = () => new Date().toISOString();
const makeSyncId = () => crypto.randomUUID?.() ?? `sync-${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function queue(operation: string, entity: string, recordId: number | string, payload: Record<string, unknown>) {
  const deviceId = await getSetting<string>("deviceId") ?? "device-uninitialized";
  const userId = await getSetting<string>("userId") ?? "local-user";
  await put("syncQueue", { operation, entity, recordId: String(recordId), timestamp: now(), deviceId, userId, status: "Pending", payload } satisfies SyncQueueItem);
}

const ageSeeds: Array<Omit<AgeGroupRule, "id" | "syncId" | "createdAt" | "updatedAt" | "archivedAt">> = [
  { key: "تحت 9", name: "تحت 9", gender: "الكل", minAge: 0, maxAge: 8, isActive: true, source: "reference" },
  { key: "تحت 11", name: "تحت 11", gender: "الكل", minAge: 9, maxAge: 10, isActive: true, source: "reference" },
  { key: "تحت 13", name: "تحت 13", gender: "الكل", minAge: 11, maxAge: 12, isActive: true, source: "reference" },
  { key: "تحت 15", name: "تحت 15", gender: "الكل", minAge: 13, maxAge: 14, isActive: true, source: "reference" },
  { key: "تحت 17", name: "تحت 17", gender: "الكل", minAge: 15, maxAge: 16, isActive: true, source: "reference" },
  { key: "رجال", name: "رجال", gender: "ذكر", minAge: 17, maxAge: 120, isActive: true, source: "reference" },
  { key: "آنسات", name: "آنسات", gender: "أنثى", minAge: 17, maxAge: 120, isActive: true, source: "reference" },
];

function referenceRows(tests: TestDefinition[]): Standard[] {
  const testByName = new Map(tests.map((test) => [test.nameAr, test])); const timestamp = now(); const output: Standard[] = [];
  for (const [testName, byGender] of Object.entries(STANDARDS_SEED_BY_TEST_NAME_AR as Record<string, Record<string, Record<string, Array<{ min: number; max: number; grade: Standard["grade"]; score: number }>>>>)) {
    const test = testByName.get(testName); if (!test) continue;
    for (const [gender, byAge] of Object.entries(byGender)) for (const [ageCategory, brackets] of Object.entries(byAge)) for (const bracket of brackets) {
      output.push({ standardSetId: `${test.id}:${gender}:${ageCategory}`, testId: test.id, gender: gender as Standard["gender"], ageCategory: ageCategory as AgeCategory, min: bracket.min, max: bracket.max, grade: bracket.grade, score: bracket.score, executionType: test.protocol.executionType, executionUnit: test.protocol.executionUnit, executionTime: test.protocol.timeByAgeCategory?.[ageCategory as AgeCategory] ?? test.protocol.executionTime, attempts: test.protocol.attempts, isActive: true, source: "reference", sourceStatus: test.protocol.sourceStatus, createdAt: timestamp, updatedAt: timestamp });
    }
  }
  return output;
}

function validationName(name: string, kind: "club" | "belt") {
  const text = name.trim(); if (!text) throw new Error(kind === "club" ? "أدخل اسم النادي" : "أدخل اسم الحزام"); return { name: text, normalizedName: normalizeReferenceName(text, kind) };
}

export const phaseA = {
  async initialize() {
    const [rules, groups] = await Promise.all([list<AgeGroupRule>("ageGroupRules"), list<TrainingGroup>("trainingGroups")]);
    for (const seed of ageSeeds) if (!rules.some((rule) => rule.key === seed.key && rule.gender === seed.gender)) await put("ageGroupRules", { ...seed, syncId: makeSyncId(), createdAt: now(), updatedAt: now(), archivedAt: null });
    for (const seed of ageSeeds) if (!groups.some((group) => group.ageGroupKey === seed.key && group.clubId === null && group.isAutoSuggested)) await put("trainingGroups", { syncId: makeSyncId(), name: `مجموعة ${seed.name}`, ageGroupKey: seed.key, clubId: null, coachUserId: null, maxPlayers: null, isAutoSuggested: true, isActive: true, createdAt: now(), updatedAt: now(), archivedAt: null });
    await this.migrateLegacyReferences();
    await this.migrateLegacyGroups();
  },
  async migrateLegacyReferences() {
    const players = await list<Player>("players");
    for (const kind of ["club", "belt"] as const) {
      const store = kind === "club" ? "clubs" : "belts"; const all = await list<Club | Belt>(store); const exact = new Map(all.map((item) => [item.name, item]));
      for (const player of players) {
        const raw = String(kind === "club" ? player.club ?? "" : player.belt ?? "").trim(); if (!raw) continue;
        let item = exact.get(raw);
        if (!item) {
          const normalizedName = normalizeReferenceName(raw, kind); const candidates = all.filter((candidate) => candidate.normalizedName === normalizedName);
          const created = { syncId: makeSyncId(), name: raw, normalizedName, isActive: true, source: "migrated" as const, createdAt: now(), updatedAt: now(), archivedAt: null, ...(kind === "belt" ? { sortOrder: all.length + 1 } : {}) };
          const id = Number(await put(store, created)); item = { ...created, id } as Club | Belt; all.push(item); exact.set(raw, item);
          if (candidates.length) await put("migrationReviews", { entity: kind, sourceValue: raw, normalizedValue: normalizedName, candidateIds: candidates.map((candidate) => candidate.id!).filter(Boolean), status: "pending", createdAt: now() } satisfies MigrationReview);
        }
        const patch = kind === "club" ? { clubId: item.id } : { beltId: item.id }; if ((kind === "club" ? player.clubId : player.beltId) !== item.id) await put("players", { ...player, ...patch, updatedAt: now() });
      }
    }
  },
  async migrateLegacyGroups() {
    if (await getSetting<boolean>("migration:legacyTrainingGroupLinks:v1")) return;
    const [players, groups, reviews] = await Promise.all([list<Player>("players"), list<TrainingGroup>("trainingGroups"), list<MigrationReview>("migrationReviews")]);
    const legacyNames = Array.from(new Set(players.filter((player) => !player.trainingGroupId && player.groupName.trim()).map((player) => player.groupName.trim())));
    for (const name of legacyNames) {
      const members = players.filter((player) => player.groupName.trim() === name);
      const categories = Array.from(new Set(members.map((player) => getAgeCategory(getAge(player.birthYear), player.gender))));
      if (categories.length !== 1) {
        if (!reviews.some((item) => item.entity === "trainingGroup" && item.sourceValue === name)) await put("migrationReviews", { entity: "trainingGroup", sourceValue: name, normalizedValue: name, candidateIds: [], status: "pending", createdAt: now() } satisfies MigrationReview);
        continue;
      }
      let group = groups.find((item) => item.name === name && item.ageGroupKey === categories[0]);
      if (!group) {
        const value: TrainingGroup = { syncId: makeSyncId(), name, ageGroupKey: categories[0]!, clubId: null, coachUserId: null, maxPlayers: null, isAutoSuggested: false, isActive: true, createdAt: now(), updatedAt: now(), archivedAt: null };
        const id = Number(await put("trainingGroups", value)); group = { ...value, id }; groups.push(group);
      }
      for (const player of members) await put("players", { ...player, trainingGroupId: group.id, updatedAt: now() });
    }
    await setSetting("migration:legacyTrainingGroupLinks:v1", true);
  },
  async clubs(includeInactive = false) { return (await list<Club>("clubs")).filter((item) => includeInactive || (item.isActive && !item.archivedAt)).sort((a, b) => a.name.localeCompare(b.name, "ar")); },
  async belts(includeInactive = false) { return (await list<Belt>("belts")).filter((item) => includeInactive || (item.isActive && !item.archivedAt)).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ar")); },
  async ageGroups(includeInactive = false) { return (await list<AgeGroupRule>("ageGroupRules")).filter((item) => includeInactive || (item.isActive && !item.archivedAt)).sort((a, b) => a.minAge - b.minAge); },
  async groups(includeInactive = false) { return (await list<TrainingGroup>("trainingGroups")).filter((item) => includeInactive || (item.isActive && !item.archivedAt)).sort((a, b) => a.name.localeCompare(b.name, "ar")); },
  async reviews() { return (await list<MigrationReview>("migrationReviews")).filter((item) => item.status === "pending"); },
  async archivePlayer(id: number) { const item = (await list<Player>("players")).find((row) => row.id === id); if (!item) throw new Error("اللاعب غير موجود"); const value = { ...item, deletedAt: now(), updatedAt: now() }; await put("players", value); await queue("ARCHIVE_PLAYER", "player", id, value as unknown as Record<string, unknown>); return value; },
  async restorePlayer(id: number) { const item = (await list<Player>("players")).find((row) => row.id === id); if (!item?.deletedAt) throw new Error("لا يوجد لاعب مؤرشف بهذا المعرف"); const value = { ...item, deletedAt: null, updatedAt: now() }; await put("players", value); await queue("RESTORE_PLAYER", "player", id, value as unknown as Record<string, unknown>); return value; },
  async saveClub(input: Partial<Club>) {
    const all = await list<Club>("clubs"); const existing = input.id ? all.find((item) => item.id === input.id) : undefined; const normalized = validationName(input.name ?? existing?.name ?? "", "club");
    if (all.some((item) => item.id !== input.id && item.isActive && item.normalizedName === normalized.normalizedName)) throw new Error("يوجد نادٍ فعّال باسم مماثل؛ راجع قائمة الترحيل بدل إنشاء تكرار");
    const value: Club = { ...existing, ...input, ...normalized, syncId: existing?.syncId ?? makeSyncId(), isActive: input.isActive ?? existing?.isActive ?? true, source: input.source ?? existing?.source ?? "admin", createdAt: existing?.createdAt ?? now(), updatedAt: now(), archivedAt: input.isActive === false ? now() : input.archivedAt ?? existing?.archivedAt ?? null } as Club;
    const id = Number(await put("clubs", value)); const saved = { ...value, id }; await queue(existing ? "UPDATE_CLUB" : "CREATE_CLUB", "club", id, saved as unknown as Record<string, unknown>); return saved;
  },
  async saveBelt(input: Partial<Belt>) {
    const all = await list<Belt>("belts"); const existing = input.id ? all.find((item) => item.id === input.id) : undefined; const normalized = validationName(input.name ?? existing?.name ?? "", "belt");
    if (all.some((item) => item.id !== input.id && item.isActive && item.normalizedName === normalized.normalizedName)) throw new Error("يوجد حزام فعّال باسم مماثل؛ راجع قائمة الترحيل بدل إنشاء تكرار");
    const value: Belt = { ...existing, ...input, ...normalized, syncId: existing?.syncId ?? makeSyncId(), sortOrder: Number(input.sortOrder ?? existing?.sortOrder ?? all.length + 1), isActive: input.isActive ?? existing?.isActive ?? true, source: input.source ?? existing?.source ?? "admin", createdAt: existing?.createdAt ?? now(), updatedAt: now(), archivedAt: input.isActive === false ? now() : input.archivedAt ?? existing?.archivedAt ?? null } as Belt;
    const id = Number(await put("belts", value)); const saved = { ...value, id }; await queue(existing ? "UPDATE_BELT" : "CREATE_BELT", "belt", id, saved as unknown as Record<string, unknown>); return saved;
  },
  async saveAgeGroup(input: Partial<AgeGroupRule>) {
    const all = await list<AgeGroupRule>("ageGroupRules"); const existing = input.id ? all.find((item) => item.id === input.id) : undefined; const minAge = Number(input.minAge ?? existing?.minAge); const maxAge = Number(input.maxAge ?? existing?.maxAge);
    if (!input.key || !input.name || !Number.isInteger(minAge) || !Number.isInteger(maxAge) || minAge > maxAge) throw new Error("قاعدة الفئة العمرية غير صالحة");
    if (all.some((item) => item.id !== input.id && item.isActive && input.isActive !== false && item.key === input.key && item.gender === input.gender)) throw new Error("يوجد تعريف فعّال لهذه الفئة والجنس");
    const value: AgeGroupRule = { ...existing, ...input, minAge, maxAge, syncId: existing?.syncId ?? makeSyncId(), isActive: input.isActive ?? existing?.isActive ?? true, source: input.source ?? existing?.source ?? "admin", createdAt: existing?.createdAt ?? now(), updatedAt: now(), archivedAt: input.isActive === false ? now() : input.archivedAt ?? existing?.archivedAt ?? null } as AgeGroupRule;
    const id = Number(await put("ageGroupRules", value)); const saved = { ...value, id }; await queue(existing ? "UPDATE_AGE_GROUP" : "CREATE_AGE_GROUP", "ageGroupRule", id, saved as unknown as Record<string, unknown>); return saved;
  },
  async saveGroup(input: Partial<TrainingGroup>) {
    const all = await list<TrainingGroup>("trainingGroups"); const existing = input.id ? all.find((item) => item.id === input.id) : undefined; if (!input.name?.trim() || !input.ageGroupKey) throw new Error("اسم المجموعة والفئة العمرية مطلوبان");
    const value: TrainingGroup = { ...existing, ...input, name: input.name.trim(), syncId: existing?.syncId ?? makeSyncId(), clubId: input.clubId ?? existing?.clubId ?? null, coachUserId: input.coachUserId ?? existing?.coachUserId ?? null, maxPlayers: input.maxPlayers ?? existing?.maxPlayers ?? null, isAutoSuggested: input.isAutoSuggested ?? existing?.isAutoSuggested ?? false, isActive: input.isActive ?? existing?.isActive ?? true, createdAt: existing?.createdAt ?? now(), updatedAt: now(), archivedAt: input.isActive === false ? now() : input.archivedAt ?? existing?.archivedAt ?? null } as TrainingGroup;
    const id = Number(await put("trainingGroups", value)); const saved = { ...value, id }; await queue(existing ? "UPDATE_TRAINING_GROUP" : "CREATE_TRAINING_GROUP", "trainingGroup", id, saved as unknown as Record<string, unknown>); return saved;
  },
  async suggestion(player: Partial<Player>) {
    if (!player.birthYear) return { ageCategory: null, group: null }; const age = getAge(Number(player.birthYear)); const category = getAgeCategory(age, player.gender === "أنثى" ? "أنثى" : "ذكر");
    const groups = await this.groups(); const group = groups.find((item) => item.ageGroupKey === category && item.clubId === (player.clubId ?? null)) ?? groups.find((item) => item.ageGroupKey === category && item.clubId === null) ?? null;
    return { ageCategory: category, group };
  },
  async restoreDefaults(filter: { testId?: number; gender?: Standard["gender"]; ageCategory?: AgeCategory } = {}) {
    const [tests, current] = await Promise.all([list<TestDefinition>("tests"), list<Standard>("standards")]); const defaults = referenceRows(tests).filter((item) => (filter.testId === undefined || item.testId === filter.testId) && (!filter.gender || item.gender === filter.gender) && (!filter.ageCategory || item.ageCategory === filter.ageCategory));
    if (!defaults.length) throw new Error("لا توجد معايير مرجعية مطابقة للاستعادة"); let archived = 0;
    for (const reference of defaults) {
      const collisions = current.filter((item) => item.isActive && item.testId === reference.testId && item.gender === reference.gender && item.ageCategory === reference.ageCategory && Math.max(item.min, reference.min) <= Math.min(item.max, reference.max));
      for (const collision of collisions) if (!(collision.source === "reference" && collision.min === reference.min && collision.max === reference.max && collision.score === reference.score)) { await put("standards", { ...collision, isActive: false, updatedAt: now() }); archived += 1; }
      const existing = current.find((item) => item.source === "reference" && item.testId === reference.testId && item.gender === reference.gender && item.ageCategory === reference.ageCategory && item.min === reference.min && item.max === reference.max && item.score === reference.score);
      await put("standards", existing ? { ...reference, id: existing.id, createdAt: existing.createdAt } : reference);
    }
    await queue("RESTORE_DEFAULT_STANDARDS", "standard", filter.testId ?? "all", { filter, restored: defaults.length, archived }); return { restored: defaults.length, archived };
  },
  async archiveResult(id: number) { const item = (await list<TestResult>("testResults")).find((row) => row.id === id); if (!item) throw new Error("النتيجة غير موجودة"); const value = { ...item, deletedAt: now(), updatedAt: now() }; await put("testResults", value); await queue("ARCHIVE_TEST_RESULT", "testResult", id, value as unknown as Record<string, unknown>); },
  async restoreResult(id: number) { const item = (await list<TestResult>("testResults")).find((row) => row.id === id); if (!item?.deletedAt) throw new Error("لا توجد نتيجة مؤرشفة بهذا المعرف"); const value = { ...item, deletedAt: null, updatedAt: now() }; await put("testResults", value); await queue("RESTORE_TEST_RESULT", "testResult", id, value as unknown as Record<string, unknown>); },
};
