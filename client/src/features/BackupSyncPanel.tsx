import { Button } from "@/components/ui/button";
import type { OfflineSnapshot } from "@/hooks/useOfflineData";
import { trpc } from "@/lib/trpc";
import { offlineApp } from "@/services/localAppService";
import type { AttendanceRecord, Player, SyncQueueItem, TestResult, TestSession } from "@/domain/types";
import { ArchiveRestore, Download, HardDriveUpload, LoaderCircle, RefreshCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type PlayerOperation = Player & { baseRevision?: number };
type ResultOperation = TestResult & { baseRevision?: number; serverProfileId?: number | null };
type AttendanceOperation = AttendanceRecord & { baseRevision?: number; serverProfileId?: number | null };
type SessionOperation = TestSession & { baseRevision?: number };

export function BackupSyncPanel({ data, refresh }: { data: OfflineSnapshot; refresh: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false);
  const upsertProfile = trpc.playerData.upsertProfile.useMutation(); const upsertResult = trpc.playerData.upsertResult.useMutation(); const upsertAttendance = trpc.playerData.upsertAttendance.useMutation(); const upsertSession = trpc.playerData.upsertSession.useMutation();
  const download = async () => { setBusy(true); try { const backup = await offlineApp.exportBackup(); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" })); link.download = `judo-performance-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); toast.success("تم إنشاء ملف النسخة الاحتياطية"); } finally { setBusy(false); } };
  const restore = async (file?: File) => { if (!file) return; setBusy(true); try { const backup = JSON.parse(await file.text()); await offlineApp.importBackup(backup); await refresh(); toast.success("تمت استعادة النسخة الاحتياطية والتحقق من البيانات"); } catch (error) { toast.error(error instanceof Error ? error.message : "ملف النسخة الاحتياطية غير صالح"); } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; } };
  const markFailure = async (item: SyncQueueItem, error: unknown) => { const message = error instanceof Error ? error.message : "تعذرت المزامنة"; await offlineApp.updateSyncQueueItem(item.id!, { status: "Failed", error: message.slice(0, 500) }); if ((error as { data?: { code?: string } })?.data?.code === "CONFLICT") await offlineApp.saveSyncConflict({ entity: item.entity === "player" ? "player" : item.entity === "attendance" ? "attendance" : item.entity === "session" ? "session" : "testResult", syncId: String(item.payload.syncId ?? item.recordId), localPayload: item.payload, remotePayload: {}, status: "pending", detectedAt: new Date().toISOString(), resolutionNote: "حُفظ التعارض في الخادم؛ راجعه المدير قبل اختيار النسخة." }); };
  const synchronize = async () => {
    const pending = data.queue.filter((item) => item.status === "Pending" || item.status === "Failed"); if (!pending.length) return;
    setBusy(true); let completed = 0;
    try {
      for (const item of pending) {
        try {
          if (item.entity === "player") {
            const player = item.payload as unknown as PlayerOperation;
            if (!player.syncId || !player.id) throw new Error("بيانات اللاعب المحلية غير مكتملة للمزامنة");
            const response = await upsertProfile.mutateAsync({ syncId: player.syncId, baseRevision: player.baseRevision ?? player.syncRevision ?? 0, sourceLocalId: player.id, name: player.name, gender: player.gender, birthYear: player.birthYear, snapshot: JSON.stringify(player), archivedAt: player.deletedAt ?? null });
            if (!response.profile?.id) throw new Error("لم يعد الخادم مفتاح سجل اللاعب");
            await offlineApp.applyPlayerSync(player.id, response.profile.id, response.profile.revision); await offlineApp.updateSyncQueueItem(item.id!, { status: "Synced", error: null, syncedAt: new Date().toISOString() }); completed += 1;
          } else if (item.entity === "testResult") {
            const result = item.payload as unknown as ResultOperation;
            const profileId = result.serverProfileId ?? (await offlineApp.players()).find((player) => player.id === result.playerId)?.serverProfileId;
            if (!result.syncId || !result.id || !profileId) throw new Error("نتيجة الاختبار تنتظر مزامنة سجل اللاعب أولًا");
            const response = await upsertResult.mutateAsync({ syncId: result.syncId, baseRevision: result.baseRevision ?? result.syncRevision ?? 0, playerProfileId: profileId, sourceLocalId: result.id, testId: result.testId, value: result.value, score: result.score, rating: result.rating, date: result.date, notes: result.notes, snapshot: JSON.stringify(result), deletedAt: result.deletedAt ?? null });
            await offlineApp.applyResultSync(result.id, response.result.revision); await offlineApp.updateSyncQueueItem(item.id!, { status: "Synced", error: null, syncedAt: new Date().toISOString() }); completed += 1;
          } else if (item.entity === "attendance") {
            const attendance = item.payload as unknown as AttendanceOperation;
            const profileId = attendance.serverProfileId ?? (await offlineApp.players()).find((player) => player.id === attendance.playerId)?.serverProfileId;
            if (!attendance.syncId || !attendance.id || !profileId) throw new Error("سجل الحضور ينتظر مزامنة سجل اللاعب أولًا");
            const response = await upsertAttendance.mutateAsync({ syncId: attendance.syncId, baseRevision: attendance.baseRevision ?? attendance.syncRevision ?? 0, playerProfileId: profileId, sourceLocalId: attendance.id, date: attendance.date, season: attendance.season, month: attendance.month, club: attendance.club, status: attendance.status, notes: attendance.notes, snapshot: JSON.stringify(attendance) });
            await offlineApp.applyAttendanceSync(attendance.id, response.attendance.revision); await offlineApp.updateSyncQueueItem(item.id!, { status: "Synced", error: null, syncedAt: new Date().toISOString() }); completed += 1;
          } else if (item.entity === "session") {
            const session = item.payload as unknown as SessionOperation; const scopedPlayers = await offlineApp.players(); const playerProfileIds = session.playerIds.map((playerId) => scopedPlayers.find((player) => player.id === playerId)?.serverProfileId).filter((id): id is number => Boolean(id));
            if (!session.syncId || !session.id || playerProfileIds.length !== session.playerIds.length) throw new Error("جلسة الاختبار تنتظر مزامنة جميع اللاعبين المشاركين");
            const response = await upsertSession.mutateAsync({ syncId: session.syncId, baseRevision: session.baseRevision ?? session.syncRevision ?? 0, sourceLocalId: session.id, testId: session.testId, name: session.name, date: session.date, playerProfileIds, batchSize: session.batchSize, currentBatch: session.currentBatch, status: session.status, snapshot: JSON.stringify(session) });
            await offlineApp.applySessionSync(session.id, response.session.revision); await offlineApp.updateSyncQueueItem(item.id!, { status: "Synced", error: null, syncedAt: new Date().toISOString() }); completed += 1;
          } else throw new Error("هذا النوع من العمليات سيُزامن في مرحلة لاحقة؛ بقي محفوظًا محليًا");
        } catch (error) { await markFailure(item, error); }
      }
      await refresh(); toast.success(completed ? `اكتملت مزامنة ${completed} عملية؛ راجع العناصر الفاشلة أو المتعارضة.` : "لم تكتمل أي عملية؛ راجع حالة الطابور.");
    } finally { setBusy(false); }
  };
  const pending = data.queue.filter((item) => item.status === "Pending" || item.status === "Failed");
  return <section className="space-y-6"><div><p className="text-sm font-semibold text-[#ad8130]">الاستمرارية المحلية والمزامنة اليدوية</p><h2 className="mt-1 text-2xl font-black">نسخ احتياطي ومزامنة</h2><p className="mt-1 text-sm text-[#718078]">يبقى العمل محليًا دون اتصال. عند رغبتك فقط، تُرسل عمليات اللاعبين والنتائج من الطابور عبر حسابك المصرح به؛ لا توجد مهمة خلفية أو إرسال تلقائي.</p></div><div className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]"><article className="rounded-2xl border border-[#dbe5dc] bg-white p-5"><div className="flex items-center gap-2"><ArchiveRestore className="h-5 w-5 text-[#ad8130]"/><h3 className="font-extrabold">النسخ الاحتياطي والاستعادة</h3></div><p className="mt-2 text-sm leading-6 text-[#718078]">تتضمن النسخة مخازن IndexedDB الخاصة بالحساب الحالي فقط؛ لا تتضمن كلمات المرور أو رمز التهيئة أو سجلات حسابات أخرى.</p><div className="mt-5 flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void download()} className="bg-[#174a3b]"><Download className="ml-2 h-4 w-4"/>تصدير نسخة</Button><Button disabled={busy} onClick={() => inputRef.current?.click()} variant="outline"><HardDriveUpload className="ml-2 h-4 w-4"/>استيراد نسخة</Button><input ref={inputRef} onChange={(event) => void restore(event.target.files?.[0])} type="file" accept="application/json" className="hidden"/></div></article><article className="rounded-2xl border border-[#dbe5dc] bg-white p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#28714d]"/><h3 className="font-extrabold">طابور المزامنة المحلي</h3></div><span className="rounded-full bg-[#fff3dc] px-2.5 py-1 text-xs font-bold text-[#956c18]">{pending.length} بانتظار الإرسال</span></div><p className="mt-2 text-xs leading-5 text-[#718078]">تُحدّث العملية الناجحة إلى Synced. العملية الفاشلة تبقى محفوظة مع السبب، ولا تُحذف من الجهاز.</p><Button disabled={busy || !pending.length} onClick={() => void synchronize()} className="mt-4 bg-[#174a3b]"><RefreshCcw className="ml-2 h-4 w-4"/>تنفيذ مزامنة يدوية</Button><div className="mt-4 max-h-64 space-y-2 overflow-y-auto">{data.queue.length ? data.queue.slice(0, 20).map((item) => <div key={item.id} className="rounded-xl bg-[#f6f8f5] p-3"><div className="flex items-center justify-between"><strong className="text-xs">{item.operation}</strong><span className="text-xs text-[#75827b]">{item.status}</span></div><p className="mt-1 text-xs text-[#66756d]">{item.entity} #{item.recordId} · {new Date(item.timestamp).toLocaleString("ar-EG")}</p>{item.error && <p className="mt-1 text-xs text-[#a24b3d]">{item.error}</p>}</div>) : <p className="rounded-xl bg-[#f6f8f5] p-4 text-sm text-[#718078]">لا توجد عمليات معلقة بعد.</p>}</div></article></div>{data.conflicts.length > 0 && <article className="rounded-2xl border border-[#efd5cf] bg-[#fff8f6] p-5"><div className="flex items-center gap-2"><TriangleAlert className="h-5 w-5 text-[#b14e40]"/><h3 className="font-extrabold">تعارضات تحتاج مراجعة إدارية</h3></div><p className="mt-2 text-sm leading-6 text-[#7d5a53]">لم يُستبدل أي سجل متعارض. تحفظ المنصة النسخة المحلية والنسخة الخادمية لتقرير المدير لاحقًا.</p><div className="mt-3 space-y-2">{data.conflicts.map((conflict) => <div key={conflict.id} className="rounded-xl bg-white p-3 text-sm"><strong>{conflict.entity}</strong><span className="mr-2 text-[#7d5a53]">{conflict.syncId} · {conflict.status}</span></div>)}</div></article>}{busy && <div className="flex items-center gap-2 text-sm text-[#607066]"><LoaderCircle className="h-4 w-4 animate-spin"/>جارٍ تنفيذ العملية المحددة…</div>}</section>;
}
