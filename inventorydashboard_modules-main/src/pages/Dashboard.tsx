import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Package,
  Receipt,
  TrendingUp,
  IndianRupee,
  FileText,
  Users,
  Trophy,
  ArrowRight,
  Search,
  Calendar,
  PieChart as PieIcon,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  History,
  Calculator,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../App";
import {
  isSoldBill,
  isSoldBillRecord,
  isDroppedBill,
  isQuotationBill,
  deduplicateBills,
  buildEnquiriesMap,
  resolveBillWithEnquiry,
  getBillTotal,
  getBillDate,
} from "../utils/billUtils";

// Clean professional slate & subtle accent palette
const PIE_COLORS = [
  "#0f172a", // Slate 900
  "#334155", // Slate 700
  "#475569", // Slate 600
  "#64748b", // Slate 500
  "#94a3b8", // Slate 400
  "#cbd5e1", // Slate 300
  "#2563eb", // Blue 600
  "#3b82f6", // Blue 500
  "#60a5fa", // Blue 400
  "#0284c7", // Sky 600
];

type TimeFilterMode = "yesterday" | "today" | "past";
type PastMode = "past7" | "past30" | "allPast" | "specific";

interface ParsedItem {
  productName: string;
  quantity: number;
  total: number;
}

interface StaffPerformance {
  name: string;
  totalSales: number;
  billsCount: number;
  itemsCount: number;
}

const formatCurrency = (val: number): string => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(val || 0);
};

const parseDate = (val: any): Date | null => {
  if (!val) return null;
  if (typeof val.toDate === "function") return val.toDate();
  if (val.seconds) return new Date(val.seconds * 1000);
  if (val instanceof Date) return val;
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const isToday = (date: Date | null): boolean => {
  if (!date) return false;
  const now = new Date();
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
};

const isYesterday = (date: Date | null): boolean => {
  if (!date) return false;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  );
};

const isSameDay = (d1: Date | null, d2: Date | null): boolean => {
  if (!d1 || !d2) return false;
  return (
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear()
  );
};

const extractBillItems = (bill: any): ParsedItem[] => {
  let rawItems: any = bill.items || bill.materials;
  if (typeof rawItems === "string") {
    try {
      rawItems = JSON.parse(rawItems);
    } catch {
      rawItems = [];
    }
  }
  if (!Array.isArray(rawItems)) return [];

  return rawItems.map((item: any) => {
    const name = (
      item.productName ||
      item.name ||
      item.description ||
      item.componentName ||
      "Component"
    ).trim();

    let qty = 1;
    if (typeof item.quantity === "number") {
      qty = item.quantity;
    } else if (item.quantity) {
      const match = String(item.quantity).match(/\d+/);
      qty = match ? parseInt(match[0], 10) : 1;
    } else if (typeof item.qty === "number") {
      qty = item.qty;
    }

    const price = Number(item.price) || 0;
    const total =
      Number(item.total || item.totalAmount) || price * (qty > 0 ? qty : 1);

    return {
      productName: name,
      quantity: qty > 0 ? qty : 1,
      total: total > 0 ? total : 0,
    };
  });
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [bills, setBills] = useState<any[]>([]);
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // Time filter: yesterday, today, past
  const [timeFilter, setTimeFilter] = useState<TimeFilterMode>("today");
  const [pastMode, setPastMode] = useState<PastMode>("past7");
  const [specificPastDate, setSpecificPastDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return d.toISOString().split("T")[0];
  });

  const [componentSearch, setComponentSearch] = useState<string>("");

  // 1. Subscribe to Firestore Bills
  useEffect(() => {
    const unsubBills = onSnapshot(
      collection(db, "bills"),
      (snap) => {
        const fetched: any[] = [];
        snap.forEach((doc) => {
          fetched.push({ id: doc.id, ...doc.data() });
        });
        setBills(fetched);
        setLoading(false);
      },
      (err) => {
        console.error("Error subscribing to bills:", err);
        setLoading(false);
      }
    );

    return () => unsubBills();
  }, []);

  // 2. Subscribe to Firestore Enquiries (to resolve bill status & payment matching Billing & PNL)
  useEffect(() => {
    const unsubEnquiries = onSnapshot(
      collection(db, "enquiries"),
      (snap) => {
        const fetched: any[] = [];
        snap.forEach((doc) => {
          fetched.push({ id: doc.id, ...doc.data() });
        });
        setEnquiries(fetched);
      },
      (err) => {
        console.error("Error subscribing to enquiries in Dashboard:", err);
      }
    );

    return () => unsubEnquiries();
  }, []);

  // 3. Subscribe to Firestore Employees
  useEffect(() => {
    const unsubEmployees = onSnapshot(
      collection(db, "employees"),
      (snap) => {
        const empMap: Record<string, string> = {};
        snap.forEach((doc) => {
          const data = doc.data();
          const name = data.employeeName || data.name || data.email || doc.id;
          empMap[doc.id] = name;
          if (data.uid) empMap[data.uid] = name;
        });
        setEmployees(empMap);
      },
      (err) => {
        console.error("Error subscribing to employees:", err);
      }
    );

    return () => unsubEmployees();
  }, []);

  const enquiriesMap = useMemo(() => {
    return buildEnquiriesMap(enquiries);
  }, [enquiries]);

  // Deduplicate and resolve bills with linked enquiry context (100% parity with BillTransactions and PNL)
  const resolvedBills = useMemo(() => {
    const dedup = deduplicateBills(bills);
    return dedup.map((b) => resolveBillWithEnquiry(b, enquiriesMap));
  }, [bills, enquiriesMap]);

  // Filter bills based on selected timeframe (Yesterday, Today, Past Dates) - SOLD bills only
  const filteredBills = useMemo(() => {
    const soldBills = resolvedBills.filter((b) => isSoldBillRecord(b));

    if (timeFilter === "today") {
      return soldBills.filter((b) => isToday(getBillDate(b)));
    }

    if (timeFilter === "yesterday") {
      return soldBills.filter((b) =>
        isYesterday(getBillDate(b))
      );
    }

    if (timeFilter === "past") {
      const now = new Date();
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );

      if (pastMode === "specific" && specificPastDate) {
        const targetDate = new Date(specificPastDate);
        return soldBills.filter((b) =>
          isSameDay(getBillDate(b), targetDate)
        );
      }

      if (pastMode === "past7") {
        const sevenDaysAgo = new Date(startOfToday);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return soldBills.filter((b) => {
          const d = getBillDate(b);
          return d && d >= sevenDaysAgo && d < startOfToday;
        });
      }

      if (pastMode === "past30") {
        const thirtyDaysAgo = new Date(startOfToday);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return soldBills.filter((b) => {
          const d = getBillDate(b);
          return d && d >= thirtyDaysAgo && d < startOfToday;
        });
      }

      // allPast: all records created before today
      return soldBills.filter((b) => {
        const d = getBillDate(b);
        return d && d < startOfToday;
      });
    }

    return soldBills;
  }, [resolvedBills, timeFilter, pastMode, specificPastDate]);

  // Dynamic labels based on active filter

  const timeFilterCardLabel = useMemo(() => {
    if (timeFilter === "today") return "Today's Total Sales";
    if (timeFilter === "yesterday") return "Yesterday's Total Sales";
    if (timeFilter === "past") {
      if (pastMode === "specific") return "Selected Past Date Sales";
      if (pastMode === "past7") return "Past 7 Days Sales";
      if (pastMode === "past30") return "Past 30 Days Sales";
      return "All Past Sales";
    }
    return "Total Sales";
  }, [timeFilter, pastMode]);

  // Selected period total sales
  const periodSales = useMemo(() => {
    return filteredBills.reduce(
      (sum, b) => sum + getBillTotal(b),
      0
    );
  }, [filteredBills]);

  // Aggregated Components sold in selected period
  const componentsSold = useMemo(() => {
    const compMap: Record<
      string,
      { name: string; quantity: number; total: number }
    > = {};

    filteredBills.forEach((bill) => {
      const items = extractBillItems(bill);
      items.forEach((item) => {
        if (!compMap[item.productName]) {
          compMap[item.productName] = {
            name: item.productName,
            quantity: 0,
            total: 0,
          };
        }
        compMap[item.productName].quantity += item.quantity;
        compMap[item.productName].total += item.total;
      });
    });

    return Object.values(compMap).sort((a, b) => b.quantity - a.quantity);
  }, [filteredBills]);

  // Search filtered components for table
  const displayComponents = useMemo(() => {
    if (!componentSearch.trim()) return componentsSold;
    return componentsSold.filter((c) =>
      c.name.toLowerCase().includes(componentSearch.toLowerCase())
    );
  }, [componentsSold, componentSearch]);

  // Pie chart data: top 5 items + "Others" category
  const pieChartData = useMemo(() => {
    if (componentsSold.length === 0) return [];
    if (componentsSold.length <= 6) {
      return componentsSold.map((c) => ({
        name: c.name,
        value: c.quantity,
        totalSales: c.total,
      }));
    }

    const topItems = componentsSold.slice(0, 5).map((c) => ({
      name: c.name,
      value: c.quantity,
      totalSales: c.total,
    }));

    const otherQty = componentsSold
      .slice(5)
      .reduce((sum, c) => sum + c.quantity, 0);
    const otherVal = componentsSold
      .slice(5)
      .reduce((sum, c) => sum + c.total, 0);

    topItems.push({
      name: `Other (${componentsSold.length - 5} items)`,
      value: otherQty,
      totalSales: otherVal,
    });

    return topItems;
  }, [componentsSold]);

  // All-time Total Sales (Sold bills only, excludes quotations and dropped)
  const allTimeTotalSales = useMemo(() => {
    return resolvedBills
      .filter((b) => isSoldBillRecord(b))
      .reduce((sum, b) => sum + getBillTotal(b), 0);
  }, [resolvedBills]);

  // Today's Bills Calculation (Active bills only, excludes dropped)
  const todayBills = useMemo(() => {
    return resolvedBills.filter(
      (b) =>
        !isDroppedBill(b) &&
        b.status !== "dropped" &&
        isToday(getBillDate(b))
    );
  }, [resolvedBills]);

  const todayPaidBillsCount = useMemo(() => {
    return todayBills.filter((b) => isSoldBillRecord(b)).length;
  }, [todayBills]);

  const todayPendingBillsCount = useMemo(() => {
    return todayBills.length - todayPaidBillsCount;
  }, [todayBills, todayPaidBillsCount]);

  // Staff Performance Leaderboard (Sold bills only)
  const staffLeaderboard = useMemo(() => {
    const staffMap: Record<string, StaffPerformance> = {};

    resolvedBills.filter((b) => isSoldBillRecord(b)).forEach((bill) => {
      let staffName = "Unassigned Staff";
      if (bill.assignedToName && String(bill.assignedToName).trim() !== "") {
        staffName = String(bill.assignedToName).trim();
      } else if (bill.assignedTo && employees[bill.assignedTo]) {
        staffName = employees[bill.assignedTo];
      } else if (bill.createdByName && String(bill.createdByName).trim() !== "") {
        staffName = String(bill.createdByName).trim();
      } else if (bill.createdBy && employees[bill.createdBy]) {
        staffName = employees[bill.createdBy];
      }

      if (!staffMap[staffName]) {
        staffMap[staffName] = {
          name: staffName,
          totalSales: 0,
          billsCount: 0,
          itemsCount: 0,
        };
      }

      const amount = getBillTotal(bill);
      staffMap[staffName].totalSales += amount;
      staffMap[staffName].billsCount += 1;

      const items = extractBillItems(bill);
      const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
      staffMap[staffName].itemsCount += totalQty;
    });

    return Object.values(staffMap).sort((a, b) => b.totalSales - a.totalSales);
  }, [resolvedBills, employees]);

  // Table Pagination States
  const [componentPage, setComponentPage] = useState<number>(1);
  const componentPageSize = 6;
  const [staffPage, setStaffPage] = useState<number>(1);
  const staffPageSize = 6;

  useEffect(() => {
    setComponentPage(1);
  }, [timeFilter, pastMode, specificPastDate, componentSearch]);

  useEffect(() => {
    setStaffPage(1);
  }, [timeFilter, pastMode, specificPastDate]);

  const totalCompPages = Math.max(1, Math.ceil(displayComponents.length / componentPageSize));
  const compStartIndex = (componentPage - 1) * componentPageSize;
  const compEndIndex = Math.min(compStartIndex + componentPageSize, displayComponents.length);
  const paginatedComponents = useMemo(() => {
    return displayComponents.slice(compStartIndex, compEndIndex);
  }, [displayComponents, compStartIndex, compEndIndex]);

  const totalStaffPages = Math.max(1, Math.ceil(staffLeaderboard.length / staffPageSize));
  const staffStartIndex = (staffPage - 1) * staffPageSize;
  const staffEndIndex = Math.min(staffStartIndex + staffPageSize, staffLeaderboard.length);
  const paginatedStaff = useMemo(() => {
    return staffLeaderboard.slice(staffStartIndex, staffEndIndex);
  }, [staffLeaderboard, staffStartIndex, staffEndIndex]);

  return (
    <div className="w-full bg-white rounded-2xl border border-gray-100 shadow-xs p-4 sm:p-6 md:p-8 space-y-8">
      {/* ========================================================================= */}
      {/* 1. TOP SECTION: TWO HORIZONTAL PARTS (LEFT: SALES & ITEMS | RIGHT: PIE) */}
      {/* ========================================================================= */}
      <section className="space-y-4">
        {/* Section Header with Yesterday, Today, and Past Dates */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-1.5 sm:p-2 bg-white rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-center shrink-0">
              <img
                src="/ibots-logo.png"
                alt="iBots"
                className="h-8 sm:h-10 md:h-11 w-auto object-contain"
              />
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2.5">
              <span className="w-2 sm:w-2.5 h-7 sm:h-9 bg-slate-900 rounded-full inline-block shrink-0"></span>
              Dashboard
            </h1>
          </div>

          {/* Top Right Header Controls: Timeframe pill selector */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto shrink-0">
            <button
              onClick={() => setTimeFilter("yesterday")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                timeFilter === "yesterday"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              Yesterday
            </button>
            <button
              onClick={() => setTimeFilter("today")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                timeFilter === "today"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeFilter("past")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                timeFilter === "past"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Past Dates</span>
            </button>
          </div>
        </div>

        {/* Sub-selector for Past Dates */}
        {timeFilter === "past" && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs animate-in fade-in duration-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-800 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-600" />
                Past Range:
              </span>
              <button
                onClick={() => setPastMode("past7")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  pastMode === "past7"
                    ? "bg-slate-900 text-white shadow-2xs"
                    : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                Past 7 Days
              </button>
              <button
                onClick={() => setPastMode("past30")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  pastMode === "past30"
                    ? "bg-slate-900 text-white shadow-2xs"
                    : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                Past 30 Days
              </button>
              <button
                onClick={() => setPastMode("allPast")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  pastMode === "allPast"
                    ? "bg-slate-900 text-white shadow-2xs"
                    : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                All Past
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-600 text-[11px] font-medium">
                Or pick specific date:
              </span>
              <input
                type="date"
                max={
                  new Date(Date.now() - 86400000).toISOString().split("T")[0]
                }
                value={specificPastDate}
                onChange={(e) => {
                  setSpecificPastDate(e.target.value);
                  setPastMode("specific");
                }}
                className={`px-2 py-1 text-xs rounded-md border transition-all ${
                  pastMode === "specific"
                    ? "border-slate-800 ring-2 ring-slate-800/20 bg-white text-slate-900 font-semibold"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              />
            </div>
          </div>
        )}

        {/* Horizontal Two Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* PART 1 (LEFT, 7 COLS): Total Sales & Components + Qty sold */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            {/* Period Total Sales Highlight Card - Executive Slate Theme */}
            <div className="bg-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-sm border border-slate-800 relative overflow-hidden">
              <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-slate-400 text-xs sm:text-sm font-medium tracking-wide uppercase">
                    <Clock className="w-4 h-4" />
                    <span>{timeFilterCardLabel}</span>
                  </div>
                  <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1 text-white">
                    {formatCurrency(periodSales)}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Generated across{" "}
                    <strong className="text-slate-200 font-bold">
                      {filteredBills.length}
                    </strong>{" "}
                    {filteredBills.length === 1 ? "bill" : "bills"}
                  </p>
                </div>

                <div className="bg-slate-800/90 backdrop-blur-md rounded-xl p-3 sm:p-4 border border-slate-700/80 flex flex-col items-start sm:items-end">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Units Sold
                  </span>
                  <span className="text-2xl font-black text-white mt-0.5">
                    {componentsSold.reduce((sum, c) => sum + c.quantity, 0)}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {componentsSold.length} unique component
                    {componentsSold.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </div>

            {/* Components & Qty Sold List / Table */}
            <div className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs flex-1 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-slate-700" />
                  <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                    Components & Quantity Sold (
                    {timeFilter === "yesterday"
                      ? "Yesterday"
                      : timeFilter === "today"
                      ? "Today"
                      : "Past Dates"}
                    )
                  </h3>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {displayComponents.length}
                  </span>
                </div>

                {/* Filter search bar */}
                <div className="relative w-full sm:w-48">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={componentSearch}
                    onChange={(e) => setComponentSearch(e.target.value)}
                    placeholder="Search component..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                  />
                </div>
              </div>

              {/* Table Body */}
              <div className="max-h-[300px] overflow-y-auto divide-y divide-gray-100">
                {displayComponents.length === 0 ? (
                  <div className="py-12 px-4 text-center">
                    <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-700">
                      No components sold in this period
                    </p>
                    {timeFilter === "today" && bills.length > 0 && (
                      <button
                        onClick={() => setTimeFilter("past")}
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900"
                      >
                        <span>View past component sales</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50/80 text-gray-500 uppercase tracking-wider text-[10px] sticky top-0 z-10 border-b border-gray-150">
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">Component</th>
                        <th className="py-2.5 px-4 font-semibold text-center">
                          Qty Sold
                        </th>
                        <th className="py-2.5 px-4 font-semibold text-right">
                          Sales Value
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paginatedComponents.map((item, idx) => {
                        const colorIdx = compStartIndex + idx;
                        return (
                        <tr
                          key={`${item.name}-${idx}`}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="py-2.5 px-4 font-medium text-gray-900">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor:
                                    PIE_COLORS[colorIdx % PIE_COLORS.length],
                                }}
                              />
                              <span
                                className="truncate max-w-[200px] sm:max-w-[280px]"
                                title={item.name}
                              >
                                {item.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {item.quantity}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-semibold text-gray-800">
                            {formatCurrency(item.total)}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {displayComponents.length > componentPageSize && (
                  <div className="p-2.5 px-3 border-t border-gray-150 bg-gray-50/70 flex items-center justify-between text-xs text-gray-500">
                    <span>Showing {compStartIndex + 1}-{compEndIndex} of {displayComponents.length}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setComponentPage((p) => Math.max(p - 1, 1))}
                        disabled={componentPage === 1}
                        className="px-2 py-1 bg-white border border-gray-200 rounded-md text-[11px] font-semibold hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                      >
                        Prev
                      </button>
                      <span className="text-[11px] font-bold px-1.5">{componentPage}/{totalCompPages}</span>
                      <button
                        onClick={() => setComponentPage((p) => Math.min(p + 1, totalCompPages))}
                        disabled={componentPage === totalCompPages}
                        className="px-2 py-1 bg-white border border-gray-200 rounded-md text-[11px] font-semibold hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* PART 2 (RIGHT, 5 COLS): Pie Chart of Components Sold */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-gray-200/90 shadow-2xs p-5 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-slate-700" />
                <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                  Component Share Pie Chart
                </h3>
              </div>
              <span className="text-[11px] text-gray-500 font-medium">
                By Quantity Sold
              </span>
            </div>

            <div className="flex-1 min-h-[300px] flex items-center justify-center pt-2">
              {pieChartData.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <div className="w-16 h-16 rounded-full bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center mx-auto mb-3">
                    <PieIcon className="w-7 h-7 text-gray-300" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700">
                    No Data Available for Pie Chart
                  </p>
                </div>
              ) : (
                <div className="w-full h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="45%"
                        outerRadius={95}
                        innerRadius={50}
                        paddingAngle={3}
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                            stroke="#ffffff"
                            strokeWidth={2}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: any, name: any, item: any) => [
                          `${val} units (${formatCurrency(
                            item.payload.totalSales
                          )})`,
                          name,
                        ]}
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          borderColor: "#334155",
                          borderRadius: "0.75rem",
                          color: "#ffffff",
                          fontSize: "12px",
                        }}
                        itemStyle={{ color: "#ffffff" }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={48}
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => (
                          <span className="text-[11px] text-gray-600 truncate max-w-[120px] inline-block align-middle font-medium">
                            {value}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. MIDDLE SECTION: INVENTORY, BILLING, ENQUIRY (HORIZONTAL NAVIGATION CARDS) */}
      {/* ========================================================================= */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-slate-700" />
          <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
            Quick Navigation Modules
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Inventory Card */}
          <div
            onClick={() => navigate("/inventory")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && navigate("/inventory")}
            className="group cursor-pointer bg-white hover:bg-slate-50/80 border border-gray-200 hover:border-slate-400 rounded-xl p-5 shadow-2xs hover:shadow-xs transition-all duration-200 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center transition-colors shadow-2xs">
                <Package className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900 group-hover:text-slate-900 transition-colors">
                Inventory
              </h3>
            </div>
            <div className="w-9 h-9 rounded-full bg-slate-100 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center text-slate-400 transition-all">
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Billing Card */}
          <div
            onClick={() => navigate("/bills")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && navigate("/bills")}
            className="group cursor-pointer bg-white hover:bg-slate-50/80 border border-gray-200 hover:border-slate-400 rounded-xl p-5 shadow-2xs hover:shadow-xs transition-all duration-200 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center transition-colors shadow-2xs">
                <Receipt className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900 group-hover:text-slate-900 transition-colors">
                Billing
              </h3>
            </div>
            <div className="w-9 h-9 rounded-full bg-slate-100 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center text-slate-400 transition-all">
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Enquiry Card */}
          <div
            onClick={() => navigate("/enquiries")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && navigate("/enquiries")}
            className="group cursor-pointer bg-white hover:bg-slate-50/80 border border-gray-200 hover:border-slate-400 rounded-xl p-5 shadow-2xs hover:shadow-xs transition-all duration-200 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center transition-colors shadow-2xs">
                <Calculator className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900 group-hover:text-slate-900 transition-colors">
                Enquiry
              </h3>
            </div>
            <div className="w-9 h-9 rounded-full bg-slate-100 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center text-slate-400 transition-all">
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. AT DOWN SECTION: TOTAL SALES & NO OF BILLS                             */}
      {/* ========================================================================= */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-6 bg-slate-900 rounded-full inline-block"></span>
          <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
            Sales & Invoices Overview
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Total Sales Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-6 flex items-center justify-between hover:border-slate-300 transition-all">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <IndianRupee className="w-4 h-4 text-slate-700" />
                <span>Total Sales</span>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                {formatCurrency(allTimeTotalSales)}
              </div>
            </div>

            <div className="w-14 h-14 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0 shadow-2xs border border-slate-200">
              <IndianRupee className="w-7 h-7" />
            </div>
          </div>

          {/* No of Bills Card (Today's) */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-6 flex items-center justify-between hover:border-slate-300 transition-all">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <FileText className="w-4 h-4 text-slate-700" />
                <span>No. of Bills</span>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                {todayBills.length}
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                  <CheckCircle2 className="w-3 h-3" />
                  {todayPaidBillsCount} Paid Today
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                  <Clock className="w-3 h-3" />
                  {todayPendingBillsCount} Pending Today
                </span>
              </div>
            </div>

            <div className="w-14 h-14 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0 shadow-2xs border border-slate-200">
              <FileText className="w-7 h-7" />
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. AT THE BOTTOM SECTION: TOP PERFORMED STAFFS                             */}
      {/* ========================================================================= */}
      <section className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
                Top Performed Staffs
              </h2>
              <p className="text-xs text-gray-500">
                Leaderboard ranked by revenue generated and bills closed
              </p>
            </div>
          </div>

          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 self-start sm:self-auto">
            {staffLeaderboard.length} staff members ranked
          </span>
        </div>

        {/* Staff Table */}
        <div className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs overflow-hidden">
          {staffLeaderboard.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-700">
                No staff performance records available
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Records will appear as bills are attributed to staff members.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-gray-50/80 text-gray-600 uppercase tracking-wider text-[11px] border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4 font-semibold text-center w-16">
                      Rank
                    </th>
                    <th className="py-3 px-4 font-semibold">Staff Name</th>
                    <th className="py-3 px-4 font-semibold text-center">
                      No. of Bills
                    </th>
                    <th className="py-3 px-4 font-semibold text-center">
                      Items Handled
                    </th>
                    <th className="py-3 px-4 font-semibold text-right">
                      Avg Bill Value
                    </th>
                    <th className="py-3 px-4 font-semibold text-right">
                      Total Sales Value
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedStaff.map((staff, idx) => {
                    const actualRank = staffStartIndex + idx;
                    const avgBill =
                      staff.billsCount > 0
                        ? staff.totalSales / staff.billsCount
                        : 0;

                    return (
                      <tr
                        key={staff.name}
                        className={`hover:bg-sky-50/40 transition-colors ${
                          actualRank === 0 ? "bg-amber-50/20" : ""
                        }`}
                      >
                        {/* Rank Badge */}
                        <td className="py-3 px-4 text-center font-bold">
                          {actualRank === 0 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-800 text-xs font-black shadow-2xs border border-amber-300">
                              🥇 1
                            </span>
                          ) : actualRank === 1 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-xs font-black border border-slate-300">
                              🥈 2
                            </span>
                          ) : actualRank === 2 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-100 text-orange-800 text-xs font-black border border-orange-300">
                              🥉 3
                            </span>
                          ) : (
                            <span className="text-gray-500 font-semibold text-xs">
                              #{actualRank + 1}
                            </span>
                          )}
                        </td>

                        {/* Staff Name & Initial Icon */}
                        <td className="py-3 px-4 font-semibold text-gray-900">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-sky-700 text-white flex items-center justify-center font-bold text-xs uppercase shadow-2xs">
                              {staff.name.charAt(0)}
                            </div>
                            <div>
                              <div className="text-gray-900 font-bold">
                                {staff.name}
                              </div>
                              <div className="text-[11px] text-gray-400 font-normal">
                                Sales Executive
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* No of Bills */}
                        <td className="py-3 px-4 text-center">
                          <span className="inline-block px-2.5 py-1 rounded-md font-bold text-xs bg-gray-100 text-gray-800 border border-gray-200/70">
                            {staff.billsCount}
                          </span>
                        </td>

                        {/* Items Sold */}
                        <td className="py-3 px-4 text-center text-gray-600 font-medium">
                          {staff.itemsCount} units
                        </td>

                        {/* Avg Bill Value */}
                        <td className="py-3 px-4 text-right font-medium text-gray-600">
                          {formatCurrency(avgBill)}
                        </td>

                        {/* Total Sales Value */}
                        <td className="py-3 px-4 text-right">
                          <span className="font-extrabold text-sky-600 text-sm sm:text-base">
                            {formatCurrency(staff.totalSales)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {staffLeaderboard.length > staffPageSize && (
                <div className="p-3 px-4 border-t border-gray-150 bg-gray-50/70 flex items-center justify-between text-xs text-gray-500">
                  <span>Showing {staffStartIndex + 1}-{staffEndIndex} of {staffLeaderboard.length} staff members</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setStaffPage((p) => Math.max(p - 1, 1))}
                      disabled={staffPage === 1}
                      className="px-2.5 py-1 bg-white border border-gray-200 rounded-md text-[11px] font-semibold hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                    >
                      Prev
                    </button>
                    <span className="text-[11px] font-bold px-2">{staffPage}/{totalStaffPages}</span>
                    <button
                      onClick={() => setStaffPage((p) => Math.min(p + 1, totalStaffPages))}
                      disabled={staffPage === totalStaffPages}
                      className="px-2.5 py-1 bg-white border border-gray-200 rounded-md text-[11px] font-semibold hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
