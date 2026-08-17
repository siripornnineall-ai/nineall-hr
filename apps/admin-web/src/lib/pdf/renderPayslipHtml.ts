import { notoSansThaiBase64 } from "./fonts/notoSansThaiBase64";

// Payslip PDFs used to be generated with @react-pdf/renderer, which embeds fonts as
// CID-keyed subsets — this renders correctly in Chrome/pdfium but is a well-known,
// unresolved upstream bug on iOS Safari/Preview (their stricter CoreGraphics PDF
// parser mis-renders the embedded glyphs, dropping/garbling Thai characters
// specifically). Printing real HTML through headless Chromium instead sidesteps the
// whole bug class: Chromium's own PDF export does correct font embedding that every
// viewer (including Apple's) reads the same way.
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

function money(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderPayslipHtml(p: PayslipDocumentProps): string {
  const otherDeductions = p.totalDeductions - p.socialSecurityAmount - p.taxAmount;
  const otRow =
    p.otAmount > 0
      ? `<tr><td class="col-label">ค่าล่วงเวลา (OT)</td><td class="col-value">${money(p.otAmount)}</td></tr>`
      : "";
  const otherDeductionRow =
    otherDeductions > 0
      ? `<tr><td class="col-label">รายการหักอื่นๆ</td><td class="col-value">${money(otherDeductions)}</td></tr>`
      : "";

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: "NotoSansThai";
    src: url(data:font/ttf;base64,${notoSansThaiBase64}) format("truetype");
    font-weight: normal;
    font-style: normal;
  }
  * { box-sizing: border-box; }
  body {
    font-family: "NotoSansThai", sans-serif;
    font-size: 10pt;
    color: #1a1a1a;
    padding: 32px;
    margin: 0;
  }
  .header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 16px;
    border-bottom: 2px solid #C54B38;
    padding-bottom: 12px;
  }
  .company-name { font-size: 16pt; font-weight: 700; }
  .company-sub { font-size: 9pt; color: #555; margin-top: 2px; }
  .title { font-size: 14pt; text-align: right; }
  .period-label { font-size: 10pt; color: #555; text-align: right; margin-top: 2px; }
  .info-grid { display: flex; margin-bottom: 16px; gap: 24px; }
  .info-block { flex: 1; }
  .info-row { display: flex; margin-bottom: 4px; }
  .info-label { width: 90px; color: #555; flex-shrink: 0; }
  .info-value { flex: 1; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; border: 1px solid #ddd; }
  th, td { padding: 6px 8px; text-align: left; }
  thead tr { background: #f5f0ee; font-weight: 700; }
  tbody tr { border-bottom: 1px solid #eee; }
  .col-value, th.col-value { text-align: right; }
  .section-title { font-size: 11pt; font-weight: 700; margin-top: 16px; margin-bottom: 4px; color: #C54B38; }
  .net-pay-box {
    margin-top: 16px;
    padding: 12px 16px;
    background: #003942;
    color: #fff;
    border-radius: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .net-pay-label { font-size: 12pt; }
  .net-pay-value { font-size: 18pt; font-weight: 700; }
  .footer { margin-top: 24px; font-size: 8pt; color: #888; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${escapeHtml(p.orgName)}</div>
      ${p.orgLegalName ? `<div class="company-sub">${escapeHtml(p.orgLegalName)}</div>` : ""}
    </div>
    <div>
      <div class="title">สลิปเงินเดือน</div>
      <div class="period-label">${escapeHtml(p.periodLabel)}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-block">
      <div class="info-row"><div class="info-label">รหัสพนักงาน</div><div class="info-value">${escapeHtml(p.employeeCode)}</div></div>
      <div class="info-row"><div class="info-label">ชื่อ-นามสกุล</div><div class="info-value">${escapeHtml(p.employeeName)}</div></div>
      <div class="info-row"><div class="info-label">แผนก / ตำแหน่ง</div><div class="info-value">${escapeHtml(p.department ?? "-")} / ${escapeHtml(p.position ?? "-")}</div></div>
    </div>
    <div class="info-block">
      <div class="info-row"><div class="info-label">งวดเงินเดือน</div><div class="info-value">${escapeHtml(p.periodStart)} - ${escapeHtml(p.periodEnd)}</div></div>
      <div class="info-row"><div class="info-label">วันจ่ายเงิน</div><div class="info-value">${escapeHtml(p.payDate)}</div></div>
      <div class="info-row"><div class="info-label">วันทำงาน / ขาด / สาย</div><div class="info-value">${p.workedDays} / ${p.absentDays} / ${p.lateCount} ครั้ง</div></div>
    </div>
  </div>

  <div class="section-title">รายได้</div>
  <table>
    <thead><tr><th class="col-label">รายการ</th><th class="col-value">จำนวนเงิน (บาท)</th></tr></thead>
    <tbody>
      <tr><td class="col-label">เงินเดือน / ค่าจ้างพื้นฐาน</td><td class="col-value">${money(p.baseAmount)}</td></tr>
      ${otRow}
      <tr><td class="col-label">รวมรายได้</td><td class="col-value">${money(p.grossEarnings)}</td></tr>
    </tbody>
  </table>

  <div class="section-title">รายการหัก</div>
  <table>
    <thead><tr><th class="col-label">รายการ</th><th class="col-value">จำนวนเงิน (บาท)</th></tr></thead>
    <tbody>
      <tr><td class="col-label">ประกันสังคม</td><td class="col-value">${money(p.socialSecurityAmount)}</td></tr>
      <tr><td class="col-label">ภาษีหัก ณ ที่จ่าย</td><td class="col-value">${money(p.taxAmount)}</td></tr>
      ${otherDeductionRow}
      <tr><td class="col-label">รวมรายการหัก</td><td class="col-value">${money(p.totalDeductions)}</td></tr>
    </tbody>
  </table>

  <div class="net-pay-box">
    <div class="net-pay-label">เงินได้สุทธิ</div>
    <div class="net-pay-value">${money(p.netPay)} บาท</div>
  </div>

  <div class="footer">เอกสารนี้สร้างโดยระบบอัตโนมัติ ไม่จำเป็นต้องมีลายเซ็น — Nineall HR</div>
</body>
</html>`;
}
