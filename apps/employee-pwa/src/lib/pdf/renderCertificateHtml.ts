import { notoSansThaiBase64 } from "./fonts/notoSansThaiBase64";

// Same headless-Chromium approach as admin-web's payslip generator (see that file's
// comment) — printing real HTML avoids the CID-font-subsetting bug that garbles Thai
// text on iOS Safari/Preview when using a JS PDF-construction library instead.
export interface CertificateDocumentProps {
  orgName: string;
  orgLegalName: string | null;
  orgTaxId: string | null;
  employeeCode: string;
  employeeName: string;
  position: string | null;
  department: string | null;
  employmentType: string;
  hireDate: string;
  baseAmountBaht: number | null;
  showSalary: boolean;
  purpose: string | null;
  issueDate: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const EMPLOYMENT_TYPE_TH: Record<string, string> = {
  monthly: "รายเดือน (พนักงานประจำ)",
  daily: "รายวัน",
  hourly: "รายชั่วโมง",
  part_time: "พาร์ทไทม์",
  contract: "สัญญาจ้าง",
};

export function renderCertificateHtml(p: CertificateDocumentProps): string {
  const salarySentence = p.showSalary && p.baseAmountBaht
    ? `ได้รับเงินเดือน/ค่าจ้างอัตรา ${p.baseAmountBaht.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาทต่อเดือน `
    : "";
  const purposeSentence = p.purpose ? `ทั้งนี้เพื่อใช้ประกอบ${escapeHtml(p.purpose)}` : "ทั้งนี้เพื่อใช้ตามความประสงค์ของผู้ร้องขอ";

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
    font-size: 12pt;
    color: #1a1a1a;
    padding: 48px 56px;
    margin: 0;
    line-height: 1.9;
  }
  .header { text-align: center; margin-bottom: 28px; border-bottom: 2px solid #C54B38; padding-bottom: 16px; }
  .company-name { font-size: 18pt; font-weight: 700; }
  .company-sub { font-size: 10pt; color: #555; margin-top: 2px; }
  .title { font-size: 16pt; font-weight: 700; text-align: center; margin: 24px 0 8px; letter-spacing: 2px; }
  .doc-no { text-align: right; font-size: 10pt; color: #555; }
  .body-text { margin-top: 20px; text-align: justify; }
  .signature-block { margin-top: 64px; text-align: center; }
  .signature-line { margin-top: 56px; border-top: 1px solid #333; width: 240px; margin-left: auto; margin-right: auto; padding-top: 6px; }
  .footer { margin-top: 40px; font-size: 8pt; color: #888; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <div class="company-name">${escapeHtml(p.orgName)}</div>
    ${p.orgLegalName ? `<div class="company-sub">${escapeHtml(p.orgLegalName)}</div>` : ""}
    ${p.orgTaxId ? `<div class="company-sub">เลขประจำตัวผู้เสียภาษีอากร ${escapeHtml(p.orgTaxId)}</div>` : ""}
  </div>

  <div class="doc-no">วันที่ออกเอกสาร: ${escapeHtml(p.issueDate)}</div>
  <div class="title">หนังสือรับรองการทำงาน</div>

  <div class="body-text">
    หนังสือฉบับนี้ออกให้เพื่อรับรองว่า <strong>${escapeHtml(p.employeeName)}</strong> รหัสพนักงาน ${escapeHtml(p.employeeCode)}
    เป็น${p.department ? `พนักงานสังกัดแผนก${escapeHtml(p.department)} ` : "พนักงาน "}
    ตำแหน่ง <strong>${escapeHtml(p.position ?? "-")}</strong>
    ประเภทการจ้างงานแบบ${escapeHtml(EMPLOYMENT_TYPE_TH[p.employmentType] ?? p.employmentType)}
    ของ${escapeHtml(p.orgName)} ตั้งแต่วันที่ ${escapeHtml(p.hireDate)} จนถึงปัจจุบัน
    ${salarySentence}
    ${purposeSentence}
  </div>

  <div class="signature-block">
    <div class="signature-line">ผู้มีอำนาจลงนาม / ฝ่ายบุคคล</div>
  </div>

  <div class="footer">เอกสารนี้ออกโดยระบบอัตโนมัติของ ${escapeHtml(p.orgName)} — Nineall HR</div>
</body>
</html>`;
}
