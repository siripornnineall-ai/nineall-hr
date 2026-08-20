"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface TrainingRow {
  id: string;
  title: string;
  provider: string | null;
  training_date: string;
  hours: number | null;
  notes: string | null;
}

export default function TrainingPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [records, setRecords] = useState<TrainingRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("training_records")
      .select("id, title, provider, training_date, hours, notes")
      .eq("employee_id", profile.employeeId)
      .order("training_date", { ascending: false })
      .then(({ data }) => {
        setRecords(data ?? []);
        setLoaded(true);
      });
  }, [profile, supabase]);

  const totalHours = records.reduce((sum, r) => sum + Number(r.hours ?? 0), 0);

  return (
    <div className="safe-top space-y-5 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">ประวัติการอบรม</h1>

      <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <p className="text-xs text-on-surface-variant">รวมชั่วโมงการอบรมทั้งหมด</p>
        <p className="mt-1 text-xl font-bold text-primary">{totalHours} ชม.</p>
      </div>

      {loaded && records.length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีประวัติการอบรม</p>}
      <div className="space-y-2">
        {records.map((r) => (
          <div key={r.id} className="rounded-2xl bg-white p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <p className="font-semibold text-on-surface">{r.title}</p>
            <p className="text-xs text-on-surface-variant">
              {new Date(r.training_date).toLocaleDateString("th-TH")}
              {r.provider && ` — ${r.provider}`}
              {r.hours != null && ` (${r.hours} ชม.)`}
            </p>
            {r.notes && <p className="mt-1 text-xs text-on-surface-variant">{r.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
