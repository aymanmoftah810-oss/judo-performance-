import { REFERENCE_TESTS } from "@/data/referenceCatalog";
import { STANDARDS_SEED_BY_TEST_NAME_AR, FINAL_GRADE_SEED } from "@/data/referenceStandards";
import type { AgeCategory, AgeGroupRule, AttendanceRecord, Belt, Club, MigrationReview, Player, Standard, TestDefinition, TestResult, TestSession, TrainingGroup } from "@/domain/types";

export const DB_NAME = "judo-performance-offline";
export const DB_VERSION = 3;
export const STORES = ["players", "tests", "standards", "testResults", "attendance", "sessions", "syncQueue", "settings", "legacyGroups", "clubs", "belts", "ageGroupRules", "trainingGroups", "migrationReviews", "syncConflicts"] as const;
export type StoreName = (typeof STORES)[number];

type Setting<T> = { key: string; value: T };
type LegacyGroup = { id?: number; name?: string };

const request = <T>(source: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  source.onsuccess = () => resolve(source.result);
  source.onerror = () => reject(source.error ?? new Error("تعذر تنفيذ عملية قاعدة البيانات المحلية"));
});

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error("فشلت عملية قاعدة البيانات المحلية"));
  transaction.onabort = () => reject(transaction.error ?? new Error("ألغيت عملية قاعدة البيانات المحلية"));
});

let databasePromise: Promise<IDBDatabase> | null = null;
let activeScope = "legacy";
const activeDatabaseName = () => activeScope === "legacy" ? DB_NAME : `${DB_NAME}-${activeScope}`;
const openedDatabaseNames = new Set<string>([DB_NAME]);

export async function setOfflineDatabaseScope(scope: string | null | undefined) {
  const nextScope = scope?.trim() || "legacy";
  if (nextScope === activeScope) return;
  if (databasePromise) {
    try { (await databasePromise).close(); } catch { /* no existing local connection */ }
  }
  databasePromise = null;
  activeScope = nextScope;
  openedDatabaseNames.add(activeDatabaseName());
}

export function getOfflineDatabaseScope() { return activeScope; }

function openNamedDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name, DB_VERSION);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error("تعذر فتح قاعدة البيانات المحلية"));
  });
}

export function getDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  openedDatabaseNames.add(activeDatabaseName());
  databasePromise = new Promise((resolve, reject) => {
    const open = indexedDB.open(activeDatabaseName(), DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      const ensure = (name: StoreName, options: IDBObjectStoreParameters) => {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, options);
      };
      ensure("players", { keyPath: "id", autoIncrement: true });
      ensure("tests", { keyPath: "id" });
      ensure("standards", { keyPath: "id", autoIncrement: true });
      ensure("testResults", { keyPath: "id", autoIncrement: true });
      ensure("attendance", { keyPath: "id", autoIncrement: true });
      ensure("sessions", { keyPath: "id", autoIncrement: true });
      ensure("syncQueue", { keyPath: "id", autoIncrement: true });
      ensure("settings", { keyPath: "key" });
      ensure("legacyGroups", { keyPath: "id", autoIncrement: true });
      ensure("clubs", { keyPath: "id", autoIncrement: true });
      ensure("belts", { keyPath: "id", autoIncrement: true });
      ensure("ageGroupRules", { keyPath: "id", autoIncrement: true });
      ensure("trainingGroups", { keyPath: "id", autoIncrement: true });
      ensure("migrationReviews", { keyPath: "id", autoIncrement: true });
      ensure("syncConflicts", { keyPath: "id", autoIncrement: true });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error("تعذر فتح IndexedDB"));
  });
  return databasePromise;
}

export async function list<T>(storeName: StoreName): Promise<T[]> {
  const db = await getDatabase();
  const tx = db.transaction(storeName, "readonly");
  const items = await request(tx.objectStore(storeName).getAll()) as T[];
  await transactionDone(tx);
  return items;
}

export async function get<T>(storeName: StoreName, id: IDBValidKey): Promise<T | undefined> {
  const db = await getDatabase();
  const tx = db.transaction(storeName, "readonly");
  const item = await request(tx.objectStore(storeName).get(id)) as T | undefined;
  await transactionDone(tx);
  return item;
}

export async function put<T>(storeName: StoreName, value: T): Promise<IDBValidKey> {
  const db = await getDatabase();
  const tx = db.transaction(storeName, "readwrite");
  const record = value && typeof value === "object" && "id" in (value as object) && (value as { id?: unknown }).id === undefined
    ? (() => { const { id: _unused, ...withoutId } = value as T & { id?: unknown }; return withoutId; })()
    : value;
  const key = await request(tx.objectStore(storeName).put(record));
  await transactionDone(tx);
  return key;
}

export async function remove(storeName: StoreName, id: IDBValidKey): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(storeName, "readwrite");
  await request(tx.objectStore(storeName).delete(id));
  await transactionDone(tx);
}

export async function replaceStore<T>(storeName: StoreName, items: T[]): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  await request(store.clear());
  for (const item of items) await request(store.put(item));
  await transactionDone(tx);
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await get<Setting<T>>("settings", key))?.value;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await put("settings", { key, value } satisfies Setting<T>);
}

async function listFromDatabase<T>(database: IDBDatabase, storeName: StoreName): Promise<T[]> {
  if (!database.objectStoreNames.contains(storeName)) return [];
  const tx = database.transaction(storeName, "readonly");
  const items = await request(tx.objectStore(storeName).getAll()) as T[];
  await transactionDone(tx);
  return items;
}

/** تنقل البيانات التاريخية إلى نطاق المدير الفارغ مرة واحدة، دون دمج بيانات حسابات أو طوابير مزامنة مختلفة. */
export async function adoptLegacyDataIntoCurrentScope(): Promise<boolean> {
  if (activeScope === "legacy") return false;
  const current = await getDatabase();
  if ((await listFromDatabase<Player>(current, "players")).length > 0) return false;
  const legacy = await openNamedDatabase(DB_NAME);
  try {
    if ((await listFromDatabase<Player>(legacy, "players")).length === 0) return false;
    for (const store of STORES) {
      if (store === "syncQueue") continue;
      const rows = await listFromDatabase<Record<string, unknown>>(legacy, store);
      if (!rows.length) continue;
      await replaceStore(store, store === "settings" ? rows.filter((row) => row.key !== "userId") : rows);
    }
    return true;
  } finally { legacy.close(); }
}

function now() { return new Date().toISOString(); }
const syncId = () => crypto.randomUUID?.() ?? `sync-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function normalizeReferenceName(value: string, kind: "club" | "belt") {
  const basic = value.trim().toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[ً-ْ]/g, "").replace(/\s+/g, " ");
  return kind === "club" ? basic.replace(/^نادي\s+/, "") : basic.replace(/^الحزام\s+/, "");
}

const ageGroupSeeds: Array<Omit<AgeGroupRule, "id" | "syncId" | "createdAt" | "updatedAt" | "archivedAt">> = [
  { key: "تحت 9", name: "تحت 9", gender: "الكل", minAge: 0, maxAge: 8, isActive: true, source: "reference" },
  { key: "تحت 11", name: "تحت 11", gender: "الكل", minAge: 9, maxAge: 10, isActive: true, source: "reference" },
  { key: "تحت 13", name: "تحت 13", gender: "الكل", minAge: 11, maxAge: 12, isActive: true, source: "reference" },
  { key: "تحت 15", name: "تحت 15", gender: "الكل", minAge: 13, maxAge: 14, isActive: true, source: "reference" },
  { key: "تحت 17", name: "تحت 17", gender: "الكل", minAge: 15, maxAge: 16, isActive: true, source: "reference" },
  { key: "رجال", name: "رجال", gender: "ذكر", minAge: 17, maxAge: 120, isActive: true, source: "reference" },
  { key: "آنسات", name: "آنسات", gender: "أنثى", minAge: 17, maxAge: 120, isActive: true, source: "reference" },
];

async function migrateReferenceItems(kind: "club" | "belt") {
  const completed = await getSetting<boolean>(`migration:references:${kind}:v1`);
  if (completed) return;
  const players = await list<Player>("players");
  const store = kind === "club" ? "clubs" : "belts";
  const existing = await list<Club | Belt>(store);
  const exact = new Map(existing.map((item) => [item.name, item]));
  const canonical = new Map<string, Array<Club | Belt>>();
  existing.forEach((item) => canonical.set(item.normalizedName, [...(canonical.get(item.normalizedName) ?? []), item]));
  for (const player of players) {
    const raw = (kind === "club" ? player.club : player.belt)?.trim();
    if (!raw) continue;
    let item = exact.get(raw);
    if (!item) {
      const normalizedName = normalizeReferenceName(raw, kind);
      const candidates = canonical.get(normalizedName) ?? [];
      const created = {
        syncId: syncId(), name: raw, normalizedName, isActive: true, source: "migrated" as const, createdAt: now(), updatedAt: now(), archivedAt: null,
        ...(kind === "belt" ? { sortOrder: existing.length + 1 } : {}),
      };
      const id = Number(await put(store, created));
      item = { ...created, id } as Club | Belt;
      existing.push(item);
      exact.set(raw, item);
      canonical.set(normalizedName, [...candidates, item]);
      if (candidates.length) await put("migrationReviews", { entity: kind, sourceValue: raw, normalizedValue: normalizedName, candidateIds: candidates.map((candidate) => candidate.id!).filter(Boolean), status: "pending", createdAt: now() } satisfies MigrationReview);
    }
    const field = kind === "club" ? "clubId" : "beltId";
    if (player[field] !== item.id) await put("players", { ...player, [field]: item.id, updatedAt: now() });
  }
  await setSetting(`migration:references:${kind}:v1`, true);
}

async function initializeAgeGroupsAndTrainingGroups() {
  if (!(await getSetting<boolean>("migration:ageGroups:v1"))) {
    const rules = await list<AgeGroupRule>("ageGroupRules");
    for (const seed of ageGroupSeeds) if (!rules.some((rule) => rule.key === seed.key && rule.gender === seed.gender)) await put("ageGroupRules", { ...seed, syncId: syncId(), createdAt: now(), updatedAt: now(), archivedAt: null });
    await setSetting("migration:ageGroups:v1", true);
  }
  if (!(await getSetting<boolean>("migration:trainingGroups:v1"))) {
    const groups = await list<TrainingGroup>("trainingGroups");
    const rules = await list<AgeGroupRule>("ageGroupRules");
    for (const rule of rules.filter((item) => item.isActive)) if (!groups.some((group) => group.ageGroupKey === rule.key && group.clubId === null && group.isAutoSuggested)) await put("trainingGroups", { syncId: syncId(), name: `مجموعة ${rule.name}`, ageGroupKey: rule.key, clubId: null, coachUserId: null, maxPlayers: null, isAutoSuggested: true, isActive: true, createdAt: now(), updatedAt: now(), archivedAt: null });
    await setSetting("migration:trainingGroups:v1", true);
  }
}

function getProtocol(test: TestDefinition, ageCategory: string) {
  return {
    executionType: test.protocol.executionType,
    executionUnit: test.protocol.executionUnit,
    executionTime: test.protocol.timeByAgeCategory?.[ageCategory as keyof NonNullable<typeof test.protocol.timeByAgeCategory>] ?? test.protocol.executionTime,
    attempts: test.protocol.attempts,
    sourceStatus: test.protocol.sourceStatus,
  };
}

function flattenReferenceStandards(tests: TestDefinition[]): Standard[] {
  const timestamp = now();
  const byName = new Map(tests.map((test) => [test.nameAr, test]));
  const flattened: Standard[] = [];
  for (const [testName, byGender] of Object.entries(STANDARDS_SEED_BY_TEST_NAME_AR as Record<string, Record<string, Record<string, Array<{ min: number; max: number; grade: Standard["grade"]; score: number }>>>>)) {
    const test = byName.get(testName);
    if (!test) continue;
    for (const [gender, byAge] of Object.entries(byGender)) {
      for (const [ageCategory, brackets] of Object.entries(byAge)) {
        const protocol = getProtocol(test, ageCategory);
        for (const bracket of brackets) {
          flattened.push({
            standardSetId: `${test.id}:${gender}:${ageCategory}`,
            testId: test.id,
            gender: gender as Standard["gender"],
            ageCategory: ageCategory as Standard["ageCategory"],
            min: bracket.min,
            max: bracket.max,
            grade: bracket.grade,
            score: bracket.score,
            executionType: protocol.executionType,
            executionUnit: protocol.executionUnit,
            executionTime: protocol.executionTime,
            attempts: protocol.attempts,
            isActive: true,
            source: "reference",
            sourceStatus: protocol.sourceStatus,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        }
      }
    }
  }
  return flattened;
}

function readLegacyJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function legacyEntries(prefix: string) {
  const rows: unknown[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(prefix)) {
      const value = readLegacyJson(key);
      if (value) rows.push(value);
    }
  }
  return rows;
}

function legacyStatus(status: unknown): "active" | "new" | "suspended" {
  if (status === "مقيد") return "active";
  if (status === "حديث") return "new";
  if (status === "متوقف") return "suspended";
  return status === "new" || status === "suspended" ? status : "active";
}

async function migrateFromLocalStorage() {
  if (await getSetting<boolean>("migration:localStorage:v2")) return { migrated: false, counts: {} };
  const legacyGroups = legacyEntries("judo:group:") as LegacyGroup[];
  const groupById = new Map(legacyGroups.map((group) => [group.id, group.name ?? ""]));
  const legacyPlayers = legacyEntries("judo:player:") as Array<Record<string, unknown>>;
  const mappings: Array<[string, StoreName]> = [
    ["judo:test:", "tests"], ["judo:standard:", "standards"], ["judo:testresult:", "testResults"], ["judo:attendance:", "attendance"],
  ];
  const counts: Record<string, number> = {};
  if ((await list("players")).length === 0 && legacyPlayers.length) {
    for (const raw of legacyPlayers) {
      const groupId = Number(raw.groupId ?? 0);
      await put("players", {
        ...raw,
        status: legacyStatus(raw.status),
        groupName: groupById.get(groupId) ?? String(raw.groupName ?? ""),
        playerCode: raw.playerCode ?? raw.membershipNo ?? "",
        address: raw.address ?? "",
        joinDate: raw.joinDate ?? String(raw.createdAt ?? "").slice(0, 10),
        deletedAt: raw.deletedAt ?? null,
      });
    }
    counts.players = legacyPlayers.length;
  }
  for (const [prefix, target] of mappings) {
    const rows = legacyEntries(prefix);
    if ((await list(target)).length === 0 && rows.length) {
      for (const row of rows) await put(target, row);
      counts[target] = rows.length;
    }
  }
  if (legacyGroups.length && (await list("legacyGroups")).length === 0) {
    for (const group of legacyGroups) await put("legacyGroups", group);
    counts.groups = legacyGroups.length;
  }
  await setSetting("migration:localStorage:v2", { completedAt: now(), counts });
  return { migrated: Object.keys(counts).length > 0, counts };
}

async function ensurePlayerSyncIds() {
  const players = await list<Player>("players");
  for (const player of players) {
    if (!player.syncId || player.serverProfileId === undefined) await put("players", { ...player, syncId: player.syncId ?? syncId(), serverProfileId: player.serverProfileId ?? null, updatedAt: now() });
  }
}

async function ensureResultSyncIds() {
  const results = await list<TestResult>("testResults");
  for (const result of results) if (!result.syncId || result.syncRevision === undefined) await put("testResults", { ...result, syncId: result.syncId ?? syncId(), syncRevision: result.syncRevision ?? 0 });
}

async function ensureAttendanceAndSessionSyncIds() {
  const [attendance, sessions] = await Promise.all([list<AttendanceRecord>("attendance"), list<TestSession>("sessions")]);
  for (const record of attendance) if (!record.syncId || record.syncRevision === undefined) await put("attendance", { ...record, syncId: record.syncId ?? syncId(), syncRevision: record.syncRevision ?? 0, createdByAccountId: record.createdByAccountId ?? null, updatedByAccountId: record.updatedByAccountId ?? null });
  for (const session of sessions) if (!session.syncId || session.syncRevision === undefined) await put("sessions", { ...session, syncId: session.syncId ?? syncId(), syncRevision: session.syncRevision ?? 0, createdByAccountId: session.createdByAccountId ?? null, updatedByAccountId: session.updatedByAccountId ?? null });
}

async function enrichLegacyStandards(tests: TestDefinition[]) {
  const standards = await list<Standard>("standards");
  if (!standards.length) {
    for (const standard of flattenReferenceStandards(tests)) await put("standards", standard);
    return;
  }
  const testById = new Map(tests.map((test) => [test.id, test]));
  for (const standard of standards) {
    const test = testById.get(standard.testId);
    if (!test) continue;
    const protocol = getProtocol(test, standard.ageCategory);
    await put("standards", {
      ...standard,
      standardSetId: standard.standardSetId ?? `${standard.testId}:${standard.gender}:${standard.ageCategory}`,
      executionType: standard.executionType ?? protocol.executionType,
      executionUnit: standard.executionUnit ?? protocol.executionUnit,
      executionTime: standard.executionTime ?? protocol.executionTime,
      attempts: standard.attempts ?? protocol.attempts,
      isActive: standard.isActive ?? true,
      source: standard.source ?? "reference",
      sourceStatus: standard.sourceStatus ?? protocol.sourceStatus,
      updatedAt: standard.updatedAt ?? now(),
      createdAt: standard.createdAt ?? now(),
    });
  }
}

export async function initializeOfflineDatabase() {
  const migration = await migrateFromLocalStorage();
  await ensurePlayerSyncIds();
  await ensureResultSyncIds();
  await ensureAttendanceAndSessionSyncIds();
  const existingTests = await list<TestDefinition>("tests");
  const testByName = new Map(existingTests.map((test) => [test.nameAr, test]));
  for (const reference of REFERENCE_TESTS) {
    const existing = testByName.get(reference.nameAr);
    await put("tests", existing ? { ...reference, ...existing, protocol: reference.protocol } : reference);
  }
  const tests = await list<TestDefinition>("tests");
  await enrichLegacyStandards(tests);
  await migrateReferenceItems("club");
  await migrateReferenceItems("belt");
  await initializeAgeGroupsAndTrainingGroups();
  if (!(await getSetting("reference:finalGrades"))) await setSetting("reference:finalGrades", FINAL_GRADE_SEED);
  if (!(await getSetting("deviceId"))) {
    const raw = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await setSetting("deviceId", `device-${raw}`);
  }
  await setSetting("userId", "local-user");
  return { migration, standards: (await list("standards")).length, tests: (await list("tests")).length };
}

export async function exportOfflineDatabase() {
  const payload: Record<string, unknown> = {};
  for (const store of STORES) payload[store] = await list(store);
  return { version: 1, exportedAt: now(), database: DB_NAME, payload };
}

export async function importOfflineDatabase(backup: { payload?: Partial<Record<StoreName, unknown[]>> }) {
  if (!backup?.payload) throw new Error("ملف النسخة الاحتياطية غير صالح");
  for (const store of STORES) {
    const items = backup.payload[store];
    if (Array.isArray(items)) await replaceStore(store, items);
  }
  return initializeOfflineDatabase();
}

export async function resetOfflineDatabaseForTests() {
  if (databasePromise) {
    try { (await databasePromise).close(); } catch { /* no open connection */ }
  }
  databasePromise = null;
  activeScope = "legacy";
  const namesToDelete = Array.from(openedDatabaseNames);
  openedDatabaseNames.clear();
  openedDatabaseNames.add(DB_NAME);
  await Promise.all(namesToDelete.map((databaseName) => new Promise<void>((resolve, reject) => {
    const deletion = indexedDB.deleteDatabase(databaseName);
    deletion.onsuccess = () => resolve();
    deletion.onerror = () => reject(deletion.error ?? new Error("تعذر حذف قاعدة الاختبار"));
    deletion.onblocked = () => reject(new Error(`تعذر عزل قاعدة الاختبار المفتوحة: ${databaseName}`));
  })));
}
