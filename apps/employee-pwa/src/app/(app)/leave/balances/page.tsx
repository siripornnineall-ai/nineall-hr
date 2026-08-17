"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface LeaveType {
  id: string;
  name_th: string;
}
interface LeaveBalanceRow {
  leave_type_id: string;
  entitled_days: number;
  carried_over_days: number;
  used_days: number;
  pending_days: number;
}

export default function LeaveBalancesPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalanceRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const year = new Date().getFullYear();
    const [{ data: types }, { data: bal }] = await Promise.all([
      supabase.from("leave_types").select("id, name_th").eq("org_id", profile.orgId).eq("is_active", true),
      supabase
        .from("leave_balances")
        .select("leave_type_id, entitled_days, carried_over_days, used_days, pending_days")
        .eq("employee_id", profile.employeeId)
        .eq("year", year),
    ]);
    setLeaveTypes(types ?? []);
    setBalances(bal ?? []);
    setLoaded(true);
  }, [profile, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-primary">วันลาคงเหลือ</h1>
        <Link href="/leave" className="text-xs font-semibold text-secondary">
          ขอลางาน →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {balances.map((b) => {
          const type = leaveTypes.find((t) => t.id === b.leave_type_id);
          const remaining = Number(b.entitled_days) + Number(b.carried_over_days) - Number(b.used_days) - Number(b.pending_days);
          return (
            <div key={b.leave_type_id} className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
              <p className="text-xs text-on-surface-variant">{type?.name_th ?? "-"}</p>
              <p className="mt-1 text-xl font-bold text-primary">{remaining} วัน</p>
            </div>
          );
        })}
        {loaded && balances.length === 0 && <p className="col-span-2 text-sm text-on-surface-variant">ยังไม่มีข้อมูลวันลาคงเหลือ</p>}
      </div>
    </div>
  );
}
