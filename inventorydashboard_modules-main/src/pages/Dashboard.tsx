import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  IndianRupee,
  FileText,
  ClipboardList,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  RefreshCw,
  Bell,
  Filter,
  Calendar,
  ChevronRight,
  ChevronLeft,
  Search,
  X,
  ExternalLink,
  Plus,
  ShoppingBag,
  ShoppingCart,
  GraduationCap,
  Briefcase,
  Package,
  ListOrdered,
  Target,
  Layers,
  Award,
  Check,
  Activity,
  Percent,
  Eye,
  ArrowRight,
  BarChart3,
  PieChart as PieIcon,
  ShieldAlert,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Line,
  ComposedChart,
} from "recharts";
import * as XLSX from "xlsx";
import { collection, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../App";
import type { Enquiry } from "../types/enquiry";

// --- Types & Interfaces ---
export type ChannelType = "all" | "ecommerce" | "training" | "projects";
export type DatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "thisWeek"
  | "thisMonth"
  | "lastMonth"
  | "last30"
  | "last90"
  | "thisYear"
  | "custom";
export type RevenueGranularity = "daily" | "weekly" | "monthly" | "yearly";

interface EmployeeDoc {
  id?: string;
  uid?: string;
  employeeName?: string;
  name?: string;
  email?: string;
  role?: string;
  managerId?: string;
}

interface ProductItem {
  id: string;
  name: string;
  sku?: string;
  category?: string;
  currentPrice?: number;
  purchasePrice?: number;
  price?: number;
  totalQuantity?: number;
  lowStockThreshold?: number;
}

interface BillItem {
  productId?: string;
  productName?: string;
  quantity?: number;
  price?: number;
  total?: number;
  purchasePrice?: number;
  costPrice?: number;
  sku?: string;
  category?: string;
}

interface BillData {
  id: string;
  invoiceNumber?: string;
  customerName?: string;
  companyName?: string;
  customerContact?: string;
  totalAmount?: number;
  subtotal?: number;
  status?: string;
  paymentStatus?: string;
  items?: BillItem[] | string;
  createdAt?: any;
  billDate?: any;
  updatedAt?: any;
  enquiryEnqId?: string;
  placeOfSupply?: string;
  billedBy?: any;
  billedTo?: any;
  [key: string]: any;
}

interface StockAlert {
  id: string;
  name: string;
  currentStock: number;
  threshold: number;
  status: "low" | "out";
  category: string;
  sku?: string;
}

// Chart Palette
const PALETTE = [
  "#2563EB", // Blue
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#6366F1", // Indigo
  "#EC4899", // Pink
  "#8B5CF6", // Purple
  "#14B8A6", // Teal
  "#F97316", // Orange
  "#06B6D4", // Cyan
  "#84CC16", // Lime
];

// Channels Definition
const CHANNELS_CONFIG: { id: ChannelType; label: string; icon: any; color: string; bg: string; border: string }[] = [
  { id: "all", label: "All Channels", icon: Layers, color: "text-slate-800", bg: "bg-slate-100", border: "border-slate-300" },
  { id: "ecommerce", label: "E-commerce", icon: ShoppingCart, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  { id: "training", label: "Training", icon: GraduationCap, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  { id: "projects", label: "Projects & Academic", icon: Briefcase, color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200" },
];

// Date Presets Definition
const DATE_PRESETS_CONFIG: { id: DatePreset; label: string }[] = [
  { id: "all", label: "All Time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "thisWeek", label: "This Week" },
  { id: "thisMonth", label: "This Month" },
  { id: "lastMonth", label: "Last Month" },
  { id: "last30", label: "Last 30 Days" },
  { id: "last90", label: "Last 90 Days" },
  { id: "thisYear", label: "This Year" },
  { id: "custom", label: "Custom Range" },
];

// Safe date parser
const parseAnyDate = (dateVal: any): Date | null => {
  if (!dateVal) return null;
  try {
    if (typeof dateVal.toDate === "function") {
      const d = dateVal.toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (dateVal.seconds !== undefined) {
      const d = new Date(Number(dateVal.seconds) * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
    if (dateVal._seconds !== undefined) {
      const d = new Date(Number(dateVal._seconds) * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
    if (dateVal instanceof Date) {
      return isNaN(dateVal.getTime()) ? null : dateVal;
    }
    if (typeof dateVal === "string" || typeof dateVal === "number") {
      const d = new Date(dateVal);
      return isNaN(d.getTime()) ? null : d;
    }
  } catch {
    return null;
  }
  return null;
};

// Safe customer name resolver
const resolveCustomerName = (record: any): string => {
  if (!record) return "Unknown Customer";
  return (
    record.companyName ||
    record.customerName ||
    record.customer?.name ||
    record.customer?.company ||
    record.companyDetails?.companyName ||
    record.clientName ||
    record.name ||
    record.billedTo?.name ||
    "N/A"
  );
};

// Channel resolver
const resolveRecordChannel = (record: any): ChannelType => {
  const type = String(record.type || record.enquiryType || "").toLowerCase().trim();
  const mode = String(record.mode || record.source || "").toLowerCase().trim();
  const course = String(record.course || record.preferredCourse || "").toLowerCase().trim();

  if (
    type === "training" ||
    type.includes("train") ||
    type === "academic" ||
    type.includes("course") ||
    course.length > 0
  ) {
    return "training";
  }
  if (
    type === "projects" ||
    type === "b2b" ||
    type.includes("project")
  ) {
    return "projects";
  }
  return "ecommerce";
};

// Safely parse bill items
const parseBillItems = (itemsRaw: any): BillItem[] => {
  if (!itemsRaw) return [];
  if (Array.isArray(itemsRaw)) return itemsRaw;
  if (typeof itemsRaw === "string") {
    try {
      const parsed = JSON.parse(itemsRaw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

// Date range calculator for presets and previous period
const getDateRangeForPreset = (
  preset: DatePreset,
  customStart?: string,
  customEnd?: string
): { start: Date | null; end: Date | null; prevStart: Date | null; prevEnd: Date | null } => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case "today": {
      const prevStart = new Date(startOfToday);
      prevStart.setDate(prevStart.getDate() - 1);
      const prevEnd = new Date(endOfToday);
      prevEnd.setDate(prevEnd.getDate() - 1);
      return { start: startOfToday, end: endOfToday, prevStart, prevEnd };
    }
    case "yesterday": {
      const yStart = new Date(startOfToday);
      yStart.setDate(yStart.getDate() - 1);
      const yEnd = new Date(endOfToday);
      yEnd.setDate(yEnd.getDate() - 1);
      const prevStart = new Date(startOfToday);
      prevStart.setDate(prevStart.getDate() - 2);
      const prevEnd = new Date(endOfToday);
      prevEnd.setDate(prevEnd.getDate() - 2);
      return { start: yStart, end: yEnd, prevStart, prevEnd };
    }
    case "thisWeek": {
      const day = now.getDay();
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - day);
      const prevStart = new Date(start);
      prevStart.setDate(prevStart.getDate() - 7);
      const prevEnd = new Date(start);
      prevEnd.setMilliseconds(-1);
      return { start, end: endOfToday, prevStart, prevEnd };
    }
    case "thisMonth": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end: endOfToday, prevStart, prevEnd };
    }
    case "lastMonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
      const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
      return { start, end, prevStart, prevEnd };
    }
    case "last30": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 30);
      const prevStart = new Date(start);
      prevStart.setDate(prevStart.getDate() - 30);
      const prevEnd = new Date(start);
      prevEnd.setMilliseconds(-1);
      return { start, end: endOfToday, prevStart, prevEnd };
    }
    case "last90": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 90);
      const prevStart = new Date(start);
      prevStart.setDate(prevStart.getDate() - 90);
      const prevEnd = new Date(start);
      prevEnd.setMilliseconds(-1);
      return { start, end: endOfToday, prevStart, prevEnd };
    }
    case "thisYear": {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const prevStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      const prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      return { start, end: endOfToday, prevStart, prevEnd };
    }
    case "custom": {
      if (customStart && customEnd) {
        const start = new Date(customStart + "T00:00:00");
        const end = new Date(customEnd + "T23:59:59");
        const duration = end.getTime() - start.getTime();
        const prevEnd = new Date(start.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - duration);
        return { start, end, prevStart, prevEnd };
      }
      return { start: null, end: null, prevStart: null, prevEnd: null };
    }
    case "all":
    default:
      return { start: null, end: null, prevStart: null, prevEnd: null };
  }
};

const formatCurrency = (amount: number, compact: boolean = false) => {
  const val = Number(amount || 0);
  if (compact && Math.abs(val) >= 10000000) {
    return `₹${(val / 10000000).toFixed(2)} Cr`;
  }
  if (compact && Math.abs(val) >= 100000) {
    return `₹${(val / 100000).toFixed(2)} L`;
  }
  return `₹${val.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};

const formatTrend = (current: number, previous: number) => {
  if (previous === 0) {
    if (current === 0) return { pct: 0, isUp: true, label: "0% vs prev" };
    return { pct: 100, isUp: true, label: "+100% vs prev" };
  }
  const diff = current - previous;
  const pct = (diff / previous) * 100;
  return {
    pct: Math.abs(pct),
    isUp: pct >= 0,
    label: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs prev`,
  };
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Loading & Action State
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStockDrawerOpen, setIsStockDrawerOpen] = useState(false);

  // Global Filters
  const [datePreset, setDatePreset] = useState<DatePreset>("thisMonth");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [selectedChannel, setSelectedChannel] = useState<ChannelType>("all");
  const [selectedStaffUid, setSelectedStaffUid] = useState<string>("all");

  // Granular Sub-views
  const [revenueGranularity, setRevenueGranularity] = useState<RevenueGranularity>("daily");
  const [staffRankLimit, setStaffRankLimit] = useState<"top5" | "top10" | "all">("top5");
  const [productInsightsTab, setProductInsightsTab] = useState<"bestselling" | "revenue" | "profit" | "lowstock">("bestselling");

  // Raw Data State from Firestore
  const [rawEnquiries, setRawEnquiries] = useState<Enquiry[]>([]);
  const [rawBills, setRawBills] = useState<BillData[]>([]);
  const [rawProducts, setRawProducts] = useState<ProductItem[]>([]);
  const [employeesByUid, setEmployeesByUid] = useState<Record<string, EmployeeDoc>>({});
  const [teamMemberUids, setTeamMemberUids] = useState<string[]>([]);

  // Recent Table State
  const [tableSearch, setTableSearch] = useState("");
  const [tableStatusFilter, setTableStatusFilter] = useState("all");
  const [tablePage, setTablePage] = useState(1);
  const tableItemsPerPage = 10;

  // 1. Fetch Employees
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "employees"), (snap) => {
      const byUid: Record<string, EmployeeDoc> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as EmployeeDoc;
        const uid = (data.uid ?? d.id).toString();
        if (uid) {
          byUid[uid] = {
            id: d.id,
            ...data,
            employeeName: data.employeeName || data.name || uid,
          };
        }
      });
      setEmployeesByUid(byUid);
    });
    return () => unsub();
  }, []);

  // 2. Fetch Teams (for Manager scope)
  useEffect(() => {
    if (user?.role === "manager" && user.uid) {
      const unsub = onSnapshot(collection(db, "teams"), (snap) => {
        let staffIds: string[] = [];
        snap.docs.forEach((d) => {
          const t = d.data();
          if (t.managerId === user.uid && Array.isArray(t.staff)) {
            staffIds = [...staffIds, ...t.staff.map((s: any) => s.id)];
          }
        });
        setTeamMemberUids([...new Set(staffIds)]);
      });
      return () => unsub();
    }
  }, [user]);

  // 3. Fetch Enquiries, Bills, and Products
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const unsubEnq = onSnapshot(collection(db, "enquiries"), (snap) => {
      setRawEnquiries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Enquiry)));
      setLoading(false);
    });

    const unsubBills = onSnapshot(collection(db, "bills"), (snap) => {
      setRawBills(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BillData)));
    });

    const unsubProd = onSnapshot(collection(db, "products"), (snap) => {
      setRawProducts(
        snap.docs.map((d) => {
          const dt = d.data();
          let cost = 0;
          if (dt.currentPrice !== undefined && !isNaN(Number(dt.currentPrice))) {
            cost = Number(dt.currentPrice);
          } else if (dt.purchasePrice !== undefined && !isNaN(Number(dt.purchasePrice))) {
            cost = Number(dt.purchasePrice);
          } else if (dt.price !== undefined && !isNaN(Number(dt.price))) {
            cost = Number(dt.price);
          }
          return {
            id: d.id,
            name: dt.name || "Unnamed Product",
            sku: dt.sku || "",
            category: dt.category || "General",
            currentPrice: cost,
            purchasePrice: Number(dt.purchasePrice || cost),
            price: Number(dt.price || 0),
            totalQuantity: Number(dt.totalQuantity || 0),
            lowStockThreshold: Number(dt.lowStockThreshold || 10),
          };
        })
      );
    });

    return () => {
      unsubEnq();
      unsubBills();
      unsubProd();
    };
  }, [user]);

  // Manual Refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [eSnap, bSnap, pSnap] = await Promise.all([
        getDocs(collection(db, "enquiries")),
        getDocs(collection(db, "bills")),
        getDocs(collection(db, "products")),
      ]);
      setRawEnquiries(eSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Enquiry)));
      setRawBills(bSnap.docs.map((d) => ({ id: d.id, ...d.data() } as BillData)));
      setRawProducts(
        pSnap.docs.map((d) => {
          const dt = d.data();
          let cost = Number(dt.currentPrice || dt.purchasePrice || dt.price || 0);
          return {
            id: d.id,
            name: dt.name || "Unnamed Product",
            sku: dt.sku || "",
            category: dt.category || "General",
            currentPrice: cost,
            purchasePrice: Number(dt.purchasePrice || cost),
            price: Number(dt.price || 0),
            totalQuantity: Number(dt.totalQuantity || 0),
            lowStockThreshold: Number(dt.lowStockThreshold || 10),
          };
        })
      );
    } catch (err) {
      console.error("Refresh error:", err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // Product Cost Maps for accurate COGS
  const productCostMaps = useMemo(() => {
    const byId = new Map<string, number>();
    const byName = new Map<string, number>();
    const bySku = new Map<string, number>();

    rawProducts.forEach((p) => {
      const cost = Number(p.currentPrice || p.purchasePrice || p.price || 0);
      if (p.id) byId.set(p.id, cost);
      if (p.name) byName.set(p.name.trim().toLowerCase(), cost);
      if (p.sku) bySku.set(p.sku.trim().toLowerCase(), cost);
    });

    return { byId, byName, bySku };
  }, [rawProducts]);

  // Inventory Stock Alerts
  const stockAlerts = useMemo<StockAlert[]>(() => {
    const list: StockAlert[] = [];
    rawProducts.forEach((p) => {
      const qty = Number(p.totalQuantity || 0);
      const thresh = Number(p.lowStockThreshold || 10);
      if (qty === 0) {
        list.push({
          id: p.id,
          name: p.name,
          currentStock: 0,
          threshold: thresh,
          status: "out",
          category: p.category || "General",
          sku: p.sku,
        });
      } else if (qty <= thresh) {
        list.push({
          id: p.id,
          name: p.name,
          currentStock: qty,
          threshold: thresh,
          status: "low",
          category: p.category || "General",
          sku: p.sku,
        });
      }
    });

    list.sort((a, b) => {
      if (a.status === "out" && b.status !== "out") return -1;
      if (a.status !== "out" && b.status === "out") return 1;
      return a.currentStock - b.currentStock;
    });

    return list;
  }, [rawProducts]);

  // Date Range Bounds
  const { start: dateStart, end: dateEnd, prevStart: prevDateStart, prevEnd: prevDateEnd } = useMemo(() => {
    return getDateRangeForPreset(datePreset, customStartDate, customEndDate);
  }, [datePreset, customStartDate, customEndDate]);

  // Date check helper
  const isDateWithin = (dVal: any, s: Date | null, e: Date | null): boolean => {
    if (!s && !e) return true;
    const d = parseAnyDate(dVal);
    if (!d) return false;
    if (s && d < s) return false;
    if (e && d > e) return false;
    return true;
  };

  // Scoped Data (User Permissions + Channel + Staff Filter)
  const scopedData = useMemo(() => {
    let enqs = rawEnquiries;
    let bills = rawBills;

    // Role filtering
    if (user?.role === "manager") {
      const allowed = [...teamMemberUids, user.uid];
      enqs = enqs.filter((e) => e.assignedTo && allowed.includes(e.assignedTo));
      // For bills, filter by staff if assigned or include all team
    } else if (user?.role === "staff") {
      enqs = enqs.filter((e) => e.assignedTo === user.uid);
    }

    // Staff selector filter (if applied)
    if (selectedStaffUid !== "all") {
      enqs = enqs.filter((e) => e.assignedTo === selectedStaffUid);
    }

    // Channel filter
    if (selectedChannel !== "all") {
      enqs = enqs.filter((e) => resolveRecordChannel(e) === selectedChannel);
      bills = bills.filter((b) => resolveRecordChannel(b) === selectedChannel);
    }

    return { enqs, bills };
  }, [rawEnquiries, rawBills, user, teamMemberUids, selectedStaffUid, selectedChannel]);

  // Current Period Records vs Previous Period Records
  const { currentEnqs, prevEnqs, currentBills, prevBills } = useMemo(() => {
    const curE = scopedData.enqs.filter((e) => isDateWithin(e.createdAt || e.paidDate, dateStart, dateEnd));
    const prvE = scopedData.enqs.filter((e) => isDateWithin(e.createdAt || e.paidDate, prevDateStart, prevDateEnd));

    const curB = scopedData.bills.filter((b) => isDateWithin(b.billDate || b.createdAt || b.updatedAt, dateStart, dateEnd));
    const prvB = scopedData.bills.filter((b) => isDateWithin(b.billDate || b.createdAt || b.updatedAt, prevDateStart, prevDateEnd));

    return { currentEnqs: curE, prevEnqs: prvE, currentBills: curB, prevBills: prvB };
  }, [scopedData, dateStart, dateEnd, prevDateStart, prevDateEnd]);

  // Master KPI Computation
  const analytics = useMemo(() => {
    // Helper to calculate financials for a set of bills and enquiries
    const calculateFinancials = (billsSet: BillData[], enqsSet: Enquiry[]) => {
      let revenue = 0;
      let purchaseCost = 0;
      let totalOrders = 0;
      let outstandingAmount = 0;
      let outstandingCount = 0;

      // Track bill invoice numbers or enquiry IDs to avoid double counting
      const billedEnquiryIds = new Set<string>();

      billsSet.forEach((bill) => {
        const isPaid = bill.status === "paid" || bill.paymentStatus === "completed" || bill.paymentStatus === "paid";
        const isDropped = bill.status === "dropped" || bill.paymentStatus === "refunded" || (bill as any).refunded === true;
        const total = Number(bill.totalAmount || bill.subtotal || 0);

        if (bill.enquiryEnqId) billedEnquiryIds.add(bill.enquiryEnqId);

        if (isPaid) {
          revenue += total;
          totalOrders += 1;

          // Compute COGS for bill items
          const items = parseBillItems(bill.items);
          items.forEach((item) => {
            const qty = Number(item.quantity || 1);
            let cost = 0;
            if (item.purchasePrice !== undefined && !isNaN(Number(item.purchasePrice))) {
              cost = Number(item.purchasePrice);
            } else if (item.costPrice !== undefined && !isNaN(Number(item.costPrice))) {
              cost = Number(item.costPrice);
            } else if (item.productId && productCostMaps.byId.has(item.productId)) {
              cost = productCostMaps.byId.get(item.productId)!;
            } else if (item.productName && productCostMaps.byName.has(item.productName.trim().toLowerCase())) {
              cost = productCostMaps.byName.get(item.productName.trim().toLowerCase())!;
            }
            purchaseCost += cost * qty;
          });
        } else if (!isDropped) {
          outstandingAmount += total;
          outstandingCount += 1;
        }
      });

      // Add standalone converted enquiries not present in bills
      enqsSet.forEach((enq) => {
        const enqId = enq.enqId || enq.id;
        if (enqId && billedEnquiryIds.has(enqId)) return;

        const s = String(enq.status || "").toLowerCase().trim();
        const ps = String(enq.paymentStatus || "").toLowerCase().trim();
        const isConverted = s === "approved" || s === "delivered" || s === "dispatched" || s === "sales" || ps === "paid";
        const val = Number(enq.value || 0);

        if (isConverted && val > 0) {
          revenue += val;
          totalOrders += 1;
          // Approximate cost from materials if available
          const materials = parseBillItems(enq.materials);
          materials.forEach((m) => {
            const qty = Number(m.quantity || 1);
            let cost = Number(m.purchasePrice || m.costPrice || 0);
            purchaseCost += cost * qty;
          });
        }
      });

      const netProfit = revenue - purchaseCost;
      const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
      const aov = totalOrders > 0 ? revenue / totalOrders : 0;

      return {
        revenue,
        purchaseCost,
        netProfit,
        netMargin,
        totalOrders,
        aov,
        outstandingAmount,
        outstandingCount,
      };
    };

    // Helper for Enquiry metrics
    const calculateEnquiryMetrics = (enqsSet: Enquiry[]) => {
      let total = enqsSet.length;
      let convertedCount = 0;
      let convertedVal = 0;
      let quoteCount = 0;
      let testingCount = 0;
      let droppedCount = 0;
      let openCount = 0;
      let unassignedCount = 0;
      let overdueFollowupsCount = 0;

      const now = new Date();

      enqsSet.forEach((e) => {
        const s = String(e.status || "").toLowerCase().trim();
        const ps = String(e.paymentStatus || "").toLowerCase().trim();
        const val = Number(e.value || 0);

        if (!e.assignedTo || e.assignedTo === "" || e.assignedTo === "UNASSIGNED") {
          unassignedCount += 1;
        }

        // Check overdue follow up
        if (e.followUpDate) {
          const fDate = parseAnyDate(e.followUpDate);
          if (fDate && fDate < now && s !== "approved" && s !== "dropped" && s !== "delivered") {
            overdueFollowupsCount += 1;
          }
        }

        if (s === "approved" || s === "delivered" || s === "dispatched" || s === "sales" || ps === "paid") {
          convertedCount += 1;
          convertedVal += val;
        } else if (s === "dropped") {
          droppedCount += 1;
        } else if (s === "testing") {
          testingCount += 1;
        } else if (s === "quote" || s === "quotation") {
          quoteCount += 1;
        } else {
          openCount += 1;
        }
      });

      const conversionRate = total > 0 ? (convertedCount / total) * 100 : 0;

      return {
        total,
        convertedCount,
        convertedVal,
        quoteCount,
        testingCount,
        droppedCount,
        openCount,
        unassignedCount,
        overdueFollowupsCount,
        conversionRate,
      };
    };

    const currentFin = calculateFinancials(currentBills, currentEnqs);
    const prevFin = calculateFinancials(prevBills, prevEnqs);

    const currentEnqM = calculateEnquiryMetrics(currentEnqs);
    const prevEnqM = calculateEnquiryMetrics(prevEnqs);

    // Trends
    const revenueTrend = formatTrend(currentFin.revenue, prevFin.revenue);
    const enquiryTrend = formatTrend(currentEnqM.total, prevEnqM.total);
    const ordersTrend = formatTrend(currentFin.totalOrders, prevFin.totalOrders);
    const profitTrend = formatTrend(currentFin.netProfit, prevFin.netProfit);

    return {
      financials: currentFin,
      prevFinancials: prevFin,
      enquiries: currentEnqM,
      prevEnquiries: prevEnqM,
      trends: {
        revenue: revenueTrend,
        enquiries: enquiryTrend,
        orders: ordersTrend,
        profit: profitTrend,
      },
    };
  }, [currentBills, prevBills, currentEnqs, prevEnqs, productCostMaps]);

  // Revenue Analytics Granular Buckets
  const revenueChartData = useMemo(() => {
    const buckets = new Map<string, { label: string; dateSort: number; revenue: number; cost: number; profit: number }>();

    // Process current bills
    currentBills.forEach((b) => {
      const isPaid = b.status === "paid" || b.paymentStatus === "completed" || b.paymentStatus === "paid";
      if (!isPaid) return;

      const d = parseAnyDate(b.billDate || b.createdAt || b.updatedAt);
      if (!d) return;

      let key = "";
      let label = "";

      if (revenueGranularity === "daily") {
        key = d.toISOString().split("T")[0];
        label = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      } else if (revenueGranularity === "weekly") {
        const weekDay = d.getDay();
        const ws = new Date(d);
        ws.setDate(d.getDate() - weekDay);
        key = ws.toISOString().split("T")[0];
        label = `Wk ${ws.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`;
      } else if (revenueGranularity === "monthly") {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        label = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      } else {
        key = String(d.getFullYear());
        label = String(d.getFullYear());
      }

      if (!buckets.has(key)) {
        buckets.set(key, { label, dateSort: d.getTime(), revenue: 0, cost: 0, profit: 0 });
      }

      const itemTotal = Number(b.totalAmount || b.subtotal || 0);
      const bObj = buckets.get(key)!;
      bObj.revenue += itemTotal;

      // Cost of items
      const items = parseBillItems(b.items);
      let billCost = 0;
      items.forEach((it) => {
        const qty = Number(it.quantity || 1);
        let c = Number(it.purchasePrice || it.costPrice || 0);
        if (c === 0 && it.productId && productCostMaps.byId.has(it.productId)) {
          c = productCostMaps.byId.get(it.productId)!;
        }
        billCost += c * qty;
      });
      bObj.cost += billCost;
      bObj.profit = bObj.revenue - bObj.cost;
    });

    const list = Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([_, v]) => v);

    return list;
  }, [currentBills, revenueGranularity, productCostMaps]);

  // Revenue Highlights (Highest, Lowest, Daily Average, Target Achievement)
  const revenueHighlights = useMemo(() => {
    if (revenueChartData.length === 0) {
      return {
        highestDay: null,
        lowestDay: null,
        avgDaily: 0,
        monthlyTarget: 500000,
        achievementPct: 0,
      };
    }

    let highest = revenueChartData[0];
    let lowest = revenueChartData[0];

    revenueChartData.forEach((item) => {
      if (item.revenue > highest.revenue) highest = item;
      if (item.revenue < lowest.revenue && item.revenue > 0) lowest = item;
    });

    const totalDays = revenueChartData.length || 1;
    const avgDaily = analytics.financials.revenue / totalDays;
    const monthlyTarget = 500000;
    const achievementPct = Math.min(100, (analytics.financials.revenue / monthlyTarget) * 100);

    return {
      highestDay: highest,
      lowestDay: lowest,
      avgDaily,
      monthlyTarget,
      achievementPct,
    };
  }, [revenueChartData, analytics.financials.revenue]);

  // Channel Analytics Comparison Data
  const channelAnalytics = useMemo(() => {
    const channels: ChannelType[] = ["ecommerce", "training", "projects"];

    return channels.map((ch) => {
      const chBills = currentBills.filter((b) => resolveRecordChannel(b) === ch);
      const chEnqs = currentEnqs.filter((e) => resolveRecordChannel(e) === ch);

      let revenue = 0;
      let purchaseCost = 0;
      let orders = 0;
      let pending = 0;

      chBills.forEach((b) => {
        const isPaid = b.status === "paid" || b.paymentStatus === "completed" || b.paymentStatus === "paid";
        const isDropped = b.status === "dropped" || b.paymentStatus === "refunded";
        const total = Number(b.totalAmount || b.subtotal || 0);

        if (isPaid) {
          revenue += total;
          orders += 1;
          const items = parseBillItems(b.items);
          items.forEach((it) => {
            const qty = Number(it.quantity || 1);
            let cost = Number(it.purchasePrice || it.costPrice || 0);
            if (cost === 0 && it.productId && productCostMaps.byId.has(it.productId)) {
              cost = productCostMaps.byId.get(it.productId)!;
            }
            purchaseCost += cost * qty;
          });
        } else if (!isDropped) {
          pending += total;
        }
      });

      const totalEnquiries = chEnqs.length;
      let convertedEnqs = 0;
      chEnqs.forEach((e) => {
        const s = String(e.status || "").toLowerCase().trim();
        const ps = String(e.paymentStatus || "").toLowerCase().trim();
        if (s === "approved" || s === "delivered" || s === "dispatched" || s === "sales" || ps === "paid") {
          convertedEnqs += 1;
        }
      });

      const conversionRate = totalEnquiries > 0 ? (convertedEnqs / totalEnquiries) * 100 : 0;
      const profit = revenue - purchaseCost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      const conf = CHANNELS_CONFIG.find((c) => c.id === ch)!;

      return {
        id: ch,
        name: conf.label,
        icon: conf.icon,
        color: conf.color,
        bg: conf.bg,
        border: conf.border,
        revenue,
        purchaseCost,
        profit,
        margin,
        totalEnquiries,
        convertedEnqs,
        conversionRate,
        pending,
      };
    });
  }, [currentBills, currentEnqs, productCostMaps]);

  // CRM Funnel Data
  const funnelData = useMemo(() => {
    const total = analytics.enquiries.total || 1;
    const stages = [
      { name: "Total Inflow", count: analytics.enquiries.total, val: currentEnqs.reduce((s, e) => s + (Number(e.value) || 0), 0) },
      { name: "Quotation Sent", count: analytics.enquiries.quoteCount + analytics.enquiries.testingCount + analytics.enquiries.convertedCount, val: 0 },
      { name: "Testing Phase", count: analytics.enquiries.testingCount + analytics.enquiries.convertedCount, val: 0 },
      { name: "Approved Orders", count: analytics.enquiries.convertedCount, val: analytics.enquiries.convertedVal },
    ];

    return stages.map((st, idx) => {
      const pctOfTotal = (st.count / total) * 100;
      const prevCount = idx === 0 ? total : stages[idx - 1].count || 1;
      const stepConversion = (st.count / prevCount) * 100;
      return {
        ...st,
        pctOfTotal: Math.min(100, pctOfTotal),
        stepConversion: Math.min(100, stepConversion),
      };
    });
  }, [analytics, currentEnqs]);

  // Lead Acquisition Sources (Donut Chart)
  const sourceChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    currentEnqs.forEach((e) => {
      const src = String(e.mode || e.source || "Website").trim();
      counts[src] = (counts[src] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [currentEnqs]);

  // Lost Enquiry Reasons
  const lostReasonsData = useMemo(() => {
    const reasons: Record<string, number> = {};
    currentEnqs.forEach((e) => {
      const s = String(e.status || "").toLowerCase().trim();
      if (s === "dropped") {
        const r = String(e.reason || e.remarks || "No reason specified").trim();
        reasons[r] = (reasons[r] || 0) + 1;
      }
    });

    return Object.entries(reasons)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [currentEnqs]);

  // Staff Performance Leaderboard
  const staffLeaderboard = useMemo(() => {
    const staffMap = new Map<
      string,
      {
        uid: string;
        name: string;
        email: string;
        totalEnquiries: number;
        convertedCount: number;
        revenue: number;
        pendingCount: number;
        droppedCount: number;
      }
    >();

    // Initialize with all known employees
    Object.values(employeesByUid).forEach((emp) => {
      const uid = emp.uid || emp.id || "";
      if (uid && !staffMap.has(uid)) {
        staffMap.set(uid, {
          uid,
          name: emp.employeeName || emp.name || "Employee",
          email: emp.email || "-",
          totalEnquiries: 0,
          convertedCount: 0,
          revenue: 0,
          pendingCount: 0,
          droppedCount: 0,
        });
      }
    });

    // Populate with current enquiries
    currentEnqs.forEach((e) => {
      const uid = e.assignedTo || "unassigned";
      if (!staffMap.has(uid)) {
        const emp = employeesByUid[uid];
        staffMap.set(uid, {
          uid,
          name: emp?.employeeName || emp?.name || uid === "unassigned" ? "Unassigned" : uid,
          email: emp?.email || "-",
          totalEnquiries: 0,
          convertedCount: 0,
          revenue: 0,
          pendingCount: 0,
          droppedCount: 0,
        });
      }

      const st = staffMap.get(uid)!;
      st.totalEnquiries += 1;

      const s = String(e.status || "").toLowerCase().trim();
      const ps = String(e.paymentStatus || "").toLowerCase().trim();
      const val = Number(e.value || 0);

      if (s === "approved" || s === "delivered" || s === "dispatched" || s === "sales" || ps === "paid") {
        st.convertedCount += 1;
        st.revenue += val;
      } else if (s === "dropped") {
        st.droppedCount += 1;
      } else {
        st.pendingCount += 1;
      }
    });

    const list = Array.from(staffMap.values())
      .filter((s) => s.totalEnquiries > 0 || s.revenue > 0)
      .map((s) => ({
        ...s,
        conversionRate: s.totalEnquiries > 0 ? (s.convertedCount / s.totalEnquiries) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue || b.convertedCount - a.convertedCount);

    if (staffRankLimit === "top5") return list.slice(0, 5);
    if (staffRankLimit === "top10") return list.slice(0, 10);
    return list;
  }, [employeesByUid, currentEnqs, staffRankLimit]);

  // Monthly Leads by Assigned Staff (Grouped Bar Chart)
  const monthlyLeadsByStaff = useMemo(() => {
    const monthlyStaffMap = new Map<string, Record<string, number>>();
    const staffNames = new Set<string>();

    currentEnqs.forEach((e) => {
      const d = parseAnyDate(e.createdAt);
      if (!d) return;

      const monthKey = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      const emp = employeesByUid[e.assignedTo || ""];
      const staffName = emp?.employeeName || emp?.name || "Unassigned";

      staffNames.add(staffName);

      if (!monthlyStaffMap.has(monthKey)) {
        monthlyStaffMap.set(monthKey, {});
      }
      const rec = monthlyStaffMap.get(monthKey)!;
      rec[staffName] = (rec[staffName] || 0) + 1;
    });

    const activeStaff = Array.from(staffNames).slice(0, 6);

    const chartData = Array.from(monthlyStaffMap.entries()).map(([month, counts]) => ({
      month,
      ...counts,
    }));

    return { chartData, staffNames: activeStaff };
  }, [currentEnqs, employeesByUid]);

  // Top 10 Clients by Revenue
  const topClients = useMemo(() => {
    const clientMap = new Map<
      string,
      {
        name: string;
        totalPurchases: number;
        ordersCount: number;
        lastPurchaseDate: Date | null;
        outstandingAmount: number;
      }
    >();

    currentBills.forEach((b) => {
      const name = resolveCustomerName(b);
      const isPaid = b.status === "paid" || b.paymentStatus === "completed" || b.paymentStatus === "paid";
      const isDropped = b.status === "dropped" || b.paymentStatus === "refunded";
      const amt = Number(b.totalAmount || b.subtotal || 0);
      const bDate = parseAnyDate(b.billDate || b.createdAt);

      if (!clientMap.has(name)) {
        clientMap.set(name, {
          name,
          totalPurchases: 0,
          ordersCount: 0,
          lastPurchaseDate: null,
          outstandingAmount: 0,
        });
      }

      const c = clientMap.get(name)!;
      if (isPaid) {
        c.totalPurchases += amt;
        c.ordersCount += 1;
        if (bDate && (!c.lastPurchaseDate || bDate > c.lastPurchaseDate)) {
          c.lastPurchaseDate = bDate;
        }
      } else if (!isDropped) {
        c.outstandingAmount += amt;
      }
    });

    return Array.from(clientMap.values())
      .filter((c) => c.totalPurchases > 0 || c.outstandingAmount > 0)
      .sort((a, b) => b.totalPurchases - a.totalPurchases)
      .slice(0, 10);
  }, [currentBills]);

  // Top Products Insights
  const productInsights = useMemo(() => {
    const prodMap = new Map<
      string,
      {
        id: string;
        name: string;
        sku: string;
        category: string;
        unitsSold: number;
        revenue: number;
        cost: number;
        profit: number;
        currentStock: number;
      }
    >();

    // Seed with inventory products
    rawProducts.forEach((p) => {
      prodMap.set(p.name.trim().toLowerCase(), {
        id: p.id,
        name: p.name,
        sku: p.sku || "",
        category: p.category || "General",
        unitsSold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        currentStock: p.totalQuantity || 0,
      });
    });

    // Aggregate billed sales
    currentBills.forEach((b) => {
      const isPaid = b.status === "paid" || b.paymentStatus === "completed" || b.paymentStatus === "paid";
      if (!isPaid) return;

      const items = parseBillItems(b.items);
      items.forEach((it) => {
        const nameKey = (it.productName || "Unnamed").trim().toLowerCase();
        const qty = Number(it.quantity || 1);
        const price = Number(it.price || 0);
        const lineTotal = Number(it.total || price * qty);

        let unitCost = Number(it.purchasePrice || it.costPrice || 0);
        if (unitCost === 0 && it.productId && productCostMaps.byId.has(it.productId)) {
          unitCost = productCostMaps.byId.get(it.productId)!;
        } else if (unitCost === 0 && productCostMaps.byName.has(nameKey)) {
          unitCost = productCostMaps.byName.get(nameKey)!;
        }

        if (!prodMap.has(nameKey)) {
          prodMap.set(nameKey, {
            id: it.productId || nameKey,
            name: it.productName || "Unnamed Item",
            sku: it.sku || "",
            category: it.category || "General",
            unitsSold: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
            currentStock: 0,
          });
        }

        const pObj = prodMap.get(nameKey)!;
        pObj.unitsSold += qty;
        pObj.revenue += lineTotal;
        pObj.cost += unitCost * qty;
        pObj.profit = pObj.revenue - pObj.cost;
      });
    });

    const all = Array.from(prodMap.values());

    return {
      bestselling: [...all].filter((p) => p.unitsSold > 0).sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 10),
      revenue: [...all].filter((p) => p.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      profit: [...all].filter((p) => p.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 10),
      lowstock: rawProducts
        .filter((p) => (p.totalQuantity || 0) <= (p.lowStockThreshold || 10))
        .map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku || "",
          category: p.category || "General",
          unitsSold: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          currentStock: p.totalQuantity || 0,
        }))
        .slice(0, 10),
    };
  }, [currentBills, rawProducts, productCostMaps]);

  // Recent Table Rows & Search
  const filteredRecentTable = useMemo(() => {
    let list = currentEnqs;

    if (tableStatusFilter !== "all") {
      list = list.filter((e) => String(e.status || "").toLowerCase() === tableStatusFilter.toLowerCase());
    }

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      list = list.filter((e) => {
        const cName = resolveCustomerName(e).toLowerCase();
        const enqId = String(e.enqId || "").toLowerCase();
        const emp = (employeesByUid[e.assignedTo || ""]?.employeeName || "").toLowerCase();
        const st = String(e.status || "").toLowerCase();
        return cName.includes(q) || enqId.includes(q) || emp.includes(q) || st.includes(q);
      });
    }

    return list;
  }, [currentEnqs, tableStatusFilter, tableSearch, employeesByUid]);

  const totalTablePages = Math.ceil(filteredRecentTable.length / tableItemsPerPage) || 1;
  const currentTableRows = filteredRecentTable.slice(
    (tablePage - 1) * tableItemsPerPage,
    tablePage * tableItemsPerPage
  );

  // Export Executive Dashboard Excel Report
  const handleExportReport = () => {
    try {
      const wb = XLSX.utils.book_new();

      // 1. KPI Summary Sheet
      const kpiData = [
        ["BUSINESS DASHBOARD EXECUTIVE REPORT"],
        [`Generated On: ${new Date().toLocaleString("en-IN")}`],
        [`Period: ${datePreset.toUpperCase()} | Channel: ${selectedChannel.toUpperCase()}`],
        [],
        ["Metric", "Current Value", "Previous Period", "Growth Trend"],
        ["Total Revenue", analytics.financials.revenue, analytics.prevFinancials.revenue, analytics.trends.revenue.label],
        ["Outstanding Payments", analytics.financials.outstandingAmount, analytics.prevFinancials.outstandingAmount, "-"],
        ["Total Enquiries", analytics.enquiries.total, analytics.prevEnquiries.total, analytics.trends.enquiries.label],
        ["Converted Enquiries", analytics.enquiries.convertedCount, analytics.prevEnquiries.convertedCount, "-"],
        ["Conversion Rate", `${analytics.enquiries.conversionRate.toFixed(1)}%`, `${analytics.prevEnquiries.conversionRate.toFixed(1)}%`, "-"],
        ["Total Orders", analytics.financials.totalOrders, analytics.prevFinancials.totalOrders, analytics.trends.orders.label],
        ["Average Order Value (AOV)", analytics.financials.aov, analytics.prevFinancials.aov, "-"],
        ["Purchase Cost (COGS)", analytics.financials.purchaseCost, analytics.prevFinancials.purchaseCost, "-"],
        ["Net Profit", analytics.financials.netProfit, analytics.prevFinancials.netProfit, analytics.trends.profit.label],
        ["Net Margin %", `${analytics.financials.netMargin.toFixed(1)}%`, `${analytics.prevFinancials.netMargin.toFixed(1)}%`, "-"],
      ];
      const wsKPI = XLSX.utils.aoa_to_sheet(kpiData);
      XLSX.utils.book_append_sheet(wb, wsKPI, "KPI Summary");

      // 2. Revenue Breakdown Sheet
      const revData = [
        ["Date / Period", "Revenue (INR)", "Purchase Cost (INR)", "Net Profit (INR)"],
        ...revenueChartData.map((r) => [r.label, r.revenue, r.cost, r.profit]),
      ];
      const wsRev = XLSX.utils.aoa_to_sheet(revData);
      XLSX.utils.book_append_sheet(wb, wsRev, "Revenue Analytics");

      // 3. Channel Breakdown Sheet
      const chData = [
        ["Channel", "Revenue (INR)", "Purchase Cost (INR)", "Net Profit (INR)", "Net Margin %", "Total Enquiries", "Orders", "Conversion %", "Pending (INR)"],
        ...channelAnalytics.map((c) => [c.name, c.revenue, c.purchaseCost, c.profit, `${c.margin.toFixed(1)}%`, c.totalEnquiries, c.convertedEnqs, `${c.conversionRate.toFixed(1)}%`, c.pending]),
      ];
      const wsCh = XLSX.utils.aoa_to_sheet(chData);
      XLSX.utils.book_append_sheet(wb, wsCh, "Channel Analytics");

      // 4. Staff Performance Leaderboard
      const staffData = [
        ["Rank", "Staff Name", "Email", "Total Enquiries", "Converted", "Revenue (INR)", "Conversion %", "Pending Leads", "Dropped Leads"],
        ...staffLeaderboard.map((s, idx) => [idx + 1, s.name, s.email, s.totalEnquiries, s.convertedCount, s.revenue, `${s.conversionRate.toFixed(1)}%`, s.pendingCount, s.droppedCount]),
      ];
      const wsStaff = XLSX.utils.aoa_to_sheet(staffData);
      XLSX.utils.book_append_sheet(wb, wsStaff, "Staff Performance");

      // 5. Top Clients
      const clientData = [
        ["Rank", "Client / Company", "Total Purchases (INR)", "Orders Count", "Last Purchase Date", "Outstanding (INR)"],
        ...topClients.map((c, idx) => [idx + 1, c.name, c.totalPurchases, c.ordersCount, c.lastPurchaseDate ? c.lastPurchaseDate.toLocaleDateString("en-IN") : "-", c.outstandingAmount]),
      ];
      const wsClient = XLSX.utils.aoa_to_sheet(clientData);
      XLSX.utils.book_append_sheet(wb, wsClient, "Top Clients");

      XLSX.writeFile(wb, `Business_Dashboard_Report_${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch (err) {
      console.error("Export error:", err);
      alert("Failed to export dashboard report. Please try again.");
    }
  };

  // Helper for status badge
  const getEnquiryStatusBadge = (status?: string) => {
    const s = String(status || "").toLowerCase().trim();
    if (s === "approved" || s === "delivered" || s === "dispatched" || s === "sales") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" /> Approved
        </span>
      );
    }
    if (s === "testing") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          🧪 Testing
        </span>
      );
    }
    if (s === "dropped") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
          <XCircle className="w-3 h-3" /> Dropped
        </span>
      );
    }
    if (s === "quote" || s === "quotation") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-200">
          Quotation
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200 capitalize">
        {status || "Open"}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-16">
      {/* ================= STICKY EXECUTIVE HEADER ================= */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-200/90 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3.5 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs flex-shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                  Business Dashboard
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 capitalize">
                  {user?.role || "Staff"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Executive intelligence overview for Revenue, Lead Pipeline, Channel ROI, and Team Metrics.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleRefresh}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white hover:bg-gray-50 text-gray-700 rounded-xl border border-gray-200/90 shadow-xs transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>

            <button
              onClick={handleExportReport}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Report
            </button>

            <button
              onClick={() => setIsStockDrawerOpen(true)}
              className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-xl transition cursor-pointer border border-gray-200 bg-white"
              title="Inventory Stock Alerts"
            >
              <Bell className="w-4 h-4" />
              {stockAlerts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {stockAlerts.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* ================= 9. GLOBAL FILTERS BAR ================= */}
        <section className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 space-y-3.5">
          {/* Row 1: Date Range Presets */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mr-1 flex-shrink-0">
                <Calendar className="w-3.5 h-3.5 text-blue-600" /> Date:
              </span>
              {DATE_PRESETS_CONFIG.map((preset) => {
                const isActive = datePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => setDatePreset(preset.id)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer whitespace-nowrap ${
                      isActive
                        ? "bg-slate-900 text-white shadow-xs"
                        : "bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-100"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Range Picker */}
            {datePreset === "custom" && (
              <div className="flex items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-100">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-gray-200 rounded-xl text-gray-700"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-gray-200 rounded-xl text-gray-700"
                />
              </div>
            )}
          </div>

          {/* Row 2: Channel Selector & Staff Dropdown */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-gray-100">
            {/* Channel Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mr-1 flex-shrink-0">
                <Filter className="w-3.5 h-3.5 text-blue-600" /> Channel:
              </span>
              {CHANNELS_CONFIG.map((ch) => {
                const Icon = ch.icon;
                const isActive = selectedChannel === ch.id;
                return (
                  <button
                    key={ch.id}
                    onClick={() => setSelectedChannel(ch.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer whitespace-nowrap ${
                      isActive
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-100"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{ch.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Staff Selector (for Admin & Manager) */}
            {(user?.role === "admin" || user?.role === "manager") && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  Staff:
                </span>
                <select
                  value={selectedStaffUid}
                  onChange={(e) => setSelectedStaffUid(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-gray-200 rounded-xl text-gray-700 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="all">All Team Members</option>
                  {Object.values(employeesByUid).map((emp) => (
                    <option key={emp.uid || emp.id} value={emp.uid || emp.id}>
                      {emp.employeeName || emp.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </section>

        {/* ================= 6. BUSINESS ACTION CENTER (PRIORITY ALERTS) ================= */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-500" /> Business Action Center
            </h2>
            <span className="text-[11px] text-gray-400 font-medium">Critical items needing attention</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* 1. Overdue / Pending Follow-ups */}
            <div
              onClick={() => navigate("/enquiries")}
              className="bg-white p-4 rounded-2xl shadow-xs border border-amber-200/90 hover:border-amber-400 transition cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                  Pending Follow-ups
                </span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-amber-700 tracking-tight">
                    {analytics.enquiries.overdueFollowupsCount}
                  </p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 px-2 py-0.5 rounded-full bg-amber-100">
                    Action Req.
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 flex items-center justify-between">
                  <span>Enquiries awaiting response</span>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-600 group-hover:translate-x-0.5 transition-transform" />
                </p>
              </div>
            </div>

            {/* 2. Unassigned Enquiries */}
            <div
              onClick={() => navigate("/enquiries")}
              className="bg-white p-4 rounded-2xl shadow-xs border border-blue-200/90 hover:border-blue-400 transition cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">
                  Unassigned Enquiries
                </span>
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ClipboardList className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-blue-700 tracking-tight">
                    {analytics.enquiries.unassignedCount}
                  </p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 px-2 py-0.5 rounded-full bg-blue-100">
                    New Leads
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 flex items-center justify-between">
                  <span>Assign to staff to start follow-up</span>
                  <ArrowRight className="w-3.5 h-3.5 text-blue-600 group-hover:translate-x-0.5 transition-transform" />
                </p>
              </div>
            </div>

            {/* 3. Outstanding Payments */}
            <div
              onClick={() => navigate("/bills")}
              className="bg-white p-4 rounded-2xl shadow-xs border border-rose-200/90 hover:border-rose-400 transition cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">
                  Outstanding Payments
                </span>
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <IndianRupee className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-rose-700 tracking-tight">
                    {formatCurrency(analytics.financials.outstandingAmount, true)}
                  </p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 px-2 py-0.5 rounded-full bg-rose-100">
                    {analytics.financials.outstandingCount} Bills
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 flex items-center justify-between">
                  <span>Pending payment collection</span>
                  <ArrowRight className="w-3.5 h-3.5 text-rose-600 group-hover:translate-x-0.5 transition-transform" />
                </p>
              </div>
            </div>

            {/* 4. Stock Alerts */}
            <div
              onClick={() => setIsStockDrawerOpen(true)}
              className="bg-white p-4 rounded-2xl shadow-xs border border-purple-200/90 hover:border-purple-400 transition cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">
                  Low Stock Products
                </span>
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-purple-700 tracking-tight">
                    {stockAlerts.length}
                  </p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800 px-2 py-0.5 rounded-full bg-purple-100">
                    {stockAlerts.filter((s) => s.status === "out").length} Out of Stock
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 flex items-center justify-between">
                  <span>Reorder stock before stockout</span>
                  <ArrowRight className="w-3.5 h-3.5 text-purple-600 group-hover:translate-x-0.5 transition-transform" />
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 2. EXECUTIVE KPI OVERVIEW (8 METRIC CARDS) ================= */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-blue-600" /> Executive Business Overview
            </h2>
            <span className="text-[11px] text-gray-400 font-medium">Click any card to open detailed module</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Card 1: Total Revenue */}
            <div
              onClick={() => navigate("/bills")}
              className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-gray-200/90 hover:border-blue-400 hover:shadow-sm transition cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Revenue</span>
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <IndianRupee className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-gray-900 tracking-tight">
                  {formatCurrency(analytics.financials.revenue)}
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-xs">
                  <span
                    className={`inline-flex items-center font-bold ${
                      analytics.trends.revenue.isUp ? "text-emerald-700" : "text-rose-600"
                    }`}
                  >
                    {analytics.trends.revenue.isUp ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    {analytics.trends.revenue.label}
                  </span>
                  <span className="text-gray-400">&bull; Billed Sales</span>
                </div>
              </div>
            </div>

            {/* Card 2: Outstanding Payments */}
            <div
              onClick={() => navigate("/bills")}
              className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-gray-200/90 hover:border-amber-400 hover:shadow-sm transition cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Outstanding Payments</span>
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-amber-600 tracking-tight">
                  {formatCurrency(analytics.financials.outstandingAmount)}
                </p>
                <p className="text-xs text-gray-500 mt-1 font-medium">
                  {analytics.financials.outstandingCount} Pending Bills &bull; Awaiting Collection
                </p>
              </div>
            </div>

            {/* Card 3: Total Enquiries */}
            <div
              onClick={() => navigate("/enquiries")}
              className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-gray-200/90 hover:border-indigo-400 hover:shadow-sm transition cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Enquiries</span>
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ClipboardList className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-gray-900 tracking-tight">
                  {analytics.enquiries.total}
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-xs">
                  <span
                    className={`inline-flex items-center font-bold ${
                      analytics.trends.enquiries.isUp ? "text-emerald-700" : "text-rose-600"
                    }`}
                  >
                    {analytics.trends.enquiries.isUp ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    {analytics.trends.enquiries.label}
                  </span>
                  <span className="text-gray-400">&bull; Leads Received</span>
                </div>
              </div>
            </div>

            {/* Card 4: Converted Enquiries */}
            <div
              onClick={() => navigate("/enquiries")}
              className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-gray-200/90 hover:border-teal-400 hover:shadow-sm transition cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Converted Enquiries</span>
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-teal-700 tracking-tight">
                  {analytics.enquiries.convertedCount}
                </p>
                <p className="text-xs text-teal-600 mt-1 font-semibold truncate">
                  {formatCurrency(analytics.enquiries.convertedVal)} Pipeline Converted
                </p>
              </div>
            </div>

            {/* Card 5: Conversion Rate */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Conversion Rate</span>
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Percent className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-purple-700 tracking-tight">
                  {analytics.enquiries.conversionRate.toFixed(1)}%
                </p>
                <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className="bg-purple-600 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, analytics.enquiries.conversionRate)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Card 6: Total Orders */}
            <div
              onClick={() => navigate("/bills")}
              className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-gray-200/90 hover:border-blue-400 hover:shadow-sm transition cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Orders</span>
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-gray-900 tracking-tight">
                  {analytics.financials.totalOrders}
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-xs">
                  <span
                    className={`inline-flex items-center font-bold ${
                      analytics.trends.orders.isUp ? "text-emerald-700" : "text-rose-600"
                    }`}
                  >
                    {analytics.trends.orders.isUp ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    {analytics.trends.orders.label}
                  </span>
                  <span className="text-gray-400">&bull; Closed Invoices</span>
                </div>
              </div>
            </div>

            {/* Card 7: Average Order Value (AOV) */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Average Order Value</span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Target className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-gray-900 tracking-tight">
                  {formatCurrency(analytics.financials.aov)}
                </p>
                <p className="text-xs text-gray-500 mt-1 font-medium">Per completed transaction</p>
              </div>
            </div>

            {/* Card 8: Net Profit */}
            <div
              onClick={() => navigate("/pnl")}
              className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-gray-200/90 hover:border-emerald-400 hover:shadow-sm transition cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Net Profit</span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Activity className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <p
                  className={`text-2xl font-bold tracking-tight ${
                    analytics.financials.netProfit >= 0 ? "text-emerald-700" : "text-rose-600"
                  }`}
                >
                  {formatCurrency(analytics.financials.netProfit)}
                </p>
                <p className="text-xs mt-1 font-semibold text-emerald-700">
                  {analytics.financials.netMargin.toFixed(1)}% Net Margin &bull; Sales - COGS
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 3. REVENUE & FINANCIAL ANALYTICS ================= */}
        <section className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" /> Revenue & Financial Analytics
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Comparison of Gross Revenue, Purchase Cost (COGS), and Net Profit.
              </p>
            </div>

            {/* Granularity Selector */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {(["daily", "weekly", "monthly", "yearly"] as RevenueGranularity[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setRevenueGranularity(g)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer capitalize ${
                    revenueGranularity === g ? "bg-white text-gray-900 shadow-2xs" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Highlights Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
            <div>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                Highest Sales Day
              </span>
              <p className="text-sm font-bold text-gray-900 mt-0.5">
                {revenueHighlights.highestDay ? formatCurrency(revenueHighlights.highestDay.revenue) : "-"}
              </p>
              <span className="text-[10px] text-gray-500">{revenueHighlights.highestDay?.label || "N/A"}</span>
            </div>

            <div>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                Average Daily Sales
              </span>
              <p className="text-sm font-bold text-gray-900 mt-0.5">
                {formatCurrency(revenueHighlights.avgDaily)}
              </p>
              <span className="text-[10px] text-gray-500">Run-rate per day</span>
            </div>

            <div>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                Monthly Target
              </span>
              <p className="text-sm font-bold text-gray-900 mt-0.5">
                {formatCurrency(revenueHighlights.monthlyTarget)}
              </p>
              <span className="text-[10px] text-blue-600 font-semibold">
                {revenueHighlights.achievementPct.toFixed(1)}% Achieved
              </span>
            </div>

            <div>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                Period Growth
              </span>
              <p
                className={`text-sm font-bold mt-0.5 ${
                  analytics.trends.revenue.isUp ? "text-emerald-700" : "text-rose-600"
                }`}
              >
                {analytics.trends.revenue.label}
              </p>
              <span className="text-[10px] text-gray-500">vs Prior window</span>
            </div>
          </div>

          {/* Chart Container */}
          <div className="w-full h-[280px]">
            {revenueChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={revenueChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748B" }} />
                  <YAxis tickFormatter={(v) => `₹${v}`} tick={{ fontSize: 11, fill: "#64748B" }} />
                  <Tooltip
                    formatter={(v: any, name: any) => [formatCurrency(Number(v)), name]}
                    contentStyle={{ borderRadius: "12px", border: "1px solid #E2E8F0", fontSize: "12px" }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#2563EB"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#revGrad)"
                  />
                  <Bar dataKey="cost" name="Purchase Cost" fill="#6366F1" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Line type="monotone" dataKey="profit" name="Net Profit" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 text-xs">
                <BarChart3 className="w-8 h-8 text-gray-300 mb-1" />
                No revenue records found for this period and channel filter.
              </div>
            )}
          </div>
        </section>

        {/* ================= 4. ENQUIRY & CRM ANALYTICS & FUNNEL ================= */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Conversion Funnel */}
          <div className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-5 lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                  <Filter className="w-4 h-4 text-purple-600" /> Sales & Enquiry Conversion Funnel
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Progression rates from lead inflow to approved orders
                </p>
              </div>
              <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">
                {analytics.enquiries.conversionRate.toFixed(1)}% Overall Conversion
              </span>
            </div>

            <div className="space-y-3">
              {funnelData.map((st, idx) => (
                <div key={st.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-gray-800 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-gray-700 flex items-center justify-center text-[10px] font-bold">
                        {idx + 1}
                      </span>
                      {st.name}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 font-medium">
                        {st.count} {st.count === 1 ? "lead" : "leads"}
                        {st.val > 0 && ` (${formatCurrency(st.val)})`}
                      </span>
                      <span className="font-bold text-blue-600 w-12 text-right">
                        {st.pctOfTotal.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${
                        idx === 0
                          ? "bg-blue-500"
                          : idx === 1
                          ? "bg-indigo-500"
                          : idx === 2
                          ? "bg-purple-500"
                          : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.max(4, st.pctOfTotal)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Stage Summary Tags */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-gray-100">
              <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-100 text-center">
                <span className="text-[10px] font-bold text-blue-700 uppercase">Open / New</span>
                <p className="text-base font-bold text-blue-900 mt-0.5">{analytics.enquiries.openCount}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-purple-50/60 border border-purple-100 text-center">
                <span className="text-[10px] font-bold text-purple-700 uppercase">Quotations</span>
                <p className="text-base font-bold text-purple-900 mt-0.5">{analytics.enquiries.quoteCount}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-100 text-center">
                <span className="text-[10px] font-bold text-amber-700 uppercase">In Testing</span>
                <p className="text-base font-bold text-amber-900 mt-0.5">{analytics.enquiries.testingCount}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-100 text-center">
                <span className="text-[10px] font-bold text-rose-700 uppercase">Dropped</span>
                <p className="text-base font-bold text-rose-900 mt-0.5">{analytics.enquiries.droppedCount}</p>
              </div>
            </div>
          </div>

          {/* Lead Acquisition Sources */}
          <div className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-5 space-y-3 flex flex-col justify-between">
            <div className="pb-2 border-b border-gray-100">
              <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-indigo-600" /> Acquisition Sources
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Channels driving enquiries</p>
            </div>

            {sourceChartData.length > 0 ? (
              <div className="w-full h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sourceChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      dataKey="value"
                      paddingAngle={3}
                    >
                      {sourceChartData.map((_, idx) => (
                        <Cell key={`source-${idx}`} fill={PALETTE[idx % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => [`${v} leads`, "Count"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-gray-400 text-xs">
                No source data available.
              </div>
            )}

            <div className="space-y-1.5 max-h-28 overflow-y-auto pt-2 border-t border-gray-100 text-xs">
              {sourceChartData.slice(0, 4).map((src, idx) => (
                <div key={src.name} className="flex items-center justify-between text-gray-600">
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
                    />
                    <span className="truncate">{src.name}</span>
                  </div>
                  <span className="font-bold text-gray-900">{src.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= 7. CHANNEL ANALYTICS COMPARISON ================= */}
        <section className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" /> Channel Analytics Comparison
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Head-to-head comparison of E-commerce, Training, and Projects & Academic channels.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {channelAnalytics.map((ch) => {
              const Icon = ch.icon;
              return (
                <div
                  key={ch.id}
                  className={`p-4 rounded-2xl border ${ch.border} ${ch.bg} flex flex-col justify-between space-y-4`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-white shadow-2xs flex items-center justify-center text-gray-800">
                        <Icon className="w-4 h-4" />
                      </div>
                      <h4 className="font-bold text-sm text-gray-900">{ch.name}</h4>
                    </div>
                    <span className="text-xs font-bold text-gray-600 bg-white/80 px-2 py-0.5 rounded-full border border-gray-200">
                      {ch.totalEnquiries} Leads
                    </span>
                  </div>

                  <div className="space-y-2 bg-white/90 p-3 rounded-xl border border-white/60">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Revenue</span>
                      <span className="font-bold text-gray-900">{formatCurrency(ch.revenue)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Purchase Cost</span>
                      <span className="font-medium text-gray-700">{formatCurrency(ch.purchaseCost)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1.5 border-t border-gray-100">
                      <span className="font-bold text-gray-700">Net Profit</span>
                      <span
                        className={`font-bold ${ch.profit >= 0 ? "text-emerald-700" : "text-rose-600"}`}
                      >
                        {formatCurrency(ch.profit)} ({ch.margin.toFixed(1)}%)
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <div className="p-2 rounded-lg bg-white/70">
                      <span className="text-[10px] text-gray-400 block font-bold uppercase">Orders</span>
                      <span className="font-bold text-gray-900">{ch.convertedEnqs}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-white/70">
                      <span className="text-[10px] text-gray-400 block font-bold uppercase">Conversion</span>
                      <span className="font-bold text-blue-600">{ch.conversionRate.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ================= 5. STAFF PERFORMANCE ANALYTICS ================= */}
        {(user?.role === "admin" || user?.role === "manager") && (
          <section className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" /> Staff Performance Analytics
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Ranked by converted sales revenue, pipeline velocity, and conversion percentage.
                </p>
              </div>

              {/* View limit toggle */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                {(["top5", "top10", "all"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setStaffRankLimit(r)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer uppercase ${
                      staffRankLimit === r ? "bg-white text-gray-900 shadow-2xs" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {r === "all" ? "All Staff" : r}
                  </button>
                ))}
              </div>
            </div>

            {/* Leaderboard Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Rank / Staff</th>
                    <th className="py-3 px-3 text-right">Assigned Leads</th>
                    <th className="py-3 px-3 text-right">Converted</th>
                    <th className="py-3 px-3 text-right">Sales Revenue</th>
                    <th className="py-3 px-3 text-right">Conversion %</th>
                    <th className="py-3 px-3 text-right">Pending</th>
                    <th className="py-3 px-4 text-right">Dropped</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {staffLeaderboard.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400">
                        No staff activity found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    staffLeaderboard.map((staff, idx) => (
                      <tr key={staff.uid} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-bold text-gray-900 flex items-center gap-2.5">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs text-white ${
                              idx === 0
                                ? "bg-amber-500"
                                : idx === 1
                                ? "bg-slate-400"
                                : idx === 2
                                ? "bg-amber-700"
                                : "bg-gray-300 text-gray-700"
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <div>
                            <p className="font-bold text-gray-900">{staff.name}</p>
                            <span className="text-[10px] text-gray-400 font-normal">{staff.email}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-gray-700">
                          {staff.totalEnquiries}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-700">
                          {staff.convertedCount}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-gray-900">
                          {formatCurrency(staff.revenue)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-blue-600">
                          {staff.conversionRate.toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-right text-amber-700 font-semibold">
                          {staff.pendingCount}
                        </td>
                        <td className="py-3 px-4 text-right text-rose-600 font-semibold">
                          {staff.droppedCount}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Monthly Leads Chart by Staff */}
            {monthlyLeadsByStaff.chartData.length > 0 && (
              <div className="pt-4 border-t border-gray-100 space-y-2">
                <span className="text-xs font-bold text-gray-600">Monthly Leads by Staff Member</span>
                <div className="w-full h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyLeadsByStaff.chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      {monthlyLeadsByStaff.staffNames.map((name, idx) => (
                        <Bar key={name} dataKey={name} fill={PALETTE[idx % PALETTE.length]} radius={[4, 4, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ================= 8. CLIENT & PRODUCT INSIGHTS ================= */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top 10 Clients */}
          <div className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-5 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" /> Top 10 Clients by Revenue
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">High-value recurring customers</p>
              </div>
              <button
                onClick={() => navigate("/bills")}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
              >
                <span>View All</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Client</th>
                    <th className="py-2.5 px-2 text-right">Orders</th>
                    <th className="py-2.5 px-3 text-right">Purchases</th>
                    <th className="py-2.5 px-3 text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {topClients.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-gray-400">
                        No client purchase records found.
                      </td>
                    </tr>
                  ) : (
                    topClients.map((client, idx) => (
                      <tr key={client.name} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 px-3 font-semibold text-gray-900 truncate max-w-[150px]">
                          <span className="text-gray-400 font-mono text-[10px] mr-1.5">{idx + 1}.</span>
                          {client.name}
                        </td>
                        <td className="py-2.5 px-2 text-right text-gray-600 font-medium">
                          {client.ordersCount}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-gray-900">
                          {formatCurrency(client.totalPurchases)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-rose-600">
                          {client.outstandingAmount > 0 ? formatCurrency(client.outstandingAmount) : "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Products & Inventory Insights */}
          <div className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-600" /> Product Insights
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Performance from billing ledger</p>
              </div>

              {/* Sub-tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                {(["bestselling", "revenue", "profit", "lowstock"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setProductInsightsTab(t)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer capitalize ${
                      productInsightsTab === t ? "bg-white text-gray-900 shadow-2xs" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {t === "bestselling" ? "Units" : t === "revenue" ? "Sales" : t === "profit" ? "Profit" : "Low Stock"}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-2 text-right">Units</th>
                    <th className="py-2.5 px-3 text-right">Sales / Profit</th>
                    <th className="py-2.5 px-3 text-right">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {productInsights[productInsightsTab].length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-gray-400">
                        No product records match this view.
                      </td>
                    </tr>
                  ) : (
                    productInsights[productInsightsTab].map((prod, idx) => (
                      <tr key={prod.id || prod.name} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 px-3 font-semibold text-gray-900 truncate max-w-[160px]">
                          <span className="text-gray-400 font-mono text-[10px] mr-1.5">{idx + 1}.</span>
                          {prod.name}
                        </td>
                        <td className="py-2.5 px-2 text-right font-medium text-gray-700">
                          {prod.unitsSold}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-gray-900">
                          {productInsightsTab === "profit" ? formatCurrency(prod.profit) : formatCurrency(prod.revenue)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] ${
                              prod.currentStock === 0
                                ? "bg-rose-100 text-rose-800"
                                : prod.currentStock <= 10
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {prod.currentStock} in stock
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ================= RECENT ENQUIRIES & TRANSACTIONS FEED ================= */}
        <section className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-blue-600" /> Recent Enquiries & Transactions Feed
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Showing {filteredRecentTable.length} active records in current filtered window
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search */}
              <div className="relative min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => {
                    setTableSearch(e.target.value);
                    setTablePage(1);
                  }}
                  placeholder="Search customer, ID, staff..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Status Filter */}
              <select
                value={tableStatusFilter}
                onChange={(e) => {
                  setTableStatusFilter(e.target.value);
                  setTablePage(1);
                }}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-gray-200 rounded-xl text-gray-700 font-semibold focus:bg-white focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="approved">Approved</option>
                <option value="testing">Testing</option>
                <option value="quote">Quotation</option>
                <option value="open">Open</option>
                <option value="dropped">Dropped</option>
              </select>

              <button
                onClick={() => navigate("/enquiries")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition cursor-pointer"
              >
                <span>Full CRM</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Enquiry ID</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-3">Channel</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Value</th>
                  <th className="py-3 px-4">Assigned Staff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentTableRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400">
                      No enquiries match the search and filter criteria.
                    </td>
                  </tr>
                ) : (
                  currentTableRows.map((row) => {
                    const ch = resolveRecordChannel(row);
                    const d = parseAnyDate(row.createdAt);
                    const emp = employeesByUid[row.assignedTo || ""];
                    return (
                      <tr
                        key={row.id}
                        onClick={() => navigate("/enquiries")}
                        className="hover:bg-blue-50/40 cursor-pointer transition"
                        title="Click to view in CRM"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-blue-600">
                          {row.enqId || row.id}
                        </td>
                        <td className="py-3 px-3 text-gray-500 whitespace-nowrap">
                          {d ? d.toLocaleDateString("en-IN") : "-"}
                        </td>
                        <td className="py-3 px-4 font-semibold text-gray-900 truncate max-w-[180px]">
                          {resolveCustomerName(row)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="capitalize text-[11px] font-semibold text-gray-600 bg-slate-100 px-2 py-0.5 rounded-md">
                            {ch}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {getEnquiryStatusBadge(row.status)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-gray-900 whitespace-nowrap">
                          {formatCurrency(Number(row.value || 0))}
                        </td>
                        <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                          {emp?.employeeName || emp?.name || "Unassigned"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination */}
          {totalTablePages > 1 && (
            <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs text-gray-500">
              <span>
                Showing {(tablePage - 1) * tableItemsPerPage + 1} to{" "}
                {Math.min(tablePage * tableItemsPerPage, filteredRecentTable.length)} of{" "}
                {filteredRecentTable.length} records
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                  disabled={tablePage === 1}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-100 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 font-bold text-gray-800">
                  {tablePage} / {totalTablePages}
                </span>
                <button
                  onClick={() => setTablePage((p) => Math.min(totalTablePages, p + 1))}
                  disabled={tablePage === totalTablePages}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-100 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* ================= STOCK ALERTS SLIDE-OUT DRAWER ================= */}
      {isStockDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 bg-slate-50 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-gray-900">Inventory Stock Alerts</h3>
                  <p className="text-xs text-gray-600">
                    {stockAlerts.filter((a) => a.status === "out").length} Out of Stock &bull;{" "}
                    {stockAlerts.filter((a) => a.status === "low").length} Low Stock
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsStockDrawerOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Alerts List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {stockAlerts.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-xs">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                  <p className="font-bold text-sm text-gray-800">All Stock Healthy</p>
                  <p className="mt-1">No low-stock or out-of-stock items detected.</p>
                </div>
              ) : (
                stockAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    onClick={() => {
                      setIsStockDrawerOpen(false);
                      navigate("/inventory");
                    }}
                    className={`p-3.5 rounded-2xl border transition cursor-pointer hover:shadow-xs flex items-start justify-between gap-3 ${
                      alert.status === "out" ? "bg-rose-50/70 border-rose-200" : "bg-amber-50/70 border-amber-200"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            alert.status === "out" ? "bg-rose-200 text-rose-800" : "bg-amber-200 text-amber-800"
                          }`}
                        >
                          {alert.status === "out" ? "OUT OF STOCK" : "LOW STOCK"}
                        </span>
                        {alert.sku && (
                          <span className="text-[10px] text-gray-400 font-mono">
                            SKU: {alert.sku}
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-xs text-gray-900">{alert.name}</h4>
                      <p className="text-[11px] text-gray-600">
                        Current: <strong className="text-gray-900">{alert.currentStock}</strong> units (Threshold: {alert.threshold})
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400 mt-2 shrink-0" />
                  </div>
                ))
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {stockAlerts.length} total active alert{stockAlerts.length === 1 ? "" : "s"}
              </span>
              <button
                onClick={() => {
                  setIsStockDrawerOpen(false);
                  navigate("/inventory");
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition cursor-pointer shadow-xs"
              >
                Go to Inventory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
