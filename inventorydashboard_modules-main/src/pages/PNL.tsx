import React, { useEffect, useState, useMemo } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../App";
import * as XLSX from "xlsx";
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  ShoppingCart,
  GraduationCap,
  IndianRupee,
  Calendar,
  Download,
  Search,
  Filter,
  PlusCircle,
  X,
  Package,
  Layers,
  ArrowUpDown,
  FileSpreadsheet,
  AlertTriangle,
  RotateCcw,
  Check,
  ChevronRight,
  Info,
} from "lucide-react";

// --- Types & Interfaces ---

export type ChannelType = "all" | "academic" | "ecommerce";
export type DateRangePreset =
  | "all"
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_fy"
  | "custom";

interface InventoryProduct {
  id: string;
  name: string;
  sku?: string;
  category?: string;
  currentPrice?: number; // unit cost price (purchase price)
  purchasePrice?: number; // selling price
  totalQuantity?: number;
  [key: string]: any;
}

interface BillItem {
  productId?: string;
  productName?: string;
  quantity?: number;
  price?: number;
  total?: number;
  purchasePrice?: number;
  category?: string;
  [key: string]: any;
}

interface BillRecord {
  id: string;
  enquiryEnqId?: string;
  enquiryId?: string;
  channel?: ChannelType;
  totalAmount?: number;
  subtotal?: number;
  taxableValue?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  shippingCharges?: number;
  status?: string;
  paymentStatus?: string;
  items?: BillItem[] | string;
  createdAt?: any;
  updatedAt?: any;
  billedTo?: {
    name?: string;
    companyName?: string;
    gstin?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface EnquiryRecord {
  id: string;
  enqId?: string;
  type?: string; // e.g. "B2B", "B2C", "ecommerce", "academic", "projects", "training"
  mode?: string; // e.g. "Website", "WhatsApp", "Offline"
  companyDetails?: {
    companyName?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface WastageTransaction {
  id: string;
  productId: string;
  productName: string;
  type: string;
  quantity: number;
  price?: number; // unit cost price
  totalAmount: number; // quantity * price
  notes?: string;
  reason?: string;
  performedBy?: string;
  performedByName?: string;
  createdAt: any;
}

interface CategoryPnL {
  category: string;
  unitsSold: number;
  salesValue: number;
  ecommerceSales: number;
  academicSales: number;
  purchaseCost: number;
  wastageValue: number;
  grossMargin: number;
  netMargin: number;
  marginPct: number;
}

interface ProductPnL {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  unitsSold: number;
  unitCost: number;
  avgSellingPrice: number;
  salesValue: number;
  ecommerceSales: number;
  academicSales: number;
  purchaseCost: number;
  wastageQty: number;
  wastageValue: number;
  grossMargin: number;
  netMargin: number;
  marginPct: number;
}

const formatCurrency = (val: number): string => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(val || 0);
};

export default function PNL() {
  const { user } = useAuth();

  // Raw Database State
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [bills, setBills] = useState<BillRecord[]>([]);
  const [enquiries, setEnquiries] = useState<EnquiryRecord[]>([]);
  const [transactions, setTransactions] = useState<WastageTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & View State
  const [channelFilter, setChannelFilter] = useState<ChannelType>("all");
  const [datePreset, setDatePreset] = useState<DateRangePreset>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [activeTab, setActiveTab] = useState<"category" | "product" | "wastage">("category");
  const [searchQuery, setSearchQuery] = useState("");

  // Sort State
  const [sortField, setSortField] = useState<string>("salesValue");
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Wastage Modal State
  const [isWastageModalOpen, setIsWastageModalOpen] = useState(false);
  const [wastageForm, setWastageForm] = useState({
    productId: "",
    quantity: 1,
    reason: "Damaged in transit",
    customNotes: "",
  });
  const [isSubmittingWastage, setIsSubmittingWastage] = useState(false);

  // 1. Live Subscriptions to Firestore Collections
  useEffect(() => {
    setLoading(true);

    // Products Listener
    const unsubProducts = onSnapshot(collection(db, "products"), (snap) => {
      const list: InventoryProduct[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        let costPrice = 0;
        if (d.currentPrice !== undefined && !isNaN(Number(d.currentPrice))) {
          costPrice = Number(d.currentPrice);
        } else if (d.stockEntries && Array.isArray(d.stockEntries) && d.stockEntries.length > 0) {
          const last = d.stockEntries[d.stockEntries.length - 1];
          costPrice = Number(last?.unitPrice || d.price || 0);
        } else {
          costPrice = Number(d.price || 0);
        }

        return {
          id: docSnap.id,
          name: d.name || "Unnamed Product",
          sku: d.sku || "",
          category: d.category || "General",
          currentPrice: costPrice,
          purchasePrice: Number(d.purchasePrice || costPrice),
          totalQuantity: Number(d.totalQuantity || 0),
          ...d,
        };
      });
      setProducts(list);
    });

    // Bills Listener
    const unsubBills = onSnapshot(collection(db, "bills"), (snap) => {
      const list: BillRecord[] = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setBills(list);
    });

    // Enquiries Listener (to determine channel for bills)
    const unsubEnquiries = onSnapshot(collection(db, "enquiries"), (snap) => {
      const list: EnquiryRecord[] = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setEnquiries(list);
    });

    // Transactions Listener (for wastage & stock write-offs)
    const unsubTransactions = onSnapshot(collection(db, "transactions"), (snap) => {
      const list: WastageTransaction[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          productId: d.productId || "",
          productName: d.productName || "Product",
          type: d.type || "adjust",
          quantity: Number(d.quantity || 0),
          price: Number(d.price || 0),
          totalAmount: Number(d.totalAmount || 0),
          notes: d.notes || "",
          reason: d.reason || "",
          performedBy: d.performedBy || "",
          performedByName: d.performedByName || "",
          createdAt: d.createdAt,
        };
      });
      setTransactions(list);
      setLoading(false);
    });

    return () => {
      unsubProducts();
      unsubBills();
      unsubEnquiries();
      unsubTransactions();
    };
  }, []);

  // Quick lookup maps
  const productsMap = useMemo(() => {
    const map = new Map<string, InventoryProduct>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  const productsByName = useMemo(() => {
    const map = new Map<string, InventoryProduct>();
    products.forEach((p) => {
      if (p.name) map.set(p.name.trim().toLowerCase(), p);
      if (p.sku) map.set(p.sku.trim().toLowerCase(), p);
    });
    return map;
  }, [products]);

  const enquiriesMap = useMemo(() => {
    const map = new Map<string, EnquiryRecord>();
    enquiries.forEach((enq) => {
      if (enq.enqId) map.set(enq.enqId, enq);
      if (enq.id) map.set(enq.id, enq);
    });
    return map;
  }, [enquiries]);

  // Product Matching Engine
  const findProduct = (item: any): InventoryProduct | null => {
    if (!item) return null;
    if (item.productId && productsMap.has(item.productId)) {
      return productsMap.get(item.productId)!;
    }
    const rawName = String(item.productName || item.name || "").trim().toLowerCase();
    if (!rawName) return null;
    if (productsByName.has(rawName)) return productsByName.get(rawName)!;

    const alphaNum = rawName.replace(/[^a-z0-9]/g, "");
    if (alphaNum && productsByName.has(alphaNum)) return productsByName.get(alphaNum)!;

    const rawSku = String(item.sku || "").trim().toLowerCase();
    if (rawSku && productsByName.has(rawSku)) return productsByName.get(rawSku)!;

    for (const p of products) {
      if (!p.name) continue;
      const pLower = p.name.trim().toLowerCase();
      if (pLower.length >= 4 && (rawName.includes(pLower) || pLower.includes(rawName))) {
        return p;
      }
    }
    return null;
  };

  // Determine Channel (Academic vs. E-commerce)
  const resolveBillChannel = (bill: BillRecord): "academic" | "ecommerce" => {
    if (bill.channel === "ecommerce" || (bill as any).orderType === "ecommerce") {
      return "ecommerce";
    }
    if (bill.channel === "academic" || (bill as any).orderType === "academic") {
      return "academic";
    }

    const enqKey = bill.enquiryEnqId || bill.enquiryId;
    if (enqKey && enquiriesMap.has(enqKey)) {
      const enq = enquiriesMap.get(enqKey)!;
      const enqType = (enq.type || "").toLowerCase();
      const enqMode = (enq.mode || "").toLowerCase();

      if (enqType.includes("ecommerce") || enqType.includes("b2c") || enqMode.includes("website")) {
        return "ecommerce";
      }
      return "academic";
    }

    const billedToName = (bill.billedTo?.name || bill.billedTo?.companyName || "").toLowerCase();
    if (
      billedToName.includes("college") ||
      billedToName.includes("school") ||
      billedToName.includes("university") ||
      billedToName.includes("institute") ||
      billedToName.includes("academy") ||
      billedToName.includes("ltd") ||
      billedToName.includes("pvt") ||
      bill.billedTo?.gstin
    ) {
      return "academic";
    }

    return "academic"; // Default to Academic if institutional
  };

  // Date Range Filtering Helper
  const isDateInSelectedRange = (dateVal: any): boolean => {
    if (!dateVal) return datePreset === "all";
    let d: Date | null = null;
    if (dateVal?.toDate && typeof dateVal.toDate === "function") {
      d = dateVal.toDate();
    } else if (dateVal instanceof Date) {
      d = dateVal;
    } else if (typeof dateVal === "string" || typeof dateVal === "number") {
      d = new Date(dateVal);
    }
    if (!d || isNaN(d.getTime())) return datePreset === "all";

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (datePreset) {
      case "all":
        return true;
      case "today":
        return d >= startOfToday;
      case "this_week": {
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        return d >= startOfWeek;
      }
      case "this_month": {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return d >= startOfMonth;
      }
      case "last_month": {
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        return d >= startOfLastMonth && d <= endOfLastMonth;
      }
      case "this_quarter": {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const startOfQuarter = new Date(now.getFullYear(), currentQuarter * 3, 1);
        return d >= startOfQuarter;
      }
      case "this_fy": {
        // Indian Financial Year: April 1 to March 31
        const currentYear = now.getFullYear();
        const fyStart = now.getMonth() >= 3 ? new Date(currentYear, 3, 1) : new Date(currentYear - 1, 3, 1);
        return d >= fyStart;
      }
      case "custom": {
        if (!customStartDate && !customEndDate) return true;
        const start = customStartDate ? new Date(customStartDate) : new Date(0);
        const end = customEndDate ? new Date(`${customEndDate}T23:59:59`) : new Date(2100, 0, 1);
        return d >= start && d <= end;
      }
      default:
        return true;
    }
  };

  // 2. Filtered Bills
  const activeBills = useMemo(() => {
    return bills.filter((b) => {
      // Exclude dropped or fully refunded bills from revenue
      const isDroppedOrRefunded =
        b.status === "dropped" ||
        b.paymentStatus === "refunded" ||
        (b as any).refunded === true ||
        (typeof b.paymentSubStatus === "string" && b.paymentSubStatus.toLowerCase().includes("refund")) ||
        (typeof (b as any).enquiryStatus === "string" && (b as any).enquiryStatus.toLowerCase() === "dropped");
      if (isDroppedOrRefunded) return false;

      // Filter by Channel
      if (channelFilter !== "all") {
        const resolved = resolveBillChannel(b);
        if (resolved !== channelFilter) return false;
      }

      // Filter by Date
      const billDate = b.createdAt || b.billDate || b.updatedAt;
      return isDateInSelectedRange(billDate);
    });
  }, [bills, channelFilter, datePreset, customStartDate, customEndDate, enquiriesMap]);

  // 3. Filtered Wastage Transactions
  const wastageTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const isDateValid = isDateInSelectedRange(t.createdAt);
      if (!isDateValid) return false;

      // Wastage is defined as:
      // a) explicit 'waste' type
      // b) 'delete' (deleted damaged stock)
      // c) 'adjust' where notes/reasons indicate wastage/damage/scrap or downward adjustment
      const notesLower = (t.notes || "").toLowerCase() + " " + (t.reason || "").toLowerCase();
      const isWastage =
        t.type === "waste" ||
        t.type === "delete" ||
        notesLower.includes("wastage") ||
        notesLower.includes("damage") ||
        notesLower.includes("scrap") ||
        notesLower.includes("loss") ||
        notesLower.includes("defect") ||
        notesLower.includes("expired") ||
        (t.type === "adjust" && (t.quantity > 0 || notesLower.includes("adjust")));

      return isWastage;
    });
  }, [transactions, datePreset, customStartDate, customEndDate]);

  // Wastage lookup by Product ID for accurate product attribution
  const productWastageMap = useMemo(() => {
    const map = new Map<string, { qty: number; value: number }>();
    wastageTransactions.forEach((t) => {
      const prod = productsMap.get(t.productId) || productsByName.get((t.productName || "").trim().toLowerCase());
      const pId = prod ? prod.id : t.productId;
      const unitCost = prod?.currentPrice || t.price || 0;
      const wastageVal = t.totalAmount > 0 ? t.totalAmount : t.quantity * unitCost;

      const current = map.get(pId) || { qty: 0, value: 0 };
      map.set(pId, {
        qty: current.qty + (t.quantity || 1),
        value: current.value + wastageVal,
      });
    });
    return map;
  }, [wastageTransactions, productsMap, productsByName]);

  // 4. Core Calculations (Total Sales, Academic, E-commerce, Purchase Value, Wastage, Net Margin)
  const summaryMetrics = useMemo(() => {
    let totalSales = 0;
    let ecommerceSales = 0;
    let academicSales = 0;
    let totalPurchaseCost = 0;
    let totalBilledUnits = 0;
    let ecommerceCount = 0;
    let academicCount = 0;

    activeBills.forEach((bill) => {
      const subtotal = Number(bill.subtotal || bill.taxableValue || 0);
      const cgst = Number(bill.cgst || 0);
      const sgst = Number(bill.sgst || 0);
      const igst = Number(bill.igst || 0);
      const shipping = Number(bill.shippingCharges || 0);
      const billTotal = Number(
        bill.totalAmount !== undefined && bill.totalAmount !== null
          ? bill.totalAmount
          : subtotal + cgst + sgst + igst + shipping
      );

      totalSales += billTotal;
      const channel = resolveBillChannel(bill);
      if (channel === "ecommerce") {
        ecommerceSales += billTotal;
        ecommerceCount++;
      } else {
        academicSales += billTotal;
        academicCount++;
      }

      // Calculate COGS (Purchase Cost of items sold)
      let itemsList: any[] = bill.items as any;
      if (typeof itemsList === "string") {
        try {
          itemsList = JSON.parse(itemsList);
        } catch {
          itemsList = [];
        }
      }
      if (!Array.isArray(itemsList) || itemsList.length === 0) {
        const alt = (bill as any).materials || (bill as any).products;
        if (Array.isArray(alt)) itemsList = alt;
      }

      let billCost = 0;
      if (Array.isArray(itemsList) && itemsList.length > 0) {
        for (const item of itemsList) {
          const qty = Number(item.quantity) || 1;
          totalBilledUnits += qty;

          const explicitCost = (item as any).purchasePrice ?? (item as any).costPrice;
          if (explicitCost !== undefined && Number(explicitCost) > 0) {
            billCost += Number(explicitCost) * qty;
            continue;
          }

          const matched = findProduct(item);
          const unitCost = Number(matched?.currentPrice || 0);
          billCost += unitCost * qty;
        }
      }

      if (billCost === 0) {
        const fallbackBillCost = (bill as any).purchaseValue ?? (bill as any).totalCost;
        if (fallbackBillCost && Number(fallbackBillCost) > 0) {
          billCost = Number(fallbackBillCost);
        }
      }

      totalPurchaseCost += billCost;
    });

    // Total Wastage Value @ Cost Price
    let totalWastageCost = 0;
    let totalWastageUnits = 0;
    wastageTransactions.forEach((t) => {
      const prod = productsMap.get(t.productId) || productsByName.get((t.productName || "").trim().toLowerCase());
      const unitCost = prod?.currentPrice || t.price || 0;
      const wVal = t.totalAmount > 0 ? t.totalAmount : t.quantity * unitCost;
      totalWastageCost += wVal;
      totalWastageUnits += t.quantity || 1;
    });

    const grossMargin = totalSales - totalPurchaseCost;
    const netMargin = totalSales - totalPurchaseCost - totalWastageCost;
    const marginPct = totalSales > 0 ? (netMargin / totalSales) * 100 : 0;

    return {
      totalSales,
      ecommerceSales,
      academicSales,
      ecommerceCount,
      academicCount,
      totalPurchaseCost,
      totalWastageCost,
      totalWastageUnits,
      grossMargin,
      netMargin,
      marginPct,
      totalBilledUnits,
      activeBillsCount: activeBills.length,
    };
  }, [activeBills, wastageTransactions, productsMap, productsByName]);

  // 5. Category-wise Breakdown Aggregation
  const categoryData = useMemo(() => {
    const map = new Map<string, CategoryPnL>();

    // Process all items in active bills
    activeBills.forEach((bill) => {
      const channel = resolveBillChannel(bill);
      let itemsList: any[] = bill.items as any;
      if (typeof itemsList === "string") {
        try {
          itemsList = JSON.parse(itemsList);
        } catch {
          itemsList = [];
        }
      }
      if (!Array.isArray(itemsList) || itemsList.length === 0) {
        const alt = (bill as any).materials || (bill as any).products;
        if (Array.isArray(alt)) itemsList = alt;
      }

      if (Array.isArray(itemsList) && itemsList.length > 0) {
        const billTotal = Number(bill.totalAmount || 0);
        // Estimate item selling value if item.total is present, or distribute bill total
        const itemsTotalSum = itemsList.reduce(
          (sum, it) => sum + Number(it.total || it.price * (it.quantity || 1) || 0),
          0
        );

        itemsList.forEach((item) => {
          const qty = Number(item.quantity) || 1;
          const matched = findProduct(item);
          const category = (matched?.category || item.category || "General").trim();
          const unitCost = Number(matched?.currentPrice || item.purchasePrice || 0);
          const itemCost = unitCost * qty;

          let itemSaleVal = Number(item.total || (item.price || 0) * qty);
          if (itemSaleVal === 0 && billTotal > 0 && itemsTotalSum > 0) {
            itemSaleVal = (itemSaleVal / itemsTotalSum) * billTotal;
          } else if (itemSaleVal === 0 && billTotal > 0) {
            itemSaleVal = billTotal / itemsList.length;
          }

          const existing = map.get(category) || {
            category,
            unitsSold: 0,
            salesValue: 0,
            ecommerceSales: 0,
            academicSales: 0,
            purchaseCost: 0,
            wastageValue: 0,
            grossMargin: 0,
            netMargin: 0,
            marginPct: 0,
          };

          existing.unitsSold += qty;
          existing.salesValue += itemSaleVal;
          if (channel === "ecommerce") {
            existing.ecommerceSales += itemSaleVal;
          } else {
            existing.academicSales += itemSaleVal;
          }
          existing.purchaseCost += itemCost;

          map.set(category, existing);
        });
      }
    });

    // Attribute category wastage
    wastageTransactions.forEach((t) => {
      const prod = productsMap.get(t.productId) || productsByName.get((t.productName || "").trim().toLowerCase());
      const cat = (prod?.category || "General").trim();
      const unitCost = prod?.currentPrice || t.price || 0;
      const wVal = t.totalAmount > 0 ? t.totalAmount : t.quantity * unitCost;

      const existing = map.get(cat) || {
        category: cat,
        unitsSold: 0,
        salesValue: 0,
        ecommerceSales: 0,
        academicSales: 0,
        purchaseCost: 0,
        wastageValue: 0,
        grossMargin: 0,
        netMargin: 0,
        marginPct: 0,
      };

      existing.wastageValue += wVal;
      map.set(cat, existing);
    });

    // Compute margins
    const result: CategoryPnL[] = [];
    map.forEach((item) => {
      item.grossMargin = item.salesValue - item.purchaseCost;
      item.netMargin = item.salesValue - item.purchaseCost - item.wastageValue;
      item.marginPct = item.salesValue > 0 ? (item.netMargin / item.salesValue) * 100 : 0;
      result.push(item);
    });

    return result;
  }, [activeBills, wastageTransactions, productsMap, productsByName]);

  // 6. Product-wise Breakdown Aggregation
  const productData = useMemo(() => {
    const map = new Map<string, ProductPnL>();

    // Process all items in active bills
    activeBills.forEach((bill) => {
      const channel = resolveBillChannel(bill);
      let itemsList: any[] = bill.items as any;
      if (typeof itemsList === "string") {
        try {
          itemsList = JSON.parse(itemsList);
        } catch {
          itemsList = [];
        }
      }
      if (!Array.isArray(itemsList) || itemsList.length === 0) {
        const alt = (bill as any).materials || (bill as any).products;
        if (Array.isArray(alt)) itemsList = alt;
      }

      if (Array.isArray(itemsList) && itemsList.length > 0) {
        itemsList.forEach((item) => {
          const qty = Number(item.quantity) || 1;
          const matched = findProduct(item);
          const pId = matched ? matched.id : String(item.productId || item.productName || "misc");
          const pName = matched ? matched.name : String(item.productName || "Custom Item");
          const sku = matched?.sku || item.sku || "-";
          const cat = matched?.category || item.category || "General";
          const unitCost = Number(matched?.currentPrice || item.purchasePrice || 0);
          const itemCost = unitCost * qty;
          const itemSaleVal = Number(item.total || (item.price || 0) * qty);

          const existing = map.get(pId) || {
            productId: pId,
            productName: pName,
            sku,
            category: cat,
            unitsSold: 0,
            unitCost,
            avgSellingPrice: 0,
            salesValue: 0,
            ecommerceSales: 0,
            academicSales: 0,
            purchaseCost: 0,
            wastageQty: 0,
            wastageValue: 0,
            grossMargin: 0,
            netMargin: 0,
            marginPct: 0,
          };

          existing.unitsSold += qty;
          existing.salesValue += itemSaleVal;
          if (channel === "ecommerce") {
            existing.ecommerceSales += itemSaleVal;
          } else {
            existing.academicSales += itemSaleVal;
          }
          existing.purchaseCost += itemCost;
          if (existing.unitsSold > 0) {
            existing.avgSellingPrice = existing.salesValue / existing.unitsSold;
          }

          map.set(pId, existing);
        });
      }
    });

    // Merge product wastage
    productWastageMap.forEach((wData, pId) => {
      const prod = productsMap.get(pId);
      const existing = map.get(pId) || {
        productId: pId,
        productName: prod ? prod.name : "Wasted Product",
        sku: prod?.sku || "-",
        category: prod?.category || "General",
        unitsSold: 0,
        unitCost: prod?.currentPrice || 0,
        avgSellingPrice: 0,
        salesValue: 0,
        ecommerceSales: 0,
        academicSales: 0,
        purchaseCost: 0,
        wastageQty: 0,
        wastageValue: 0,
        grossMargin: 0,
        netMargin: 0,
        marginPct: 0,
      };

      existing.wastageQty += wData.qty;
      existing.wastageValue += wData.value;
      map.set(pId, existing);
    });

    // Compute margins
    const result: ProductPnL[] = [];
    map.forEach((item) => {
      item.grossMargin = item.salesValue - item.purchaseCost;
      item.netMargin = item.salesValue - item.purchaseCost - item.wastageValue;
      item.marginPct = item.salesValue > 0 ? (item.netMargin / item.salesValue) * 100 : 0;
      result.push(item);
    });

    return result;
  }, [activeBills, productWastageMap, productsMap]);

  // Filtered & Sorted Category Data
  const sortedCategoryData = useMemo(() => {
    let list = [...categoryData];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => c.category.toLowerCase().includes(q));
    }

    list.sort((a: any, b: any) => {
      const valA = a[sortField] !== undefined ? a[sortField] : 0;
      const valB = b[sortField] !== undefined ? b[sortField] : 0;
      if (typeof valA === "string") {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? valA - valB : valB - valA;
    });

    return list;
  }, [categoryData, searchQuery, sortField, sortAsc]);

  // Filtered & Sorted Product Data
  const sortedProductData = useMemo(() => {
    let list = [...productData];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.productName.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }

    list.sort((a: any, b: any) => {
      const valA = a[sortField] !== undefined ? a[sortField] : 0;
      const valB = b[sortField] !== undefined ? b[sortField] : 0;
      if (typeof valA === "string") {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? valA - valB : valB - valA;
    });

    return list;
  }, [productData, searchQuery, sortField, sortAsc]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // default descending for financial numbers
    }
  };

  // 7. Downloadable Excel Report Generation
  const handleDownloadReport = () => {
    try {
      const workbook = XLSX.utils.book_new();

      // Sheet 1: Executive Summary
      const summarySheetData = [
        ["PROFIT & LOSS (P&L) EXECUTIVE SUMMARY"],
        ["Generated On", new Date().toLocaleString()],
        ["Channel Filter", channelFilter.toUpperCase()],
        ["Date Range", datePreset.replace("_", " ").toUpperCase()],
        ["Custom Range", customStartDate ? `${customStartDate} to ${customEndDate}` : "N/A"],
        [],
        ["METRIC", "AMOUNT (INR)", "NOTES"],
        ["Total Sales Value", summaryMetrics.totalSales, "Both Academic & E-commerce"],
        ["- Academic Sales Value", summaryMetrics.academicSales, `${summaryMetrics.academicCount} Active Orders`],
        ["- E-commerce Sales Value", summaryMetrics.ecommerceSales, `${summaryMetrics.ecommerceCount} Active Orders`],
        ["Purchase Value (COGS)", summaryMetrics.totalPurchaseCost, "Cost of Goods Sold at Unit Cost"],
        ["Wastage Value @ Cost", summaryMetrics.totalWastageCost, `${summaryMetrics.totalWastageUnits} units written off`],
        ["Gross Profit (Sales - COGS)", summaryMetrics.grossMargin, ""],
        ["Net Margin (Profit/Loss)", summaryMetrics.netMargin, "Sales - COGS - Wastage"],
        ["Net Margin %", `${summaryMetrics.marginPct.toFixed(2)}%`, "Percentage of Sales Revenue"],
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetData);
      XLSX.utils.book_append_sheet(workbook, wsSummary, "P&L Summary");

      // Sheet 2: Category Breakdown
      const categorySheetData = sortedCategoryData.map((c) => ({
        Category: c.category,
        "Units Sold": c.unitsSold,
        "Total Sales (₹)": c.salesValue,
        "Academic Sales (₹)": c.academicSales,
        "E-commerce Sales (₹)": c.ecommerceSales,
        "Purchase Cost (₹)": c.purchaseCost,
        "Wastage @ Cost (₹)": c.wastageValue,
        "Gross Margin (₹)": c.grossMargin,
        "Net Margin (₹)": c.netMargin,
        "Margin %": `${c.marginPct.toFixed(1)}%`,
      }));
      const wsCategory = XLSX.utils.json_to_sheet(categorySheetData);
      XLSX.utils.book_append_sheet(workbook, wsCategory, "Category-wise P&L");

      // Sheet 3: Product Breakdown
      const productSheetData = sortedProductData.map((p) => ({
        "Product Name": p.productName,
        SKU: p.sku,
        Category: p.category,
        "Units Sold": p.unitsSold,
        "Avg Sell Price (₹)": Math.round(p.avgSellingPrice),
        "Unit Cost Price (₹)": p.unitCost,
        "Total Sales Value (₹)": p.salesValue,
        "Academic Sales (₹)": p.academicSales,
        "E-commerce Sales (₹)": p.ecommerceSales,
        "Purchase Cost (₹)": p.purchaseCost,
        "Wastage Units": p.wastageQty,
        "Wastage Value @ Cost (₹)": p.wastageValue,
        "Net Margin (₹)": p.netMargin,
        "Margin %": `${p.marginPct.toFixed(1)}%`,
      }));
      const wsProduct = XLSX.utils.json_to_sheet(productSheetData);
      XLSX.utils.book_append_sheet(workbook, wsProduct, "Product-wise P&L");

      // Sheet 4: Wastage Log
      const wastageSheetData = wastageTransactions.map((w) => ({
        Date: w.createdAt?.toDate ? w.createdAt.toDate().toLocaleDateString() : "-",
        Product: w.productName,
        "Quantity Wasted": w.quantity,
        "Unit Cost (₹)": w.price || 0,
        "Total Wastage @ Cost (₹)": w.totalAmount,
        "Reason / Notes": w.notes || w.reason || "Stock Discrepancy",
        "Logged By": w.performedByName || "Admin",
      }));
      const wsWastage = XLSX.utils.json_to_sheet(wastageSheetData);
      XLSX.utils.book_append_sheet(workbook, wsWastage, "Wastage Details");

      // Save file
      const fileName = `PNL_Report_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error("Export P&L Report error:", err);
      alert("Failed to export report. Please try again.");
    }
  };

  // 8. Log New Wastage Handler
  const handleLogWastage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wastageForm.productId || wastageForm.quantity <= 0) {
      return alert("Please select a valid product and enter quantity greater than 0");
    }

    const targetProduct = productsMap.get(wastageForm.productId);
    if (!targetProduct) return alert("Product not found");

    const costPrice = targetProduct.currentPrice || 0;
    const totalWastageCost = costPrice * wastageForm.quantity;

    setIsSubmittingWastage(true);
    try {
      // 1. Add record to transactions collection
      await addDoc(collection(db, "transactions"), {
        productId: targetProduct.id,
        productName: targetProduct.name,
        type: "waste",
        quantity: wastageForm.quantity,
        previousQuantity: targetProduct.totalQuantity || 0,
        newQuantity: Math.max(0, (targetProduct.totalQuantity || 0) - wastageForm.quantity),
        price: costPrice,
        totalAmount: totalWastageCost,
        reason: wastageForm.reason,
        notes: `[Wastage - ${wastageForm.reason}] ${wastageForm.customNotes || ""}`.trim(),
        performedBy: user?.uid || "admin",
        performedByName: user?.name || user?.email || "Admin",
        createdAt: serverTimestamp(),
      });

      // 2. Deduct from inventory stock in products collection
      const newStock = Math.max(0, (targetProduct.totalQuantity || 0) - wastageForm.quantity);
      await updateDoc(doc(db, "products", targetProduct.id), {
        totalQuantity: newStock,
        updatedAt: serverTimestamp(),
      });

      alert(`Successfully recorded wastage of ${wastageForm.quantity} units for ${targetProduct.name} at cost ${formatCurrency(totalWastageCost)}.`);
      setIsWastageModalOpen(false);
      setWastageForm({
        productId: "",
        quantity: 1,
        reason: "Damaged in transit",
        customNotes: "",
      });
    } catch (err) {
      console.error("Error logging wastage:", err);
      alert("Failed to record wastage. Please try again.");
    } finally {
      setIsSubmittingWastage(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 font-sans">
      {/* Page Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                  Profit & Loss (P&L) Statement
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                  Real-time analytics for Sales, Buying Cost, Wastage, and Net Margin across all business channels.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsWastageModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl transition cursor-pointer shadow-2xs"
            >
              <PlusCircle className="w-3.5 h-3.5 text-rose-600" />
              Record Wastage
            </button>

            <button
              onClick={handleDownloadReport}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Report (Excel)
            </button>
          </div>
        </div>

        {/* Global Filter Bar: Channel & Date Range */}
        <div className="mt-5 p-4 bg-white rounded-2xl shadow-xs border border-gray-200/90 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Channel Selector */}
          <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-xl overflow-x-auto">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2">Channel:</span>
            <button
              onClick={() => setChannelFilter("all")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer ${
                channelFilter === "all"
                  ? "bg-white text-gray-900 shadow-2xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              All Channels ({summaryMetrics.activeBillsCount})
            </button>
            <button
              onClick={() => setChannelFilter("academic")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                channelFilter === "academic"
                  ? "bg-purple-600 text-white shadow-2xs"
                  : "text-purple-700 hover:bg-purple-50"
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              Academic
            </button>
            <button
              onClick={() => setChannelFilter("ecommerce")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                channelFilter === "ecommerce"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-blue-700 hover:bg-blue-50"
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              E-commerce
            </button>
          </div>

          {/* Date Range Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as DateRangePreset)}
                className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="this_week">This Week</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="this_quarter">This Quarter</option>
                <option value="this_fy">This Financial Year (FY)</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </div>

            {datePreset === "custom" && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-gray-50"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-gray-50"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">
        {/* ============ TOP METRIC SUMMARY CARDS ============ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
          {/* 1. Total Sales Value (Both Academic & E-commerce) */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Total Sales</span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <IndianRupee className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-xl font-bold text-gray-900 tracking-tight truncate">
                {formatCurrency(summaryMetrics.totalSales)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Academic + E-commerce</p>
            </div>
          </div>

          {/* 2. E-commerce Sales Value */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wider">E-commerce Sales</span>
              <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-xl font-bold text-teal-700 tracking-tight truncate">
                {formatCurrency(summaryMetrics.ecommerceSales)}
              </p>
              <p className="text-[11px] text-teal-600 mt-0.5 truncate">
                {summaryMetrics.ecommerceCount} Orders &bull;{" "}
                {summaryMetrics.totalSales > 0
                  ? ((summaryMetrics.ecommerceSales / summaryMetrics.totalSales) * 100).toFixed(0)
                  : 0}
                % share
              </p>
            </div>
          </div>

          {/* 3. Academic Sales Value */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">Academic Sales</span>
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <GraduationCap className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-xl font-bold text-purple-700 tracking-tight truncate">
                {formatCurrency(summaryMetrics.academicSales)}
              </p>
              <p className="text-[11px] text-purple-600 mt-0.5 truncate">
                {summaryMetrics.academicCount} Orders &bull;{" "}
                {summaryMetrics.totalSales > 0
                  ? ((summaryMetrics.academicSales / summaryMetrics.totalSales) * 100).toFixed(0)
                  : 0}
                % share
              </p>
            </div>
          </div>

          {/* 4. Purchase Value (COGS) */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Purchase Value</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-xl font-bold text-indigo-900 tracking-tight truncate">
                {formatCurrency(summaryMetrics.totalPurchaseCost)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Cost of Goods Sold (COGS)</p>
            </div>
          </div>

          {/* 5. Wastage @ Cost Price */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Wastage (@ Cost)</span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-xl font-bold text-rose-600 tracking-tight truncate">
                {formatCurrency(summaryMetrics.totalWastageCost)}
              </p>
              <p className="text-[11px] text-rose-500 mt-0.5 truncate">
                {summaryMetrics.totalWastageUnits} units written off
              </p>
            </div>
          </div>

          {/* 6. Net Margin */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Net Margin</span>
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  summaryMetrics.netMargin >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                }`}
              >
                {summaryMetrics.netMargin >= 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
              </div>
            </div>
            <div className="mt-2.5">
              <p
                className={`text-xl font-bold tracking-tight truncate ${
                  summaryMetrics.netMargin >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {formatCurrency(summaryMetrics.netMargin)}
              </p>
              <p className="text-[11px] font-semibold text-emerald-700 mt-0.5 truncate">
                {summaryMetrics.marginPct >= 0 ? "+" : ""}
                {summaryMetrics.marginPct.toFixed(1)}% margin
              </p>
            </div>
          </div>
        </div>

        {/* ============ VIEW SWITCHER & SEARCH ============ */}
        <div className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* View Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-gray-100/90 rounded-xl">
              <button
                onClick={() => setActiveTab("category")}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTab === "category"
                    ? "bg-white text-gray-900 shadow-2xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Category-wise P&L ({categoryData.length})
              </button>
              <button
                onClick={() => setActiveTab("product")}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTab === "product"
                    ? "bg-white text-gray-900 shadow-2xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Product-wise P&L ({productData.length})
              </button>
              <button
                onClick={() => setActiveTab("wastage")}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTab === "wastage"
                    ? "bg-white text-gray-900 shadow-2xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Wastage Log ({wastageTransactions.length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeTab === "category"
                    ? "Search categories..."
                    : activeTab === "product"
                    ? "Search products, SKU, category..."
                    : "Search wastage notes..."
                }
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ============ TAB A: CATEGORY-WISE P&L ============ */}
        {activeTab === "category" && (
          <div className="bg-white rounded-2xl shadow-xs border border-gray-200/90 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-gray-900">Category-wise Profit & Loss Breakdown</h3>
                <p className="text-xs text-gray-500">Grouped by product categories in your inventory</p>
              </div>
              <span className="text-xs text-gray-400 font-medium">
                {sortedCategoryData.length} {sortedCategoryData.length === 1 ? "Category" : "Categories"}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4 cursor-pointer" onClick={() => handleSort("category")}>
                      <div className="flex items-center gap-1">Category <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-3 px-3 text-center cursor-pointer" onClick={() => handleSort("unitsSold")}>
                      <div className="flex items-center justify-center gap-1">Units Sold <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-3 px-3 text-right cursor-pointer" onClick={() => handleSort("salesValue")}>
                      <div className="flex items-center justify-end gap-1">Total Sales <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-3 px-3 text-right text-teal-700">E-com Sales</th>
                    <th className="py-3 px-3 text-right text-purple-700">Academic Sales</th>
                    <th className="py-3 px-3 text-right cursor-pointer" onClick={() => handleSort("purchaseCost")}>
                      <div className="flex items-center justify-end gap-1">Purchase Cost (COGS) <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-3 px-3 text-right text-rose-600 cursor-pointer" onClick={() => handleSort("wastageValue")}>
                      <div className="flex items-center justify-end gap-1">Wastage @ Cost <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-3 px-3 text-right cursor-pointer" onClick={() => handleSort("netMargin")}>
                      <div className="flex items-center justify-end gap-1">Net Margin <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-3 px-4 text-center cursor-pointer" onClick={() => handleSort("marginPct")}>
                      <div className="flex items-center justify-center gap-1">Margin % <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedCategoryData.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-gray-400">
                        No category data found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    sortedCategoryData.map((c) => (
                      <tr key={c.category} className="hover:bg-gray-50/70 transition">
                        <td className="py-3 px-4 font-bold text-gray-900 flex items-center gap-2">
                          <Layers className="w-3.5 h-3.5 text-blue-500" />
                          <span>{c.category}</span>
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-gray-700">{c.unitsSold}</td>
                        <td className="py-3 px-3 text-right font-bold text-gray-900">{formatCurrency(c.salesValue)}</td>
                        <td className="py-3 px-3 text-right text-teal-700 font-medium">{formatCurrency(c.ecommerceSales)}</td>
                        <td className="py-3 px-3 text-right text-purple-700 font-medium">{formatCurrency(c.academicSales)}</td>
                        <td className="py-3 px-3 text-right text-gray-600">{formatCurrency(c.purchaseCost)}</td>
                        <td className="py-3 px-3 text-right text-rose-600 font-medium">{formatCurrency(c.wastageValue)}</td>
                        <td className="py-3 px-3 text-right font-bold">
                          <span className={c.netMargin >= 0 ? "text-emerald-600" : "text-rose-600"}>
                            {formatCurrency(c.netMargin)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              c.marginPct >= 20
                                ? "bg-emerald-100 text-emerald-800"
                                : c.marginPct >= 0
                                ? "bg-blue-100 text-blue-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {c.marginPct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {sortedCategoryData.length > 0 && (
                  <tfoot className="bg-gray-50 font-bold border-t-2 border-gray-200 text-gray-900">
                    <tr>
                      <td className="py-3 px-4">TOTALS</td>
                      <td className="py-3 px-3 text-center">{summaryMetrics.totalBilledUnits}</td>
                      <td className="py-3 px-3 text-right">{formatCurrency(summaryMetrics.totalSales)}</td>
                      <td className="py-3 px-3 text-right text-teal-700">{formatCurrency(summaryMetrics.ecommerceSales)}</td>
                      <td className="py-3 px-3 text-right text-purple-700">{formatCurrency(summaryMetrics.academicSales)}</td>
                      <td className="py-3 px-3 text-right">{formatCurrency(summaryMetrics.totalPurchaseCost)}</td>
                      <td className="py-3 px-3 text-right text-rose-600">{formatCurrency(summaryMetrics.totalWastageCost)}</td>
                      <td className="py-3 px-3 text-right text-emerald-600">{formatCurrency(summaryMetrics.netMargin)}</td>
                      <td className="py-3 px-4 text-center">{summaryMetrics.marginPct.toFixed(1)}%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ============ TAB B: PRODUCT-WISE P&L ============ */}
        {activeTab === "product" && (
          <div className="bg-white rounded-2xl shadow-xs border border-gray-200/90 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-gray-900">Product-wise Profit & Loss Performance</h3>
                <p className="text-xs text-gray-500">Individual product unit costs, sales values, wastage, and profit margins</p>
              </div>
              <span className="text-xs text-gray-400 font-medium">
                {sortedProductData.length} {sortedProductData.length === 1 ? "Product" : "Products"}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4 cursor-pointer" onClick={() => handleSort("productName")}>
                      <div className="flex items-center gap-1">Product <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3 text-center cursor-pointer" onClick={() => handleSort("unitsSold")}>
                      <div className="flex items-center justify-center gap-1">Units Sold <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-3 px-3 text-right">Avg Sell Price</th>
                    <th className="py-3 px-3 text-right">Unit Cost Price</th>
                    <th className="py-3 px-3 text-right cursor-pointer" onClick={() => handleSort("salesValue")}>
                      <div className="flex items-center justify-end gap-1">Sales Value <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-3 px-3 text-right cursor-pointer" onClick={() => handleSort("purchaseCost")}>
                      <div className="flex items-center justify-end gap-1">Purchase Cost <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-3 px-3 text-right text-rose-600 cursor-pointer" onClick={() => handleSort("wastageValue")}>
                      <div className="flex items-center justify-end gap-1">Wastage @ Cost <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-3 px-3 text-right cursor-pointer" onClick={() => handleSort("netMargin")}>
                      <div className="flex items-center justify-end gap-1">Net Margin <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-3 px-4 text-center cursor-pointer" onClick={() => handleSort("marginPct")}>
                      <div className="flex items-center justify-center gap-1">Margin % <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedProductData.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-gray-400">
                        No product data found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    sortedProductData.map((p) => (
                      <tr key={p.productId} className="hover:bg-gray-50/70 transition">
                        <td className="py-3 px-4">
                          <p className="font-bold text-gray-900">{p.productName}</p>
                          {p.sku && p.sku !== "-" && <p className="text-[10px] text-gray-400 font-mono">SKU: {p.sku}</p>}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md text-[11px] font-medium">
                            {p.category}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-gray-800">{p.unitsSold}</td>
                        <td className="py-3 px-3 text-right text-gray-700">{formatCurrency(p.avgSellingPrice)}</td>
                        <td className="py-3 px-3 text-right text-gray-600">{formatCurrency(p.unitCost)}</td>
                        <td className="py-3 px-3 text-right font-bold text-gray-900">{formatCurrency(p.salesValue)}</td>
                        <td className="py-3 px-3 text-right text-gray-600">{formatCurrency(p.purchaseCost)}</td>
                        <td className="py-3 px-3 text-right text-rose-600 font-medium">
                          {p.wastageValue > 0 ? formatCurrency(p.wastageValue) : "-"}
                        </td>
                        <td className="py-3 px-3 text-right font-bold">
                          <span className={p.netMargin >= 0 ? "text-emerald-600" : "text-rose-600"}>
                            {formatCurrency(p.netMargin)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              p.marginPct >= 20
                                ? "bg-emerald-100 text-emerald-800"
                                : p.marginPct >= 0
                                ? "bg-blue-100 text-blue-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {p.marginPct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============ TAB C: WASTAGE LOG ============ */}
        {activeTab === "wastage" && (
          <div className="bg-white rounded-2xl shadow-xs border border-gray-200/90 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-gray-900">Stock Wastage & Loss Log (@ Cost Price)</h3>
                <p className="text-xs text-gray-500">Damaged, defective, expired, or written-off items recorded at unit purchase cost</p>
              </div>
              <button
                onClick={() => setIsWastageModalOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition"
              >
                + Log Wastage
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-3 text-center">Quantity Wasted</th>
                    <th className="py-3 px-3 text-right">Unit Cost Price</th>
                    <th className="py-3 px-3 text-right text-rose-600 font-bold">Total Wastage @ Cost</th>
                    <th className="py-3 px-4">Reason / Notes</th>
                    <th className="py-3 px-3">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {wastageTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-400">
                        No wastage recorded for this period. Click "+ Log Wastage" to record damaged or written-off stock.
                      </td>
                    </tr>
                  ) : (
                    wastageTransactions.map((w) => (
                      <tr key={w.id} className="hover:bg-gray-50/70 transition">
                        <td className="py-3 px-4 text-gray-500">
                          {w.createdAt?.toDate ? w.createdAt.toDate().toLocaleDateString() : "-"}
                        </td>
                        <td className="py-3 px-4 font-bold text-gray-900">{w.productName}</td>
                        <td className="py-3 px-3 text-center font-bold text-rose-700">{w.quantity}</td>
                        <td className="py-3 px-3 text-right text-gray-600">{formatCurrency(w.price || 0)}</td>
                        <td className="py-3 px-3 text-right font-bold text-rose-600">
                          {formatCurrency(w.totalAmount)}
                        </td>
                        <td className="py-3 px-4 text-gray-700">
                          <span className="font-semibold text-gray-800">{w.reason || "Wastage"}</span>
                          {w.notes && <p className="text-[11px] text-gray-500 mt-0.5">{w.notes}</p>}
                        </td>
                        <td className="py-3 px-3 text-gray-600">{w.performedByName || "Admin"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ============ MODAL: LOG NEW WASTAGE ============ */}
      {isWastageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <div className="flex items-center gap-2 text-rose-600">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-base font-bold text-gray-900">Record Stock Wastage / Loss</h3>
              </div>
              <button
                onClick={() => setIsWastageModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleLogWastage} className="space-y-4 text-xs">
              {/* Product Selector */}
              <div>
                <label className="block font-semibold text-gray-700 uppercase mb-1">
                  Select Product <span className="text-red-500">*</span>
                </label>
                <select
                  value={wastageForm.productId}
                  onChange={(e) => setWastageForm({ ...wastageForm, productId: e.target.value })}
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                >
                  <option value="">-- Choose Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.sku ? `(${p.sku})` : ""} - Stock: {p.totalQuantity} - Cost: {formatCurrency(p.currentPrice || 0)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label className="block font-semibold text-gray-700 uppercase mb-1">
                  Quantity Damaged / Wasted <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={wastageForm.quantity}
                  onChange={(e) => setWastageForm({ ...wastageForm, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="block font-semibold text-gray-700 uppercase mb-1">
                  Reason for Wastage <span className="text-red-500">*</span>
                </label>
                <select
                  value={wastageForm.reason}
                  onChange={(e) => setWastageForm({ ...wastageForm, reason: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                >
                  <option value="Damaged in transit">Damaged in transit</option>
                  <option value="Defective from supplier">Defective from supplier</option>
                  <option value="Demo / Workshop scrap">Demo / Workshop scrap</option>
                  <option value="Expired / Obsolete">Expired / Obsolete</option>
                  <option value="Physical count discrepancy">Physical count discrepancy</option>
                  <option value="Customer return / Unusable">Customer return / Unusable</option>
                </select>
              </div>

              {/* Custom Remarks */}
              <div>
                <label className="block font-semibold text-gray-700 uppercase mb-1">Remarks / Details</label>
                <textarea
                  rows={2}
                  value={wastageForm.customNotes}
                  onChange={(e) => setWastageForm({ ...wastageForm, customNotes: e.target.value })}
                  placeholder="Optional details or ticket reference..."
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>

              {/* Total Calculation Preview */}
              {wastageForm.productId && productsMap.get(wastageForm.productId) && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-rose-900">Total Wastage Cost</p>
                    <p className="text-[11px] text-rose-700">
                      {wastageForm.quantity} units &times; {formatCurrency(productsMap.get(wastageForm.productId)?.currentPrice || 0)} unit cost
                    </p>
                  </div>
                  <p className="text-base font-bold text-rose-700">
                    {formatCurrency(
                      (productsMap.get(wastageForm.productId)?.currentPrice || 0) * wastageForm.quantity
                    )}
                  </p>
                </div>
              )}

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isSubmittingWastage}
                  onClick={() => setIsWastageModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingWastage}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs cursor-pointer disabled:opacity-60"
                >
                  {isSubmittingWastage ? "Recording..." : "Confirm & Deduct Stock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

