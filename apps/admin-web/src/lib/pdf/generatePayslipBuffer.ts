import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { renderPayslipHtml, type PayslipDocumentProps } from "./renderPayslipHtml";

export type { PayslipDocumentProps };

// Locally, point PUPPETEER_EXECUTABLE_PATH (see .env.local) at the Chromium the
// `puppeteer` devDependency downloads to ~/.cache/puppeteer — that package is dev-only
// so it's never bundled into the deployed function. On Vercel, @sparticuz/chromium
// supplies a build made to fit the serverless function size limit.
export async function generatePayslipBuffer(data: PayslipDocumentProps): Promise<Buffer> {
  const isLocal = Boolean(process.env.PUPPETEER_EXECUTABLE_PATH);
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || (await chromium.executablePath());

  // chromium.args carries flags (e.g. --single-process) tuned for @sparticuz/chromium's
  // restricted Lambda/serverless environment — applying them to a full desktop Chrome
  // build locally crashes it (Page.printToPDF: Target closed) instead of helping.
  const browser = await puppeteer.launch({
    args: isLocal ? [] : chromium.args,
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    // No external resources to wait for — the font is an inline base64 data URI.
    await page.setContent(renderPayslipHtml(data), { waitUntil: "domcontentloaded" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
