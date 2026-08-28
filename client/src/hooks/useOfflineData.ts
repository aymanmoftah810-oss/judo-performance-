import { offlineApp } from "@/services/localAppService";
import { phaseA } from "@/services/phaseAService";
import { trpc } from "@/lib/trpc";
import type { AgeGroupRule, AttendanceRecord, Belt, Club, LocalSyncConflict, MigrationReview, Player, Standard, SyncQueueItem, TestDefinition, TestResult, TestSession, TrainingGroup } from "@/domain/types";
import { useCallback, useEffect, useState } from "react";

export type PlatformAccountScope = { id: number; role: "ADMIN" | "COACH" | "PLAYER"; mustChangePassword?: boolean } | null;

export interface OfflineSnapshot {
  players: Player[];
  tests: TestDefinition[];
  standards: Standard[];
  results: TestResult[];
  latestResults: TestResult[];
  attendance: AttendanceRecord[];
  sessions: TestSession[];
  queue: SyncQueueItem[];
  clubs: Club[];
  belts: Belt[];
  ageGroups: AgeGroupRule[];
  trainingGroups: TrainingGroup[];
  migrationReviews: MigrationReview[];
  conflicts: LocalSyncConflict[];
  metrics: {
    activePlayers: number;
    testRecords: number;
    averageTeamAchievement: number;
    excellentPercentage: number;
    absentToday: number;
    injuredToday: number;
    pendingSync: number;
    documentedStandards: number;
  };
}

const emptySnapshot: OfflineSnapshot = {
  players: [], tests: [], standards: [], results: [], latestResults: [], attendance: [], sessions: [], queue: [], clubs: [], belts: [], ageGroups: [], trainingGroups: [], migrationReviews: [], conflicts: [],
  metrics: { activePlayers: 0, testRecords: 0, averageTeamAchievement: 0, excellentPercentage: 0, absentToday: 0, injuredToday: 0, pendingSync: 0, documentedStandards: 0 },
};

export function useOfflineData(account: PlatformAccountScope) {
  const [data, setData] = useState<OfflineSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visibleData = trpc.playerData.visibleData.useQuery({ accountId: account?.id ?? 0 }, { enabled: Boolean(account?.id), retry: false });

  const refresh = useCallback(async () => {
    try {
      const [overview, sessions, conflicts] = await Promise.all([offlineApp.overview(), offlineApp.sessions(), offlineApp.syncConflicts()]);
      setData({
        players: overview.players, tests: overview.tests, standards: overview.standards, results: overview.results, latestResults: overview.latestResults,
        attendance: overview.attendance, queue: overview.queueItems, sessions, metrics: overview.metrics, clubs: overview.clubs, belts: overview.belts, ageGroups: overview.ageGroups, trainingGroups: overview.trainingGroups, migrationReviews: overview.migrationReviews, conflicts,
      });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل البيانات المحلية");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true); setData(emptySnapshot);
        await offlineApp.activateAccountScope(account);
        await phaseA.initialize();
        await refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "تعذر تهيئة قاعدة البيانات المحلية");
        setLoading(false);
      }
    })();
  }, [account?.id, account?.role, refresh]);

  useEffect(() => {
    if (!account || !visibleData.data) return;
    void (async () => {
      await offlineApp.hydrateServerVisibleData(visibleData.data);
      await refresh();
    })();
  }, [account?.id, refresh, visibleData.data]);

  return { data, loading, error, refresh };
}
