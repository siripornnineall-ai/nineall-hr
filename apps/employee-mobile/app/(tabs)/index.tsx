import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";

interface HomeStats {
  leaveDaysRemaining: number;
  otHoursThisMonth: number;
  pendingRequests: number;
  latestPayslipLabel: string | null;
  todayStatus: string | null;
  todayClockIn: string | null;
}

const STATUS_TH: Record<string, string> = {
  on_time: "ตรงเวลา",
  late: "มาสาย",
  early_leave: "ออกก่อนเวลา",
  absent: "ขาดงาน",
  holiday: "วันหยุด",
  leave: "ลา",
  work_from_home: "Work From Home",
  off_site: "นอกสถานที่",
  pending_offline: "รอซิงค์ข้อมูล",
};

export default function HomeScreen() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadStats = useCallback(async () => {
    if (!profile) return;
    const today = new Date().toISOString().slice(0, 10);
    const year = new Date().getFullYear();
    const monthStart = `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;

    const [balances, ot, leaveReq, otReq, payslip, todayAttendance] = await Promise.all([
      supabase.from("leave_balances").select("entitled_days, carried_over_days, used_days, pending_days").eq("employee_id", profile.employeeId).eq("year", year),
      supabase.from("overtime_requests").select("approved_hours").eq("employee_id", profile.employeeId).eq("status", "approved").gte("work_date", monthStart),
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("employee_id", profile.employeeId).eq("status", "pending"),
      supabase.from("overtime_requests").select("id", { count: "exact", head: true }).eq("employee_id", profile.employeeId).eq("status", "pending"),
      supabase
        .from("payslips")
        .select("payroll_periods(label)")
        .eq("employee_id", profile.employeeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("attendance_records")
        .select("status, clock_in_server_at")
        .eq("employee_id", profile.employeeId)
        .eq("work_date", today)
        .maybeSingle(),
    ]);

    const leaveDaysRemaining = (balances.data ?? []).reduce(
      (sum, b) => sum + Number(b.entitled_days) + Number(b.carried_over_days) - Number(b.used_days) - Number(b.pending_days),
      0
    );
    const otHours = (ot.data ?? []).reduce((sum, o) => sum + Number(o.approved_hours ?? 0), 0);
    const period = payslip.data?.payroll_periods as unknown as { label: string } | null;

    setStats({
      leaveDaysRemaining,
      otHoursThisMonth: otHours,
      pendingRequests: (leaveReq.count ?? 0) + (otReq.count ?? 0),
      latestPayslipLabel: period?.label ?? null,
      todayStatus: todayAttendance.data?.status ?? null,
      todayClockIn: todayAttendance.data?.clock_in_server_at ?? null,
    });
  }, [profile]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  async function onRefresh() {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.name}>{profile?.fullName ?? "-"}</Text>
              <Text style={styles.jobTitle}>{profile?.jobTitle ?? ""}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.clock}>{now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false })}</Text>
              <Text style={styles.date}>{now.toLocaleDateString("th-TH")}</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.statusCard}>
            <MaterialIcons name={stats?.todayClockIn ? "check-circle" : "schedule"} size={24} color={stats?.todayClockIn ? theme.colors.success : theme.colors.onSurfaceVariant} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.statusLabel}>
                {stats?.todayClockIn ? `เข้างานวันนี้: ${new Date(stats.todayClockIn).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}` : "ยังไม่ลงเวลาเข้างานวันนี้"}
              </Text>
              {stats?.todayStatus && <Text style={styles.statusValue}>{STATUS_TH[stats.todayStatus] ?? stats.todayStatus}</Text>}
            </View>
          </View>

          <View style={styles.grid}>
            <StatCard icon="event-available" color={theme.colors.tertiary} label="วันลาคงเหลือ" value={`${stats?.leaveDaysRemaining ?? "-"} วัน`} />
            <StatCard icon="timer" color={theme.colors.secondary} label="OT เดือนนี้" value={`${stats?.otHoursThisMonth ?? 0} ชม.`} />
            <StatCard icon="pending-actions" color="#c2760a" label="คำขอรออนุมัติ" value={`${stats?.pendingRequests ?? 0} รายการ`} />
            <StatCard icon="payments" color="#1d4ed8" label="สลิปล่าสุด" value={stats?.latestPayslipLabel ?? "ยังไม่มี"} />
          </View>

          <View style={styles.actionsRow}>
            <ActionButton label="ลงเวลาเข้า-ออก" icon="fingerprint" onPress={() => router.push("/(tabs)/attendance")} />
            <ActionButton label="ขอลางาน" icon="event-note" onPress={() => router.push("/(tabs)/leave")} />
          </View>

          <View style={{ marginTop: 24, alignItems: "flex-end", paddingHorizontal: 20 }}>
            <Text onPress={signOut} style={styles.logout}>
              ออกจากระบบ
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon, color, label, value }: { icon: keyof typeof MaterialIcons.glyphMap; color: string; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <MaterialIcons name={icon} size={22} color={color} />
      <Text style={styles.statCardLabel}>{label}</Text>
      <Text style={styles.statCardValue}>{value}</Text>
    </View>
  );
}

function ActionButton({ label, icon, onPress }: { label: string; icon: keyof typeof MaterialIcons.glyphMap; onPress: () => void }) {
  return (
    <View style={styles.actionButton} onTouchEnd={onPress}>
      <MaterialIcons name={icon} size={22} color="#fff" />
      <Text style={styles.actionButtonText}>{label}</Text>
    </View>
  );
}

const cardShadow = {
  shadowColor: "#000",
  shadowOpacity: 0.05,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.surfaceCream },
  header: { backgroundColor: theme.colors.primaryContainer, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { color: "#fff", fontSize: 20, fontWeight: "800" },
  jobTitle: { color: "rgba(255,255,255,0.85)", fontSize: 13 },
  clock: { color: "#fff", fontSize: 24, fontWeight: "800" },
  date: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
  body: { marginTop: -16, paddingHorizontal: 16 },
  statusCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 16, padding: 16, ...cardShadow },
  statusLabel: { fontSize: 13, color: theme.colors.onSurfaceVariant, fontWeight: "600" },
  statusValue: { fontSize: 13, color: theme.colors.success, fontWeight: "700", marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 16 },
  statCard: { width: "47%", backgroundColor: "#fff", borderRadius: 16, padding: 16, ...cardShadow },
  statCardLabel: { fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 8 },
  statCardValue: { fontSize: 16, fontWeight: "800", color: theme.colors.onSurface, marginTop: 2 },
  actionsRow: { flexDirection: "row", gap: 12, marginTop: 20 },
  actionButton: { flex: 1, backgroundColor: theme.colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: "center", gap: 4 },
  actionButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  logout: { color: theme.colors.danger, fontWeight: "600", fontSize: 13 },
});
