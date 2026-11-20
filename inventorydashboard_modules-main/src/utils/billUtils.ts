/**
 * Universal utility functions for bill processing, deduplication,
 * status resolution, and sales & cost calculations.
 *
 * Guarantees 100% mathematical consistency across:
 * - BillTransactions (Billing page)
 * - PNL (Profit & Loss page)
 * - Dashboard (Executive overview & metrics)
 * - Reports (Client reports & comparisons)
 */

export const isDroppedBill = (bill: any): boolean => {
  if (!bill) return false;
  const status = String(bill.status || "").toLowerCase().trim();
  const paymentStatus = String(bill.paymentStatus || "").toLowerCase().trim();
  const enquiryStatus = String(bill.enquiryStatus || "").toLowerCase().trim();
  const paymentSubStatus = String(bill.paymentSubStatus || "").toLowerCase().trim();

  return (
    status === "dropped" ||
    status === "cancelled" ||
    status === "canceled" ||
    enquiryStatus === "dropped" ||
    enquiryStatus === "cancelled" ||
    enquiryStatus === "canceled" ||
    paymentStatus === "refunded" ||
    bill.refunded === true ||
    paymentSubStatus.includes("refund")
  );
};

export const isQuotationBill = (bill: any): boolean => {
  if (!bill) return false;
  if (isDroppedBill(bill)) return false;

  const status = String(bill.status || "").toLowerCase().trim();
  const enquiryStatus = String(bill.enquiryStatus || "").toLowerCase().trim();
  const paymentStatus = String(bill.paymentStatus || "").toLowerCase().trim();
  const invoiceNumber = String(bill.invoiceNumber || (bill as any).quotationNumber || (bill as any).quoteNo || "").toUpperCase().trim();
  const docType = String(bill.documentType || "").toUpperCase().trim();

  // Master Rule 1: If enquiryStatus is explicitly quotation, quote, or proforma invoice:
  // It is STRICTLY a quotation unless the enquiry was explicitly approved or paid!
  const isEnquiryQuote =
    enquiryStatus === "quotation" ||
    enquiryStatus === "quote" ||
    enquiryStatus === "proforma invoice";

  if (isEnquiryQuote) {
    const isEnquiryExplicitlySold =
      enquiryStatus === "approved" ||
      enquiryStatus === "delivered" ||
      enquiryStatus === "dispatched" ||
      paymentStatus === "paid";
    return !isEnquiryExplicitlySold;
  }

  // Master Rule 2: If document or bill is explicitly a quotation/proforma invoice:
  const isExplicitQuote =
    status === "quotation" ||
    status === "quote" ||
    status === "proforma" ||
    bill.isQuotation === true ||
    bill.isProformaInvoice === true ||
    docType === "QUOTATION" ||
    docType === "PROFORMA INVOICE" ||
    invoiceNumber.startsWith("IBQ-") ||
    invoiceNumber.startsWith("IBPI-");

  if (isExplicitQuote) {
    const isSoldOrApproved =
      paymentStatus === "paid" ||
      enquiryStatus === "approved" ||
      enquiryStatus === "delivered" ||
      enquiryStatus === "dispatched" ||
      status === "approved";
    return !isSoldOrApproved;
  }

  // Master Rule 3: Pending bills without explicit approval or payment confirmation are treated as quotation / estimates
  if (
    (status === "pending" || !status) &&
    paymentStatus !== "paid" &&
    enquiryStatus !== "approved" &&
    enquiryStatus !== "delivered" &&
    enquiryStatus !== "dispatched"
  ) {
    return true;
  }

  return false;
};

export const isSoldBill = (bill: any): boolean => {
  if (!bill) return false;
  if (isDroppedBill(bill)) return false;
  if (isQuotationBill(bill)) return false;

  const status = String(bill.status || "").toLowerCase().trim();
  const paymentStatus = String(bill.paymentStatus || "").toLowerCase().trim();
  const enquiryStatus = String(bill.enquiryStatus || "").toLowerCase().trim();

  // Sold orders: approved, delivered, dispatched, sales, paid, completed (only when NOT a quotation or dropped)
  return (
    status === "paid" ||
    status === "approved" ||
    status === "delivered" ||
    status === "dispatched" ||
    status === "sales" ||
    status === "completed" ||
    paymentStatus === "paid" ||
    paymentStatus === "completed" ||
    enquiryStatus === "approved" ||
    enquiryStatus === "delivered" ||
    enquiryStatus === "dispatched" ||
    enquiryStatus === "completed" ||
    enquiryStatus === "sales"
  );
};

/**
 * Single source of truth for confirmed sold bills:
 * Strictly excludes dropped bills, quotations, proformas, estimates, and unpaid leads.
 */
export const isSoldBillRecord = (bill: any): boolean => {
  if (!bill) return false;
  if (isDroppedBill(bill)) return false;
  if (isQuotationBill(bill)) return false;
  return isSoldBill(bill);
};

/**
 * Calculate total purchase value of all stock ever purchased for a product.
 * Sum of all non-delivery stock entries, falling back to quantity * unit cost.
 */
export const calculateProductPurchasedValue = (product: any): number => {
  if (!product) return 0;
  const stockEntries = product.stockEntries || [];
  if (Array.isArray(stockEntries) && stockEntries.length > 0) {
    const addedCost = stockEntries
      .filter((e: any) => e && e.type !== "deliver")
      .reduce(
        (sum: number, e: any) =>
          sum +
          Number(
            e.totalPrice !== undefined && e.totalPrice !== null && !isNaN(Number(e.totalPrice))
              ? Number(e.totalPrice)
              : Number(e.quantity || 0) * Number(e.unitPrice || 0)
          ),
        0
      );
    if (addedCost > 0) return addedCost;
  }
  const qty = Number(product.totalQuantity || product.quantity || 0);
  const unitCost = getProductUnitCost(product);
  return qty * unitCost;
};

/**
 * Calculate current physical stock on hand value at unit purchase cost.
 */
export const calculateProductCurrentStockValue = (product: any): number => {
  if (!product) return 0;
  const qty = Math.max(0, Number(product.totalQuantity || 0));
  const unitCost = getProductUnitCost(product);
  return qty * unitCost;
};

/**
 * Deduplicate bills: keep only the newest revision for duplicate invoice numbers or document IDs.
 */
export function deduplicateBills<T extends { id?: string; invoiceNumber?: string; updatedAt?: any; createdAt?: any; billDate?: any }>(
  bills: T[]
): T[] {
  const billMap = new Map<string, T>();

  const getDocTimestamp = (x: any): number => {
    const val = x.updatedAt || x.createdAt || x.billDate;
    if (val?.toDate && typeof val.toDate === "function") return val.toDate().getTime();
    if (val instanceof Date) return val.getTime();
    if (typeof val === "object" && typeof val?.seconds === "number") return val.seconds * 1000;
    if (typeof val === "string" || typeof val === "number") {
      const t = new Date(val).getTime();
      if (!isNaN(t)) return t;
    }
    return 0;
  };

  const sortedBills = [...bills].sort((a, b) => getDocTimestamp(b) - getDocTimestamp(a));

  sortedBills.forEach((bill) => {
    const invNum = (
      bill.invoiceNumber ||
      (bill as any).billNumber ||
      (bill as any).quoteNo ||
      (bill as any).quotationNumber ||
      ""
    ).trim();

    const key = invNum ? `inv_${invNum.toLowerCase()}` : (bill.id || `bill_${Math.random()}`);
    if (!billMap.has(key)) {
      billMap.set(key, bill);
    }
  });

  return Array.from(billMap.values());
}

/**
 * Build a robust, case-insensitive, multi-alias enquiry lookup map.
 */
export function buildEnquiriesMap(enquiries: any[]): Map<string, any> {
  const map = new Map<string, any>();
  if (!Array.isArray(enquiries)) return map;

  enquiries.forEach((enq) => {
    if (!enq) return;
    if (enq.id) {
      map.set(String(enq.id).trim(), enq);
      map.set(String(enq.id).trim().toLowerCase(), enq);
    }
    if (enq.enqId) {
      const raw = String(enq.enqId).trim();
      map.set(raw, enq);
      map.set(raw.toLowerCase(), enq);
      map.set(raw.toUpperCase(), enq);
      const compact = raw.replace(/[\s-_]/g, "");
      if (compact) {
        map.set(compact.toLowerCase(), enq);
        map.set(compact.toUpperCase(), enq);
      }
    }
    if (enq.billId) {
      const bRaw = String(enq.billId).trim();
      map.set(bRaw, enq);
      map.set(bRaw.toLowerCase(), enq);
    }
    if (enq.invoiceNumber) {
      const invRaw = String(enq.invoiceNumber).trim();
      map.set(invRaw, enq);
      map.set(invRaw.toLowerCase(), enq);
    }

    // Phone indexing
    const rawPhone = String(
      enq.contactNumber ||
      enq.customerContact ||
      enq.customer?.contactNumber ||
      enq.customer?.phone ||
      enq.customer?.mobile ||
      enq.phone ||
      enq.mobile ||
      enq.companyDetails?.companyMobile ||
      ""
    ).replace(/\D/g, "");
    if (rawPhone.length >= 7) {
      map.set(`phone_${rawPhone}`, enq);
      map.set(`phone_${rawPhone.slice(-10)}`, enq);
    }

    // Name indexing
    const rawName = String(
      enq.customerName ||
      enq.customer?.name ||
      enq.companyDetails?.companyName ||
      enq.name ||
      ""
    ).trim().toLowerCase();
    if (rawName.length >= 3) {
      map.set(`name_${rawName}`, enq);
    }
  });

  return map;
}

/**
 * Find matching enquiry for a bill across all identifier variations.
 */
export function findMatchingEnquiry(bill: any, enquiriesMap: Map<string, any>): any | null {
  if (!bill || !enquiriesMap) return null;

  const candidateKeys = [
    bill.enquiryEnqId,
    bill.enquiryId,
    bill.billedTo?.enqId,
    (bill as any).enqId,
    (bill as any).quotationId,
    (bill as any).quoteNo,
    (bill as any).billId,
    bill.id,
    bill.invoiceNumber,
  ];

  for (const k of candidateKeys) {
    if (!k) continue;
    const strK = String(k).trim();
    if (enquiriesMap.has(strK)) return enquiriesMap.get(strK);
    const strLower = strK.toLowerCase();
    if (enquiriesMap.has(strLower)) return enquiriesMap.get(strLower);
    const compact = strLower.replace(/[\s-_]/g, "");
    if (compact && enquiriesMap.has(compact)) return enquiriesMap.get(compact);
  }

  // Fallback to customer phone number
  const rawBillPhone = String(
    bill.customerContact ||
    bill.billedTo?.contactNumber ||
    (bill as any).phone ||
    (bill as any).mobile ||
    (bill as any).contact ||
    ""
  ).replace(/\D/g, "");
  if (rawBillPhone.length >= 7) {
    if (enquiriesMap.has(`phone_${rawBillPhone}`)) return enquiriesMap.get(`phone_${rawBillPhone}`);
    if (enquiriesMap.has(`phone_${rawBillPhone.slice(-10)}`)) return enquiriesMap.get(`phone_${rawBillPhone.slice(-10)}`);
  }

  // Fallback to customer name
  const rawBillName = String(
    bill.customerName ||
    bill.billedTo?.name ||
    (bill as any).name ||
    ""
  ).trim().toLowerCase();
  if (rawBillName.length >= 3 && enquiriesMap.has(`name_${rawBillName}`)) {
    return enquiriesMap.get(`name_${rawBillName}`);
  }

  return null;
}

/**
 * Enrich a bill with its linked enquiry details and normalize its status.
 */
export function resolveBillWithEnquiry(bill: any, enquiriesMap?: Map<string, any>): any {
  if (!bill) return bill;
  const enquiryData = enquiriesMap ? findMatchingEnquiry(bill, enquiriesMap) : null;

  const rawEnqStatus = enquiryData?.status || (enquiryData as any)?.productStatus || bill.enquiryStatus || "";
  const productStatus = rawEnqStatus;
  const enqStatusLower = String(rawEnqStatus).toLowerCase().trim();

  const rawEnqPayment = enquiryData?.paymentStatus || "";
  const enqPaymentLower = String(rawEnqPayment).toLowerCase().trim();

  const billStatusLower = String(bill.status || "").toLowerCase().trim();
  const billPaymentLower = String(bill.paymentStatus || "").toLowerCase().trim();

  const paymentSubStatus = bill.paymentSubStatus || enquiryData?.paymentSubStatus || enquiryData?.paymentType || "";

  const invoiceNumberRaw =
    bill.invoiceNumber ||
    bill.billNumber ||
    bill.quoteNo ||
    bill.quotationNumber ||
    bill.proformaInvoiceNumber ||
    bill.billId ||
    "";

  const invUpper = String(invoiceNumberRaw).toUpperCase().trim();
  const docType = String(bill.documentType || "").toUpperCase().trim();

  const isEnqDropped =
    enqStatusLower === "dropped" ||
    enqStatusLower === "cancelled" ||
    enqStatusLower === "canceled";

  const isBillDropped =
    billStatusLower === "dropped" ||
    billStatusLower === "cancelled" ||
    billStatusLower === "canceled" ||
    isDroppedBill(bill);

  const isEnqQuote =
    enqStatusLower === "quotation" ||
    enqStatusLower === "quote" ||
    enqStatusLower === "proforma invoice" ||
    String(enquiryData?.type || "").toLowerCase().includes("quotation");

  const isBillQuote =
    billStatusLower === "quotation" ||
    billStatusLower === "quote" ||
    billStatusLower === "proforma" ||
    bill.isQuotation === true ||
    bill.isProformaInvoice === true ||
    docType === "QUOTATION" ||
    docType === "PROFORMA INVOICE" ||
    invUpper.startsWith("IBQ-") ||
    invUpper.startsWith("IBPI-");

  // Determine final status & paymentStatus:
  let status: "quotation" | "paid" | "dropped" = "quotation";
  let transactionPaymentStatus: "pending" | "completed" = "pending";

  if (isEnqDropped || isBillDropped) {
    status = "dropped";
    transactionPaymentStatus = "pending";
  } else if (isEnqQuote) {
    // MASTER SOURCE OF TRUTH: If the enquiry is in Quotation status:
    // It remains STRICTLY a Quotation unless the enquiry itself is explicitly approved or paid!
    // Stale or default statuses on the bill document (e.g. status: "completed" or "paid") NEVER override the enquiry!
    if (enqStatusLower === "approved" || enqStatusLower === "delivered" || enqStatusLower === "dispatched") {
      status = "paid";
      transactionPaymentStatus = (enqPaymentLower === "paid" || billPaymentLower === "paid") ? "completed" : "pending";
    } else if (enqPaymentLower === "paid") {
      status = "paid";
      transactionPaymentStatus = "completed";
    } else {
      status = "quotation";
      transactionPaymentStatus = "pending";
    }
  } else if (isBillQuote) {
    if (enqStatusLower === "approved" || enqStatusLower === "delivered" || enqStatusLower === "dispatched") {
      status = "paid";
      transactionPaymentStatus = (enqPaymentLower === "paid" || billPaymentLower === "paid") ? "completed" : "pending";
    } else if (enqPaymentLower === "paid" || billPaymentLower === "paid") {
      status = "paid";
      transactionPaymentStatus = "completed";
    } else {
      status = "quotation";
      transactionPaymentStatus = "pending";
    }
  } else if (
    enqStatusLower === "approved" ||
    enqStatusLower === "delivered" ||
    enqStatusLower === "dispatched" ||
    billStatusLower === "approved" ||
    billStatusLower === "delivered" ||
    billStatusLower === "dispatched" ||
    billStatusLower === "sales" ||
    billStatusLower === "completed" ||
    billStatusLower === "paid" ||
    enqPaymentLower === "paid" ||
    billPaymentLower === "paid" ||
    billPaymentLower === "completed"
  ) {
    status = "paid";
    transactionPaymentStatus =
      enqPaymentLower === "paid" || billPaymentLower === "paid" || billPaymentLower === "completed" || billStatusLower === "paid"
        ? "completed"
        : "pending";
  } else {
    status = "quotation";
    transactionPaymentStatus = "pending";
  }

  // If bill.items is empty, fall back to enquiry materials
  let resolvedItems = bill.items;
  if (typeof resolvedItems === "string") {
    try {
      resolvedItems = JSON.parse(resolvedItems);
    } catch {
      resolvedItems = [];
    }
  }
  if (!Array.isArray(resolvedItems) || resolvedItems.length === 0) {
    const alt = bill.materials || bill.products;
    if (Array.isArray(alt)) resolvedItems = alt;
    else if (typeof alt === "string") {
      try {
        resolvedItems = JSON.parse(alt);
      } catch {
        resolvedItems = [];
      }
    }
  }
  if ((!resolvedItems || !Array.isArray(resolvedItems) || resolvedItems.length === 0) && enquiryData) {
    try {
      let parsed = enquiryData.materials || enquiryData.products || enquiryData.items;
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
      if (Array.isArray(parsed)) {
        resolvedItems = parsed.map((m: any, idx: number) => ({
          productId: m.productId || m.id || `PROD-${idx}`,
          productName: m.productName || m.name || "Item",
          quantity: Number(m.quantity) || 1,
          price: Number(m.price) || 0,
          total: Number(m.totalAmount || m.total || (Number(m.price || 0) * Number(m.quantity || 1))),
          purchasePrice: m.purchasePrice !== undefined ? Number(m.purchasePrice) : undefined,
          costPrice: m.costPrice,
          cost: m.cost,
          buyingPrice: m.buyingPrice,
          sku: m.sku,
          category: m.category,
          hsn: m.hsn || m.hsnCode || "",
        }));
      }
    } catch {
      // ignore
    }
  }

  const rawCustomerGstin = (
    bill.billedTo?.gstin ||
    enquiryData?.companyDetails?.companyGST ||
    enquiryData?.gstin ||
    ""
  ).trim().toUpperCase();

  const isCompanyGstin =
    rawCustomerGstin === "33AAKCP9459K1ZO" ||
    rawCustomerGstin.includes("33AAKCP9459K1ZO") ||
    rawCustomerGstin.includes("AAMCP9459K");

  const dummyGstins = [
    "URP", "N/A", "NA", "NONE", "NIL", "NULL", "UNDEFINED",
    "UNREGISTERED", "NOT APPLICABLE", "CONSUMER", "NOT PROVIDED", "-"
  ];

  const customerGstinForDisplay = !isCompanyGstin && !dummyGstins.includes(rawCustomerGstin) ? rawCustomerGstin : "";

  const hasTax =
    (bill.cgst && bill.cgst > 0) ||
    (bill.sgst && bill.sgst > 0) ||
    (bill.igst && bill.igst > 0) ||
    bill.taxType === "cgst_sgst" ||
    bill.taxType === "igst";

  const isGST = !!customerGstinForDisplay || hasTax;
  const companyName = enquiryData?.companyDetails?.companyName || bill.companyName || "";
  const placeOfSupply = bill.placeOfSupply || bill.billedTo?.state || enquiryData?.state || "Tamil Nadu";

  const enqType = String(
    enquiryData?.type ||
    enquiryData?.customerType ||
    enquiryData?.clientType ||
    enquiryData?.enquiryType ||
    enquiryData?.customer?.type ||
    ""
  ).toUpperCase().trim();

  const clientType = String(
    bill.clientType ||
    bill.customerType ||
    bill.enquiryType ||
    bill.billType ||
    ""
  ).toUpperCase().trim();

  let billType: "B2B" | "B2C" = "B2C";
  if (enqType.includes("B2C") || clientType.includes("B2C")) {
    billType = "B2C";
  } else if (enqType.includes("B2B") || clientType.includes("B2B") || !!customerGstinForDisplay) {
    billType = "B2B";
  } else if (
    companyName &&
    (companyName.toLowerCase().includes("pvt") ||
      companyName.toLowerCase().includes("ltd") ||
      companyName.toLowerCase().includes("inc") ||
      companyName.toLowerCase().includes("technologies") ||
      companyName.toLowerCase().includes("solutions") ||
      companyName.toLowerCase().includes("enterprises") ||
      companyName.toLowerCase().includes("corporation") ||
      companyName.toLowerCase().includes("llp"))
  ) {
    billType = "B2B";
  }

  const customerName =
    bill.customerName ||
    bill.billedTo?.name ||
    bill.clientName ||
    bill.customer ||
    enquiryData?.customerName ||
    enquiryData?.name ||
    enquiryData?.contactPerson ||
    "Customer";

  const customerContact =
    bill.customerContact ||
    bill.billedTo?.contactNumber ||
    bill.phone ||
    bill.mobile ||
    enquiryData?.contactNumber ||
    enquiryData?.customerContact ||
    enquiryData?.customer?.contactNumber ||
    enquiryData?.phone ||
    enquiryData?.mobile ||
    "-";

  const customerAddress = String(
    bill.customerAddress ||
    bill.billedTo?.address ||
    enquiryData?.customerAddress ||
    enquiryData?.address ||
    ""
  ).trim();

  const invoiceNumber =
    bill.invoiceNumber ||
    bill.billNumber ||
    bill.quoteNo ||
    bill.quotationNumber ||
    bill.proformaInvoiceNumber ||
    bill.billId ||
    "";

  return {
    ...bill,
    id: bill.id,
    customerName,
    customerContact,
    customerAddress,
    invoiceNumber,
    items: Array.isArray(resolvedItems) ? resolvedItems : [],
    status,
    paymentStatus: transactionPaymentStatus,
    paymentType: paymentSubStatus,
    paymentSubStatus,
    enquiryEnqId: bill.enquiryEnqId || enquiryData?.enqId || "",
    enquiryStatus: productStatus || (status === "quotation" ? "Quotation" : (status === "dropped" ? "Dropped" : "Approved")),
    shipmentStatus: bill.shipmentStatus || enquiryData?.shipmentStatus || bill.shippingStatus || "",
    placeOfSupply,
    gstin: customerGstinForDisplay,
    isGST,
    billType,
    companyName,
    isQuotation: status === "quotation",
    billedTo: {
      ...(bill.billedTo || {}),
      name: bill.billedTo?.name || customerName,
      contactNumber: bill.billedTo?.contactNumber || customerContact,
      address: bill.billedTo?.address || customerAddress,
      gstin: bill.billedTo?.gstin || customerGstinForDisplay,
      state: bill.billedTo?.state || placeOfSupply,
      city: bill.billedTo?.city || enquiryData?.city || "",
      enqId: bill.billedTo?.enqId || bill.enquiryEnqId || enquiryData?.enqId || "",
    },
  };
}

/**
 * Safely compute total amount for a bill.
 */
export function getBillTotal(bill: any): number {
  if (!bill) return 0;
  if (bill.totalAmount !== undefined && bill.totalAmount !== null && !isNaN(Number(bill.totalAmount))) {
    return Number(bill.totalAmount);
  }
  const subtotal = Number(bill.subtotal || bill.taxableValue || 0);
  const cgst = Number(bill.cgst || 0);
  const sgst = Number(bill.sgst || 0);
  const igst = Number(bill.igst || 0);
  const shipping = Number(bill.shippingCharges || 0);
  return subtotal + cgst + sgst + igst + shipping;
}

/**
 * Extract unified Date from a bill document.
 */
export function getBillDate(b: any): Date {
  const raw = b?.approvedAt || b?.billDate || b?.date || b?.invoiceDate || b?.createdAt || b?.updatedAt;
  if (raw?.toDate && typeof raw.toDate === "function") return raw.toDate();
  if (raw instanceof Date) return isNaN(raw.getTime()) ? new Date(0) : raw;
  if (typeof raw === "object" && typeof raw?.seconds === "number") return new Date(raw.seconds * 1000);
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
      const d = parseInt(dmyMatch[1], 10);
      const m = parseInt(dmyMatch[2], 10) - 1;
      const y = parseInt(dmyMatch[3], 10);
      const parsed = new Date(y, m, d);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  if (typeof raw === "number") {
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

/**
 * Extract unit purchase cost for an inventory product or item.
 */
export function getProductUnitCost(p: any, fallbackItem?: any): number {
  if (fallbackItem) {
    const explicit =
      fallbackItem.purchasePrice ??
      fallbackItem.costPrice ??
      fallbackItem.cost ??
      fallbackItem.buyingPrice;
    if (explicit !== undefined && explicit !== null && !isNaN(Number(explicit)) && Number(explicit) > 0) {
      return Number(explicit);
    }
  }
  if (!p) return 0;
  if (p.currentPrice !== undefined && p.currentPrice !== null && !isNaN(Number(p.currentPrice)) && Number(p.currentPrice) > 0) {
    return Number(p.currentPrice);
  }
  if (p.purchasePrice !== undefined && p.purchasePrice !== null && !isNaN(Number(p.purchasePrice)) && Number(p.purchasePrice) > 0) {
    return Number(p.purchasePrice);
  }
  const stockEntries = p.stockEntries || [];
  if (Array.isArray(stockEntries) && stockEntries.length > 0) {
    const addEntries = stockEntries.filter((e: any) => e && e.type !== "deliver");
    if (addEntries.length > 0) {
      const last = addEntries[addEntries.length - 1];
      const uPrice = Number(last?.unitPrice || last?.price || 0);
      if (uPrice > 0) return uPrice;
    }
  }
  if (p.price !== undefined && p.price !== null && !isNaN(Number(p.price)) && Number(p.price) > 0) {
    return Number(p.price);
  }
  if (p.unitprice !== undefined && p.unitprice !== null && !isNaN(Number(p.unitprice)) && Number(p.unitprice) > 0) {
    return Number(p.unitprice);
  }
  return 0;
}

/**
 * Match a bill item against the inventory products catalog.
 */
export function findInventoryProduct(
  item: any,
  productsMap: Map<string, any>,
  productsByName: Map<string, any>,
  productsList: any[]
): any | null {
  if (!item) return null;

  // 1. Direct ID match
  if (item.productId && productsMap.has(item.productId)) {
    return productsMap.get(item.productId);
  }

  // 2. Exact cleaned name match
  const rawName = String(item.productName || item.name || "").trim().toLowerCase();
  if (!rawName) return null;

  if (productsByName.has(rawName)) {
    return productsByName.get(rawName);
  }

  // 3. Alphanumeric stripped name match
  const alphaNum = rawName.replace(/[^a-z0-9]/g, "");
  if (alphaNum && productsByName.has(alphaNum)) {
    return productsByName.get(alphaNum);
  }

  // 4. SKU match
  const rawSku = String(item.sku || item.productId || "").trim().toLowerCase();
  if (rawSku && productsByName.has(rawSku)) {
    return productsByName.get(rawSku);
  }

  // 5. Substring / inclusion match in productsList
  for (const prod of productsList) {
    if (!prod?.name) continue;
    const pName = String(prod.name).trim().toLowerCase();
    if (pName === rawName) return prod;
    if (pName.length >= 4 && (rawName.includes(pName) || pName.includes(rawName))) {
      return prod;
    }
  }

  // 6. Multi-token word overlap matching (>= 60% words match)
  const itemTokens = rawName.split(/[\s\-_,./]+/).filter((t) => t.length > 2);
  if (itemTokens.length > 0) {
    let bestMatch: any = null;
    let maxOverlap = 0;

    for (const prod of productsList) {
      if (!prod?.name) continue;
      const prodTokens = String(prod.name).trim().toLowerCase().split(/[\s\-_,./]+/).filter((t) => t.length > 2);
      if (prodTokens.length === 0) continue;

      let overlap = 0;
      for (const t of itemTokens) {
        if (prodTokens.includes(t)) overlap++;
      }

      const matchRatio = overlap / Math.min(itemTokens.length, prodTokens.length);
      if (matchRatio >= 0.6 && overlap > maxOverlap) {
        maxOverlap = overlap;
        bestMatch = prod;
      }
    }

    if (bestMatch) return bestMatch;
  }

  return null;
}

/**
 * Accurately calculate the purchase cost of goods for a bill record.
 */
export function calculateBillPurchaseCost(
  bill: any,
  productsMap: Map<string, any>,
  productsByName: Map<string, any>,
  productsList: any[]
): { billPurchase: number; billItemsQty: number } {
  let billPurchase = 0;
  let billItemsQty = 0;

  let itemsList: any[] = bill.items;
  if (typeof itemsList === "string") {
    try {
      itemsList = JSON.parse(itemsList);
    } catch {
      itemsList = [];
    }
  }
  if (!Array.isArray(itemsList) || itemsList.length === 0) {
    const altItems = (bill as any).materials || (bill as any).products;
    if (Array.isArray(altItems)) {
      itemsList = altItems;
    } else if (typeof altItems === "string") {
      try {
        itemsList = JSON.parse(altItems);
      } catch {
        itemsList = [];
      }
    }
  }

  if (Array.isArray(itemsList) && itemsList.length > 0) {
    for (const item of itemsList) {
      const qty = Number(item.quantity) || 1;
      billItemsQty += qty;
      const matchedProd = findInventoryProduct(item, productsMap, productsByName, productsList);
      const unitCost = getProductUnitCost(matchedProd, item);
      billPurchase += unitCost * qty;
    }
  }

  // Fallback to explicit bill-level cost if item-level cost is zero
  if (billPurchase === 0) {
    const explicitBillCost = (bill as any).purchaseValue ?? (bill as any).totalCost;
    if (
      explicitBillCost !== undefined &&
      explicitBillCost !== null &&
      !isNaN(Number(explicitBillCost)) &&
      Number(explicitBillCost) > 0
    ) {
      billPurchase = Number(explicitBillCost);
    }
  }

  return { billPurchase, billItemsQty };
}

/**
 * Convert an enquiry document into a normalized bill object.
 * Guarantees that approved orders and active enquiries seamlessly populate Bills, Dashboard, and PNL.
 */
export function createBillFromApprovedEnquiry(enq: any): any {
  if (!enq) return null;

  let materials: any[] = [];
  try {
    materials = typeof enq.materials === "string" ? JSON.parse(enq.materials) : (enq.materials || []);
  } catch {
    materials = [];
  }

  const items = (Array.isArray(materials) ? materials : []).map((m: any, idx: number) => {
    const qty = Number(m.quantity) || 1;
    const price = Number(m.price) || 0;
    const rate = m.taxRate !== undefined && m.taxRate !== null ? Number(m.taxRate) : (Number(enq.gstRate) || 0);
    const taxable = m.taxableValue !== undefined ? Number(m.taxableValue) : (price * qty);
    const tax = m.taxAmount !== undefined ? Number(m.taxAmount) : ((taxable * rate) / 100);
    return {
      productId: m.productId || m.id || `PROD-${idx}`,
      productName: m.productName || m.name || "Item",
      quantity: qty,
      price: price,
      total: Number(m.totalAmount) || (taxable + tax),
      taxableValue: taxable,
      taxAmount: tax,
      taxRate: rate,
      originalPrice: Number(m.originalPrice) || price,
      purchasePrice: m.purchasePrice !== undefined ? Number(m.purchasePrice) : undefined,
      costPrice: m.costPrice !== undefined ? Number(m.costPrice) : undefined,
      cost: m.cost !== undefined ? Number(m.cost) : undefined,
      sku: m.sku || "",
      category: m.category || "",
      hsn: m.hsnCode || m.hsn || "",
    };
  });

  const computedItemsTotal = items.reduce((s, it) => s + (it.total || 0), 0);
  const totalAmount = Number(enq.finalTotal || enq.value || computedItemsTotal || 0);
  const subtotal = Number(enq.subtotal || enq.taxableValue || (items.length > 0 ? items.reduce((s, it) => s + (it.taxableValue || 0), 0) : totalAmount));
  const taxAmount = Number(enq.gstAmount || (items.length > 0 ? items.reduce((s, it) => s + (it.taxAmount || 0), 0) : 0));

  const statusLower = String(enq.status || "").toLowerCase().trim();
  const paymentLower = String(enq.paymentStatus || "").toLowerCase().trim();
  const isApproved = statusLower === "approved" || statusLower === "delivered" || statusLower === "dispatched";
  const isPaid = paymentLower === "paid" || paymentLower === "completed";
  const isQuotation = !isApproved && (statusLower === "quotation" || statusLower === "proforma invoice" || String(enq.type || "").toLowerCase().includes("quotation"));
  const hasItems = items.length > 0;
  const isActionable = isApproved || isPaid || isQuotation || statusLower === "testing" || hasItems || totalAmount > 0;
  if (!isActionable) return null;

  // If no material items but total amount is positive, provide a synthesized item for component analytics
  if (items.length === 0 && totalAmount > 0) {
    items.push({
      productId: enq.enqId || "ORDER-ITEM",
      productName: enq.customerName ? `Order: ${enq.customerName}` : "Order Items",
      quantity: 1,
      price: totalAmount,
      total: totalAmount,
      taxableValue: totalAmount,
      taxAmount: 0,
      taxRate: 0,
      originalPrice: totalAmount,
      hsn: "",
    });
  }

  // Effective transaction date: if approved, use approvedAt / updatedAt if newer than createdAt
  const effectiveDate = enq.approvedAt || enq.billDate || (isApproved && enq.updatedAt ? enq.updatedAt : enq.createdAt) || new Date();
  const cleanNum = String(enq.enqId || Date.now()).replace(/\D/g, "");
  const fallbackQuoteNum = `IBQ-${cleanNum.slice(-6) || "000001"}`;
  const fallbackInvNum = `IBIN-${cleanNum.slice(-8) || "00000001"}`;
  const invoiceNumber = enq.invoiceNumber || enq.proformaInvoiceNumber || (isQuotation ? (enq.quotationNumber || enq.quoteNo || fallbackQuoteNum) : fallbackInvNum);

  const customerName = enq.customerName || enq.customer?.name || enq.contactPerson || enq.name || enq.clientName || "Customer";
  const customerContact = enq.contactNumber || enq.customerContact || enq.customer?.contactNumber || enq.phone || enq.mobile || "-";
  const customerAddress = String(enq.customerAddress || enq.address || "").trim();
  const custGstin = String(enq.companyDetails?.companyGST || enq.gstin || "").trim().toUpperCase();

  const taxType = enq.taxType || (enq.state && String(enq.state).toLowerCase().includes("tamil nadu") ? "cgst_sgst" : (enq.state ? "igst" : "cgst_sgst"));
  const isIgst = taxType === "igst";
  const cgst = isIgst ? 0 : taxAmount / 2;
  const sgst = isIgst ? 0 : taxAmount / 2;
  const igst = isIgst ? taxAmount : 0;

  return {
    id: enq.id || enq.billId || `bill-enq-${enq.enqId || Date.now()}`,
    billId: enq.billId || enq.enqId || enq.id,
    invoiceNumber: invoiceNumber,
    billDate: effectiveDate,
    date: effectiveDate,
    dueDate: effectiveDate,
    customerName,
    customerContact,
    customerCity: enq.city || "",
    customerAddress,
    totalAmount: totalAmount,
    subtotal: subtotal,
    taxAmount: taxAmount,
    discountAmount: Number(enq.discountAmount) || 0,
    discountPercentage: Number(enq.discountPercentage) || 0,
    shippingCharges: Number(enq.shippingCharges) || 0,
    taxType,
    taxRate: Number(enq.gstRate) || 0,
    cgst,
    sgst,
    igst,
    assignedTo: enq.assignedTo || "",
    assignedToName: enq.assignedTo || "Unassigned",
    createdBy: enq.assignedTo || "",
    createdByRole: "staff",
    status: isApproved || isPaid ? "completed" : (isQuotation ? "quotation" : "completed"),
    paymentStatus: isPaid ? "paid" : "pending",
    paymentType: enq.paymentType || enq.paymentSubStatus || "N/A",
    paymentSubStatus: enq.paymentSubStatus || "N/A",
    shipmentStatus: enq.shipmentStatus || "",
    items: items,
    billedBy: {
      name: "Protowiz Private Limited",
      address: "Trichy, Tamil Nadu, India",
      gstin: "33AAKCP9459K1ZO",
      pan: "AAKCP9459K",
    },
    billedTo: {
      name: customerName,
      enqId: enq.enqId || "",
      contactNumber: customerContact,
      city: enq.city || "",
      state: enq.state || "Tamil Nadu",
      address: customerAddress,
      gstin: custGstin,
    },
    placeOfSupply: enq.state || "Tamil Nadu",
    enquiryId: enq.id || "",
    enquiryEnqId: enq.enqId || "",
    enquiryStatus: enq.status || (isApproved ? "Approved" : "Quotation"),
    isQuotation: isQuotation,
    deductFromInventory: isApproved,
    inventoryUpdated: isApproved,
    stockDeducted: isApproved,
    createdAt: effectiveDate,
    updatedAt: enq.updatedAt || effectiveDate,
  };
}

/**
 * Build fast lookup maps from products catalog for accurate purchase cost valuation.
 */
export function buildProductsLookupMaps(productsList: any[]): {
  productsMap: Map<string, any>;
  productsByName: Map<string, any>;
} {
  const pMap = new Map<string, any>();
  const pNameMap = new Map<string, any>();

  (productsList || []).forEach((prod) => {
    if (!prod) return;
    pMap.set(prod.id, prod);

    if (prod.name) {
      const trimmedLower = String(prod.name).trim().toLowerCase();
      pNameMap.set(trimmedLower, prod);

      const alphaNum = trimmedLower.replace(/[^a-z0-9]/g, "");
      if (alphaNum && alphaNum !== trimmedLower) {
        pNameMap.set(alphaNum, prod);
      }
    }

    if (prod.sku) {
      const skuLower = String(prod.sku).trim().toLowerCase();
      pNameMap.set(skuLower, prod);
    }
  });

  return { productsMap: pMap, productsByName: pNameMap };
}

/**
 * Universal Unified Bills Engine:
 * Combines deduplicated bills with synthesized unbilled enquiries so that:
 * - BillTransactions (Billing)
 * - PNL (Profit & Loss)
 * - Dashboard (Executive Overview)
 * share the exact same transactions, sales metrics, purchase costs, and net margins.
 */
export function getUnifiedBillsWithEnquiries(
  rawBills: any[],
  rawEnquiries: any[],
  defaultBankDetailsObj?: any
): any[] {
  const dedupedBills = deduplicateBills(rawBills || []);
  const enquiriesMap = buildEnquiriesMap(rawEnquiries || []);

  // Track all identifiers already present in bills
  const billedKeys = new Set<string>();
  dedupedBills.forEach((b: any) => {
    const explicitEnqId = b.enquiryEnqId || b.enquiryId || b.billedTo?.enqId || b.enqId;
    if (explicitEnqId) billedKeys.add(String(explicitEnqId).trim().toLowerCase());
    if (b.id) billedKeys.add(String(b.id).trim().toLowerCase());
    if (b.billId) billedKeys.add(String(b.billId).trim().toLowerCase());
    if (b.invoiceNumber) billedKeys.add(String(b.invoiceNumber).trim().toLowerCase());
  });

  const missingEnquiryBills: any[] = [];
  (rawEnquiries || []).forEach((e: any) => {
    if (!e) return;
    const statusLower = String(e.status || "").toLowerCase().trim();
    if (statusLower === "dropped") return;

    const enqIdStr = String(e.enqId || "").trim().toLowerCase();
    const docIdStr = String(e.id || "").trim().toLowerCase();
    const billIdStr = String(e.billId || "").trim().toLowerCase();
    const invNumStr = String(e.invoiceNumber || `INV-${e.enqId}`).trim().toLowerCase();

    const alreadyInBills =
      (enqIdStr && billedKeys.has(enqIdStr)) ||
      (docIdStr && billedKeys.has(docIdStr)) ||
      (billIdStr && billedKeys.has(billIdStr)) ||
      (invNumStr && billedKeys.has(invNumStr));

    if (!alreadyInBills) {
      const synthBill = createBillFromApprovedEnquiry(e);
      if (synthBill) {
        if (defaultBankDetailsObj && !synthBill.billedBy) {
          synthBill.billedBy = defaultBankDetailsObj;
        }
        missingEnquiryBills.push(synthBill);
      }
    }
  });

  const allBills = [...dedupedBills, ...missingEnquiryBills];
  const resolved = allBills.map((b) => resolveBillWithEnquiry(b, enquiriesMap));

  resolved.sort((a, b) => {
    const da = getBillDate(a)?.getTime() || 0;
    const dbTime = getBillDate(b)?.getTime() || 0;
    return dbTime - da;
  });

  return resolved;
}
