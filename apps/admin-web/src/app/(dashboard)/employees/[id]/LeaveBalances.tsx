"use client";

import { EditableList } from "../../settings/EditableList";
import { createLeaveBalanceAction, updateLeaveBalanceAction } from "../actions";

interface LeaveType {
  id: string;
  name_th: string;
}
interface LeaveBalanceRow {
  id: string;
  leave_type_id: string;
  year: number;
  entitled_days: number;
  carried_over_days: number;
  used_days: number;
  pending_days: number;
}

export function LeaveBalances({ employeeId, leaveTypes, balances }: { employeeId: string; leaveTypes: LeaveType[]; balances: LeaveBalanceRow[] }) {
  const boundCreate = createLeaveBalanceAction.bind(null, employeeId);

  return (
    <EditableList
      title="วันลาคงเหลือ"
      fields={[
        { key: "leaveTypeId", label: "ประเภทการลา", type: "select", options: leaveTypes.map((t) => ({ value: t.id, label: t.name_th })) },
        { key: "year", label: "ปี (ค.ศ.)", type: "number" },
        { key: "entitledDays", label: "สิทธิวันลา (วัน)", type: "number" },
        { key: "carriedOverDays", label: "ยกมาจากปีก่อน (วัน)", type: "number", optional: true },
      ]}
      rows={balances.map((b) => {
        const type = leaveTypes.find((t) => t.id === b.leave_type_id);
        const remaining = Number(b.entitled_days) + Number(b.carried_over_days) - Number(b.used_days) - Number(b.pending_days);
        return {
          id: b.id,
          leaveTypeId: b.leave_type_id,
          year: b.year,
          entitledDays: b.entitled_days,
          carriedOverDays: b.carried_over_days,
          label: `${type?.name_th ?? "-"} (${b.year})`,
          subLabel: `เหลือ ${remaining} วัน (ใช้ไป ${b.used_days}, รออนุมัติ ${b.pending_days})`,
        };
      })}
      onCreate={boundCreate}
      onSave={updateLeaveBalanceAction}
      emptyLabel="ยังไม่มีการให้สิทธิวันลาแก่พนักงานคนนี้"
      addLabel="ให้สิทธิวันลา"
    />
  );
}
