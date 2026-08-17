import path from "node:path";
import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";

Font.register({
  family: "NotoSansThai",
  src: path.join(process.cwd(), "src/lib/pdf/fonts/NotoSansThai-Regular.ttf"),
});

const styles = StyleSheet.create({
  page: { fontFamily: "NotoSansThai", fontSize: 10, padding: 32, color: "#1a1a1a" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16, borderBottom: "2px solid #C54B38", paddingBottom: 12 },
  companyName: { fontSize: 16, fontWeight: 700 },
  companySub: { fontSize: 9, color: "#555", marginTop: 2 },
  title: { fontSize: 14, textAlign: "right" },
  periodLabel: { fontSize: 10, color: "#555", textAlign: "right", marginTop: 2 },
  infoGrid: { flexDirection: "row", marginBottom: 16, gap: 24 },
  infoBlock: { flex: 1 },
  infoRow: { flexDirection: "row", marginBottom: 4 },
  infoLabel: { width: 90, color: "#555" },
  infoValue: { flex: 1, fontWeight: 700 },
  table: { marginTop: 8, border: "1px solid #ddd" },
  tableRow: { flexDirection: "row", borderBottom: "1px solid #eee", paddingVertical: 6, paddingHorizontal: 8 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#f5f0ee", paddingVertical: 6, paddingHorizontal: 8, fontWeight: 700 },
  colLabel: { flex: 2 },
  colValue: { flex: 1, textAlign: "right" },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginTop: 16, marginBottom: 4, color: "#C54B38" },
  netPayBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#003942",
    color: "#ffffff",
    borderRadius: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  netPayLabel: { fontSize: 12 },
  netPayValue: { fontSize: 18, fontWeight: 700 },
  footer: { marginTop: 24, fontSize: 8, color: "#888", textAlign: "center" },
});

function money(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface PayslipDocumentProps {
  orgName: string;
  orgLegalName: string | null;
  employeeCode: string;
  employeeName: string;
  department: string | null;
  position: string | null;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  baseAmount: number;
  otAmount: number;
  workedDays: number;
  absentDays: number;
  lateCount: number;
  grossEarnings: number;
  socialSecurityAmount: number;
  taxAmount: number;
  totalDeductions: number;
  netPay: number;
}

export function PayslipDocument(p: PayslipDocumentProps) {
  const otherDeductions = p.totalDeductions - p.socialSecurityAmount - p.taxAmount;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{p.orgName}</Text>
            {p.orgLegalName && <Text style={styles.companySub}>{p.orgLegalName}</Text>}
          </View>
          <View>
            <Text style={styles.title}>สลิปเงินเดือน</Text>
            <Text style={styles.periodLabel}>{p.periodLabel}</Text>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoBlock}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>รหัสพนักงาน</Text>
              <Text style={styles.infoValue}>{p.employeeCode}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>ชื่อ-นามสกุล</Text>
              <Text style={styles.infoValue}>{p.employeeName}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>แผนก / ตำแหน่ง</Text>
              <Text style={styles.infoValue}>
                {p.department ?? "-"} / {p.position ?? "-"}
              </Text>
            </View>
          </View>
          <View style={styles.infoBlock}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>งวดเงินเดือน</Text>
              <Text style={styles.infoValue}>
                {p.periodStart} - {p.periodEnd}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>วันจ่ายเงิน</Text>
              <Text style={styles.infoValue}>{p.payDate}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>วันทำงาน / ขาด / สาย</Text>
              <Text style={styles.infoValue}>
                {p.workedDays} / {p.absentDays} / {p.lateCount} ครั้ง
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>รายได้</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.colLabel}>รายการ</Text>
            <Text style={styles.colValue}>จำนวนเงิน (บาท)</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.colLabel}>เงินเดือน / ค่าจ้างพื้นฐาน</Text>
            <Text style={styles.colValue}>{money(p.baseAmount)}</Text>
          </View>
          {p.otAmount > 0 && (
            <View style={styles.tableRow}>
              <Text style={styles.colLabel}>ค่าล่วงเวลา (OT)</Text>
              <Text style={styles.colValue}>{money(p.otAmount)}</Text>
            </View>
          )}
          <View style={styles.tableRow}>
            <Text style={styles.colLabel}>รวมรายได้</Text>
            <Text style={styles.colValue}>{money(p.grossEarnings)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>รายการหัก</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.colLabel}>รายการ</Text>
            <Text style={styles.colValue}>จำนวนเงิน (บาท)</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.colLabel}>ประกันสังคม</Text>
            <Text style={styles.colValue}>{money(p.socialSecurityAmount)}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.colLabel}>ภาษีหัก ณ ที่จ่าย</Text>
            <Text style={styles.colValue}>{money(p.taxAmount)}</Text>
          </View>
          {otherDeductions > 0 && (
            <View style={styles.tableRow}>
              <Text style={styles.colLabel}>รายการหักอื่นๆ</Text>
              <Text style={styles.colValue}>{money(otherDeductions)}</Text>
            </View>
          )}
          <View style={styles.tableRow}>
            <Text style={styles.colLabel}>รวมรายการหัก</Text>
            <Text style={styles.colValue}>{money(p.totalDeductions)}</Text>
          </View>
        </View>

        <View style={styles.netPayBox}>
          <Text style={styles.netPayLabel}>เงินได้สุทธิ</Text>
          <Text style={styles.netPayValue}>{money(p.netPay)} บาท</Text>
        </View>

        <Text style={styles.footer}>เอกสารนี้สร้างโดยระบบอัตโนมัติ ไม่จำเป็นต้องมีลายเซ็น — Nineall HR</Text>
      </Page>
    </Document>
  );
}
