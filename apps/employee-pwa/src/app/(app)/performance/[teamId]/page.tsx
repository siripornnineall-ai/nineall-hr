"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { getPushStatus, subscribeToPush, type PushStatus } from "@/lib/push";

const STORES = ["Issa Apparel", "Fasonaf", "Active"];

interface Team {
  id: string;
  slug: string;
  name: string;
  shift_end_time: string | null;
  notify_enabled: boolean;
}

interface Member {
  id: string;
  employeeId: string;
  name: string;
  isLead: boolean;
  managedPages: string[];
}

interface SalesRow {
  store: string;
  sales: number;
  adSpend: number;
}

interface Entry {
  work_date: string;
  is_none: boolean;
  quantity: number | null;
  defect_count: number | null;
  defect_photo_paths: string[] | null;
  sales_data: SalesRow[] | null;
  content_note: string | null;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(date: Date): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function emptySalesRows(): SalesRow[] {
  return STORES.map((store) => ({ store, sales: 0, adSpend: 0 }));
}

export default function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  const [isNone, setIsNone] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [defectCount, setDefectCount] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [existingPhotoPaths, setExistingPhotoPaths] = useState<string[]>([]);
  const [salesRows, setSalesRows] = useState<SalesRow[]>(emptySalesRows());
  const [contentNote, setContentNote] = useState("");
  const [pushStatus, setPushStatus] = useState<PushStatus>("unsupported");
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    getPushStatus().then(setPushStatus);
  }, []);

  async function handleEnableNotifications() {
    if (!profile) return;
    setSubscribing(true);
    const status = await subscribeToPush(supabase, profile.profileId);
    setPushStatus(status);
    setSubscribing(false);
  }

  const isCurrentMonth = monthKey(monthDate) === monthKey(new Date());

  const load = useCallback(async () => {
    if (!profile || !teamId) return;
    setLoaded(false);
    const { start, end } = monthRange(monthDate);
    const [{ data: teamRow }, { data: memberRows }, { data: entryRows }] = await Promise.all([
      supabase.from("output_teams").select("id, slug, name, shift_end_time, notify_enabled").eq("id", teamId).maybeSingle(),
      supabase.rpc("get_output_team_roster", { p_output_team_id: teamId }),
      supabase
        .from("output_team_entries")
        .select("work_date, is_none, quantity, defect_count, defect_photo_paths, sales_data, content_note")
        .eq("output_team_id", teamId)
        .gte("work_date", start)
        .lte("work_date", end)
        .order("work_date", { ascending: false }),
    ]);

    setTeam(teamRow ?? null);
    interface RosterRow {
      member_id: string;
      employee_id: string;
      is_lead: boolean;
      managed_pages: string[] | null;
      first_name: string;
      last_name: string;
    }
    setMembers(
      ((memberRows ?? []) as RosterRow[]).map((m) => {
        return {
          id: m.member_id,
          employeeId: m.employee_id,
          name: `${m.first_name} ${m.last_name}`,
          isLead: m.is_lead,
          managedPages: m.managed_pages ?? [],
        };
      })
    );
    const rows = (entryRows ?? []) as Entry[];
    setEntries(rows);

    const today = rows.find((r) => r.work_date === todayStr());
    setIsNone(today?.is_none ?? false);
    setQuantity(today?.quantity != null ? String(today.quantity) : "");
    setDefectCount(today?.defect_count != null ? String(today.defect_count) : "");
    setExistingPhotoPaths(today?.defect_photo_paths ?? []);
    setContentNote(today?.content_note ?? "");
    setSalesRows(
      today?.sales_data && today.sales_data.length > 0
        ? STORES.map((store) => today.sales_data!.find((s) => s.store === store) ?? { store, sales: 0, adSpend: 0 })
        : emptySalesRows()
    );
    setPendingPhotos([]);
    setLoaded(true);
  }, [profile, supabase, teamId, monthDate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (existingPhotoPaths.length === 0) return;
    (async () => {
      const urls: Record<string, string> = {};
      for (const path of existingPhotoPaths) {
        const { data } = await supabase.storage.from("output-photos").createSignedUrl(path, 3600);
        if (data?.signedUrl) urls[path] = data.signedUrl;
      }
      setPhotoUrls(urls);
    })();
  }, [existingPhotoPaths, supabase]);

  async function handleSave() {
    if (!profile || !team) return;
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      let photoPaths = existingPhotoPaths;
      if (pendingPhotos.length > 0) {
        const uploaded: string[] = [];
        for (const file of pendingPhotos) {
          const path = `${profile.orgId}/${profile.employeeId}/${team.id}/${todayStr()}/${crypto.randomUUID()}-${file.name}`;
          const { error: uploadError } = await supabase.storage.from("output-photos").upload(path, file);
          if (uploadError) throw new Error(uploadError.message);
          uploaded.push(path);
        }
        photoPaths = [...existingPhotoPaths, ...uploaded];
      }

      const payload: Record<string, unknown> = {
        org_id: profile.orgId,
        output_team_id: team.id,
        work_date: todayStr(),
        is_none: isNone,
        submitted_by_profile_id: profile.profileId,
        updated_at: new Date().toISOString(),
      };
      if (!isNone) {
        if (team.slug === "sewing") payload.quantity = Number(quantity) || 0;
        if (team.slug === "pack" || team.slug === "sales") {
          payload.defect_count = Number(defectCount) || 0;
          payload.defect_photo_paths = photoPaths.length > 0 ? photoPaths : null;
        }
        if (team.slug === "sales") payload.sales_data = salesRows;
        if (team.slug === "content") {
          payload.quantity = Number(quantity) || 0;
          payload.content_note = contentNote || null;
        }
      }

      const { error: upsertError } = await supabase.from("output_team_entries").upsert(payload, { onConflict: "output_team_id,work_date" });
      if (upsertError) throw new Error(upsertError.message);

      setSuccess("บันทึกผลงานวันนี้เรียบร้อยแล้ว");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded || !team) {
    return (
      <div className="safe-top flex min-h-[50vh] items-center justify-center px-4 pt-4">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  const lead = members.find((m) => m.isLead);
  const regularMembers = members.filter((m) => !m.isLead);

  const monthTotalQuantity = entries.reduce((sum, e) => sum + (e.quantity ?? 0), 0);
  const monthTotalDefects = entries.reduce((sum, e) => sum + (e.defect_count ?? 0), 0);
  const monthSalesTotals = STORES.map((store) => {
    const sales = entries.reduce((sum, e) => sum + (e.sales_data?.find((s) => s.store === store)?.sales ?? 0), 0);
    const adSpend = entries.reduce((sum, e) => sum + (e.sales_data?.find((s) => s.store === store)?.adSpend ?? 0), 0);
    return { store, sales, adSpend, roas: adSpend > 0 ? sales / adSpend : null };
  });

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm font-semibold text-primary">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        กลับ
      </button>

      <h1 className="text-lg font-bold text-primary">{team.name}</h1>

      {team.notify_enabled && pushStatus === "unsubscribed" && (
        <button
          onClick={handleEnableNotifications}
          disabled={subscribing}
          className="flex w-full items-center justify-between rounded-2xl bg-primary/10 px-4 py-3 text-left text-sm font-semibold text-primary disabled:opacity-60"
        >
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">notifications_active</span>
            เปิดการแจ้งเตือนก่อนเลิกงาน
          </span>
          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>
      )}
      {team.notify_enabled && pushStatus === "denied" && (
        <p className="rounded-2xl bg-status-danger/10 px-4 py-3 text-xs text-status-danger">
          การแจ้งเตือนถูกปิดไว้ในมือถือ — ไปที่การตั้งค่ามือถือแล้วอนุญาตการแจ้งเตือนให้แอปนี้ ถ้าอยากได้รับแจ้งเตือนก่อนเลิกงาน
        </p>
      )}

      <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <p className="mb-2 text-sm font-semibold text-on-surface-variant">สมาชิกในทีม</p>
        {members.length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีสมาชิก — ให้แอดมินเพิ่มสมาชิกเข้าทีมนี้</p>}
        {lead && (
          <div className="mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-status-warning">star</span>
            <span className="text-sm font-semibold text-on-surface">{lead.name}</span>
            <span className="rounded-full bg-status-warning/10 px-2 py-0.5 text-[10px] font-bold text-status-warning">หัวหน้าทีม</span>
          </div>
        )}
        {regularMembers.map((m) => (
          <div key={m.id} className="flex items-center gap-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant" />
            <span className="text-sm text-on-surface">{m.name}</span>
            {m.managedPages.length > 0 && <span className="text-xs text-on-surface-variant">— ดูแลเพจ {m.managedPages.join(", ")}</span>}
          </div>
        ))}
        {lead && lead.managedPages.length > 0 && <p className="ml-6 text-xs text-on-surface-variant">ดูแลเพจ {lead.managedPages.join(", ")}</p>}
      </div>

      {team.slug === "cutting" ? (
        <div className="rounded-2xl bg-white p-4 text-center shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <p className="text-sm text-on-surface-variant">ยังไม่ได้กำหนดข้อมูลผลงานสำหรับทีมนี้</p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-on-surface-variant">ผลงานวันนี้</p>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
                <input type="checkbox" checked={isNone} onChange={(e) => setIsNone(e.target.checked)} />
                วันนี้ไม่มี
              </label>
            </div>

            {!isNone && (
              <div className="space-y-3">
                {team.slug === "sewing" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
                    />
                    <span className="shrink-0 text-sm text-on-surface-variant">ชิ้น</span>
                  </div>
                )}

                {(team.slug === "pack" || team.slug === "sales") && (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-on-surface-variant">จำนวนที่ผิดพลาดวันนี้</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={defectCount}
                        onChange={(e) => setDefectCount(e.target.value)}
                        placeholder="0"
                        className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
                      />
                      <span className="shrink-0 text-sm text-on-surface-variant">{team.slug === "pack" ? "แพ็ค" : "ออเดอร์"}</span>
                    </div>
                    <label className="block text-xs font-semibold text-on-surface-variant">รูปของที่ผิดพลาด</label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      capture="environment"
                      onChange={(e) => setPendingPhotos(Array.from(e.target.files ?? []))}
                      className="w-full text-xs text-on-surface-variant"
                    />
                    {pendingPhotos.length > 0 && <p className="text-xs text-on-surface-variant">เลือกไว้ {pendingPhotos.length} รูป (ยังไม่บันทึก)</p>}
                    {existingPhotoPaths.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {existingPhotoPaths.map((path) =>
                          photoUrls[path] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={path} src={photoUrls[path]} alt="" className="h-16 w-16 rounded-lg object-cover" />
                          ) : null
                        )}
                      </div>
                    )}
                  </div>
                )}

                {team.slug === "sales" && (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-on-surface-variant">ยอดขายและค่าแอดวันนี้ (แต่ละร้าน)</label>
                    {salesRows.map((row, i) => {
                      const roas = row.adSpend > 0 ? row.sales / row.adSpend : null;
                      return (
                        <div key={row.store} className="rounded-xl border border-outline-variant p-3">
                          <p className="mb-1.5 text-xs font-bold text-on-surface">{row.store}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="mb-1 block text-[11px] text-on-surface-variant">ยอดขาย (บาท)</label>
                              <input
                                type="number"
                                min={0}
                                value={row.sales || ""}
                                onChange={(e) => {
                                  const next = [...salesRows];
                                  next[i] = { ...row, sales: Number(e.target.value) || 0 };
                                  setSalesRows(next);
                                }}
                                className="w-full rounded-lg border border-outline-variant px-2.5 py-2 text-sm"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] text-on-surface-variant">ค่าแอด (บาท)</label>
                              <input
                                type="number"
                                min={0}
                                value={row.adSpend || ""}
                                onChange={(e) => {
                                  const next = [...salesRows];
                                  next[i] = { ...row, adSpend: Number(e.target.value) || 0 };
                                  setSalesRows(next);
                                }}
                                className="w-full rounded-lg border border-outline-variant px-2.5 py-2 text-sm"
                              />
                            </div>
                          </div>
                          <p className="mt-1.5 text-xs font-semibold text-primary">ROAS: {roas != null ? roas.toFixed(2) : "-"}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {team.slug === "content" && (
                  <div className="space-y-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-on-surface-variant">จำนวนโพสต์วันนี้</label>
                      <input
                        type="number"
                        min={0}
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        placeholder="0"
                        className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-on-surface-variant">วันนี้ลงโพสต์อะไรบ้าง</label>
                      <textarea
                        value={contentNote}
                        onChange={(e) => setContentNote(e.target.value)}
                        rows={3}
                        placeholder="เช่น รีวิวสินค้าใหม่ x2, โปรโมชั่นสิ้นเดือน x1"
                        className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && <p className="mt-2 text-sm text-status-danger">{error}</p>}
            {success && <p className="mt-2 text-sm font-semibold text-status-success">{success}</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="mt-3 h-11 w-full rounded-xl bg-primary text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <div className="mb-3 flex items-center justify-between">
              <button
                onClick={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                className="rounded-lg border border-outline-variant px-2.5 py-1 text-xs font-semibold text-on-surface-variant"
              >
                ← เดือนก่อน
              </button>
              <span className="text-sm font-bold text-on-surface">{monthDate.toLocaleDateString("th-TH", { month: "long", year: "numeric" })}</span>
              <button
                onClick={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                disabled={isCurrentMonth}
                className="rounded-lg border border-outline-variant px-2.5 py-1 text-xs font-semibold text-on-surface-variant disabled:opacity-40"
              >
                เดือนถัดไป →
              </button>
            </div>

            <div className="mb-3 rounded-xl bg-surface-container p-3">
              {team.slug === "sewing" && (
                <p className="text-sm font-bold text-on-surface">
                  ยอดรวมทั้งเดือน: <span className="text-primary">{monthTotalQuantity.toLocaleString()}</span> ชิ้น
                </p>
              )}
              {team.slug === "pack" && (
                <p className="text-sm font-bold text-on-surface">
                  ผิดพลาดรวมทั้งเดือน: <span className="text-status-danger">{monthTotalDefects.toLocaleString()}</span> แพ็ค
                </p>
              )}
              {team.slug === "content" && (
                <p className="text-sm font-bold text-on-surface">
                  โพสต์รวมทั้งเดือน: <span className="text-primary">{monthTotalQuantity.toLocaleString()}</span> โพสต์
                </p>
              )}
              {team.slug === "sales" && (
                <div className="space-y-1">
                  {monthSalesTotals.map((s) => (
                    <p key={s.store} className="text-xs text-on-surface">
                      <span className="font-bold">{s.store}</span> — ยอดขาย {s.sales.toLocaleString()} บ. / ค่าแอด {s.adSpend.toLocaleString()} บ. / ROAS{" "}
                      {s.roas != null ? s.roas.toFixed(2) : "-"}
                    </p>
                  ))}
                  <p className="pt-1 text-xs font-bold text-status-danger">ผิดพลาดรวม {monthTotalDefects.toLocaleString()} ออเดอร์</p>
                </div>
              )}
            </div>

            <p className="mb-2 text-xs font-semibold text-on-surface-variant">รายวัน</p>
            {entries.length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีข้อมูลเดือนนี้</p>}
            <div className="space-y-1.5">
              {entries.map((e) => (
                <div key={e.work_date} className="flex items-center justify-between border-b border-outline-variant/60 py-1.5 text-sm">
                  <span className="text-on-surface-variant">{new Date(e.work_date).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
                  {e.is_none ? (
                    <span className="text-xs text-on-surface-variant">ไม่มี</span>
                  ) : (
                    <span className="font-semibold text-on-surface">
                      {team.slug === "sewing" && `${e.quantity ?? 0} ชิ้น`}
                      {team.slug === "pack" && `ผิด ${e.defect_count ?? 0} แพ็ค`}
                      {team.slug === "content" && `${e.quantity ?? 0} โพสต์`}
                      {team.slug === "sales" && `รวม ${(e.sales_data ?? []).reduce((s, r) => s + r.sales, 0).toLocaleString()} บ.`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
