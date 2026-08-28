import type { OfflineSnapshot } from "@/hooks/useOfflineData";
import { buildReportModel, createExcelWorkbook } from "@/services/reportExportService";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

const snapshot = {
  players: [{ id: 1, name: "لاعب التقرير", gender: "ذكر", birthYear: 2012, status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
  tests: [{ id: 1, nameAr: "الضغط", unit: "تكرار", active: true, weight: 1 }],
  standards: [],
  results: [{ id: 11, syncId: "result-report-11", syncRevision: 1, playerId: 1, testId: 1, value: 24, score: 4, rating: "جيد جدا", date: "2026-08-27", notes: "نتيجة فعلية", createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z" }],
  attendance: [{ id: 21, syncId: "attendance-report-21", syncRevision: 1, playerId: 1, date: "2026-08-27", season: "2026", month: "2026-08", club: "النادي", status: "present", notes: "", createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z" }],
  sessions: [{ id: 31, syncId: "session-report-31", syncRevision: 1, testId: 1, name: "جلسة التقرير", date: "2026-08-27", playerIds: [1], batchSize: 10, currentBatch: 0, status: "completed", createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z" }],
  metrics: { averageTeamAchievement: 80, excellentPercentage: 0 },
} as unknown as OfflineSnapshot;

describe("تصدير التقارير المحلية", () => {
  it("REPORT-E-001: يبني ملخصًا من السجلات المحلية والفئة القائمة على سنة الميلاد فقط", () => {
    const report = buildReportModel(snapshot);
    expect(report.summary).toMatchObject({ playerCount: 1, resultCount: 1, attendanceCount: 1 });
    expect(report.rankings[0]).toMatchObject({ achievement: 80, finalGrade: "جيد جدًا" });
  });

  it("REPORT-E-002: ينشئ Excel متعدد الأوراق بعناوين عربية واتجاه RTL دون أسرار", () => {
    const workbook = createExcelWorkbook(snapshot);
    expect(workbook.SheetNames).toEqual(["ملخص الفريق", "اللاعبون", "النتائج", "الحضور", "الجلسات"]);
    expect(workbook.Sheets["اللاعبون"]["!views"]?.[0]).toMatchObject({ rightToLeft: true });
    const content = workbook.SheetNames.map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name])).join("\n");
    expect(content).toContain("لاعب التقرير"); expect(content).toContain("سنة الميلاد"); expect(content).not.toMatch(/password|token|secret|setup/i);
  });
});
