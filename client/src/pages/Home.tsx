import { OfflineShell, type WorkspaceView } from "@/components/OfflineShell";
import { AttendancePanel } from "@/features/AttendancePanel";
import { AccountsPanel } from "@/features/AccountsPanel";
import { BackupSyncPanel } from "@/features/BackupSyncPanel";
import { OverviewPanel } from "@/features/OverviewPanel";
import { PlayerCard, PlayersPanel } from "@/features/PlayersPanel";
import { ReadinessPanel } from "@/features/ReadinessPanel";
import { ReportsPanel } from "@/features/ReportsPanel";
import { ReferenceDataPanel } from "@/features/ReferenceDataPanel";
import { StandardsPanel } from "@/features/StandardsPanel";
import { TestsPanel } from "@/features/TestsPanel";
import { useOfflineData } from "@/hooks/useOfflineData";
import { trpc } from "@/lib/trpc";
import { DatabaseZap, LoaderCircle, RefreshCcw, TriangleAlert } from "lucide-react";
import { useState } from "react";

function requestedView(): WorkspaceView {
  const value = new URLSearchParams(window.location.search).get("view") as WorkspaceView | null;
  return ["dashboard", "players", "tests", "standards", "attendance", "reports", "backup", "references", "readiness", "accounts"].includes(value ?? "") ? value! : "dashboard";
}

export default function Home() {
  const account = trpc.accounts.me.useQuery(undefined, { retry: false });
  const accountStatus = trpc.accounts.status.useQuery(undefined, { retry: false });
  const { data, loading, error, refresh } = useOfflineData(account.data && !account.data.mustChangePassword ? { id: account.data.id, role: account.data.role } : null);
  const [view, setView] = useState<WorkspaceView>(requestedView);
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);

  const selectPlayer = (id: number) => { setSelectedPlayer(id); setView("players"); };
  const accountGate = accountStatus.data?.initialized && (!account.data || account.data.mustChangePassword) && view !== "accounts";
  const playerOnlyContent = account.data?.role === "PLAYER" && view !== "accounts";
  const content = accountGate ? <div className="mx-auto max-w-lg rounded-2xl border border-[#e8d7a6] bg-[#fffaf0] p-6 text-center"><h2 className="text-xl font-black">يلزم تسجيل الدخول</h2><p className="mt-2 text-sm leading-6 text-[#756027]">بعد تهيئة حسابات المنصة، لا تُعرض بيانات اللاعبين أو نتائجهم قبل تسجيل الدخول بحساب ADMIN أو COACH أو PLAYER.</p><button onClick={() => setView("accounts")} className="mt-4 rounded-lg bg-[#174a3b] px-4 py-2 text-sm font-bold text-white">الانتقال إلى الحسابات</button></div> : playerOnlyContent ? data.players[0]?.id ? <PlayerCard playerId={data.players[0].id} data={data} onBack={() => undefined} /> : <div className="mx-auto max-w-lg rounded-2xl border border-[#dbe5dc] bg-white p-6 text-center"><h2 className="text-xl font-black">ملفي قيد التهيئة</h2><p className="mt-2 text-sm leading-6 text-[#718078]">لا توجد بيانات لاعب متاحة لهذا الحساب بعد. يجب أن يربط المدير الحساب بسجل اللاعب المركزي.</p></div> : selectedPlayer ? <PlayerCard playerId={selectedPlayer} data={data} onBack={() => setSelectedPlayer(null)} /> : (() => {
    switch (view) {
      case "players": return <PlayersPanel data={data} refresh={refresh} onSelect={selectPlayer} />;
      case "tests": return <TestsPanel data={data} refresh={refresh} />;
      case "standards": return <StandardsPanel data={data} refresh={refresh} />;
      case "attendance": return <AttendancePanel data={data} refresh={refresh} />;
      case "reports": return <ReportsPanel data={data} />;
      case "backup": return <BackupSyncPanel data={data} refresh={refresh} />;
      case "references": return <ReferenceDataPanel data={data} refresh={refresh} />;
      case "accounts": return <AccountsPanel players={data.players} onSessionChange={() => void account.refetch()} />;
      case "readiness": return <ReadinessPanel />;
      default: return <OverviewPanel data={data} />;
    }
  })();

  return <OfflineShell view={view} accountRole={account.data?.role} onView={(next) => { setSelectedPlayer(null); setView(next); }}>
    {loading ? <div className="grid min-h-[50vh] place-items-center"><div className="text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#e7f3e9] text-[#28714d]"><LoaderCircle className="h-6 w-6 animate-spin"/></span><p className="mt-3 font-bold">جارٍ تجهيز قاعدة البيانات المحلية…</p></div></div> : error ? <div className="mx-auto max-w-lg rounded-2xl border border-[#efd5cf] bg-[#fff8f6] p-6 text-center"><TriangleAlert className="mx-auto h-8 w-8 text-[#b14e40]"/><h2 className="mt-3 text-lg font-black">تعذر تشغيل المنصة محليًا</h2><p className="mt-2 text-sm leading-6 text-[#7d5a53]">{error}</p><button onClick={() => void refresh()} className="mt-4 inline-flex items-center rounded-lg bg-[#174a3b] px-4 py-2 text-sm font-bold text-white"><RefreshCcw className="ml-2 h-4 w-4"/>إعادة المحاولة</button></div> : content}
  </OfflineShell>;
}
