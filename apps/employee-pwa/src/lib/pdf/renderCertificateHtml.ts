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
  signerName: string | null;
  signerTitle: string | null;
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
    ? ` มีอัตราเงินเดือนประจำเดือนละ ${p.baseAmountBaht.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท ซึ่งอัตรานี้ยังไม่รวมค่าตอบแทนและเงินพิเศษอื่นๆ`
    : "";
  const purposeSentence = p.purpose
    ? `หนังสือรับรองฉบับนี้ใช้เพื่อประกอบ${escapeHtml(p.purpose)}เท่านั้น`
    : "หนังสือรับรองฉบับนี้ใช้ตามความประสงค์ของผู้ร้องขอเท่านั้น";

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
    font-size: 13pt;
    color: #1a1a1a;
    padding: 64px 72px;
    margin: 0;
    line-height: 2;
  }
  .title { font-size: 17pt; font-weight: 700; text-align: center; margin: 0 0 36px; }
  .body-text { text-indent: 48px; text-align: justify; }
  .body-text + .body-text { margin-top: 18px; }
  .issue-line { margin-top: 40px; text-align: right; }
  .signature-block { margin-top: 64px; text-align: right; padding-right: 48px; }
  .signature-line { margin-bottom: 6px; }
  .signature-name { font-weight: 700; }
</style>
</head>
<body>
  <div class="title">หนังสือรับรองการทำงาน</div>

  <div class="body-text">
    หนังสือฉบับนี้ออกเพื่อรับรองว่า <strong>${escapeHtml(p.employeeName)}</strong> รหัสพนักงาน ${escapeHtml(p.employeeCode)}
    เป็นพนักงานของ${escapeHtml(p.orgLegalName ?? p.orgName)}
    ปฏิบัติงานในตำแหน่ง <strong>${escapeHtml(p.position ?? "-")}</strong>${p.department ? ` ฝ่าย${escapeHtml(p.department)}` : ""}
    ประเภทการจ้างงานแบบ${escapeHtml(EMPLOYMENT_TYPE_TH[p.employmentType] ?? p.employmentType)}
  </div>

  <div class="body-text">
    โดยเริ่มทำงานตั้งแต่วันที่ ${escapeHtml(p.hireDate)} จนถึงปัจจุบัน${salarySentence}
  </div>

  <div class="body-text">
    ${purposeSentence}
  </div>

  <div class="issue-line">ออกให้ ณ วันที่ ${escapeHtml(p.issueDate)}</div>

  <div class="signature-block">
    <div class="signature-line">ลงชื่อ...........................................</div>
    ${p.signerName ? `<div class="signature-name">(${escapeHtml(p.signerName)})</div>` : ""}
    <div>${escapeHtml(p.signerTitle ?? "ผู้มีอำนาจลงนาม / ฝ่ายบุคคล")}</div>
  </div>
</body>
</html>`;
}
