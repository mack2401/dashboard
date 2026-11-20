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

  // If explicitly flagged as quotation / estimate / proforma
  if (
    status === "quotation" ||
    status === "quote" ||
    status === "proforma" ||
    enquiryStatus === "quotation" ||
    enquiryStatus === "quote" ||
    bill.isQuotation === true ||
    bill.isProformaInvoice === true
  ) {
    if (
      status !== "paid" &&
      status !== "completed" &&
      paymentStatus !== "paid" &&
      paymentStatus !== "completed" &&
      enquiryStatus !== "approved" &&
      enquiryStatus !== "delivered" &&
      enquiryStatus !== "dispatched"
    ) {
      return true;
    }
  }

  // Pending bills without approval or payment confirmation are treated as quotation / estimates
  if (
    (status === "pending" || !status) &&
    paymentStatus !== "paid" &&
    paymentStatus !== "completed" &&
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

  const status = String(bill.status || "").toLowerCase().trim();
  const paymentStatus = String(bill.paymentStatus || "").toLowerCase().trim();
  const enquiryStatus = String(bill.enquiryStatus || "").toLowerCase().trim();

  // If marked as quotation or proforma, only consider sold if explicitly approved/paid
  if (
    status === "quotation" ||
    status === "quote" ||
    status === "proforma" ||
    enquiryStatus === "quotation" ||
    enquiryStatus === "quote" ||
    bill.isQuotation === true
  ) {
    return (
      status === "paid" ||
      status === "completed" ||
      paymentStatus === "paid" ||
      paymentStatus === "completed" ||
      enquiryStatus === "approved" ||
      enquiryStatus === "delivered" ||
      enquiryStatus === "dispatched"
    );
  }

  // Sold orders: paid, approved, completed, delivered, dispatched
  return (
    status === "paid" ||
    status === "completed" ||
    status === "approved" ||
    status === "delivered" ||
    status === "dispatched" ||
    status === "sales" ||
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

  const productStatus = enquiryData?.status || (enquiryData as any)?.productStatus || bill.enquiryStatus || "";
  const paymentStatus = enquiryData?.paymentStatus || bill.paymentStatus || "";
  const paymentSubStatus = bill.paymentSubStatus || enquiryData?.paymentSubStatus || enquiryData?.paymentType || "";

  let status: "quotation" | "paid" | "dropped" = "quotation";
  let transactionPaymentStatus: "pending" | "completed" = "pending";

  const billWithContext = {
    ...bill,
    enquiryStatus: productStatus,
    paymentStatus,
    paymentSubStatus,
  };

  if (
    String(productStatus).toLowerCase() === "dropped" ||
    String(enquiryData?.status).toLowerCase() === "dropped" ||
    String(bill.status).toLowerCase() === "dropped" ||
    isDroppedBill(billWithContext)
  ) {
    status = "dropped";
    transactionPaymentStatus = "pending";
  } else if (
    productStatus === "Approved" ||
    productStatus === "Delivered" ||
    productStatus === "Dispatched" ||
    String(paymentStatus).toLowerCase() === "paid" ||
    String(bill.paymentStatus).toLowerCase() === "completed" ||
    String(bill.status).toLowerCase() === "paid" ||
    String(bill.status).toLowerCase() === "completed" ||
    isSoldBill(billWithContext)
  ) {
    status = "paid";
    transactionPaymentStatus = "completed";
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
  }
  if ((!resolvedItems || !Array.isArray(resolvedItems) || resolvedItems.length === 0) && enquiryData) {
    try {
      let parsed = enquiryData.materials || enquiryData.products || enquiryData.items;
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
      if (Array.isArray(parsed)) {
        resolvedItems = parsed.map((m: any) => ({
          productId: m.productId || m.id,
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

  return {
    ...bill,
    items: Array.isArray(resolvedItems) ? resolvedItems : [],
    status,
    paymentStatus: transactionPaymentStatus,
    paymentType: paymentSubStatus,
    paymentSubStatus,
    enquiryEnqId: bill.enquiryEnqId || enquiryData?.enqId || "",
    enquiryStatus: productStatus,
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
  const raw = b?.billDate || b?.date || b?.invoiceDate || b?.createdAt || b?.updatedAt;
  if (raw?.toDate && typeof raw.toDate === "function") return raw.toDate();
  if (raw instanceof Date) return isNaN(raw.getTime()) ? new Date(0) : raw;
  if (typeof raw === "object" && typeof raw?.seconds === "number") return new Date(raw.seconds * 1000);
  if (typeof raw === "string" || typeof raw === "number") {
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
