export type Gender = "ذكر" | "أنثى";
export type AgeCategory = "تحت 9" | "تحت 11" | "تحت 13" | "تحت 15" | "تحت 17" | "رجال" | "آنسات";
export type Grade = "ضعيف" | "مقبول" | "جيد" | "جيد جدًا" | "ممتاز";
export type MeasurementType = "repetitions" | "timed" | "distance" | "measurement";
export type AttendanceStatus = "present" | "absent" | "injured";

export interface Player {
  id?: number;
  /** معرّف مشاركة ثابت مستقل عن رقم IndexedDB المحلي. */
  syncId?: string;
  /** مفتاح سجل اللاعب المركزي عند تسجيله؛ لا يستخدم بدل معرّف الجهاز المحلي. */
  serverProfileId?: number | null;
  syncRevision?: number;
  createdByAccountId?: number | null;
  updatedByAccountId?: number | null;
  name: string;
  membershipNo: string;
  playerCode: string;
  gender: Gender;
  birthYear: number;
  /** معلومة اختيارية؛ لا تدخل في حساب العمر أو الفئة. */
  birthDate?: string | null;
  weight: number | null;
  belt: string;
  beltId?: number | null;
  club: string;
  clubId?: number | null;
  address: string;
  phone: string;
  status: "active" | "new" | "suspended";
  groupName: string;
  trainingGroupId?: number | null;
  joinDate: string;
  notes: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceItem {
  id?: number;
  syncId: string;
  name: string;
  normalizedName: string;
  isActive: boolean;
  source: "migrated" | "admin";
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface Club extends ReferenceItem {}

export interface Belt extends ReferenceItem {
  sortOrder: number;
}

export interface AgeGroupRule {
  id?: number;
  syncId: string;
  key: AgeCategory;
  name: AgeCategory;
  gender: Gender | "الكل";
  minAge: number;
  maxAge: number;
  isActive: boolean;
  source: "reference" | "admin";
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface TrainingGroup {
  id?: number;
  syncId: string;
  name: string;
  ageGroupKey: AgeCategory;
  clubId: number | null;
  coachUserId: string | null;
  maxPlayers: number | null;
  isAutoSuggested: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface MigrationReview {
  id?: number;
  entity: "club" | "belt" | "trainingGroup";
  sourceValue: string;
  normalizedValue: string;
  candidateIds: number[];
  status: "pending" | "resolved" | "ignored";
  createdAt: string;
}

export interface TestDefinition {
  id: number;
  key: string;
  name: string;
  nameAr: string;
  unit: string;
  measurementType: MeasurementType;
  higherIsBetter: boolean;
  active: boolean;
  description: string;
  weight: number;
  protocol: ExecutionProtocol;
}

export interface ExecutionProtocol {
  executionType: MeasurementType;
  executionUnit: string;
  executionTime: number | null;
  attempts: number;
  timeByAgeCategory?: Partial<Record<AgeCategory, number>>;
  note: string;
  sourceStatus: "documented" | "needs_admin_setup";
}

export interface Standard {
  id?: number;
  standardSetId: string;
  testId: number;
  gender: Gender;
  ageCategory: AgeCategory;
  min: number;
  max: number;
  grade: Grade;
  score: number;
  executionType: MeasurementType;
  executionUnit: string;
  executionTime: number | null;
  attempts: number;
  isActive: boolean;
  source: "reference" | "admin";
  sourceStatus: "documented" | "needs_admin_setup";
  createdAt: string;
  updatedAt: string;
}

export interface TestResult {
  id?: number;
  syncId?: string;
  syncRevision?: number;
  playerId: number;
  testId: number;
  sessionId?: number | null;
  value: number;
  score: number | null;
  rating: Grade | null;
  achievement?: number | null;
  date: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface AttendanceRecord {
  id?: number;
  syncId?: string;
  syncRevision?: number;
  createdByAccountId?: number | null;
  updatedByAccountId?: number | null;
  playerId: number;
  date: string;
  season: string;
  month: string;
  club: string;
  status: AttendanceStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestSession {
  id?: number;
  syncId?: string;
  syncRevision?: number;
  createdByAccountId?: number | null;
  updatedByAccountId?: number | null;
  testId: number;
  name: string;
  date: string;
  playerIds: number[];
  batchSize: number;
  currentBatch: number;
  status: "draft" | "active" | "completed";
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface SyncQueueItem {
  id?: number;
  operation: string;
  entity: string;
  recordId: string;
  timestamp: string;
  deviceId: string;
  userId: string;
  status: "Pending" | "Synced" | "Failed";
  payload: Record<string, unknown>;
  error?: string | null;
  syncedAt?: string | null;
}

export interface LocalSyncConflict {
  id?: number;
  entity: "player" | "testResult" | "attendance" | "session";
  syncId: string;
  localPayload: Record<string, unknown>;
  remotePayload: Record<string, unknown>;
  status: "pending" | "keep_local" | "keep_remote" | "merged";
  detectedAt: string;
  resolvedAt?: string | null;
  resolutionNote?: string;
}

export interface EvaluationResult {
  score: number | null;
  rating: Grade | null;
  age: number;
  ageCategory: AgeCategory;
  standard: Standard | null;
  reason?: string;
}

export interface FinalEvaluation {
  achievement: number;
  finalGrade: Grade;
}
