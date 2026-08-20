import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { renderCertificateHtml, type CertificateDocumentProps } from "./renderCertificateHtml";

export type { CertificateDocumentProps };

// Mirrors apps/admin-web/src/lib/pdf/generatePayslipBuffer.ts exactly — see that file's
// comments for why this uses Puppeteer over @sparticuz/chromium (Vercel) /
// PUPPETEER_EXECUTABLE_PATH (local dev) instead of a JS PDF-construction library.
export async function generateCertificateBuffer(data: CertificateDocumentProps): Promise<Buffer> {
  const isLocal = Boolean(process.env.PUPPETEER_EXECUTABLE_PATH);
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || (await chromium.executablePath());

  const browser = await puppeteer.launch({
    args: isLocal ? [] : chromium.args,
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(renderCertificateHtml(data), { waitUntil: "domcontentloaded" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
