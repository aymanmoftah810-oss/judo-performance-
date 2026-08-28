import { Button } from "@/components/ui/button";
import type { OfflineSnapshot } from "@/hooks/useOfflineData";
import { offlineApp } from "@/services/localAppService";
import type { AttendanceStatus } from "@/domain/types";
import { CalendarCheck2, Check, HeartPulse, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const statusConfig: Array<{ status: AttendanceStatus; label: string; icon: typeof Check; tone: string }> = [
  { status: "present", label: "حاضر", icon: Check, tone: "bg-[#e7f3e9] text-[#28714d] hover:bg-[#d4ebda]" }, { status: "absent", label: "غائب", icon: X, tone: "bg-[#faece9] text-[#b14e40] hover:bg-[#f8ddd8]" }, { status: "injured", label: "مصاب", icon: HeartPulse, tone: "bg-[#fff3dc] text-[#956c18] hover:bg-[#f9e5bc]" },
];

export function AttendancePanel({ data, refresh }: { data: OfflineSnapshot; refresh: () => Promise<void> }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [busy, setBusy] = useState<number | null>(null); const records = new Map(data.attendance.filter((record) => record.date === date).map((record) => [record.playerId, record]));
  const record = async (playerId: number, status: AttendanceStatus) => { setBusy(playerId); try { await offlineApp.recordAttendance({ playerId, date, status }); toast.success("تم تحديث الحضور"); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ الحضور"); } finally { setBusy(null); } };
  return <section className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-[#ad8130]">المتابعة اليومية</p><h2 className="mt-1 text-2xl font-black">الحضور</h2><p className="mt-1 text-sm text-[#718078]">سجل واحد لكل لاعب وتاريخ؛ يعيد النظام التحديث بدل إنشاء تكرار.</p></div><div className="flex items-center gap-2 rounded-xl border border-[#dbe5dc] bg-white px-3 py-2"><CalendarCheck2 className="h-4 w-4 text-[#28714d]"/><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="bg-transparent text-sm outline-none"/></div></div>
    <div className="overflow-hidden rounded-2xl border border-[#dbe5dc] bg-white"><div className="divide-y divide-[#edf1ed]">{data.players.filter((player) => player.status === "active").map((player) => { const current = records.get(player.id!); return <div key={player.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><strong>{player.name}</strong><p className="mt-1 text-xs text-[#75827b]">{player.club || "دون نادٍ"} · {current ? `الحالة الحالية: ${statusConfig.find((item) => item.status === current.status)?.label}` : "لم يسجل بعد"}</p></div><div className="flex gap-2">{statusConfig.map(({ status, label, icon: Icon, tone }) => <Button key={status} disabled={busy === player.id} variant="ghost" size="sm" onClick={() => record(player.id!, status)} className={`${tone} ${current?.status === status ? "ring-2 ring-offset-1 ring-[#174a3b]" : ""}`}><Icon className="ml-1 h-3.5 w-3.5"/>{label}</Button>)}</div></div>; })}{!data.players.filter((player) => player.status === "active").length && <p className="p-10 text-center text-sm text-[#75827b]">أضف لاعبًا نشطًا أولًا لتسجيل الحضور.</p>}</div></div>
  </section>;
}
