import { sarabunRegularBase64 } from "./fonts/sarabunRegularBase64";
import { sarabunBoldBase64 } from "./fonts/sarabunBoldBase64";

// Same headless-Chromium approach as admin-web's payslip generator (see that file's
// comment) — printing real HTML avoids the CID-font-subsetting bug that garbles Thai
// text on iOS Safari/Preview when using a JS PDF-construction library instead.
//
// Font: TH Sarabun New itself isn't available to embed here (no verified freely-licensed
// source on hand) — Google's Sarabun is the closest safe equivalent: same type family,
// SIL Open Font License, and visually near-identical for a document like this.
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
  // Data URI (e.g. "data:image/png;base64,...") of the signer's actual signature image,
  // if one has been provided — otherwise a blank line is left for signing on paper.
  signatureImageDataUri: string | null;
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
    font-family: "Sarabun";
    src: url(data:font/ttf;base64,${sarabunRegularBase64}) format("truetype");
    font-weight: 400;
    font-style: normal;
  }
  @font-face {
    font-family: "Sarabun";
    src: url(data:font/ttf;base64,${sarabunBoldBase64}) format("truetype");
    font-weight: 700;
    font-style: normal;
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Sarabun", sans-serif;
    font-weight: 400;
    font-size: 16pt;
    color: #1a1a1a;
    padding: 72px 80px;
    margin: 0;
    line-height: 1.9;
  }
  .title { font-size: 18pt; font-weight: 700; text-align: center; margin: 0 0 40px; }
  .body-text { text-indent: 56px; text-align: justify; }
  .body-text + .body-text { margin-top: 20px; }
  strong { font-weight: 700; }
  .issue-line { margin-top: 48px; text-align: right; }
  .signature-block { margin-top: 16px; text-align: right; padding-right: 56px; }
  .signature-image { height: 70px; margin-bottom: -18px; }
  .signature-line { margin-bottom: 8px; letter-spacing: 2px; }
  .signature-name { font-weight: 700; margin-top: 4px; }
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
    ${p.signatureImageDataUri ? `<img class="signature-image" src="${p.signatureImageDataUri}" alt="" /><br/>` : ""}
    <div class="signature-line">ลงชื่อ...........................................</div>
    ${p.signerName ? `<div class="signature-name">(${escapeHtml(p.signerName)})</div>` : ""}
    <div>${escapeHtml(p.signerTitle ?? "ผู้มีอำนาจลงนาม / ฝ่ายบุคคล")}</div>
  </div>
</body>
</html>`;
}
