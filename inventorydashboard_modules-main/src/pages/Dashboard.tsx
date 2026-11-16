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
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  History,
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

// Vibrant Sky Blue accented palette for the Pie Chart
const PIE_COLORS = [
  "#0284c7", // Sky-600
  "#0ea5e9", // Sky-500
  "#38bdf8", // Sky-400
  "#10b981", // Emerald-500
  "#f59e0b", // Amber-500
  "#8b5cf6", // Violet-500
  "#06b6d4", // Cyan-500
  "#ec4899", // Pink-500
  "#f97316", // Orange-500
  "#64748b", // Slate-500
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

  // 2. Subscribe to Firestore Employees
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

  // Filter bills based on selected timeframe (Yesterday, Today, Past Dates)
  const filteredBills = useMemo(() => {
    if (timeFilter === "today") {
      return bills.filter((b) => isToday(parseDate(b.billDate || b.createdAt)));
    }

    if (timeFilter === "yesterday") {
      return bills.filter((b) =>
        isYesterday(parseDate(b.billDate || b.createdAt))
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
        return bills.filter((b) =>
          isSameDay(parseDate(b.billDate || b.createdAt), targetDate)
        );
      }

      if (pastMode === "past7") {
        const sevenDaysAgo = new Date(startOfToday);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return bills.filter((b) => {
          const d = parseDate(b.billDate || b.createdAt);
          return d && d >= sevenDaysAgo && d < startOfToday;
        });
      }

      if (pastMode === "past30") {
        const thirtyDaysAgo = new Date(startOfToday);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return bills.filter((b) => {
          const d = parseDate(b.billDate || b.createdAt);
          return d && d >= thirtyDaysAgo && d < startOfToday;
        });
      }

      // allPast: all records created before today
      return bills.filter((b) => {
        const d = parseDate(b.billDate || b.createdAt);
        return d && d < startOfToday;
      });
    }

    return bills;
  }, [bills, timeFilter, pastMode, specificPastDate]);

  // Dynamic titles and labels based on active filter
  const timeFilterTitle = useMemo(() => {
    if (timeFilter === "today") return "Today's Sales & Components Breakdown";
    if (timeFilter === "yesterday")
      return "Yesterday's Sales & Components Breakdown";
    if (timeFilter === "past") {
      if (pastMode === "specific" && specificPastDate) {
        const d = new Date(specificPastDate);
        const formatted = isNaN(d.getTime())
          ? specificPastDate
          : d.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
        return `Sales & Components on ${formatted}`;
      }
      if (pastMode === "past7") return "Past 7 Days Sales & Components Breakdown";
      if (pastMode === "past30")
        return "Past 30 Days Sales & Components Breakdown";
      return "All Past Dates Sales & Components Breakdown";
    }
    return "Sales & Components Breakdown";
  }, [timeFilter, pastMode, specificPastDate]);

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
      (sum, b) => sum + (Number(b.totalAmount) || 0),
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

  // All-time Cumulative Total Sales & No. of Bills
  const allTimeTotalSales = useMemo(() => {
    return bills.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
  }, [bills]);

  const paidBillsCount = useMemo(() => {
    return bills.filter(
      (b) =>
        String(b.status || "").toLowerCase() === "paid" ||
        String(b.paymentStatus || "").toLowerCase() === "completed"
    ).length;
  }, [bills]);

  const pendingBillsCount = useMemo(() => {
    return bills.length - paidBillsCount;
  }, [bills, paidBillsCount]);

  // Staff Performance Leaderboard
  const staffLeaderboard = useMemo(() => {
    const staffMap: Record<string, StaffPerformance> = {};

    bills.forEach((bill) => {
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

      const amount = Number(bill.totalAmount) || 0;
      staffMap[staffName].totalSales += amount;
      staffMap[staffName].billsCount += 1;

      const items = extractBillItems(bill);
      const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
      staffMap[staffName].itemsCount += totalQty;
    });

    return Object.values(staffMap).sort((a, b) => b.totalSales - a.totalSales);
  }, [bills, employees]);

  return (
    <div className="w-full bg-white rounded-2xl border border-gray-100 shadow-xs p-4 sm:p-6 md:p-8 space-y-8">
      {/* ========================================================================= */}
      {/* 1. TOP SECTION: TWO HORIZONTAL PARTS (LEFT: SALES & ITEMS | RIGHT: PIE) */}
      {/* ========================================================================= */}
      <section className="space-y-4">
        {/* Section Header with Yesterday, Today, and Past Dates */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <span className="w-2.5 h-6 bg-sky-500 rounded-full inline-block"></span>
              {timeFilterTitle}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              Live component sales and cumulative performance analytics
            </p>
          </div>

          {/* Timeframe pill selector: Yesterday, Today, Past Dates */}
          <div className="flex items-center gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-200/80 self-start sm:self-auto">
            <button
              onClick={() => setTimeFilter("yesterday")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                timeFilter === "yesterday"
                  ? "bg-sky-500 text-white shadow-xs"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100/70"
              }`}
            >
              Yesterday
            </button>
            <button
              onClick={() => setTimeFilter("today")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                timeFilter === "today"
                  ? "bg-sky-500 text-white shadow-xs"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100/70"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeFilter("past")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                timeFilter === "past"
                  ? "bg-sky-500 text-white shadow-xs"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100/70"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Past Dates</span>
            </button>
          </div>
        </div>

        {/* Sub-selector for Past Dates */}
        {timeFilter === "past" && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-sky-50/70 p-3 rounded-xl border border-sky-100 text-xs animate-in fade-in duration-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-sky-900 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-sky-600" />
                Past Range:
              </span>
              <button
                onClick={() => setPastMode("past7")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  pastMode === "past7"
                    ? "bg-sky-600 text-white shadow-2xs"
                    : "bg-white text-sky-800 hover:bg-sky-100/70 border border-sky-200/60"
                }`}
              >
                Past 7 Days
              </button>
              <button
                onClick={() => setPastMode("past30")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  pastMode === "past30"
                    ? "bg-sky-600 text-white shadow-2xs"
                    : "bg-white text-sky-800 hover:bg-sky-100/70 border border-sky-200/60"
                }`}
              >
                Past 30 Days
              </button>
              <button
                onClick={() => setPastMode("allPast")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  pastMode === "allPast"
                    ? "bg-sky-600 text-white shadow-2xs"
                    : "bg-white text-sky-800 hover:bg-sky-100/70 border border-sky-200/60"
                }`}
              >
                All Past
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-600 text-[11px] font-medium">
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
                    ? "border-sky-500 ring-2 ring-sky-500/20 bg-white text-sky-900 font-semibold"
                    : "border-gray-200 bg-white text-gray-700"
                }`}
              />
            </div>
          </div>
        )}

        {/* Horizontal Two Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* PART 1 (LEFT, 7 COLS): Total Sales & Components + Qty sold */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            {/* Period Total Sales Highlight Card - Sky Blue Theme */}
            <div className="bg-gradient-to-r from-[#0ea5e9] via-[#0284c7] to-[#0369a1] rounded-2xl p-5 sm:p-6 text-white shadow-md relative overflow-hidden">
              <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
              <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sky-100 text-xs sm:text-sm font-medium tracking-wide uppercase">
                    <Clock className="w-4 h-4" />
                    <span>{timeFilterCardLabel}</span>
                  </div>
                  <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1">
                    {formatCurrency(periodSales)}
                  </div>
                  <p className="text-xs text-sky-100/90 mt-1">
                    Generated across{" "}
                    <strong className="text-white font-bold">
                      {filteredBills.length}
                    </strong>{" "}
                    {filteredBills.length === 1 ? "bill" : "bills"}
                  </p>
                </div>

                <div className="bg-white/15 backdrop-blur-md rounded-xl p-3 sm:p-4 border border-white/20 flex flex-col items-start sm:items-end">
                  <span className="text-[11px] font-semibold text-sky-100 uppercase tracking-wider">
                    Units Sold
                  </span>
                  <span className="text-2xl font-black text-white mt-0.5">
                    {componentsSold.reduce((sum, c) => sum + c.quantity, 0)}
                  </span>
                  <span className="text-[11px] text-sky-200">
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
                  <Layers className="w-4 h-4 text-sky-600" />
                  <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                    Components & Quantity Sold (
                    {timeFilter === "yesterday"
                      ? "Yesterday"
                      : timeFilter === "today"
                      ? "Today"
                      : "Past Dates"}
                    )
                  </h3>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
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
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
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
                    <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                      Items sold from newly generated bills will immediately appear here.
                    </p>
                    {timeFilter === "today" && bills.length > 0 && (
                      <button
                        onClick={() => setTimeFilter("past")}
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-700"
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
                      {displayComponents.map((item, idx) => (
                        <tr
                          key={`${item.name}-${idx}`}
                          className="hover:bg-sky-50/40 transition-colors"
                        >
                          <td className="py-2.5 px-4 font-medium text-gray-900">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor:
                                    PIE_COLORS[idx % PIE_COLORS.length],
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
                            <span className="inline-block px-2 py-0.5 rounded-full font-bold bg-sky-50 text-sky-700 border border-sky-200/60">
                              {item.quantity}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-semibold text-gray-800">
                            {formatCurrency(item.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* PART 2 (RIGHT, 5 COLS): Pie Chart of Components Sold */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-gray-200/90 shadow-2xs p-5 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-sky-600" />
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
                  <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                    The chart will populate automatically as components are sold.
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
      {/* 2. MIDDLE SECTION: INVENTORY, BILLING, PNL (HORIZONTAL NAVIGATION CARDS) */}
      {/* ========================================================================= */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-sky-600" />
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
            className="group cursor-pointer bg-white hover:bg-gradient-to-br hover:from-sky-50/50 hover:to-white border border-gray-200/90 hover:border-sky-500 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all duration-200 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 group-hover:bg-sky-500 group-hover:text-white flex items-center justify-center transition-colors shadow-2xs">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-600">
                  Stock & Catalog
                </span>
                <h3 className="text-lg font-extrabold text-gray-900 group-hover:text-sky-600 transition-colors">
                  Inventory
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Manage components, quantities & alerts
                </p>
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-gray-100 group-hover:bg-sky-500 group-hover:text-white flex items-center justify-center text-gray-400 transition-all">
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Billing Card */}
          <div
            onClick={() => navigate("/bills")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && navigate("/bills")}
            className="group cursor-pointer bg-white hover:bg-gradient-to-br hover:from-emerald-50/50 hover:to-white border border-gray-200/90 hover:border-emerald-500 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all duration-200 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center transition-colors shadow-2xs">
                <Receipt className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                  Invoices & Estimates
                </span>
                <h3 className="text-lg font-extrabold text-gray-900 group-hover:text-emerald-600 transition-colors">
                  Billing
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Generate bills, GST & print transactions
                </p>
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-gray-100 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center text-gray-400 transition-all">
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* PNL Card */}
          <div
            onClick={() => navigate("/pnl")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && navigate("/pnl")}
            className="group cursor-pointer bg-white hover:bg-gradient-to-br hover:from-violet-50/50 hover:to-white border border-gray-200/90 hover:border-violet-500 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all duration-200 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 group-hover:bg-violet-600 group-hover:text-white flex items-center justify-center transition-colors shadow-2xs">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-violet-600">
                  Financial Analytics
                </span>
                <h3 className="text-lg font-extrabold text-gray-900 group-hover:text-violet-600 transition-colors">
                  PNL
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  View profit, loss, margins & revenues
                </p>
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-gray-100 group-hover:bg-violet-600 group-hover:text-white flex items-center justify-center text-gray-400 transition-all">
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
          <div className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs p-6 flex items-center justify-between hover:border-sky-300 transition-all">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                <IndianRupee className="w-4 h-4 text-sky-600" />
                <span>Total Cumulative Sales</span>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                {formatCurrency(allTimeTotalSales)}
              </div>
              <p className="text-xs text-gray-500">
                Combined revenue across all billing records
              </p>
            </div>

            <div className="w-14 h-14 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center flex-shrink-0 shadow-2xs border border-sky-100">
              <IndianRupee className="w-7 h-7" />
            </div>
          </div>

          {/* No of Bills Card */}
          <div className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs p-6 flex items-center justify-between hover:border-sky-300 transition-all">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                <FileText className="w-4 h-4 text-sky-600" />
                <span>No. of Bills</span>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                {bills.length}
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                  <CheckCircle2 className="w-3 h-3" />
                  {paidBillsCount} Paid
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                  <Clock className="w-3 h-3" />
                  {pendingBillsCount} Pending
                </span>
              </div>
            </div>

            <div className="w-14 h-14 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center flex-shrink-0 shadow-2xs border border-sky-100">
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
                  {staffLeaderboard.map((staff, idx) => {
                    const avgBill =
                      staff.billsCount > 0
                        ? staff.totalSales / staff.billsCount
                        : 0;

                    return (
                      <tr
                        key={staff.name}
                        className={`hover:bg-sky-50/40 transition-colors ${
                          idx === 0 ? "bg-amber-50/20" : ""
                        }`}
                      >
                        {/* Rank Badge */}
                        <td className="py-3 px-4 text-center font-bold">
                          {idx === 0 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-800 text-xs font-black shadow-2xs border border-amber-300">
                              🥇 1
                            </span>
                          ) : idx === 1 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-xs font-black border border-slate-300">
                              🥈 2
                            </span>
                          ) : idx === 2 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-100 text-orange-800 text-xs font-black border border-orange-300">
                              🥉 3
                            </span>
                          ) : (
                            <span className="text-gray-500 font-semibold text-xs">
                              #{idx + 1}
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
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
