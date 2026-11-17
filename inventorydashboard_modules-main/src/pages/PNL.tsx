import React, { useEffect, useState, useMemo } from "react";
import {
  collection,
  onSnapshot,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../App";
import * as XLSX from "xlsx-js-style";
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  ShoppingCart,
  GraduationCap,
  IndianRupee,
  Calendar,
  Download,
  RefreshCw,
  Search,
  Filter,
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

interface CategoryPnL {
  category: string;
  unitsSold: number;
  salesValue: number;
  ecommerceSales: number;
  academicSales: number;
  purchaseCost: number;
  wastageQty?: number;
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
  const [loading, setLoading] = useState(true);

  // Filters & View State
  const [datePreset, setDatePreset] = useState<DateRangePreset>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [activeTab, setActiveTab] = useState<"category" | "product" | "remaining">("category");
  const [searchQuery, setSearchQuery] = useState("");

  // Sort State
  const [sortField, setSortField] = useState<string>("salesValue");
  const [sortAsc, setSortAsc] = useState<boolean>(false);

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
      setLoading(false);
    });

    // Bills Listener
    const unsubBills = onSnapshot(collection(db, "bills"), (snap) => {
      const list: BillRecord[] = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setBills(list);
      setLoading(false);
    });

    // Enquiries Listener (to determine channel for bills)
    const unsubEnquiries = onSnapshot(collection(db, "enquiries"), (snap) => {
      const list: EnquiryRecord[] = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setEnquiries(list);
    });

    return () => {
      unsubProducts();
      unsubBills();
      unsubEnquiries();
    };
  }, []);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const [prodSnap, billSnap, enqSnap] = await Promise.all([
        getDocs(collection(db, "products")),
        getDocs(collection(db, "bills")),
        getDocs(collection(db, "enquiries")),
      ]);

      const prodList: InventoryProduct[] = prodSnap.docs.map((docSnap) => {
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
      setProducts(prodList);

      const billList: BillRecord[] = billSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setBills(billList);

      const enqList: EnquiryRecord[] = enqSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setEnquiries(enqList);
    } catch (err) {
      console.error("Manual refresh failed in PNL:", err);
    } finally {
      setRefreshing(false);
    }
  };

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

  // Helper: Identify if an item or product represents Course / Training (Academic)
  // Rule: Components -> E-commerce, Course & Training -> Academic
  const isAcademicOrTrainingItem = (item: any, bill?: BillRecord): boolean => {
    const rawName = String(item?.productName || item?.name || "").toLowerCase().trim();
    const rawCat = String(item?.category || "").toLowerCase().trim();
    const rawSku = String(item?.sku || "").toLowerCase().trim();

    const academicKeywords = [
      "course",
      "training",
      "workshop",
      "internship",
      "bootcamp",
      "tuition",
      "class",
      "lecture",
      "student fee",
      "course fee",
      "training fee",
      "academic fee",
      "session",
      "syllabus",
      "curriculum",
      "certification",
      "seminar",
      "webinar",
      "coaching",
      "fellowship",
    ];

    if (academicKeywords.some((kw) => rawName.includes(kw) || rawCat.includes(kw) || rawSku.includes(kw))) {
      return true;
    }

    // Check matched product in inventory
    const matched = findProduct(item);
    if (matched) {
      const mCat = String(matched.category || "").toLowerCase().trim();
      const mName = String(matched.name || "").toLowerCase().trim();
      if (academicKeywords.some((kw) => mCat.includes(kw) || mName.includes(kw))) {
        return true;
      }
      // If it matched a physical product in inventory (sensors, microcontrollers, motors, etc.),
      // it is a component, so it belongs in E-commerce!
      return false;
    }

    // Check enquiry context
    const enqKey = bill?.enquiryEnqId || bill?.enquiryId;
    if (enqKey && enquiriesMap.has(enqKey)) {
      const enq = enquiriesMap.get(enqKey)!;
      const enqType = String(enq.type || "").toLowerCase().trim();
      const enqCourse = String((enq as any).course || (enq as any).preferredCourse || "").toLowerCase().trim();
      if (
        enqType === "training" ||
        enqType.includes("train") ||
        enqType === "academic" ||
        enqType.includes("course") ||
        enqCourse.length > 0
      ) {
        return true;
      }
    }

    // Check explicit channel on bill
    if (bill) {
      const bChannel = String(bill.channel || (bill as any).orderType || "").toLowerCase().trim();
      if (bChannel === "training" || bChannel === "academic" || bChannel === "course") {
        return true;
      }
    }

    // Default: physical components belong in E-commerce
    return false;
  };

  // Determine Channel for a Bill (Components -> E-commerce, Course & Training -> Academic)
  const resolveBillChannel = (bill: BillRecord): "academic" | "ecommerce" => {
    // 1. Check explicit channel or orderType
    const bChannel = String(bill.channel || (bill as any).orderType || "").toLowerCase().trim();
    if (bChannel === "ecommerce" || bChannel === "components") return "ecommerce";
    if (bChannel === "training" || bChannel === "academic" || bChannel === "course") return "academic";

    // 2. Inspect bill line items: components vs courses/training
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
      let academicScore = 0;
      let ecommerceScore = 0;

      itemsList.forEach((it) => {
        const val = Number(it.total || (Number(it.price) || 0) * (Number(it.quantity) || 1));
        const weight = val > 0 ? val : 1;
        if (isAcademicOrTrainingItem(it, bill)) {
          academicScore += weight;
        } else {
          ecommerceScore += weight;
        }
      });

      if (academicScore > ecommerceScore) return "academic";
      return "ecommerce";
    }

    // 3. Inspect enquiry details
    const enqKey = bill.enquiryEnqId || bill.enquiryId;
    if (enqKey && enquiriesMap.has(enqKey)) {
      const enq = enquiriesMap.get(enqKey)!;
      const enqType = String(enq.type || "").toLowerCase().trim();
      const enqMode = String(enq.mode || "").toLowerCase().trim();
      const enqCourse = String((enq as any).course || (enq as any).preferredCourse || "").toLowerCase().trim();

      if (
        enqType === "training" ||
        enqType.includes("train") ||
        enqType === "academic" ||
        enqType.includes("course") ||
        enqCourse.length > 0
      ) {
        return "academic";
      }

      if (enqType.includes("ecommerce") || enqType.includes("b2c") || enqType.includes("b2b") || enqMode.includes("website")) {
        return "ecommerce";
      }
    }

    // 4. Default: Components belong in E-commerce
    return "ecommerce";
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

  // 1.5 Deduplicated Bills (Keep only newest revision per enquiry, matching BillTransactions)
  const deduplicatedBills = useMemo(() => {
    const billMap = new Map<string, BillRecord>();
    const sorted = [...bills].sort((a, b) => {
      const getD = (x: any) => {
        const val = x.updatedAt || x.createdAt || x.billDate;
        if (val?.toDate && typeof val.toDate === "function") return val.toDate().getTime();
        if (val instanceof Date) return val.getTime();
        if (typeof val === "string" || typeof val === "number") {
          const t = new Date(val).getTime();
          if (!isNaN(t)) return t;
        }
        return 0;
      };
      return getD(b) - getD(a);
    });

    sorted.forEach((bill) => {
      const key = bill.enquiryEnqId || bill.enquiryId || bill.id;
      if (key && !billMap.has(key)) {
        billMap.set(key, bill);
      } else if (!key) {
        billMap.set(bill.id || `bill-${Math.random()}`, bill);
      }
    });

    return Array.from(billMap.values());
  }, [bills]);

  // 2. Filtered Bills (Date Filtered & Status Checked)
  const activeBills = useMemo(() => {
    return deduplicatedBills.filter((b) => {
      // Check linked enquiry status from enquiries collection
      const enqKey = b.enquiryEnqId || b.enquiryId;
      const enq = enqKey ? enquiriesMap.get(enqKey) : null;
      const isEnquiryDropped =
        enq?.status?.toLowerCase() === "dropped" ||
        (enq as any)?.productStatus?.toLowerCase() === "dropped";

      // Exclude dropped or fully refunded bills from revenue
      const isDroppedOrRefunded =
        isEnquiryDropped ||
        b.status === "dropped" ||
        b.paymentStatus === "refunded" ||
        (b as any).refunded === true ||
        (typeof b.paymentSubStatus === "string" && b.paymentSubStatus.toLowerCase().includes("refund")) ||
        (typeof (b as any).enquiryStatus === "string" && (b as any).enquiryStatus.toLowerCase() === "dropped");
      if (isDroppedOrRefunded) return false;

      // Filter by Date (prioritize billDate over createdAt)
      const billDate = b.billDate || b.createdAt || b.updatedAt;
      return isDateInSelectedRange(billDate);
    });
  }, [deduplicatedBills, enquiriesMap, datePreset, customStartDate, customEndDate]);

  // Helper to extract unit purchase cost
  const getProductUnitCost = (p: InventoryProduct | null | undefined, fallbackItem?: any): number => {
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
    const stockEntries = (p as any).stockEntries || [];
    if (Array.isArray(stockEntries) && stockEntries.length > 0) {
      const addEntries = stockEntries.filter((e: any) => e.type !== "deliver");
      if (addEntries.length > 0) {
        const totalCost = addEntries.reduce(
          (sum: number, e: any) => sum + (Number(e.totalPrice) || ((Number(e.quantity) || 0) * (Number(e.unitPrice) || 0))),
          0
        );
        const totalQty = addEntries.reduce((sum: number, e: any) => sum + (Number(e.quantity) || 0), 0);
        if (totalQty > 0) return totalCost / totalQty;
        if (addEntries[addEntries.length - 1]?.unitPrice) {
          return Number(addEntries[addEntries.length - 1].unitPrice);
        }
      }
    }
    return Number(p.price || 0);
  };

  // 3. Remaining Products in Inventory (Valued as Wastage @ Cost)
  // Wastage @ Cost is strictly the purchase cost valuation of unsold products remaining in inventory:
  // Wastage Cost = Remaining Products × Unit Cost Price
  const remainingInventoryProducts = useMemo(() => {
    return products
      .map((p) => {
        const remainingQty = Math.max(0, Number(p.totalQuantity || 0));
        const unitCost = getProductUnitCost(p);
        const totalWastageCost = remainingQty * unitCost;
        return {
          id: p.id,
          name: p.name || "Unnamed Product",
          sku: p.sku || "-",
          category: (p.category || "General").trim() || "General",
          remainingQty,
          unitCost,
          totalWastageCost,
        };
      })
      .filter((p) => p.remainingQty > 0 || p.totalWastageCost > 0)
      .sort((a, b) => b.totalWastageCost - a.totalWastageCost);
  }, [products]);

  // 4. Product-wise Performance Data (Unified Base Engine)
  // WASTAGE COST MEANS THE REMAINING STOCK PRODUCTS COST:
  // For each product, Wastage @ Cost is the remaining stock valuation (remaining units * unit cost).
  const productData = useMemo(() => {
    const map = new Map<string, ProductPnL>();

    // 1. Initialize map with all inventory products so remaining stock is fully accounted for
    products.forEach((p) => {
      const unitCost = getProductUnitCost(p);
      const remainingStock = Math.max(0, Number(p.totalQuantity || 0));
      const wastageValue = remainingStock * unitCost;

      map.set(p.id, {
        productId: p.id,
        productName: p.name || "Unnamed Product",
        sku: p.sku || "-",
        category: (p.category || "General").trim() || "General",
        unitsSold: 0,
        unitCost,
        avgSellingPrice: 0,
        salesValue: 0,
        ecommerceSales: 0,
        academicSales: 0,
        purchaseCost: 0,
        wastageQty: remainingStock,
        wastageValue,
        grossMargin: 0,
        netMargin: 0,
        marginPct: 0,
      });
    });

    // 2. Map delivered items from active bills with proportional revenue allocation
    activeBills.forEach((bill) => {
      const channel = resolveBillChannel(bill);
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
      if (!Array.isArray(itemsList) || itemsList.length === 0) {
        const enqKey = bill.enquiryEnqId || bill.enquiryId;
        const enq = enqKey ? enquiriesMap.get(enqKey) : null;
        if (enq) {
          try {
            let parsed = enq.materials || (enq as any).products || (enq as any).items;
            if (typeof parsed === "string") parsed = JSON.parse(parsed);
            if (Array.isArray(parsed)) {
              itemsList = parsed.map((m: any) => ({
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
              }));
            }
          } catch {
            // ignore
          }
        }
      }

      if (Array.isArray(itemsList) && itemsList.length > 0) {
        const rawItemsSum = itemsList.reduce((sum, it) => {
          const raw = Number(it.total || (Number(it.price) || 0) * (Number(it.quantity) || 1));
          return sum + (raw > 0 ? raw : 0);
        }, 0);

        itemsList.forEach((item) => {
          const qty = Number(item.quantity) || 1;
          const matched = findProduct(item);
          const pId = matched ? matched.id : String(item.productId || item.productName || "custom-item");
          const pName = matched ? matched.name : String(item.productName || item.name || "Custom Item");
          const sku = matched?.sku || item.sku || "-";
          const category = (matched?.category || item.category || "General").trim() || "General";
          const unitCost = getProductUnitCost(matched, item);
          const itemCost = unitCost * qty;

          let itemSaleVal = 0;
          const itemRaw = Number(item.total || (Number(item.price) || 0) * qty);
          if (rawItemsSum > 0 && billTotal > 0) {
            itemSaleVal = (itemRaw / rawItemsSum) * billTotal;
          } else if (billTotal > 0) {
            itemSaleVal = billTotal / itemsList.length;
          } else {
            itemSaleVal = itemRaw;
          }

          let existing = map.get(pId);
          if (!existing) {
            existing = {
              productId: pId,
              productName: pName,
              sku,
              category,
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
            map.set(pId, existing);
          }

          existing.unitsSold += qty;
          existing.salesValue += itemSaleVal;
          const isItemAcademic = isAcademicOrTrainingItem(item, bill);
          if (isItemAcademic) {
            existing.academicSales += itemSaleVal;
          } else {
            existing.ecommerceSales += itemSaleVal;
          }
          existing.purchaseCost += itemCost;
        });
      } else if (billTotal > 0) {
        const isBillAcademic = resolveBillChannel(bill) === "academic";
        const pId = isBillAcademic ? "academic-training-services" : "ecommerce-component-sales";
        const explicitBillCost = Number((bill as any).purchaseValue ?? (bill as any).totalCost ?? 0);
        let existing = map.get(pId);
        if (!existing) {
          existing = {
            productId: pId,
            productName: isBillAcademic ? "Academic & Training Services" : "Component Sales & Services",
            sku: isBillAcademic ? "TRN-SRV" : "GEN-BILL",
            category: isBillAcademic ? "Training" : "General",
            unitsSold: 1,
            unitCost: explicitBillCost,
            avgSellingPrice: billTotal,
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
          map.set(pId, existing);
        }
        existing.salesValue += billTotal;
        existing.purchaseCost += explicitBillCost;
        if (isBillAcademic) {
          existing.academicSales += billTotal;
        } else {
          existing.ecommerceSales += billTotal;
        }
      }
    });

    // 3. Compute margins and filter to products with either sales or remaining stock
    const result: ProductPnL[] = [];
    map.forEach((item) => {
      if (item.unitsSold > 0) {
        item.avgSellingPrice = item.salesValue / item.unitsSold;
      }
      item.grossMargin = item.salesValue - item.purchaseCost;
      item.netMargin = item.salesValue - item.purchaseCost;
      item.marginPct = item.salesValue > 0 ? (item.netMargin / item.salesValue) * 100 : 0;

      // Include products with sales or remaining stock
      if (item.unitsSold > 0 || item.wastageQty > 0 || item.salesValue > 0 || item.wastageValue > 0) {
        result.push(item);
      }
    });

    return result;
  }, [products, activeBills, productsMap, productsByName]);

  // 5. Category-wise Breakdown Aggregation (Aggregated from productData)
  const categoryData = useMemo(() => {
    const map = new Map<string, CategoryPnL>();

    productData.forEach((p) => {
      const cat = p.category || "General";
      let existing = map.get(cat);
      if (!existing) {
        existing = {
          category: cat,
          unitsSold: 0,
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
        map.set(cat, existing);
      }

      existing.unitsSold += p.unitsSold;
      existing.salesValue += p.salesValue;
      existing.ecommerceSales += p.ecommerceSales;
      existing.academicSales += p.academicSales;
      existing.purchaseCost += p.purchaseCost;
      existing.wastageQty = (existing.wastageQty || 0) + p.wastageQty;
      existing.wastageValue += p.wastageValue;
    });

    const result: CategoryPnL[] = [];
    map.forEach((item) => {
      item.grossMargin = item.salesValue - item.purchaseCost;
      item.netMargin = item.salesValue - item.purchaseCost;
      item.marginPct = item.salesValue > 0 ? (item.netMargin / item.salesValue) * 100 : 0;
      result.push(item);
    });

    return result;
  }, [productData]);

  // 6. Top Executive Metric Cards
  const summaryMetrics = useMemo(() => {
    let ecommerceCount = 0;
    let academicCount = 0;
    activeBills.forEach((bill) => {
      if (resolveBillChannel(bill) === "ecommerce") {
        ecommerceCount++;
      } else {
        academicCount++;
      }
    });

    const totalSales = productData.reduce((s, p) => s + p.salesValue, 0);
    const ecommerceSales = productData.reduce((s, p) => s + p.ecommerceSales, 0);
    const academicSales = productData.reduce((s, p) => s + p.academicSales, 0);
    const totalPurchaseCost = productData.reduce((s, p) => s + p.purchaseCost, 0);
    const totalWastageCost = productData.reduce((s, p) => s + p.wastageValue, 0);
    const totalWastageUnits = productData.reduce((s, p) => s + p.wastageQty, 0);
    const totalBilledUnits = productData.reduce((s, p) => s + p.unitsSold, 0);
    const grossMargin = totalSales - totalPurchaseCost;
    const netMargin = totalSales - totalPurchaseCost;
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
  }, [productData, activeBills]);

  // 7. Filtered & Sorted Category Data
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

  // 8. Filtered & Sorted Product Data
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

  // 9. Filtered & Sorted Remaining Products
  const sortedRemainingProducts = useMemo(() => {
    let list = [...remainingInventoryProducts];
    if (searchQuery.trim() && activeTab === "remaining") {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }

    list.sort((a: any, b: any) => {
      const valA = a[sortField] !== undefined ? a[sortField] : a.totalWastageCost;
      const valB = b[sortField] !== undefined ? b[sortField] : b.totalWastageCost;
      if (typeof valA === "string") {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? valA - valB : valB - valA;
    });

    return list;
  }, [remainingInventoryProducts, searchQuery, activeTab, sortField, sortAsc]);

  // 10. Dynamic Totals for Footers
  const categoryTotals = useMemo(() => {
    return sortedCategoryData.reduce(
      (acc, c) => ({
        unitsSold: acc.unitsSold + c.unitsSold,
        salesValue: acc.salesValue + c.salesValue,
        ecommerceSales: acc.ecommerceSales + c.ecommerceSales,
        academicSales: acc.academicSales + c.academicSales,
        purchaseCost: acc.purchaseCost + c.purchaseCost,
        wastageQty: acc.wastageQty + (c.wastageQty || 0),
        wastageValue: acc.wastageValue + c.wastageValue,
        grossMargin: acc.grossMargin + c.grossMargin,
        netMargin: acc.netMargin + c.netMargin,
      }),
      {
        unitsSold: 0,
        salesValue: 0,
        ecommerceSales: 0,
        academicSales: 0,
        purchaseCost: 0,
        wastageQty: 0,
        wastageValue: 0,
        grossMargin: 0,
        netMargin: 0,
      }
    );
  }, [sortedCategoryData]);

  const productTotals = useMemo(() => {
    return sortedProductData.reduce(
      (acc, p) => ({
        unitsSold: acc.unitsSold + p.unitsSold,
        salesValue: acc.salesValue + p.salesValue,
        ecommerceSales: acc.ecommerceSales + p.ecommerceSales,
        academicSales: acc.academicSales + p.academicSales,
        purchaseCost: acc.purchaseCost + p.purchaseCost,
        wastageQty: acc.wastageQty + p.wastageQty,
        wastageValue: acc.wastageValue + p.wastageValue,
        grossMargin: acc.grossMargin + p.grossMargin,
        netMargin: acc.netMargin + p.netMargin,
      }),
      {
        unitsSold: 0,
        salesValue: 0,
        ecommerceSales: 0,
        academicSales: 0,
        purchaseCost: 0,
        wastageQty: 0,
        wastageValue: 0,
        grossMargin: 0,
        netMargin: 0,
      }
    );
  }, [sortedProductData]);

  const remainingProductsTotals = useMemo(() => {
    return sortedRemainingProducts.reduce(
      (acc, p) => ({
        remainingQty: acc.remainingQty + p.remainingQty,
        totalWastageCost: acc.totalWastageCost + p.totalWastageCost,
      }),
      {
        remainingQty: 0,
        totalWastageCost: 0,
      }
    );
  }, [sortedRemainingProducts]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // default descending for financial numbers
    }
  };

  // 11. Downloadable Excel Report Generation (Fully Styled, Bordered & Themed via xlsx-js-style)
  const handleDownloadReport = () => {
    try {
      const workbook = XLSX.utils.book_new();

      const thinBorder = {
        top: { style: "thin", color: { rgb: "E2E8F0" } },
        bottom: { style: "thin", color: { rgb: "E2E8F0" } },
        left: { style: "thin", color: { rgb: "E2E8F0" } },
        right: { style: "thin", color: { rgb: "E2E8F0" } },
      };

      const doubleBottomBorder = {
        top: { style: "thin", color: { rgb: "94A3B8" } },
        bottom: { style: "double", color: { rgb: "0F172A" } },
        left: { style: "thin", color: { rgb: "E2E8F0" } },
        right: { style: "thin", color: { rgb: "E2E8F0" } },
      };

      // ==========================================
      // SHEET 1: P&L Summary (Navy Blue #1E3A8A)
      // ==========================================
      const summaryRows = [
        ["PROFIT & LOSS (P&L) FINANCIAL STATEMENT", "", ""],
        ["Comprehensive analysis of Sales, Purchase Cost (COGS), Wastage @ Cost (Remaining Inventory Products), and Net Margins", "", ""],
        [],
        ["Report Parameter", "Selected Value", ""],
        ["Report Generated On", new Date().toLocaleString("en-IN"), ""],
        ["Date Range Preset", datePreset.replace("_", " ").toUpperCase(), ""],
        ["Date Window", customStartDate ? `${customStartDate} to ${customEndDate}` : "All Recorded Dates", ""],
        [],
        ["FINANCIAL METRIC", "AMOUNT (₹)", "ANALYSIS & NOTES"],
        ["Total Sales Revenue", summaryMetrics.totalSales, "Total billed revenue from Academic and E-commerce channels"],
        ["  • Academic Sales (Training)", summaryMetrics.academicSales, `${summaryMetrics.academicCount} Active Orders (${summaryMetrics.totalSales > 0 ? ((summaryMetrics.academicSales / summaryMetrics.totalSales) * 100).toFixed(1) : 0}% share)`],
        ["  • E-commerce Sales (Components)", summaryMetrics.ecommerceSales, `${summaryMetrics.ecommerceCount} Active Orders (${summaryMetrics.totalSales > 0 ? ((summaryMetrics.ecommerceSales / summaryMetrics.totalSales) * 100).toFixed(1) : 0}% share)`],
        ["Purchase Cost of Goods Sold (COGS)", summaryMetrics.totalPurchaseCost, "Valuation of delivered/billed goods at unit purchase cost"],
        ["Gross Margin", summaryMetrics.grossMargin, "Total Sales Revenue - Purchase Cost (COGS)"],
        ["Wastage @ Cost", summaryMetrics.totalWastageCost, `Valuation of remaining products in inventory (${summaryMetrics.totalWastageUnits.toLocaleString()} units remaining in inventory)`],
        ["Net Margin (Profit / Loss)", summaryMetrics.netMargin, "Gross Margin - Wastage @ Cost (Remaining Products Cost)"],
        ["Net Margin %", summaryMetrics.totalSales > 0 ? summaryMetrics.netMargin / summaryMetrics.totalSales : 0, "Net Margin expressed as % of Total Sales Revenue"],
        ["Total Units Billed / Dispatched", summaryMetrics.totalBilledUnits, "Total units delivered across active bills"],
        ["Total Remaining Products in Inventory", summaryMetrics.totalWastageUnits, "Current physical stock units held across inventory"],
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      wsSummary["!cols"] = [{ wch: 42 }, { wch: 24 }, { wch: 60 }];
      wsSummary["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
        { s: { r: 3, c: 1 }, e: { r: 3, c: 2 } },
      ];

      // Title & Subtitle styling
      wsSummary["A1"].s = {
        fill: { fgColor: { rgb: "1E3A8A" } },
        font: { name: "Calibri", sz: 14, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
      wsSummary["A2"].s = {
        fill: { fgColor: { rgb: "F1F5F9" } },
        font: { name: "Calibri", sz: 10, italic: true, color: { rgb: "475569" } },
        alignment: { horizontal: "center", vertical: "center" },
      };

      // Metadata section header (Row 4, index 3)
      ["A4", "B4"].forEach((cell) => {
        if (wsSummary[cell]) {
          wsSummary[cell].s = {
            fill: { fgColor: { rgb: "E2E8F0" } },
            font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "1E293B" } },
            alignment: { horizontal: "left", vertical: "center" },
            border: thinBorder,
          };
        }
      });

      // Metadata rows (rows 5-7, indices 4-6)
      for (let r = 4; r <= 6; r++) {
        const aCell = XLSX.utils.encode_cell({ r, c: 0 });
        const bCell = XLSX.utils.encode_cell({ r, c: 1 });
        if (wsSummary[aCell]) {
          wsSummary[aCell].s = {
            fill: { fgColor: { rgb: "F8FAFC" } },
            font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "334155" } },
            alignment: { horizontal: "left", vertical: "center" },
            border: thinBorder,
          };
        }
        if (wsSummary[bCell]) {
          wsSummary[bCell].s = {
            fill: { fgColor: { rgb: "FFFFFF" } },
            font: { name: "Calibri", sz: 10, color: { rgb: "0F172A" } },
            alignment: { horizontal: "left", vertical: "center" },
            border: thinBorder,
          };
        }
      }

      // Summary Table Header (Row 9, index 8)
      ["A9", "B9", "C9"].forEach((cell) => {
        if (wsSummary[cell]) {
          wsSummary[cell].s = {
            fill: { fgColor: { rgb: "1E3A8A" } },
            font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
            alignment: { horizontal: "center", vertical: "center" },
            border: {
              top: { style: "thin", color: { rgb: "1E3A8A" } },
              bottom: { style: "medium", color: { rgb: "0F172A" } },
              left: { style: "thin", color: { rgb: "E2E8F0" } },
              right: { style: "thin", color: { rgb: "E2E8F0" } },
            },
          };
        }
      });

      // Financial Metric data styling (Row 10 to 19, indices 9 to 18)
      const metricStyles: Record<number, { bg: string; bold?: boolean; numFmt?: string; textColor?: string }> = {
        9: { bg: "EFF6FF", bold: true, numFmt: "₹#,##0.00", textColor: "1E3A8A" }, // Total Sales
        10: { bg: "FFFFFF", bold: false, numFmt: "₹#,##0.00", textColor: "475569" }, // Academic
        11: { bg: "FFFFFF", bold: false, numFmt: "₹#,##0.00", textColor: "475569" }, // E-com
        12: { bg: "FEF3C7", bold: true, numFmt: "₹#,##0.00", textColor: "92400E" }, // Purchase Cost
        13: { bg: "ECFDF5", bold: true, numFmt: "₹#,##0.00", textColor: "065F46" }, // Gross Margin
        14: { bg: "FFE4E6", bold: true, numFmt: "₹#,##0.00", textColor: "9F1239" }, // Wastage @ Cost
        15: { bg: "FEF08A", bold: true, numFmt: "₹#,##0.00", textColor: summaryMetrics.netMargin >= 0 ? "15803D" : "DC2626" }, // Net Margin
        16: { bg: "FEF08A", bold: true, numFmt: "0.00%", textColor: summaryMetrics.netMargin >= 0 ? "15803D" : "DC2626" }, // Net Margin %
        17: { bg: "F8FAFC", bold: false, numFmt: "#,##0", textColor: "334155" }, // Billed Units
        18: { bg: "F8FAFC", bold: false, numFmt: "#,##0", textColor: "334155" }, // Remaining Products
      };

      for (let r = 9; r <= 18; r++) {
        const conf = metricStyles[r] || { bg: "FFFFFF" };
        const isDoubleBottom = r === 15 || r === 16;
        const cellBorder = isDoubleBottom ? doubleBottomBorder : thinBorder;

        for (let c = 0; c <= 2; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          if (!wsSummary[cellRef]) continue;

          let align: "left" | "center" | "right" = "left";
          if (c === 1) align = conf.numFmt?.includes("%") ? "center" : "right";
          if (c === 2) align = "left";

          wsSummary[cellRef].s = {
            fill: { fgColor: { rgb: conf.bg } },
            font: {
              name: "Calibri",
              sz: r === 15 ? 12 : 11,
              bold: !!conf.bold,
              color: { rgb: conf.textColor || "0F172A" },
            },
            alignment: { horizontal: align, vertical: "center" },
            numFmt: c === 1 ? conf.numFmt : undefined,
            border: cellBorder,
          };
        }
      }

      wsSummary["!rows"] = [
        { hpt: 30 },
        { hpt: 20 },
        { hpt: 10 },
        { hpt: 20 },
        { hpt: 18 },
        { hpt: 18 },
        { hpt: 18 },
        { hpt: 10 },
        { hpt: 26 },
        ...Array(10).fill({ hpt: 22 }),
      ];

      XLSX.utils.book_append_sheet(workbook, wsSummary, "P&L Summary");

      // ==========================================
      // SHEET 2: Category-wise P&L (Royal Blue #1D4ED8)
      // ==========================================
      const categoryCols = [
        { header: "Category", key: "category", width: 28, align: "left" as const, isBold: true },
        { header: "Units Sold", key: "unitsSold", width: 14, align: "center" as const, numFmt: "#,##0" },
        { header: "Total Sales (₹)", key: "salesValue", width: 20, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Academic Sales (₹)", key: "academicSales", width: 20, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "E-com Sales (₹)", key: "ecommerceSales", width: 20, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Purchase Cost (₹)", key: "purchaseCost", width: 22, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Remaining Products (Units)", key: "wastageQty", width: 26, align: "center" as const, numFmt: "#,##0" },
        { header: "Wastage @ Cost (₹)", key: "wastageValue", width: 22, align: "right" as const, numFmt: "₹#,##0.00", colorFn: () => "9F1239" },
        { header: "Gross Margin (₹)", key: "grossMargin", width: 20, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Net Margin (₹)", key: "netMargin", width: 20, align: "right" as const, numFmt: "₹#,##0.00", colorFn: (v: number) => (v >= 0 ? "15803D" : "DC2626") },
        { header: "Margin %", key: "marginRatio", width: 14, align: "center" as const, numFmt: "0.0%" },
      ];

      const categorySheetData = [
        ["CATEGORY-WISE PROFIT & LOSS BREAKDOWN"],
        ["Grouped by product categories - Sales, Purchase Cost, Remaining Products in Inventory, Wastage @ Cost, and Net Margin"],
        [],
        categoryCols.map((c) => c.header),
      ];

      sortedCategoryData.forEach((c) => {
        const rowObj = {
          ...c,
          marginRatio: c.salesValue > 0 ? c.netMargin / c.salesValue : 0,
        };
        categorySheetData.push(categoryCols.map((col) => (rowObj as any)[col.key]));
      });

      const catTotalRow = {
        category: "TOTALS",
        unitsSold: categoryTotals.unitsSold,
        salesValue: categoryTotals.salesValue,
        academicSales: categoryTotals.academicSales,
        ecommerceSales: categoryTotals.ecommerceSales,
        purchaseCost: categoryTotals.purchaseCost,
        wastageQty: categoryTotals.wastageQty,
        wastageValue: categoryTotals.wastageValue,
        grossMargin: categoryTotals.grossMargin,
        netMargin: categoryTotals.netMargin,
        marginRatio: categoryTotals.salesValue > 0 ? categoryTotals.netMargin / categoryTotals.salesValue : 0,
      };
      categorySheetData.push(categoryCols.map((col) => (catTotalRow as any)[col.key]));

      const wsCategory = XLSX.utils.aoa_to_sheet(categorySheetData);
      wsCategory["!cols"] = categoryCols.map((c) => ({ wch: c.width }));
      wsCategory["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: categoryCols.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: categoryCols.length - 1 } },
      ];

      // Title & Subtitle
      wsCategory["A1"].s = {
        fill: { fgColor: { rgb: "1D4ED8" } },
        font: { name: "Calibri", sz: 13, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
      wsCategory["A2"].s = {
        fill: { fgColor: { rgb: "DBEAFE" } },
        font: { name: "Calibri", sz: 10, italic: true, color: { rgb: "1E40AF" } },
        alignment: { horizontal: "center", vertical: "center" },
      };

      // Category Header (Row index 3)
      for (let c = 0; c < categoryCols.length; c++) {
        const ref = XLSX.utils.encode_cell({ r: 3, c });
        if (wsCategory[ref]) {
          wsCategory[ref].s = {
            fill: { fgColor: { rgb: "1D4ED8" } },
            font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: {
              top: { style: "thin", color: { rgb: "1D4ED8" } },
              bottom: { style: "medium", color: { rgb: "0F172A" } },
              left: { style: "thin", color: { rgb: "E2E8F0" } },
              right: { style: "thin", color: { rgb: "E2E8F0" } },
            },
          };
        }
      }

      // Data Rows
      sortedCategoryData.forEach((item, idx) => {
        const rIdx = 4 + idx;
        const bg = idx % 2 === 1 ? "F8FAFC" : "FFFFFF";
        const rowObj = {
          ...item,
          marginRatio: item.salesValue > 0 ? item.netMargin / item.salesValue : 0,
        };

        categoryCols.forEach((col, cIdx) => {
          const ref = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
          if (!wsCategory[ref]) return;
          const val = (rowObj as any)[col.key];
          const textColor = col.colorFn && typeof val === "number" ? col.colorFn(val) : col.isBold ? "0F172A" : "334155";

          wsCategory[ref].s = {
            fill: { fgColor: { rgb: bg } },
            font: { name: "Calibri", sz: 11, bold: !!col.isBold, color: { rgb: textColor } },
            alignment: { horizontal: col.align, vertical: "center" },
            numFmt: typeof val === "number" ? col.numFmt : undefined,
            border: thinBorder,
          };
        });
      });

      // Totals Row
      const catTotalIdx = 4 + sortedCategoryData.length;
      categoryCols.forEach((col, cIdx) => {
        const ref = XLSX.utils.encode_cell({ r: catTotalIdx, c: cIdx });
        if (!wsCategory[ref]) return;
        const val = (catTotalRow as any)[col.key];
        const textColor = col.colorFn && typeof val === "number" ? col.colorFn(val) : "0F172A";

        wsCategory[ref].s = {
          fill: { fgColor: { rgb: "FEF3C7" } },
          font: { name: "Calibri", sz: 11, bold: true, color: { rgb: textColor } },
          alignment: { horizontal: col.align, vertical: "center" },
          numFmt: typeof val === "number" ? col.numFmt : undefined,
          border: doubleBottomBorder,
        };
      });

      wsCategory["!rows"] = [
        { hpt: 28 },
        { hpt: 20 },
        { hpt: 10 },
        { hpt: 26 },
        ...sortedCategoryData.map(() => ({ hpt: 22 })),
        { hpt: 24 },
      ];

      XLSX.utils.book_append_sheet(workbook, wsCategory, "Category-wise P&L");

      // ==========================================
      // SHEET 3: Product-wise P&L (Indigo #3730A3)
      // ==========================================
      const productCols = [
        { header: "Product Name", key: "productName", width: 36, align: "left" as const, isBold: true },
        { header: "SKU", key: "sku", width: 16, align: "center" as const },
        { header: "Category", key: "category", width: 22, align: "left" as const },
        { header: "Units Sold", key: "unitsSold", width: 14, align: "center" as const, numFmt: "#,##0" },
        { header: "Avg Sale Price (₹)", key: "avgSellingPrice", width: 18, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Unit Cost Price (₹)", key: "unitCost", width: 18, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Total Sales (₹)", key: "salesValue", width: 20, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Purchase Cost (₹)", key: "purchaseCost", width: 22, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Remaining Products (Units)", key: "wastageQty", width: 26, align: "center" as const, numFmt: "#,##0" },
        { header: "Wastage @ Cost (₹)", key: "wastageValue", width: 22, align: "right" as const, numFmt: "₹#,##0.00", colorFn: () => "9F1239" },
        { header: "Net Margin (₹)", key: "netMargin", width: 20, align: "right" as const, numFmt: "₹#,##0.00", colorFn: (v: number) => (v >= 0 ? "15803D" : "DC2626") },
        { header: "Margin %", key: "marginRatio", width: 14, align: "center" as const, numFmt: "0.0%" },
      ];

      const productSheetData = [
        ["PRODUCT-WISE PROFIT & LOSS BREAKDOWN"],
        ["Individual product unit cost, sales performance, remaining products in inventory valuation (Wastage @ Cost), and profit margins"],
        [],
        productCols.map((c) => c.header),
      ];

      sortedProductData.forEach((p) => {
        const rowObj = {
          ...p,
          marginRatio: p.salesValue > 0 ? p.netMargin / p.salesValue : 0,
        };
        productSheetData.push(productCols.map((col) => (rowObj as any)[col.key]));
      });

      const prodTotalRow = {
        productName: `TOTALS (${sortedProductData.length} Products)`,
        sku: "-",
        category: "-",
        unitsSold: productTotals.unitsSold,
        avgSellingPrice: "-",
        unitCost: "-",
        salesValue: productTotals.salesValue,
        purchaseCost: productTotals.purchaseCost,
        wastageQty: productTotals.wastageQty,
        wastageValue: productTotals.wastageValue,
        netMargin: productTotals.netMargin,
        marginRatio: productTotals.salesValue > 0 ? productTotals.netMargin / productTotals.salesValue : 0,
      };
      productSheetData.push(productCols.map((col) => (prodTotalRow as any)[col.key]));

      const wsProduct = XLSX.utils.aoa_to_sheet(productSheetData);
      wsProduct["!cols"] = productCols.map((c) => ({ wch: c.width }));
      wsProduct["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: productCols.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: productCols.length - 1 } },
      ];

      // Title & Subtitle
      wsProduct["A1"].s = {
        fill: { fgColor: { rgb: "3730A3" } },
        font: { name: "Calibri", sz: 13, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
      wsProduct["A2"].s = {
        fill: { fgColor: { rgb: "E0E7FF" } },
        font: { name: "Calibri", sz: 10, italic: true, color: { rgb: "3730A3" } },
        alignment: { horizontal: "center", vertical: "center" },
      };

      // Header row
      for (let c = 0; c < productCols.length; c++) {
        const ref = XLSX.utils.encode_cell({ r: 3, c });
        if (wsProduct[ref]) {
          wsProduct[ref].s = {
            fill: { fgColor: { rgb: "3730A3" } },
            font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: {
              top: { style: "thin", color: { rgb: "3730A3" } },
              bottom: { style: "medium", color: { rgb: "0F172A" } },
              left: { style: "thin", color: { rgb: "E2E8F0" } },
              right: { style: "thin", color: { rgb: "E2E8F0" } },
            },
          };
        }
      }

      // Data rows
      sortedProductData.forEach((item, idx) => {
        const rIdx = 4 + idx;
        const bg = idx % 2 === 1 ? "F8FAFC" : "FFFFFF";
        const rowObj = {
          ...item,
          marginRatio: item.salesValue > 0 ? item.netMargin / item.salesValue : 0,
        };

        productCols.forEach((col, cIdx) => {
          const ref = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
          if (!wsProduct[ref]) return;
          const val = (rowObj as any)[col.key];
          const textColor = col.colorFn && typeof val === "number" ? col.colorFn(val) : col.isBold ? "0F172A" : "334155";

          wsProduct[ref].s = {
            fill: { fgColor: { rgb: bg } },
            font: { name: "Calibri", sz: 11, bold: !!col.isBold, color: { rgb: textColor } },
            alignment: { horizontal: col.align, vertical: "center" },
            numFmt: typeof val === "number" ? col.numFmt : undefined,
            border: thinBorder,
          };
        });
      });

      // Product totals row
      const prodTotalIdx = 4 + sortedProductData.length;
      productCols.forEach((col, cIdx) => {
        const ref = XLSX.utils.encode_cell({ r: prodTotalIdx, c: cIdx });
        if (!wsProduct[ref]) return;
        const val = (prodTotalRow as any)[col.key];
        const textColor = col.colorFn && typeof val === "number" ? col.colorFn(val) : "0F172A";

        wsProduct[ref].s = {
          fill: { fgColor: { rgb: "FEF3C7" } },
          font: { name: "Calibri", sz: 11, bold: true, color: { rgb: textColor } },
          alignment: { horizontal: col.align, vertical: "center" },
          numFmt: typeof val === "number" ? col.numFmt : undefined,
          border: doubleBottomBorder,
        };
      });

      wsProduct["!rows"] = [
        { hpt: 28 },
        { hpt: 20 },
        { hpt: 10 },
        { hpt: 26 },
        ...sortedProductData.map(() => ({ hpt: 22 })),
        { hpt: 24 },
      ];

      XLSX.utils.book_append_sheet(workbook, wsProduct, "Product-wise P&L");

      // ==========================================
      // SHEET 4: Remaining Products in Inventory (Wine Red #9F1239)
      // ==========================================
      const stockCols = [
        { header: "Product Name", key: "name", width: 36, align: "left" as const, isBold: true },
        { header: "SKU", key: "sku", width: 16, align: "center" as const },
        { header: "Category", key: "category", width: 24, align: "left" as const },
        { header: "Remaining Products (Units)", key: "remainingQty", width: 26, align: "center" as const, numFmt: "#,##0" },
        { header: "Unit Cost Price (₹)", key: "unitCost", width: 20, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Total Wastage @ Cost (₹)", key: "totalWastageCost", width: 26, align: "right" as const, numFmt: "₹#,##0.00", isBold: true },
      ];

      const stockSheetData = [
        ["REMAINING PRODUCTS IN INVENTORY (WASTAGE @ COST)"],
        ["Purchase cost valuation of remaining unsold products in inventory (Wastage Cost = Remaining Products × Unit Cost Price)"],
        [],
        stockCols.map((c) => c.header),
      ];

      remainingInventoryProducts.forEach((p) => {
        stockSheetData.push(stockCols.map((col) => (p as any)[col.key]));
      });

      const totalRemainingStockUnits = remainingInventoryProducts.reduce((s, p) => s + p.remainingQty, 0);
      const totalRemainingStockVal = remainingInventoryProducts.reduce((s, p) => s + p.totalWastageCost, 0);

      const stockTotalRow = {
        name: `TOTAL REMAINING PRODUCTS (${remainingInventoryProducts.length} Products)`,
        sku: "-",
        category: "-",
        remainingQty: totalRemainingStockUnits,
        unitCost: "-",
        totalWastageCost: totalRemainingStockVal,
      };
      stockSheetData.push(stockCols.map((col) => (stockTotalRow as any)[col.key]));

      const wsStock = XLSX.utils.aoa_to_sheet(stockSheetData);
      wsStock["!cols"] = stockCols.map((c) => ({ wch: c.width }));
      wsStock["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: stockCols.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: stockCols.length - 1 } },
      ];

      // Title & Subtitle
      wsStock["A1"].s = {
        fill: { fgColor: { rgb: "9F1239" } },
        font: { name: "Calibri", sz: 13, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
      wsStock["A2"].s = {
        fill: { fgColor: { rgb: "FFE4E6" } },
        font: { name: "Calibri", sz: 10, italic: true, color: { rgb: "9F1239" } },
        alignment: { horizontal: "center", vertical: "center" },
      };

      // Header row
      for (let c = 0; c < stockCols.length; c++) {
        const ref = XLSX.utils.encode_cell({ r: 3, c });
        if (wsStock[ref]) {
          wsStock[ref].s = {
            fill: { fgColor: { rgb: "9F1239" } },
            font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: {
              top: { style: "thin", color: { rgb: "9F1239" } },
              bottom: { style: "medium", color: { rgb: "0F172A" } },
              left: { style: "thin", color: { rgb: "E2E8F0" } },
              right: { style: "thin", color: { rgb: "E2E8F0" } },
            },
          };
        }
      }

      // Data rows
      remainingInventoryProducts.forEach((item, idx) => {
        const rIdx = 4 + idx;
        const bg = idx % 2 === 1 ? "F8FAFC" : "FFFFFF";

        stockCols.forEach((col, cIdx) => {
          const ref = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
          if (!wsStock[ref]) return;
          const val = (item as any)[col.key];

          wsStock[ref].s = {
            fill: { fgColor: { rgb: bg } },
            font: {
              name: "Calibri",
              sz: 11,
              bold: !!col.isBold,
              color: { rgb: col.key === "totalWastageCost" ? "9F1239" : col.isBold ? "0F172A" : "334155" },
            },
            alignment: { horizontal: col.align, vertical: "center" },
            numFmt: typeof val === "number" ? col.numFmt : undefined,
            border: thinBorder,
          };
        });
      });

      // Total row
      const stockTotalIdx = 4 + remainingInventoryProducts.length;
      stockCols.forEach((col, cIdx) => {
        const ref = XLSX.utils.encode_cell({ r: stockTotalIdx, c: cIdx });
        if (!wsStock[ref]) return;
        const val = (stockTotalRow as any)[col.key];

        wsStock[ref].s = {
          fill: { fgColor: { rgb: "FFE4E6" } },
          font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "9F1239" } },
          alignment: { horizontal: col.align, vertical: "center" },
          numFmt: typeof val === "number" ? col.numFmt : undefined,
          border: doubleBottomBorder,
        };
      });

      wsStock["!rows"] = [
        { hpt: 28 },
        { hpt: 20 },
        { hpt: 10 },
        { hpt: 26 },
        ...remainingInventoryProducts.map(() => ({ hpt: 22 })),
        { hpt: 24 },
      ];

      XLSX.utils.book_append_sheet(workbook, wsStock, "Remaining Products");

      // Save file
      const fileName = `PNL_Report_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error("Export P&L Report error:", err);
      alert("Failed to export report. Please try again.");
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
              onClick={handleRefresh}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white hover:bg-gray-50 text-gray-700 rounded-xl border border-gray-200/90 shadow-xs transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing || loading ? "animate-spin" : ""}`} />
              Refresh
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

        {/* Date Filter Bar */}
        <div className="mt-5 p-3.5 bg-white rounded-2xl shadow-xs border border-gray-200/90 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-gray-800">Date Range Filter</span>
              <p className="text-[11px] text-gray-400">Filter sales, purchase cost, and margins by date period</p>
            </div>
          </div>

          {/* Date Range Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as DateRangePreset)}
                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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

          {/* 2. E-commerce Sales Value (Components) */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wider">E-com (Components)</span>
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
                % share (Components)
              </p>
            </div>
          </div>

          {/* 3. Academic Sales Value (Courses & Training) */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">Academic (Training)</span>
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
                % share (Courses & Training)
              </p>
            </div>
          </div>

          {/* 4. Purchase Value (COGS) */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Purchase Values</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-xl font-bold text-indigo-900 tracking-tight truncate">
                {formatCurrency(summaryMetrics.totalPurchaseCost)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Cost of Goods Sold &bull; Billed Purchase</p>
            </div>
          </div>

          {/* 5. Wastage @ Cost */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Wastage @ Cost</span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-xl font-bold text-rose-600 tracking-tight truncate">
                {formatCurrency(summaryMetrics.totalWastageCost)}
              </p>
              <p className="text-[11px] text-rose-500 mt-0.5 truncate">
                {summaryMetrics.totalWastageUnits.toLocaleString()} units &bull; Remaining Inventory Stock
              </p>
            </div>
          </div>

          {/* 6. Net Margin */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Net Margin</span>
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center ${summaryMetrics.netMargin >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
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
                className={`text-xl font-bold tracking-tight truncate ${summaryMetrics.netMargin >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
              >
                {formatCurrency(summaryMetrics.netMargin)}
              </p>
              <p className="text-[11px] font-semibold text-emerald-700 mt-0.5 truncate">
                {summaryMetrics.marginPct >= 0 ? "+" : ""}
                {summaryMetrics.marginPct.toFixed(1)}% margin &bull; Sale - Purchase
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
                className={`px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${activeTab === "category"
                  ? "bg-white text-gray-900 shadow-2xs"
                  : "text-gray-600 hover:text-gray-900"
                  }`}
              >
                Category-wise P&L ({categoryData.length})
              </button>
              <button
                onClick={() => setActiveTab("product")}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${activeTab === "product"
                  ? "bg-white text-gray-900 shadow-2xs"
                  : "text-gray-600 hover:text-gray-900"
                  }`}
              >
                Product-wise P&L ({productData.length})
              </button>
              <button
                onClick={() => setActiveTab("remaining")}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${activeTab === "remaining"
                  ? "bg-white text-gray-900 shadow-2xs"
                  : "text-gray-600 hover:text-gray-900"
                  }`}
              >
                Remaining Products ({remainingInventoryProducts.length})
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
                      : "Search remaining products, SKU, category..."
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
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${c.marginPct >= 20
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
                      <td className="py-3 px-3 text-center">{categoryTotals.unitsSold.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right">{formatCurrency(categoryTotals.salesValue)}</td>
                      <td className="py-3 px-3 text-right text-teal-700">{formatCurrency(categoryTotals.ecommerceSales)}</td>
                      <td className="py-3 px-3 text-right text-purple-700">{formatCurrency(categoryTotals.academicSales)}</td>
                      <td className="py-3 px-3 text-right">{formatCurrency(categoryTotals.purchaseCost)}</td>
                      <td className="py-3 px-3 text-right text-rose-600">{formatCurrency(categoryTotals.wastageValue)}</td>
                      <td className="py-3 px-3 text-right">
                        <span className={categoryTotals.netMargin >= 0 ? "text-emerald-600" : "text-rose-600"}>
                          {formatCurrency(categoryTotals.netMargin)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${categoryTotals.salesValue > 0 && (categoryTotals.netMargin / categoryTotals.salesValue) >= 0.2
                            ? "bg-emerald-100 text-emerald-800"
                            : categoryTotals.salesValue > 0 && (categoryTotals.netMargin / categoryTotals.salesValue) >= 0
                              ? "bg-blue-100 text-blue-800"
                              : "bg-rose-100 text-rose-800"
                            }`}
                        >
                          {categoryTotals.salesValue > 0
                            ? ((categoryTotals.netMargin / categoryTotals.salesValue) * 100).toFixed(1)
                            : "0.0"}%
                        </span>
                      </td>
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
                    <th className="py-3 px-3 text-right">Avg Sale Price</th>
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
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${p.marginPct >= 20
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
                {sortedProductData.length > 0 && (
                  <tfoot className="bg-gray-50 font-bold border-t-2 border-gray-200 text-gray-900">
                    <tr>
                      <td className="py-3 px-4">TOTALS ({sortedProductData.length})</td>
                      <td className="py-3 px-3 text-gray-400">-</td>
                      <td className="py-3 px-3 text-center">{productTotals.unitsSold.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right text-gray-400">-</td>
                      <td className="py-3 px-3 text-right text-gray-400">-</td>
                      <td className="py-3 px-3 text-right">{formatCurrency(productTotals.salesValue)}</td>
                      <td className="py-3 px-3 text-right">{formatCurrency(productTotals.purchaseCost)}</td>
                      <td className="py-3 px-3 text-right text-rose-600">{formatCurrency(productTotals.wastageValue)}</td>
                      <td className="py-3 px-3 text-right">
                        <span className={productTotals.netMargin >= 0 ? "text-emerald-600" : "text-rose-600"}>
                          {formatCurrency(productTotals.netMargin)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${productTotals.salesValue > 0 && (productTotals.netMargin / productTotals.salesValue) >= 0.2
                            ? "bg-emerald-100 text-emerald-800"
                            : productTotals.salesValue > 0 && (productTotals.netMargin / productTotals.salesValue) >= 0
                              ? "bg-blue-100 text-blue-800"
                              : "bg-rose-100 text-rose-800"
                            }`}
                        >
                          {productTotals.salesValue > 0
                            ? ((productTotals.netMargin / productTotals.salesValue) * 100).toFixed(1)
                            : "0.0"}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ============ TAB C: REMAINING PRODUCTS IN INVENTORY ============ */}
        {activeTab === "remaining" && (
          <div className="bg-white rounded-2xl shadow-xs border border-gray-200/90 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-sm text-gray-900">Remaining Products in Inventory (Wastage @ Cost)</h3>
                <p className="text-xs text-gray-500">
                  Cost valuation of unsold inventory products: Wastage Cost = Remaining Products × Unit Cost Price
                </p>
              </div>
              <span className="px-2.5 py-1 bg-rose-50 text-rose-700 rounded-lg text-xs font-bold border border-rose-200/80">
                {sortedRemainingProducts.length} Products &bull; {remainingProductsTotals.remainingQty.toLocaleString()} Units Remaining
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4 cursor-pointer" onClick={() => handleSort("name")}>
                      <div className="flex items-center gap-1">Product Name <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-3 px-3 cursor-pointer" onClick={() => handleSort("category")}>
                      <div className="flex items-center gap-1">Category <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-3 px-3 text-center cursor-pointer" onClick={() => handleSort("remainingQty")}>
                      <div className="flex items-center justify-center gap-1">Remaining Products (Units) <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-3 px-3 text-right cursor-pointer" onClick={() => handleSort("unitCost")}>
                      <div className="flex items-center justify-end gap-1">Unit Cost Price <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort("totalWastageCost")}>
                      <div className="flex items-center justify-end gap-1 text-rose-700">Wastage @ Cost <ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedRemainingProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-gray-400">
                        No remaining inventory products found matching your search.
                      </td>
                    </tr>
                  ) : (
                    sortedRemainingProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50/70 transition">
                        <td className="py-3 px-4">
                          <p className="font-bold text-gray-900">{p.name}</p>
                          {p.sku && p.sku !== "-" && <p className="text-[10px] text-gray-400 font-mono">SKU: {p.sku}</p>}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md text-[11px] font-medium">
                            {p.category}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-gray-800">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            {p.remainingQty.toLocaleString()} units
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right text-gray-700 font-medium">
                          {formatCurrency(p.unitCost)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-rose-700">
                          {formatCurrency(p.totalWastageCost)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {sortedRemainingProducts.length > 0 && (
                  <tfoot className="bg-rose-50/50 font-bold border-t-2 border-rose-200 text-gray-900">
                    <tr>
                      <td className="py-3 px-4 text-rose-900">
                        TOTAL REMAINING PRODUCTS ({sortedRemainingProducts.length})
                      </td>
                      <td className="py-3 px-3 text-gray-400">-</td>
                      <td className="py-3 px-3 text-center text-rose-900">
                        {remainingProductsTotals.remainingQty.toLocaleString()} units
                      </td>
                      <td className="py-3 px-3 text-gray-400">-</td>
                      <td className="py-3 px-4 text-right text-rose-700 text-sm">
                        {formatCurrency(remainingProductsTotals.totalWastageCost)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

