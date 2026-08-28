import { boolean, double, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const accountRole = mysqlEnum("accountRole", ["ADMIN", "COACH", "PLAYER"]);

/** حسابات المنصة المحلية/المركزية، منفصلة عن معرفات OAuth المدمجة في القالب. */
export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  displayName: varchar("displayName", { length: 160 }).notNull(),
  passwordHash: varchar("passwordHash", { length: 512 }).notNull(),
  role: accountRole.notNull(),
  playerId: int("playerId"),
  isActive: boolean("isActive").default(true).notNull(),
  mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn"),
}, (table) => [uniqueIndex("accounts_player_id_unique").on(table.playerId)]);

/** مفاتيح نظام مركزية؛ لا تحفظ أسرارًا أو كلمات مرور. */
export const accountSettings = mysqlTable("accountSettings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

/** سجل مركزي محدود للاعب، يحتفظ به مستقلاً عن رقم IndexedDB المحلي والبيانات المؤقتة على الجهاز. */
export const playerProfiles = mysqlTable("playerProfiles", {
  id: int("id").autoincrement().primaryKey(),
  syncId: varchar("syncId", { length: 64 }).notNull(),
  sourceDeviceId: varchar("sourceDeviceId", { length: 128 }),
  sourceLocalId: int("sourceLocalId"),
  name: varchar("name", { length: 160 }).notNull(),
  gender: mysqlEnum("gender", ["ذكر", "أنثى"]).notNull(),
  birthYear: int("birthYear").notNull(),
  snapshot: text("snapshot").notNull(),
  createdByAccountId: int("createdByAccountId").notNull(),
  updatedByAccountId: int("updatedByAccountId").default(0).notNull(),
  revision: int("revision").default(1).notNull(),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("player_profiles_sync_id_unique").on(table.syncId), index("player_profiles_created_by_idx").on(table.createdByAccountId)]);

/** نتائج لاعب مركزية تُقرأ دائمًا عبر نطاق السجل المصرح به، لا عبر رقم لاعب مرسل من العميل. */
export const playerResults = mysqlTable("playerResults", {
  id: int("id").autoincrement().primaryKey(),
  syncId: varchar("syncId", { length: 64 }).notNull(),
  playerProfileId: int("playerProfileId").notNull(),
  sourceLocalId: int("sourceLocalId"),
  testId: int("testId").notNull(),
  value: double("value").notNull(),
  score: double("score"),
  rating: varchar("rating", { length: 32 }),
  date: varchar("date", { length: 10 }).notNull(),
  notes: text("notes"),
  snapshot: text("snapshot"),
  deletedAt: timestamp("deletedAt"),
  createdByAccountId: int("createdByAccountId").default(0).notNull(),
  updatedByAccountId: int("updatedByAccountId").default(0).notNull(),
  revision: int("revision").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("player_results_sync_id_unique").on(table.syncId), index("player_results_profile_date_idx").on(table.playerProfileId, table.date)]);

export const attendanceStatus = mysqlEnum("attendanceStatus", ["present", "absent", "injured", "excused"]);
/** حضور مركزي متصل بسجل اللاعب لا بالرقم المحلي؛ يحتفظ بالسجل والنسخة عند التعارض. */
export const playerAttendances = mysqlTable("playerAttendances", {
  id: int("id").autoincrement().primaryKey(),
  syncId: varchar("syncId", { length: 64 }).notNull(),
  playerProfileId: int("playerProfileId").notNull(),
  sourceLocalId: int("sourceLocalId"),
  date: varchar("date", { length: 10 }).notNull(),
  season: varchar("season", { length: 32 }).notNull(),
  month: varchar("month", { length: 10 }).notNull(),
  club: varchar("club", { length: 160 }).notNull(),
  status: attendanceStatus.notNull(),
  notes: text("notes"),
  snapshot: text("snapshot"),
  createdByAccountId: int("createdByAccountId").default(0).notNull(),
  updatedByAccountId: int("updatedByAccountId").default(0).notNull(),
  revision: int("revision").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("player_attendances_sync_id_unique").on(table.syncId), index("player_attendances_profile_date_idx").on(table.playerProfileId, table.date)]);

export const testSessionStatus = mysqlEnum("testSessionStatus", ["draft", "active", "completed"]);
/** جلسة مركزية تحفظ المشاركين بمعرّفات ملفاتهم المركزية، لا بأرقام IndexedDB. */
export const centralTestSessions = mysqlTable("centralTestSessions", {
  id: int("id").autoincrement().primaryKey(),
  syncId: varchar("syncId", { length: 64 }).notNull(),
  sourceLocalId: int("sourceLocalId"),
  testId: int("testId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  playerProfileIds: text("playerProfileIds").notNull(),
  batchSize: int("batchSize").notNull(),
  currentBatch: int("currentBatch").notNull(),
  status: testSessionStatus.notNull(),
  snapshot: text("snapshot"),
  createdByAccountId: int("createdByAccountId").default(0).notNull(),
  updatedByAccountId: int("updatedByAccountId").default(0).notNull(),
  revision: int("revision").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("central_test_sessions_sync_id_unique").on(table.syncId), index("central_test_sessions_date_idx").on(table.date)]);

export type PlayerAttendance = typeof playerAttendances.$inferSelect;
export type InsertPlayerAttendance = typeof playerAttendances.$inferInsert;
export type CentralTestSession = typeof centralTestSessions.$inferSelect;
export type InsertCentralTestSession = typeof centralTestSessions.$inferInsert;

/** نطاق مدرب صريح؛ لا يمنح حساب COACH الوصول إلى لاعب بمجرد معرف محلي أو تعديل رابط الطلب. */
export const coachPlayerAssignments = mysqlTable("coachPlayerAssignments", {
  id: int("id").autoincrement().primaryKey(),
  coachAccountId: int("coachAccountId").notNull(),
  playerProfileId: int("playerProfileId").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  assignedByAccountId: int("assignedByAccountId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("coach_player_assignment_unique").on(table.coachAccountId, table.playerProfileId), index("coach_player_assignment_profile_idx").on(table.playerProfileId)]);

export type PlayerProfile = typeof playerProfiles.$inferSelect;
export type InsertPlayerProfile = typeof playerProfiles.$inferInsert;
export type PlayerResult = typeof playerResults.$inferSelect;
export type InsertPlayerResult = typeof playerResults.$inferInsert;

/** سجل عمليات غير حساس وقابل للمراجعة؛ يُمنع فيه إدراج كلمات المرور والرموز والأسرار. */
export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  actorAccountId: int("actorAccountId").notNull(),
  action: varchar("action", { length: 96 }).notNull(),
  entity: varchar("entity", { length: 64 }).notNull(),
  entitySyncId: varchar("entitySyncId", { length: 64 }),
  metadata: text("metadata").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("audit_logs_actor_created_idx").on(table.actorAccountId, table.createdAt), index("audit_logs_entity_sync_idx").on(table.entity, table.entitySyncId)]);

/** تعارضات المزامنة تحفظ نسختي العميل والخادم؛ لا تستبدل نتيجة اختبار أو سجلًا متنازعًا عليه بصمت. */
export const syncConflictStatus = mysqlEnum("syncConflictStatus", ["PENDING", "KEEP_LOCAL", "KEEP_REMOTE", "MERGED"]);
export const syncConflicts = mysqlTable("syncConflicts", {
  id: int("id").autoincrement().primaryKey(),
  entity: varchar("entity", { length: 64 }).notNull(),
  syncId: varchar("syncId", { length: 64 }).notNull(),
  playerProfileId: int("playerProfileId"),
  localPayload: text("localPayload").notNull(),
  remotePayload: text("remotePayload").notNull(),
  status: syncConflictStatus.default("PENDING").notNull(),
  detectedByAccountId: int("detectedByAccountId").notNull(),
  resolvedByAccountId: int("resolvedByAccountId"),
  resolutionNote: text("resolutionNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
}, (table) => [index("sync_conflicts_status_idx").on(table.status, table.createdAt), index("sync_conflicts_entity_sync_idx").on(table.entity, table.syncId)]);

export type AuditLog = typeof auditLogs.$inferSelect;
export type SyncConflict = typeof syncConflicts.$inferSelect;
