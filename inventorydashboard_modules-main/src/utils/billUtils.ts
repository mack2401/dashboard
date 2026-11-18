/**
 * Utility functions for bill status categorization and sales filtering.
 * Ensures sales revenue strictly reflects sold / completed / paid orders,
 * excluding quotations and dropped/cancelled/refunded records.
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
