import { renderToBuffer } from "@react-pdf/renderer";
import { PayslipDocument, type PayslipDocumentProps } from "./PayslipDocument";

export async function generatePayslipBuffer(data: PayslipDocumentProps): Promise<Buffer> {
  return renderToBuffer(<PayslipDocument {...data} />);
}
