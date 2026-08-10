import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";

interface PayslipRow {
  id: string;
  issued_at: string | null;
  payroll_periods: { label: string; pay_date: string } | null;
  payroll_employee_calculations: {
    gross_earnings: number;
    total_deductions: number;
    net_pay: number;
    social_security_amount: number;
    tax_amount: number;
  } | null;
}

export default function PayslipScreen() {
  const { profile } = useAuth();
  const [payslips, setPayslips] = useState<PayslipRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("payslips")
      .select("id, issued_at, payroll_periods(label, pay_date), payroll_employee_calculations(gross_earnings, total_deductions, net_pay, social_security_amount, tax_amount)")
      .eq("employee_id", profile.employeeId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setPayslips((data ?? []) as unknown as PayslipRow[]));
  }, [profile]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.title}>สลิปเงินเดือน</Text>

        {payslips.length === 0 && <Text style={styles.empty}>ยังไม่มีสลิปเงินเดือน</Text>}

        {payslips.map((p) => {
          const calc = p.payroll_employee_calculations;
          const period = p.payroll_periods;
          const expanded = expandedId === p.id;
          return (
            <View key={p.id} style={styles.card}>
              <View style={styles.cardHeader} onTouchEnd={() => setExpandedId(expanded ? null : p.id)}>
                <View>
                  <Text style={styles.periodLabel}>{period?.label ?? "-"}</Text>
                  <Text style={styles.payDate}>จ่ายวันที่ {period?.pay_date}</Text>
                </View>
                <Text style={styles.netPay}>{calc ? Number(calc.net_pay).toLocaleString("th-TH") : "-"} บาท</Text>
              </View>

              {expanded && calc && (
                <View style={styles.detail}>
                  <DetailRow label="รายได้รวม" value={calc.gross_earnings} />
                  <DetailRow label="รายการหักรวม" value={-calc.total_deductions} negative />
                  <DetailRow label="ประกันสังคม" value={-calc.social_security_amount} negative />
                  <DetailRow label="ภาษีหัก ณ ที่จ่าย" value={-calc.tax_amount} negative />
                  <View style={styles.divider} />
                  <DetailRow label="เงินได้สุทธิ" value={calc.net_pay} bold />
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value, negative, bold }: { label: string; value: number; negative?: boolean; bold?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, bold && { fontWeight: "800" }]}>{label}</Text>
      <Text style={[styles.detailValue, negative && { color: theme.colors.danger }, bold && { fontWeight: "800", color: theme.colors.primary }]}>
        {value.toLocaleString("th-TH")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.surfaceCream },
  title: { fontSize: 20, fontWeight: "800", color: theme.colors.primary, marginBottom: 16 },
  empty: { color: theme.colors.onSurfaceVariant, textAlign: "center", marginTop: 32 },
  card: { backgroundColor: "#fff", borderRadius: 16, marginBottom: 12, overflow: "hidden" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  periodLabel: { fontWeight: "700", fontSize: 15 },
  payDate: { fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 2 },
  netPay: { fontWeight: "800", color: theme.colors.primary, fontSize: 16 },
  detail: { paddingHorizontal: 16, paddingBottom: 16, gap: 6 },
  detailRow: { flexDirection: "row", justifyContent: "space-between" },
  detailLabel: { color: theme.colors.onSurfaceVariant, fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: "600" },
  divider: { height: 1, backgroundColor: theme.colors.outlineVariant, marginVertical: 4 },
});
