/**
 * Single-Page Precision HTML Print & PDF Template Generator
 * for TAX INVOICE and QUOTATION documents.
 *
 * Engineered to strictly fit on a SINGLE A4 PAGE in portrait mode,
 * with modern corporate typography, Indian GST compliance (State 33),
 * high-resolution branding, and zero multi-page overflow.
 */

export interface BillItemPrint {
  productName: string;
  sku?: string;
  hsn?: string;
  quantity: number;
  price: number;
  taxRate?: number;
  taxAmount?: number;
  total: number;
  uom?: string;
}

export interface BankDetailsPrint {
  beneficiaryName: string;
  bankName: string;
  accountNo: string;
  ifscCode: string;
  branch: string;
}

export interface TermConditionPrint {
  id?: number | string;
  text: string;
}

export interface BillPrintData {
  documentType: "TAX INVOICE" | "QUOTATION" | "INVOICE" | "PROFORMA INVOICE" | string;
  documentLabel: string; // e.g. "Invoice #" or "Quote No"
  invoiceNumber: string;
  billDate?: Date | string | any;
  dueDate?: Date | string | any;
  status?: string;
  paymentStatus?: string;
  paymentType?: string;
  paymentSubStatus?: string;
  isPaid?: boolean;
  isQuotation?: boolean;
  isApprovedAndPaid?: boolean;
  billedBy?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    gstin?: string;
    pan?: string;
    phone?: string;
    email?: string;
  };
  billedTo?: {
    name?: string;
    companyName?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    contactNumber?: string;
    gstin?: string;
    enqId?: string;
  };
  customerName?: string;
  customerContact?: string;
  customerCity?: string;
  customerState?: string;
  enquiryEnqId?: string;
  placeOfSupply?: string;
  taxType?: "cgst_sgst" | "igst" | string;
  taxRate?: number;
  subtotal?: number;
  discountPercentage?: number;
  discountAmount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  taxAmount?: number;
  cessAmount?: number;
  shippingCharges?: number;
  totalAmount?: number;
  items?: BillItemPrint[];
  bankDetails?: BankDetailsPrint;
  terms?: TermConditionPrint[];
  notes?: string;
  includeSignature?: boolean;
  logoUrl?: string;
  signatureUrl?: string;
}

// Convert numbers into Indian Currency format in words (Rupees & Paise)
export const numberToWords = (num: number): string => {
  if (isNaN(num) || num === 0) return "Zero Rupees Only";

  const units = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
  ];

  const convert = (n: number): string => {
    if (n < 20) return units[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + units[n % 10] : "");
    if (n < 1000) return units[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  };

  const rupees = Math.floor(Math.abs(num));
  const paise = Math.round((Math.abs(num) - rupees) * 100);

  let words = "Indian Rupees " + convert(rupees);
  if (paise > 0) {
    words += " and " + convert(paise) + " Paise";
  }
  return words + " Only";
};

export const defaultCompanyBankDetails: BankDetailsPrint = {
  beneficiaryName: "Protowiz Private Limited",
  bankName: "ICICI Bank",
  accountNo: "615205044958",
  ifscCode: "ICIC0008152",
  branch: "Ram Nagar Branch, Coimbatore",
};

export const defaultQuotationTerms: TermConditionPrint[] = [
  { id: 1, text: "Payment Terms: 100% advance payment required to confirm order." },
  { id: 2, text: "Delivery Timeline: 10 - 12 business days from advance confirmation." },
  { id: 3, text: "Price Validity: Valid for 2 days from date of issuance." },
  { id: 4, text: "GST charged extra as applicable at statutory rates." },
  { id: 5, text: "Subject to Coimbatore jurisdiction." },
];

export const defaultInvoiceTerms: TermConditionPrint[] = [
  { id: 1, text: "Goods once sold cannot be taken back or exchanged unless approved." },
  { id: 2, text: "Payment terms strictly as agreed per invoice." },
  { id: 3, text: "Warranty as per standard manufacturer guidelines." },
  { id: 4, text: "Subject to Coimbatore jurisdiction." },
];

const parseDateString = (rawDate: any): string => {
  if (!rawDate) return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  let d: Date;
  if (rawDate instanceof Date) d = rawDate;
  else if (rawDate.toDate && typeof rawDate.toDate === "function") d = rawDate.toDate();
  else d = new Date(rawDate);

  if (isNaN(d.getTime())) {
    return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Generates an ultra-clean, modern, single-page printable HTML string
 * for both Tax Invoices and Quotations.
 */
export const generateBillPrintHTML = (data: BillPrintData): string => {
  const isQuotation = data.isQuotation === true || data.documentType === "QUOTATION" || data.status === "quotation";
  const isPaid = data.isPaid === true || data.paymentStatus === "completed" || data.status === "paid" || data.isApprovedAndPaid === true;
  
  const docTitle = isQuotation ? "QUOTATION" : (isPaid || data.documentType === "TAX INVOICE" ? "TAX INVOICE" : "INVOICE");
  const docSubTitle = isQuotation 
    ? "COMMERCIAL PRICE ESTIMATE" 
    : "ORIGINAL FOR RECIPIENT • GST COMPLIANT";
  const docNumberLabel = isQuotation ? "Quote No" : "Invoice No";
  const docNumber = data.invoiceNumber || "N/A";
  const formattedDate = parseDateString(data.billDate);

  const bankDetails = data.bankDetails || defaultCompanyBankDetails;
  const termsList = data.terms && data.terms.length > 0 ? data.terms : (isQuotation ? defaultQuotationTerms : defaultInvoiceTerms);
  const shouldIncludeSignature = data.includeSignature !== false;
  
  const logoUrl = data.logoUrl || "https://ibots.in/wp-content/uploads/2024/07/ibots-logo.png";
  const signatureUrl = data.signatureUrl || "/sign.jpg";

  const customerName = data.billedTo?.name || data.customerName || "Customer";
  const customerCompany = data.billedTo?.companyName || "";
  const customerContact = data.billedTo?.contactNumber || data.customerContact || "-";
  const customerCity = data.billedTo?.city || data.customerCity || "";
  const customerState = data.billedTo?.state || data.customerState || "Tamil Nadu";
  const customerGstin = data.billedTo?.gstin || (data as any).gstin || "";
  const enquiryRef = data.billedTo?.enqId || data.enquiryEnqId || "";

  const items = data.items || [];
  const subtotal = data.subtotal || 0;
  const discountAmount = data.discountAmount || 0;
  const discountPercentage = data.discountPercentage || 0;
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxRate = data.taxRate || 18;
  const taxType = data.taxType || "cgst_sgst";
  const isInterState = taxType === "igst";

  const cgst = data.cgst || (isInterState ? 0 : (data.taxAmount ? data.taxAmount / 2 : (taxableAmount * (taxRate / 2)) / 100));
  const sgst = data.sgst || (isInterState ? 0 : (data.taxAmount ? data.taxAmount / 2 : (taxableAmount * (taxRate / 2)) / 100));
  const igst = data.igst || (isInterState ? (data.taxAmount || (taxableAmount * taxRate) / 100) : 0);
  const totalTax = isInterState ? igst : (cgst + sgst);
  const totalAmount = data.totalAmount || (taxableAmount + totalTax);

  const placeOfSupply = data.placeOfSupply || customerState || "Tamil Nadu (33)";
  const paymentMode = data.paymentType || "N/A";
  const paymentSubStatus = data.paymentSubStatus || "";

  // Render Table Headers & Rows
  let tableHeadersHtml = "";
  let tableRowsHtml = "";

  if (isQuotation) {
    tableHeadersHtml = `
      <tr>
        <th style="width: 32px; text-align: center;">#</th>
        <th style="text-align: left;">Item Description & Specifications</th>
        <th style="width: 75px; text-align: center;">HSN/SAC</th>
        <th style="width: 45px; text-align: center;">Qty</th>
        <th style="width: 45px; text-align: center;">UOM</th>
        <th style="width: 85px; text-align: right;">Unit Rate (₹)</th>
        <th style="width: 55px; text-align: center;">GST %</th>
        <th style="width: 80px; text-align: right;">GST Amt (₹)</th>
        <th style="width: 95px; text-align: right;">Total (₹)</th>
      </tr>
    `;

    tableRowsHtml = items.map((item, index) => {
      const itemQty = Number(item.quantity) || 1;
      const itemPrice = Number(item.price) || 0;
      const itemRatePct = item.taxRate !== undefined && item.taxRate !== null ? Number(item.taxRate) : taxRate;
      const itemTotal = Number(item.total) || (itemPrice * itemQty);
      const itemTaxAmt = item.taxAmount !== undefined && item.taxAmount !== null
        ? Number(item.taxAmount)
        : (itemTotal * itemRatePct) / 100;
      const lineTotal = itemTotal + itemTaxAmt;

      return `
        <tr>
          <td style="text-align: center; color: #64748b; font-weight: 600;">${index + 1}</td>
          <td>
            <div style="font-weight: 700; color: #0f172a; font-size: 11px;">${item.productName}</div>
            ${item.sku && item.sku !== '-' ? `<div style="font-size: 9px; color: #64748b; font-family: monospace;">SKU: ${item.sku}</div>` : ''}
          </td>
          <td style="text-align: center; font-family: monospace; font-size: 9.5px; color: #475569;">${item.hsn || '0000'}</td>
          <td style="text-align: center; font-weight: 700; color: #0f172a;">${itemQty}</td>
          <td style="text-align: center; color: #64748b; font-size: 9.5px;">${item.uom || 'Nos'}</td>
          <td style="text-align: right; font-variant-numeric: tabular-nums;">₹${itemPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align: center; font-weight: 600; color: #2563eb; font-size: 10px;">${itemRatePct}%</td>
          <td style="text-align: right; font-variant-numeric: tabular-nums; color: #475569;">₹${itemTaxAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align: right; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums;">₹${lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      `;
    }).join("");
  } else {
    // Tax Invoice Table
    tableHeadersHtml = `
      <tr>
        <th style="width: 35px; text-align: center;">#</th>
        <th style="text-align: left;">Description of Goods / Services</th>
        <th style="width: 85px; text-align: center;">HSN / SAC</th>
        <th style="width: 50px; text-align: center;">Qty</th>
        <th style="width: 100px; text-align: right;">Unit Rate (₹)</th>
        <th style="width: 105px; text-align: right;">Taxable Value (₹)</th>
        <th style="width: 115px; text-align: right;">Amount (₹)</th>
      </tr>
    `;

    tableRowsHtml = items.map((item, index) => {
      const itemQty = Number(item.quantity) || 1;
      const itemPrice = Number(item.price) || 0;
      const itemTotal = Number(item.total) || (itemPrice * itemQty);

      return `
        <tr>
          <td style="text-align: center; color: #64748b; font-weight: 600;">${index + 1}</td>
          <td>
            <div style="font-weight: 700; color: #0f172a; font-size: 11px;">${item.productName}</div>
            ${item.sku && item.sku !== '-' ? `<div style="font-size: 9px; color: #64748b; font-family: monospace;">SKU: ${item.sku}</div>` : ''}
          </td>
          <td style="text-align: center; font-family: monospace; font-size: 9.5px; color: #475569;">${item.hsn || '0000'}</td>
          <td style="text-align: center; font-weight: 700; color: #0f172a;">${itemQty}</td>
          <td style="text-align: right; font-variant-numeric: tabular-nums;">₹${itemPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align: right; font-variant-numeric: tabular-nums; color: #334155;">₹${itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align: right; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums;">₹${itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      `;
    }).join("");
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${docTitle} - ${docNumber} | Protowiz Private Limited</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        try {
          window.focus();
          window.print();
        } catch (e) {
          console.warn("Auto-print notice:", e);
        }
      }, 450);
    });
  </script>
  <style>
    @page {
      size: A4 portrait;
      margin: 6mm 8mm 6mm 8mm;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
    }
    html, body {
      width: 100%;
      height: 100%;
      background: #ffffff;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 10px;
      line-height: 1.3;
      color: #1e293b;
      padding: 10px 14px;
    }
    .document-sheet {
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      display: flex;
      flex-direction: column;
    }

    /* Top Letterhead */
    .letterhead {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 6px;
      border-bottom: 1.5px solid #cbd5e1;
      margin-bottom: 6px;
    }
    .brand-col {
      flex: 1;
      max-width: 260px;
    }
    .brand-logo {
      height: 34px;
      width: auto;
      max-width: 140px;
      object-fit: contain;
      display: block;
      margin-bottom: 2px;
    }
    .brand-tagline {
      font-size: 8.5px;
      font-weight: 600;
      color: #64748b;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }
    .company-col {
      flex: 1.5;
      text-align: right;
    }
    .company-name {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: 0.2px;
      margin-bottom: 1px;
    }
    .company-address {
      font-size: 9px;
      color: #475569;
      line-height: 1.25;
      margin-bottom: 2px;
    }
    .company-meta {
      font-size: 8.5px;
      color: #475569;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tax-pills {
      margin-top: 3px;
      display: flex;
      justify-content: flex-end;
      gap: 4px;
    }
    .tax-id-pill {
      display: inline-block;
      font-family: monospace;
      font-weight: 700;
      background: #f1f5f9;
      color: #1e293b;
      padding: 1px 5px;
      border-radius: 3px;
      border: 1px solid #cbd5e1;
      font-size: 8.5px;
    }

    /* Document Title Banner */
    .title-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 5px 10px;
      margin-bottom: 6px;
    }
    .title-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .doc-main-title {
      font-size: 16px;
      font-weight: 900;
      letter-spacing: 1px;
      color: ${isQuotation ? '#1d4ed8' : '#0f172a'};
    }
    .doc-sub-title {
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #64748b;
      text-transform: uppercase;
    }
    .doc-badge-status {
      display: inline-flex;
      align-items: center;
      padding: 1.5px 7px;
      border-radius: 9999px;
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .badge-paid {
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
    }
    .badge-unpaid {
      background: #fffbeb;
      color: #92400e;
      border: 1px solid #fde68a;
    }
    .badge-quotation {
      background: #eff6ff;
      color: #1e40af;
      border: 1px solid #bfdbfe;
    }
    .title-meta-grid {
      display: flex;
      gap: 14px;
      text-align: right;
    }
    .meta-box {
      display: flex;
      flex-direction: column;
    }
    .meta-box-label {
      font-size: 8px;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
      letter-spacing: 0.3px;
    }
    .meta-box-value {
      font-size: 11px;
      font-weight: 800;
      color: #0f172a;
      font-family: monospace;
    }

    /* Two Column Parties Section */
    .party-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 6px;
    }
    .party-card {
      border: 1px solid #e2e8f0;
      border-radius: 5px;
      background: #ffffff;
      overflow: hidden;
    }
    .party-header {
      background: #f8fafc;
      padding: 3px 8px;
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
    }
    .party-body {
      padding: 5px 8px;
      font-size: 9.5px;
      color: #334155;
      line-height: 1.35;
    }
    .party-name {
      font-weight: 800;
      color: #0f172a;
      font-size: 11px;
      margin-bottom: 1px;
    }

    /* Place of Supply Strip */
    .supply-strip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f1f5f9;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 8.5px;
      color: #334155;
      margin-bottom: 6px;
      border: 1px solid #e2e8f0;
    }

    /* Items Table */
    .table-container {
      margin-bottom: 6px;
      border-radius: 5px;
      overflow: hidden;
      border: 1px solid #cbd5e1;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
    }
    .items-table th {
      background: #f8fafc;
      color: #334155;
      font-weight: 700;
      font-size: 8.5px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 4px 6px;
      border-bottom: 1px solid #cbd5e1;
    }
    .items-table td {
      padding: 3.5px 6px;
      border-bottom: 1px solid #f1f5f9;
      color: #1e293b;
      vertical-align: middle;
    }
    .items-table tbody tr:nth-child(even) {
      background: #fafbfc;
    }

    /* Financial Bottom Section */
    .bottom-grid {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 10px;
      margin-bottom: 6px;
      align-items: start;
    }

    /* Words Callout */
    .words-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 3px 6px;
      margin-bottom: 4px;
      font-size: 9px;
    }
    .words-label {
      font-size: 7.5px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.4px;
      display: block;
    }
    .words-text {
      font-weight: 700;
      color: #0f172a;
    }

    /* Bank Card */
    .bank-card {
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      background: #ffffff;
      padding: 4px 6px;
      font-size: 8.5px;
      margin-bottom: 4px;
    }
    .bank-header {
      font-size: 8px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #1e293b;
      margin-bottom: 2px;
      padding-bottom: 1px;
      border-bottom: 1px solid #e2e8f0;
    }
    .bank-row {
      display: grid;
      grid-template-columns: 75px 1fr;
      padding: 0.5px 0;
    }
    .bank-label {
      color: #64748b;
      font-weight: 500;
    }
    .bank-val {
      font-weight: 700;
      color: #0f172a;
      font-family: monospace;
    }

    /* Terms Card */
    .terms-card {
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      background: #ffffff;
      padding: 4px 6px;
      font-size: 8px;
      color: #475569;
    }
    .terms-header {
      font-size: 8px;
      font-weight: 800;
      text-transform: uppercase;
      color: #1e293b;
      margin-bottom: 2px;
      letter-spacing: 0.4px;
    }
    .terms-list {
      list-style-type: decimal;
      padding-left: 11px;
      line-height: 1.25;
    }

    /* Client Acceptance Box for Quotation */
    .acceptance-box {
      border: 1px dashed #94a3b8;
      border-radius: 4px;
      padding: 4px 6px;
      margin-top: 4px;
      background: #fcfcfd;
      font-size: 8px;
      color: #475569;
    }
    .acceptance-header {
      font-weight: 800;
      color: #1e293b;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .acceptance-fields {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin-top: 4px;
    }
    .acceptance-line {
      border-bottom: 1px dotted #94a3b8;
      height: 12px;
    }

    /* Totals Box */
    .totals-card {
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      background: #f8fafc;
      padding: 6px 8px;
    }
    .calc-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      color: #475569;
      padding: 1.5px 0;
    }
    .calc-row.discount {
      color: #16a34a;
      font-weight: 600;
    }
    .calc-row.tax {
      color: #334155;
      font-weight: 600;
    }
    .calc-val {
      font-weight: 700;
      color: #0f172a;
      font-variant-numeric: tabular-nums;
    }
    .calc-divider {
      height: 1px;
      background: #cbd5e1;
      margin: 3px 0;
    }
    .grand-total-box {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding-top: 3px;
      margin-top: 2px;
      border-top: 1.5px solid #0f172a;
    }
    .grand-total-label {
      font-size: 10px;
      font-weight: 900;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .grand-total-value {
      font-size: 14px;
      font-weight: 900;
      color: ${isQuotation ? '#1d4ed8' : '#047857'};
      font-variant-numeric: tabular-nums;
    }

    /* Footer Signatory Block */
    .footer-block {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-top: 4px;
      border-top: 1px solid #e2e8f0;
      margin-top: 4px;
    }
    .footer-notes {
      font-size: 8px;
      color: #64748b;
      max-width: 440px;
      line-height: 1.25;
    }
    .signatory-box {
      text-align: right;
      width: 170px;
    }
    .signatory-company {
      font-size: 9.5px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 2px;
    }
    .sign-image-wrapper {
      height: 32px;
      display: flex;
      justify-content: flex-end;
      align-items: center;
      margin-bottom: 2px;
    }
    .sign-image {
      max-height: 30px;
      max-width: 110px;
      object-fit: contain;
    }
    .signatory-title {
      font-size: 8.5px;
      font-weight: 600;
      color: #475569;
      border-top: 1px solid #cbd5e1;
      padding-top: 1.5px;
      display: inline-block;
      width: 120px;
    }

    /* Minimal System Disclaimer */
    .system-disclaimer {
      text-align: center;
      font-size: 7.5px;
      color: #94a3b8;
      margin-top: 3px;
      padding-top: 2px;
      border-top: 1px dashed #e2e8f0;
    }

    /* On-Screen Action Bar */
    .no-print-bar {
      text-align: center;
      margin-top: 14px;
      padding: 10px;
      background: #f8fafc;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .print-btn {
      padding: 7px 16px;
      font-size: 11.5px;
      font-weight: 700;
      border-radius: 6px;
      border: none;
      background: #2563eb;
      color: white;
      cursor: pointer;
      margin: 0 4px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.08);
    }
    .close-btn {
      padding: 7px 14px;
      font-size: 11.5px;
      font-weight: 600;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      background: white;
      color: #475569;
      cursor: pointer;
      margin: 0 4px;
    }

    @media print {
      @page {
        size: A4 portrait;
        margin: 6mm 8mm 6mm 8mm;
      }
      html, body {
        height: 100% !important;
        max-height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        background: transparent !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print-bar {
        display: none !important;
      }
      .document-sheet {
        max-width: 100% !important;
        height: 100% !important;
        box-shadow: none !important;
        page-break-after: avoid !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      * {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
  </style>
</head>
<body>
  <div class="document-sheet">

    <!-- Top Letterhead -->
    <header class="letterhead">
      <div class="brand-col">
        <img 
          src="${logoUrl}" 
          alt="iBots" 
          class="brand-logo" 
          onerror="this.onerror=null; this.src='/ibots-logo.png';" 
        />
        <div class="brand-tagline">Unleash the power of Electronics</div>
      </div>
      <div class="company-col">
        <div class="company-name">Protowiz Private Limited</div>
        <div class="company-address">
          34/17A, First Floor, Ramalingam Nagar, 4th Cross St, Saibaba Colony, Coimbatore - 641011, Tamil Nadu
        </div>
        <div class="company-meta">
          <span>info@ibots.in</span> &bull;
          <span>+91 80152 98233</span> &bull;
          <span>www.ibots.in</span>
        </div>
        <div class="tax-pills">
          <span class="tax-id-pill">GSTIN: 33AAKCP9459K1ZO</span>
          <span class="tax-id-pill">PAN: AAMCP9459K</span>
          <span class="tax-id-pill">State Code: 33</span>
        </div>
      </div>
    </header>

    <!-- Document Title Banner -->
    <div class="title-banner">
      <div class="title-left">
        <span class="doc-main-title">${docTitle}</span>
        ${isQuotation ? `
          <span class="doc-badge-status badge-quotation">QUOTATION</span>
        ` : isPaid ? `
          <span class="doc-badge-status badge-paid">PAID</span>
        ` : `
          <span class="doc-badge-status badge-unpaid">PAYMENT DUE</span>
        `}
        <span class="doc-sub-title">${docSubTitle}</span>
      </div>
      <div class="title-meta-grid">
        <div class="meta-box">
          <span class="meta-box-label">${docNumberLabel}</span>
          <span class="meta-box-value">${docNumber}</span>
        </div>
        <div class="meta-box">
          <span class="meta-box-label">Date</span>
          <span class="meta-box-value" style="font-family: inherit; font-size: 10px;">${formattedDate}</span>
        </div>
        ${enquiryRef ? `
        <div class="meta-box">
          <span class="meta-box-label">Enquiry Ref</span>
          <span class="meta-box-value" style="color: #2563eb;">${enquiryRef}</span>
        </div>
        ` : ''}
      </div>
    </div>

    <!-- Two-Column Parties Section -->
    <div class="party-grid">
      <!-- Supplier / Billed By -->
      <div class="party-card">
        <div class="party-header">${isQuotation ? 'Quotation Issued By' : 'Supplier / Issued By'}</div>
        <div class="party-body">
          <div class="party-name">Protowiz Private Limited</div>
          <div>34/17A, Ramalingam Nagar, Saibaba Colony, Coimbatore - 641011</div>
          <div><strong>GSTIN:</strong> 33AAKCP9459K1ZO &nbsp;|&nbsp; <strong>State:</strong> Tamil Nadu (33)</div>
          <div><strong>Contact:</strong> info@ibots.in &nbsp;|&nbsp; +91 80152 98233</div>
        </div>
      </div>

      <!-- Buyer / Billed To -->
      <div class="party-card">
        <div class="party-header">${isQuotation ? 'Quotation Prepared For' : 'Billed To / Buyer'}</div>
        <div class="party-body">
          <div class="party-name">${customerName}</div>
          ${customerCompany ? `<div><strong>Company:</strong> ${customerCompany}</div>` : ''}
          <div><strong>Contact:</strong> ${customerContact} &nbsp;|&nbsp; <strong>Location:</strong> ${[customerCity, customerState].filter(Boolean).join(', ') || '-'}</div>
          <div>
            <strong>GSTIN:</strong> ${customerGstin ? `<span style="font-family: monospace; font-weight: bold;">${customerGstin}</span>` : 'Consumer / Unregistered'}
            ${!isQuotation && paymentMode !== 'N/A' ? ` &nbsp;|&nbsp; <strong>Payment:</strong> ${paymentMode}` : ''}
          </div>
        </div>
      </div>
    </div>

    <!-- Place of Supply Strip -->
    <div class="supply-strip">
      <div>
        <strong>Place of Supply:</strong> ${placeOfSupply} &nbsp;&bull;&nbsp;
        <strong>GST Treatment:</strong> ${isInterState ? 'Inter-State Supply (IGST)' : 'Intra-State Supply (CGST + SGST)'}
      </div>
      <div>
        <strong>Reverse Charge:</strong> No
      </div>
    </div>

    <!-- Items & Charges Table -->
    <div class="table-container">
      <table class="items-table">
        <thead>
          ${tableHeadersHtml}
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </div>

    <!-- Financial Bottom Section -->
    <div class="bottom-grid">
      <!-- Left Column: Words, Bank Details, Terms, Acceptance -->
      <div>
        <!-- Amount in Words -->
        <div class="words-card">
          <span class="words-label">Amount Chargeable (in words)</span>
          <span class="words-text">${numberToWords(totalAmount)}</span>
        </div>

        <!-- Bank Details -->
        <div class="bank-card">
          <div class="bank-header">Bank Transfer & Payment Details</div>
          <div class="bank-row">
            <span class="bank-label">Beneficiary:</span>
            <span class="bank-val" style="font-family: inherit;">${bankDetails.beneficiaryName}</span>
          </div>
          <div class="bank-row">
            <span class="bank-label">Bank Name:</span>
            <span class="bank-val" style="font-family: inherit;">${bankDetails.bankName}</span>
          </div>
          <div class="bank-row">
            <span class="bank-label">Account No:</span>
            <span class="bank-val">${bankDetails.accountNo}</span>
          </div>
          <div class="bank-row">
            <span class="bank-label">IFSC Code:</span>
            <span class="bank-val">${bankDetails.ifscCode}</span>
          </div>
          <div class="bank-row">
            <span class="bank-label">Branch:</span>
            <span class="bank-val" style="font-family: inherit;">${bankDetails.branch}</span>
          </div>
        </div>

        <!-- Terms & Conditions -->
        <div class="terms-card">
          <div class="terms-header">Terms & Conditions</div>
          <ol class="terms-list">
            ${termsList.map((t) => `<li>${t.text}</li>`).join('')}
          </ol>
        </div>

        ${isQuotation ? `
        <!-- Client Acceptance Section for Quotation -->
        <div class="acceptance-box">
          <div class="acceptance-header">Client Acceptance & Confirmation</div>
          <div class="acceptance-fields">
            <div>
              <div class="acceptance-line"></div>
              <div style="font-size: 7.5px; text-transform: uppercase; margin-top: 1px;">Name & Designation</div>
            </div>
            <div>
              <div class="acceptance-line"></div>
              <div style="font-size: 7.5px; text-transform: uppercase; margin-top: 1px;">Authorized Signature</div>
            </div>
            <div>
              <div class="acceptance-line"></div>
              <div style="font-size: 7.5px; text-transform: uppercase; margin-top: 1px;">Date & Seal</div>
            </div>
          </div>
        </div>
        ` : ''}

        ${data.notes ? `
        <div style="margin-top: 4px; padding: 3px 6px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 4px; font-size: 8.5px; color: #166534;">
          <strong>Notes:</strong> ${data.notes.replace(/\\n/g, '<br>')}
        </div>
        ` : ''}
      </div>

      <!-- Right Column: Structured Totals Box -->
      <div>
        <div class="totals-card">
          <div class="calc-row">
            <span>Subtotal (Taxable Value)</span>
            <span class="calc-val">₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>

          ${discountAmount > 0 ? `
          <div class="calc-row discount">
            <span>Discount (${discountPercentage}%)</span>
            <span class="calc-val" style="color: #16a34a;">-₹${discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          ` : ''}

          <div class="calc-divider"></div>

          ${isInterState ? `
          <div class="calc-row tax">
            <span>Integrated GST - IGST (${taxRate}%)</span>
            <span class="calc-val">₹${igst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          ` : `
          <div class="calc-row tax">
            <span>Central GST - CGST (${(taxRate / 2).toFixed(1)}%)</span>
            <span class="calc-val">₹${cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="calc-row tax">
            <span>State GST - SGST (${(taxRate / 2).toFixed(1)}%)</span>
            <span class="calc-val">₹${sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          `}

          ${data.cessAmount && data.cessAmount > 0 ? `
          <div class="calc-row tax">
            <span>Cess</span>
            <span class="calc-val">₹${Number(data.cessAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          ` : ''}

          ${data.shippingCharges && data.shippingCharges > 0 ? `
          <div class="calc-row">
            <span>Shipping / Delivery</span>
            <span class="calc-val">₹${Number(data.shippingCharges).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          ` : ''}

          <div class="grand-total-box">
            <span class="grand-total-label">${isQuotation ? 'Total Estimated' : 'Grand Total'}</span>
            <span class="grand-total-value">₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Signatory & Authorization Block -->
    <div class="footer-block">
      <div class="footer-notes">
        Official commercial ${isQuotation ? 'quotation' : 'tax invoice'} issued by <strong>Protowiz Private Limited</strong>.<br />
        This is a computer-generated document &bull; Coimbatore - 641011 &bull; info@ibots.in &bull; +91 80152 98233
      </div>
      <div class="signatory-box">
        <div class="signatory-company">For Protowiz Private Limited</div>
        <div class="sign-image-wrapper">
          ${shouldIncludeSignature ? `
            <img 
              src="${signatureUrl}" 
              alt="Authorized Signatory" 
              class="sign-image" 
              onerror="this.style.display='none'" 
            />
          ` : ''}
        </div>
        <div class="signatory-title">Authorised Signatory</div>
      </div>
    </div>

    <!-- Minimal System Disclaimer -->
    <div class="system-disclaimer">
      Protowiz Private Limited &bull; Unleash the power of Electronics &bull; www.ibots.in
    </div>

    <!-- On-Screen Action Bar (Hidden when printing/PDF exporting) -->
    <div class="no-print-bar">
      <button onclick="window.print();" class="print-btn">
        🖨 Print / Save as PDF (Single Page)
      </button>
      <button onclick="window.close();" class="close-btn">
        ✕ Close Window
      </button>
    </div>

  </div>
</body>
</html>
`;
};
