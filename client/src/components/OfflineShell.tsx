import { Activity, ArchiveRestore, BarChart3, ClipboardCheck, CloudOff, Database, Gauge, Landmark, Settings2, ShieldCheck, Users, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

export type WorkspaceView = "dashboard" | "players" | "tests" | "standards" | "attendance" | "reports" | "backup" | "references" | "readiness" | "accounts";

const entries: Array<{ id: WorkspaceView; label: string; icon: typeof Gauge }> = [
  { id: "dashboard", label: "لوحة المتابعة", icon: Gauge }, { id: "players", label: "اللاعبون", icon: Users },
  { id: "tests", label: "الاختبارات", icon: ClipboardCheck }, { id: "standards", label: "المعايير", icon: Settings2 },
  { id: "attendance", label: "الحضور", icon: Activity }, { id: "reports", label: "التقارير", icon: BarChart3 },
  { id: "backup", label: "نسخ ومزامنة", icon: ArchiveRestore }, { id: "references", label: "البيانات المرجعية", icon: Landmark }, { id: "accounts", label: "الحسابات", icon: ShieldCheck }, { id: "readiness", label: "الجاهزية", icon: Database },
];

export function OfflineShell({ view, onView, children, accountRole }: { view: WorkspaceView; onView: (view: WorkspaceView) => void; children: ReactNode; accountRole?: "ADMIN" | "COACH" | "PLAYER" }) {
  return <div className="min-h-screen bg-[#f6f7f3] text-[#14251f]" dir="rtl">
    <header className="sticky top-0 z-40 border-b border-[#dbe4dd] bg-[#fbfcf9]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1560px] items-center justify-between gap-4 px-4 py-3 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#174a3b] text-[#f7e6a9] shadow-sm"><Activity className="h-5 w-5" /></div>
          <div><h1 className="text-base font-extrabold tracking-tight">منصة أداء لاعبي الجودو</h1><p className="text-xs text-[#68776f]">إدارة محلية · تقييم معياري · Offline-first</p></div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-[#cfe0d5] bg-[#eef6f0] px-3 py-1.5 text-xs font-semibold text-[#225d48] sm:flex"><WifiOff className="h-3.5 w-3.5" /> يعمل دون إنترنت</div>
      </div>
    </header>
    <div className="mx-auto grid max-w-[1560px] grid-cols-[minmax(0,1fr)] lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="sticky top-[65px] z-30 border-b border-[#dbe4dd] bg-[#f1f5f0]/95 px-2 py-2 backdrop-blur lg:static lg:min-h-[calc(100vh-65px)] lg:border-b-0 lg:border-l lg:px-3 lg:py-5">
        <nav aria-label="أقسام النظام" className="flex snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain pb-[max(0px,env(safe-area-inset-bottom))] lg:grid lg:grid-cols-1 lg:overflow-visible">
          {entries.filter((entry) => accountRole !== "PLAYER" || ["dashboard", "players", "accounts"].includes(entry.id)).map((entry) => { const Icon = entry.icon; const active = view === entry.id; return <button key={entry.id} aria-current={active ? "page" : undefined} onClick={() => onView(entry.id)} className={`flex min-h-11 min-w-20 shrink-0 snap-start items-center justify-center gap-1 rounded-xl px-2 py-2 text-center text-[11px] font-bold transition-colors lg:min-w-0 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:py-2.5 lg:text-right lg:text-sm ${active ? "bg-[#174a3b] text-white shadow-sm" : "text-[#4f6259] hover:bg-white"}`}><Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{entry.label}</span></button>; })}
        </nav>
        <div className="mt-7 hidden rounded-xl border border-[#d3dfd4] bg-white p-3 text-xs leading-5 text-[#627268] lg:block"><CloudOff className="mb-2 h-4 w-4 text-[#b48a28]" aria-hidden="true" /><strong className="block text-[#263a31]">المزامنة اليدوية</strong>تُسجَّل التغييرات محليًا في طابور آمن، وتُرسل فقط عند اختيار المستخدم تنفيذ المزامنة.</div>
      </aside>
      <main className="min-w-0 px-4 py-5 lg:px-8 lg:py-7">{children}</main>
    </div>
  </div>;
}
