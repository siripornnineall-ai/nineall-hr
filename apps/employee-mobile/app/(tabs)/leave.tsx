import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";

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
interface LeaveRequestRow {
  id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status: string;
  leave_types: { name_th: string } | null;
}

const STATUS_TH: Record<string, string> = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ปฏิเสธ", cancelled: "ยกเลิก" };

export default function LeaveScreen() {
  const { profile } = useAuth();
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalanceRow[]>([]);
  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const year = new Date().getFullYear();
    const [{ data: types }, { data: bal }, { data: reqs }] = await Promise.all([
      supabase.from("leave_types").select("id, name_th").eq("org_id", profile.orgId).eq("is_active", true).order("sort_order"),
      supabase.from("leave_balances").select("leave_type_id, entitled_days, carried_over_days, used_days, pending_days").eq("employee_id", profile.employeeId).eq("year", year),
      supabase
        .from("leave_requests")
        .select("id, start_date, end_date, total_days, status, leave_types(name_th)")
        .eq("employee_id", profile.employeeId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setLeaveTypes(types ?? []);
    setBalances(bal ?? []);
    setRequests((reqs ?? []) as unknown as LeaveRequestRow[]);
    if (types && types.length > 0 && !selectedType) setSelectedType(types[0].id);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  function computeDays(): number {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  }

  async function handleSubmit() {
    setError(null);
    const totalDays = computeDays();
    if (!selectedType || !startDate || !endDate || totalDays <= 0 || !reason) {
      setError("กรุณากรอกข้อมูลให้ครบถ้วน (วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD)");
      return;
    }
    setSubmitting(true);
    const { error: insertError } = await supabase.from("leave_requests").insert({
      org_id: profile!.orgId,
      employee_id: profile!.employeeId,
      leave_type_id: selectedType,
      start_date: startDate,
      end_date: endDate,
      unit: "full_day",
      total_days: totalDays,
      reason,
      status: "pending",
    });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message.includes("INSUFFICIENT_LEAVE_BALANCE") ? "วันลาคงเหลือไม่เพียงพอ" : insertError.message);
      return;
    }
    setStartDate("");
    setEndDate("");
    setReason("");
    Alert.alert("สำเร็จ", "ส่งคำขอลาเรียบร้อยแล้ว");
    load();
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.title}>ขอลางาน</Text>

        <View style={styles.balanceRow}>
          {balances.slice(0, 2).map((b) => {
            const type = leaveTypes.find((t) => t.id === b.leave_type_id);
            const remaining = Number(b.entitled_days) + Number(b.carried_over_days) - Number(b.used_days) - Number(b.pending_days);
            return (
              <View key={b.leave_type_id} style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>{type?.name_th ?? "-"}</Text>
                <Text style={styles.balanceValue}>{remaining} วัน</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>ประเภทการลา</Text>
          <View style={styles.chipRow}>
            {leaveTypes.map((t) => (
              <Pressable key={t.id} onPress={() => setSelectedType(t.id)} style={[styles.chip, selectedType === t.id && styles.chipActive]}>
                <Text style={[styles.chipText, selectedType === t.id && styles.chipTextActive]}>{t.name_th}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>วันที่เริ่ม (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="2569-08-15" />
          <Text style={styles.label}>วันที่สิ้นสุด (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="2569-08-16" />

          <Text style={styles.label}>เหตุผล</Text>
          <TextInput style={[styles.input, { height: 80 }]} value={reason} onChangeText={setReason} placeholder="ระบุเหตุผลการลา" multiline />

          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>ลารวมทั้งหมด:</Text>
            <Text style={styles.summaryValue}>{computeDays()} วัน</Text>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>ส่งคำขอลา</Text>}
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>ประวัติคำขอ</Text>
        {requests.map((r) => (
          <View key={r.id} style={styles.historyRow}>
            <View>
              <Text style={styles.historyType}>{r.leave_types?.name_th ?? "-"}</Text>
              <Text style={styles.historyDate}>
                {r.start_date} - {r.end_date} ({r.total_days} วัน)
              </Text>
            </View>
            <Text style={[styles.historyStatus, statusColor(r.status)]}>{STATUS_TH[r.status] ?? r.status}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function statusColor(status: string) {
  if (status === "approved") return { color: theme.colors.success };
  if (status === "rejected") return { color: theme.colors.danger };
  return { color: theme.colors.warning };
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.surfaceCream },
  title: { fontSize: 20, fontWeight: "800", color: theme.colors.primary, marginBottom: 16 },
  balanceRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  balanceCard: { flex: 1, backgroundColor: "#fff", borderRadius: 16, padding: 16 },
  balanceLabel: { fontSize: 12, color: theme.colors.onSurfaceVariant },
  balanceValue: { fontSize: 22, fontWeight: "800", color: theme.colors.primary, marginTop: 4 },
  form: { backgroundColor: "#fff", borderRadius: 20, padding: 20, gap: 4 },
  label: { fontSize: 13, fontWeight: "600", color: theme.colors.onSurfaceVariant, marginTop: 12, marginBottom: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.outlineVariant },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 13, color: theme.colors.onSurfaceVariant },
  chipTextActive: { color: "#fff", fontWeight: "700" },
  input: { borderWidth: 1, borderColor: theme.colors.outlineVariant, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  summary: { flexDirection: "row", justifyContent: "space-between", backgroundColor: theme.colors.surfaceContainer, borderRadius: 12, padding: 14, marginTop: 16 },
  summaryLabel: { fontWeight: "600" },
  summaryValue: { fontWeight: "800", color: theme.colors.primary },
  error: { color: theme.colors.danger, marginTop: 8, fontSize: 13 },
  submitButton: { marginTop: 16, height: 52, borderRadius: 14, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  submitButtonText: { color: "#fff", fontWeight: "700" },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 24, marginBottom: 12 },
  historyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 8 },
  historyType: { fontWeight: "700" },
  historyDate: { fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 2 },
  historyStatus: { fontWeight: "700", fontSize: 12 },
});
