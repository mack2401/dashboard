import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  IndianRupee,
  ClipboardList,
  BarChart3,
  Users,
  RefreshCw,
  Bell,
  TrendingUp,
  Target,
  LineChart as LineChartIcon,
  Filter,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Briefcase,
  GraduationCap,
  ShoppingCart,
  ListOrdered,
  Package,
  AlertCircle,
  X,
  Search,
  ExternalLink,
  ArrowRight,
  Clock,
  Plus,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";
import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../App";
import type { Enquiry } from "../types/enquiry";

// --- Types & Interfaces ---
type EmployeeDoc = {
  employeeName?: string;
  name?: string;
  email?: string;
  uid?: string;
  managerId?: string;
};

type SegmentType = "all" | "ecommerce" | "training" | "projects";

interface SegmentPerformance {
  totalEnq: number;
  conversion: number;
  salesValue: number;
}

interface DashboardStats {
  totalRevenue: number;
  openInvoices: number;
  dueInvoices: number;
  totalEnquiries: number;
  quoteEnquiries: number;
  salesEnquiries: number;
  droppedEnquiries: number;
  openEnquiries: number;
  conversionRate: number;
  waitingPayment: number;
}

interface ChartData {
  name: string;
  value: number;
  [key: string]: any;
}

interface RevenueData {
  date: string;
  revenue: number;
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

interface EnquiryTableRow {
  id: string;
  enqId: string;
  createdAt: string;
  createdAtTimestamp: number;
  customerName: string;
  value: number;
  assignedTo: string;
  employeeName: string;
  status: string;
  productStatus: string;
  segment: SegmentType;
}

interface BillData {
  id: string;
  totalAmount?: number;
  status?: string;
  paymentStatus?: string;
  createdAt?: any;
  [key: string]: any;
}

// --- Configuration ---
const COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
];
const CHART_HEIGHT = 240;

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  name,
}: any) => {
  if (
    !percent ||
    percent < 0.05 ||
    typeof midAngle !== "number" ||
    isNaN(midAngle) ||
    typeof cx !== "number" ||
    isNaN(cx) ||
    typeof cy !== "number" ||
    isNaN(cy)
  ) {
    return null; // hide tiny slices or invalid calculations
  }

  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  const textAnchor = x > cx ? "start" : "end";

  return (
    <>
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={textAnchor}
        dominantBaseline="central"
        fontSize={11}
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
      <text
        x={cx + (outerRadius + 8) * Math.cos(-midAngle * RADIAN)}
        y={cy + (outerRadius + 8) * Math.sin(-midAngle * RADIAN)}
        fill="#4B5563"
        textAnchor={textAnchor}
        dominantBaseline="central"
        fontSize={11}
        fontWeight="600"
      >
        {name}
      </text>
    </>
  );
};

// Safe date parser that works across all formats (Firestore Timestamp, object, Date, string, millis)
const parseAnyDate = (dateVal: any): Date | null => {
  if (!dateVal) return null;
  try {
    if (dateVal?.toDate && typeof dateVal.toDate === "function") {
      const d = dateVal.toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (dateVal?.seconds !== undefined) {
      const d = new Date(Number(dateVal.seconds) * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
    if (dateVal?._seconds !== undefined) {
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

// Resolve Customer Name safely from multiple possible fields
const resolveCustomerName = (enq: any): string => {
  if (!enq) return "Unknown";
  return (
    enq.customer?.name ||
    enq.customer?.company ||
    enq.companyDetails?.companyName ||
    enq.clientName ||
    enq.customerName ||
    enq.name ||
    enq.billedTo?.name ||
    "N/A"
  );
};

// Resolve Segment
const resolveEnquirySegment = (enq: any): SegmentType => {
  const rawType = String(enq.type || "").toLowerCase().trim();
  const rawMode = String(enq.mode || enq.source || "").toLowerCase().trim();

  if (rawType === "ecommerce" || rawType === "b2c" || rawMode === "website") {
    return "ecommerce";
  }
  if (rawType === "training" || rawType.includes("train")) {
    return "training";
  }
  if (
    rawType === "projects" ||
    rawType === "b2b" ||
    rawType.includes("project") ||
    rawType === "academic"
  ) {
    return "projects";
  }
  return "all";
};

// --- Main Dashboard Component ---
const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Loading & View States
  const [loading, setLoading] = useState(true);
  const [activeSegment, setActiveSegment] = useState<SegmentType>("all");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Raw Data State
  const [rawEnquiries, setRawEnquiries] = useState<Enquiry[]>([]);
  const [rawBills, setRawBills] = useState<BillData[]>([]);
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [employeesByUid, setEmployeesByUid] = useState<Record<string, EmployeeDoc>>({});
  const [teamMemberUids, setTeamMemberUids] = useState<string[]>([]);

  // Period / Date Filters
  const [periodPreset, setPeriodPreset] = useState<"thisMonth" | "last30" | "all" | "custom">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Table State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(8);
  const [productStatusFilter, setProductStatusFilter] = useState<string>("all");
  const [tableSearchQuery, setTableSearchQuery] = useState("");

  // 1. Fetch Employees
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "employees"), (snap) => {
      const byUid: Record<string, EmployeeDoc> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as EmployeeDoc;
        const uid = (data.uid ?? d.id).toString();
        if (uid) {
          byUid[uid] = {
            ...data,
            employeeName: data.employeeName || data.name || uid,
          };
        }
      });
      setEmployeesByUid(byUid);
    });
    return () => unsub();
  }, []);

  // 2. Fetch Manager's Team
  useEffect(() => {
    if (user?.role === "manager" && user.uid) {
      const teamsRef = collection(db, "teams");
      const unsub = onSnapshot(teamsRef, (snapshot) => {
        let allStaffIds: string[] = [];
        snapshot.docs.forEach((d) => {
          const t = d.data();
          if (t.managerId === user.uid && t.staff && Array.isArray(t.staff)) {
            const ids = t.staff.map((m: any) => m.id);
            allStaffIds = [...allStaffIds, ...ids];
          }
        });
        setTeamMemberUids([...new Set(allStaffIds)]);
      });
      return () => unsub();
    }
  }, [user]);

  // 3. Fetch Stock Alerts from Products
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      collection(db, "products"),
      (snapshot) => {
        const alerts: StockAlert[] = [];
        snapshot.docs.forEach((d) => {
          const data = d.data();
          const currentStock = Number(data.totalQuantity || 0);
          const threshold = Number(data.lowStockThreshold || 10);

          if (currentStock === 0) {
            alerts.push({
              id: d.id,
              name: data.name || "Unknown Product",
              currentStock: 0,
              threshold,
              status: "out",
              category: data.category || "Uncategorized",
              sku: data.sku,
            });
          } else if (currentStock <= threshold) {
            alerts.push({
              id: d.id,
              name: data.name || "Unknown Product",
              currentStock,
              threshold,
              status: "low",
              category: data.category || "Uncategorized",
              sku: data.sku,
            });
          }
        });

        alerts.sort((a, b) => {
          if (a.status === "out" && b.status !== "out") return -1;
          if (a.status !== "out" && b.status === "out") return 1;
          return a.currentStock - b.currentStock;
        });

        setStockAlerts(alerts);
      },
      (err) => console.error("Error subscribing to products:", err)
    );
    return () => unsub();
  }, [user]);

  // 4. Fetch Enquiries & Bills in Real Time
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    // Enquiries Listener
    const unsubEnquiries = onSnapshot(
      collection(db, "enquiries"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Enquiry[];
        setRawEnquiries(list);
        setLoading(false);
      },
      (err) => {
        console.error("Enquiries snapshot error:", err);
        setLoading(false);
      }
    );

    // Bills Listener (for real invoices & revenue)
    const unsubBills = onSnapshot(
      collection(db, "bills"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as BillData[];
        setRawBills(list);
      },
      (err) => console.error("Bills snapshot error:", err)
    );

    return () => {
      unsubEnquiries();
      unsubBills();
    };
  }, [user]);

  // Handle Preset Changes
  const handleSelectPreset = (preset: "thisMonth" | "last30" | "all") => {
    setPeriodPreset(preset);
    const today = new Date();
    if (preset === "thisMonth") {
      setStartDate(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]);
      setEndDate(today.toISOString().split("T")[0]);
    } else if (preset === "last30") {
      const past = new Date();
      past.setDate(today.getDate() - 30);
      setStartDate(past.toISOString().split("T")[0]);
      setEndDate(today.toISOString().split("T")[0]);
    } else if (preset === "all") {
      setStartDate("");
      setEndDate("");
    }
  };

  const getEmployeeName = useCallback(
    (assignee: any): string => {
      if (!assignee) return "Unassigned";
      const emp = employeesByUid[assignee];
      return emp?.employeeName || assignee;
    },
    [employeesByUid]
  );

  // Date Check Helper
  const checkDateInRange = useCallback(
    (dateObj: any): boolean => {
      if (!startDate && !endDate) return true;
      const d = parseAnyDate(dateObj);
      if (!d) return true; // Include if date missing to avoid data loss

      if (startDate) {
        const start = new Date(startDate);
        if (d < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate + "T23:59:59");
        if (d > end) return false;
      }
      return true;
    },
    [startDate, endDate]
  );

  // Filter Enquiries by User Role & Selected Date Range
  const roleFilteredEnquiries = useMemo(() => {
    let list = rawEnquiries;

    if (user?.role === "manager") {
      const allowed = [...teamMemberUids, user.uid];
      list = list.filter((e) => e.assignedTo && allowed.includes(e.assignedTo));
    } else if (user?.role === "staff") {
      list = list.filter((e) => e.assignedTo === user.uid);
    }

    return list.filter((enq) => checkDateInRange(enq.createdAt || enq.paidDate));
  }, [rawEnquiries, user, teamMemberUids, checkDateInRange]);

  // Filter Bills by Date Range
  const filteredBills = useMemo(() => {
    return rawBills.filter((b) => checkDateInRange(b.createdAt || b.billDate || b.updatedAt));
  }, [rawBills, checkDateInRange]);

  // Compute Invoice Stats from real Bills
  const invoiceStats = useMemo(() => {
    let openCount = 0;
    let dueCount = 0;
    let dueAmount = 0;
    let paidBilledRevenue = 0;

    filteredBills.forEach((b) => {
      const isPaid = b.status === "paid" || b.paymentStatus === "completed";
      const isDropped =
        b.status === "dropped" ||
        b.paymentStatus === "refunded" ||
        (b as any).refunded === true;
      const amount = Number(b.totalAmount || 0);

      if (isPaid) {
        paidBilledRevenue += amount;
      } else if (!isDropped) {
        openCount++;
        dueCount++;
        dueAmount += amount;
      }
    });

    return { openCount, dueCount, dueAmount, paidBilledRevenue };
  }, [filteredBills]);

  // Main Processing of Dashboard Analytics & Segment Filtering
  const dashboardData = useMemo(() => {
    const stats: DashboardStats = {
      totalRevenue: invoiceStats.paidBilledRevenue, // Real baseline from billing
      openInvoices: invoiceStats.openCount,
      dueInvoices: invoiceStats.dueCount,
      totalEnquiries: 0,
      quoteEnquiries: 0,
      salesEnquiries: 0,
      droppedEnquiries: 0,
      openEnquiries: 0,
      conversionRate: 0,
      waitingPayment: invoiceStats.dueAmount,
    };

    const sourceCounts: Record<string, number> = {};
    const employeePerformance: Record<string, Record<string, number>> = {};
    const statusCounts: Record<string, number> = {};
    const dailyRevenue: Record<string, number> = {};

    const allSegments: SegmentType[] = ["all", "ecommerce", "training", "projects"];
    const employeeSegmentPerformance: Record<
      string,
      Record<SegmentType, { total: number; converted: number; dropped: number; convertedValue: number }>
    > = {};

    const enquiriesTableRows: EnquiryTableRow[] = [];

    roleFilteredEnquiries.forEach((enq) => {
      const status = String(enq.status || "open").toLowerCase().trim();
      const paymentStatus = String(enq.paymentStatus || "open").toLowerCase().trim();
      const empName = getEmployeeName(enq.assignedTo);
      const segment = resolveEnquirySegment(enq);
      const revenue = Number(enq.value) || 0;

      // Segment Filter Application:
      // If user selected a specific segment (e.g. 'ecommerce'), only include matching enquiries
      const matchesActiveSegment = activeSegment === "all" || segment === activeSegment;

      const isPaid = paymentStatus === "paid";
      const notPaid = paymentStatus === "not paid" || paymentStatus === "pending";
      const isSales = isPaid || status === "sales" || status === "delivered" || status === "dispatched";
      const isQuote = ["quote", "quotation"].includes(status);
      const isDropped = status === "dropped";

      // If matches active segment, update primary KPIs & charts
      if (matchesActiveSegment) {
        stats.totalEnquiries += 1;

        let chartStatus = "Open";
        if (isPaid || isSales) {
          stats.totalRevenue += revenue;
          chartStatus = "Converted";
          stats.salesEnquiries += 1;
        } else if (isQuote) {
          chartStatus = "Quote";
          stats.quoteEnquiries += 1;
        } else if (isDropped) {
          chartStatus = "Dropped";
          stats.droppedEnquiries += 1;
        } else {
          stats.openEnquiries += 1;
          chartStatus = "Open";
          if (notPaid) {
            stats.waitingPayment += revenue;
          }
        }

        statusCounts[chartStatus] = (statusCounts[chartStatus] || 0) + 1;

        // Daily Revenue Trend
        if (isPaid || isSales) {
          const rawD = parseAnyDate(enq.paidDate || enq.createdAt);
          const d = rawD && !isNaN(rawD.getTime()) ? rawD : new Date();
          let dateKey: string;
          try {
            dateKey = d.toISOString().split("T")[0];
          } catch {
            dateKey = "Recent";
          }
          dailyRevenue[dateKey] = (dailyRevenue[dateKey] || 0) + revenue;
        }

        // Source
        const source = String(enq.mode || enq.source || "Website");
        sourceCounts[source] = (sourceCounts[source] || 0) + 1;

        // Employee Monthly Leads
        const rawDate = parseAnyDate(enq.createdAt);
        const d = rawDate && !isNaN(rawDate.getTime()) ? rawDate : new Date();
        let monthYear: string;
        try {
          monthYear = d.toLocaleString("default", { month: "short", year: "numeric" });
        } catch {
          monthYear = "Current";
        }
        if (!employeePerformance[monthYear]) employeePerformance[monthYear] = {};
        employeePerformance[monthYear][empName] = (employeePerformance[monthYear][empName] || 0) + 1;

        // Table Rows
        let formattedDate = "N/A";
        try {
          formattedDate = d.toLocaleDateString("en-IN");
        } catch {
          formattedDate = "N/A";
        }
        const createdAtTimestamp = isNaN(d.getTime()) ? 0 : d.getTime();

        enquiriesTableRows.push({
          id: String(enq.id || ""),
          enqId: String(enq.enqId || enq.id || `ENQ-${enquiriesTableRows.length + 1}`),
          createdAt: formattedDate,
          createdAtTimestamp,
          customerName: resolveCustomerName(enq),
          value: revenue,
          assignedTo: String(enq.assignedTo || ""),
          employeeName: empName,
          status: String(enq.status || "Open"),
          productStatus: String(enq.status || "Open"),
          segment,
        });
      }

      // Leaderboard segment tracker (tracks across all segments)
      if (!employeeSegmentPerformance[empName]) {
        employeeSegmentPerformance[empName] = allSegments.reduce(
          (acc, seg) => ({
            ...acc,
            [seg]: { total: 0, converted: 0, dropped: 0, convertedValue: 0 },
          }),
          {} as any
        );
      }

      const segmentsToUpdate = [segment];
      if (segment !== "all") segmentsToUpdate.push("all");

      segmentsToUpdate.forEach((seg) => {
        employeeSegmentPerformance[empName][seg].total += 1;
        if (isSales || isPaid) {
          employeeSegmentPerformance[empName][seg].converted += 1;
          employeeSegmentPerformance[empName][seg].convertedValue += revenue;
        } else if (isDropped) {
          employeeSegmentPerformance[empName][seg].dropped += 1;
        }
      });
    });

    // Conversion Rate
    const totalClosed = stats.salesEnquiries + stats.droppedEnquiries;
    if (totalClosed > 0) {
      stats.conversionRate = (stats.salesEnquiries / totalClosed) * 100;
    }

    // Format Employee Performance
    const formattedEmployeePerformance: Record<string, Record<SegmentType, SegmentPerformance>> = {};
    Object.entries(employeeSegmentPerformance).forEach(([name, segments]) => {
      formattedEmployeePerformance[name] = {} as any;
      allSegments.forEach((seg) => {
        const { total, converted, dropped, convertedValue } = segments[seg];
        const closed = converted + dropped;
        formattedEmployeePerformance[name][seg] = {
          totalEnq: total,
          conversion: closed > 0 ? (converted / closed) * 100 : 0,
          salesValue: convertedValue,
        };
      });
    });

    const leadsBySource = Object.entries(sourceCounts).map(([name, value]) => ({ name, value }));

    const funnelOrder = ["Quote", "Converted", "Dropped", "Open"];
    const statusDistribution = Object.entries(statusCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => {
        const iA = funnelOrder.indexOf(a.name);
        const iB = funnelOrder.indexOf(b.name);
        return (iA === -1 ? 99 : iA) - (iB === -1 ? 99 : iB);
      });

    const allEmployeeNames = [
      ...new Set(Object.values(employeePerformance).flatMap((m) => Object.keys(m))),
    ].sort();

    const employeeLeadsChartData = Object.entries(employeePerformance).map(([month, leads]) => ({
      month,
      ...leads,
    }));

    const revenueTrend = Object.entries(dailyRevenue)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    enquiriesTableRows.sort((a, b) => b.createdAtTimestamp - a.createdAtTimestamp);

    return {
      stats,
      leadsBySource,
      employeeLeads: { chartData: employeeLeadsChartData, employeeNames: allEmployeeNames },
      statusDistribution,
      revenueTrend,
      employeeSegmentPerformance: formattedEmployeePerformance,
      enquiriesTableRows,
    };
  }, [
    roleFilteredEnquiries,
    invoiceStats,
    activeSegment,
    getEmployeeName,
  ]);

  const formatCurrency = (amount: number) =>
    `₹ ${Number(amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  // Table Filter & Search
  const filteredTableData = useMemo(() => {
    let rows = dashboardData.enquiriesTableRows;

    if (productStatusFilter !== "all") {
      rows = rows.filter(
        (r) => String(r.productStatus || "").toLowerCase() === productStatusFilter.toLowerCase()
      );
    }

    if (tableSearchQuery.trim()) {
      const q = tableSearchQuery.toLowerCase();
      rows = rows.filter(
        (r) =>
          String(r.customerName || "").toLowerCase().includes(q) ||
          String(r.enqId || "").toLowerCase().includes(q) ||
          String(r.employeeName || "").toLowerCase().includes(q) ||
          String(r.status || "").toLowerCase().includes(q)
      );
    }

    return rows;
  }, [dashboardData.enquiriesTableRows, productStatusFilter, tableSearchQuery]);

  const uniqueProductStatuses = useMemo(() => {
    const statuses = new Set<string>();
    dashboardData.enquiriesTableRows.forEach((row) => {
      if (row.productStatus) statuses.add(String(row.productStatus));
    });
    return Array.from(statuses).sort();
  }, [dashboardData.enquiriesTableRows]);

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredTableData.slice(indexOfFirstItem, indexOfLastItem);
  const totalFilteredPages = Math.ceil(filteredTableData.length / itemsPerPage) || 1;
  const paginate = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalFilteredPages)));

  // UI Helpers
  const segmentMap: Record<SegmentType, { name: string; icon: any; color: string; badge: string }> = {
    all: { name: "All Channels", icon: ClipboardList, color: "text-indigo-600", badge: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    ecommerce: { name: "E-commerce", icon: ShoppingCart, color: "text-teal-600", badge: "bg-teal-50 text-teal-700 border-teal-200" },
    training: { name: "Training", icon: GraduationCap, color: "text-orange-600", badge: "bg-orange-50 text-orange-700 border-orange-200" },
    projects: { name: "Projects & Academic", icon: Briefcase, color: "text-blue-600", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  };

  const getStatusBadge = (status: any) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("convert") || s.includes("paid") || s.includes("sale") || s.includes("deliver")) {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">Converted</span>;
    }
    if (s.includes("quote")) {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">Quote</span>;
    }
    if (s.includes("drop")) {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">Dropped</span>;
    }
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">{String(status || "Open")}</span>;
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-12">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-200/90 shadow-2xs">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                Business Dashboard
              </h1>
              <p className="text-xs text-gray-500">
                Logged in as <strong className="text-gray-800">{user?.name || user?.employeeName || user?.email}</strong> ({user?.role?.toUpperCase()})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Quick Actions Shortcuts */}
            <button
              onClick={() => navigate("/enquiries")}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Enquiry
            </button>

            <button
              onClick={() => navigate("/bills")}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              Billing
            </button>

            {/* Stock Alerts Bell */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-xl transition relative cursor-pointer"
              title="View Inventory Stock Alerts"
            >
              <Bell className="w-5 h-5" />
              {stockAlerts.length > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {stockAlerts.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto space-y-6">
        {/* ============ FILTER & PERIOD BAR ============ */}
        <section className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mr-1">
              <Filter className="w-3.5 h-3.5 text-blue-600" /> Period:
            </span>
            <button
              onClick={() => handleSelectPreset("all")}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                periodPreset === "all"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => handleSelectPreset("thisMonth")}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                periodPreset === "thisMonth"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => handleSelectPreset("last30")}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                periodPreset === "last30"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Last 30 Days
            </button>
          </div>

          {/* Date Picker Range */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Custom:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPeriodPreset("custom");
              }}
              className="px-2.5 py-1 text-xs bg-gray-50 border border-gray-300 rounded-lg text-gray-800"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPeriodPreset("custom");
              }}
              className="px-2.5 py-1 text-xs bg-gray-50 border border-gray-300 rounded-lg text-gray-800"
            />
          </div>
        </section>

        {/* ============ SEGMENT FILTER TABS (E-COMMERCE, TRAINING, PROJECTS, ALL) ============ */}
        <section className="bg-white p-3 rounded-2xl shadow-xs border border-gray-200/90 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2">Channel:</span>
            {Object.entries(segmentMap).map(([key, { name, icon: Icon, color, badge }]) => {
              const isSelected = activeSegment === key;
              return (
                <button
                  key={key}
                  onClick={() => {
                    setActiveSegment(key as SegmentType);
                    setCurrentPage(1);
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    isSelected
                      ? `bg-blue-600 text-white shadow-xs`
                      : `bg-gray-50 text-gray-600 hover:bg-gray-100`
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{name}</span>
                </button>
              );
            })}
          </div>

          <span className="text-xs text-gray-500 font-medium px-2">
            Viewing: <strong className="text-gray-900">{segmentMap[activeSegment]?.name}</strong> ({dashboardData.stats.totalEnquiries} records)
          </span>
        </section>

        {loading ? (
          <div className="flex flex-col justify-center items-center h-80 bg-white rounded-2xl border border-gray-200">
            <RefreshCw className="w-10 h-10 animate-spin text-blue-600 mb-3" />
            <p className="text-sm font-semibold text-gray-600">Loading business analytics...</p>
          </div>
        ) : (
          <>
            {/* ============ PRIMARY KPI STAT CARDS ============ */}
            <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3.5">
              {/* Total Revenue */}
              <div
                onClick={() => navigate("/bills")}
                className="col-span-2 sm:col-span-3 lg:col-span-2 bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 hover:border-emerald-300 hover:shadow-sm transition cursor-pointer group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Revenue</span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <IndianRupee className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2.5">
                  <p className="text-2xl font-bold text-gray-900 tracking-tight">
                    {formatCurrency(dashboardData.stats.totalRevenue)}
                  </p>
                  <p className="text-[11px] text-emerald-600 mt-0.5 font-medium flex items-center gap-1">
                    Billed & Converted Sales <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </p>
                </div>
              </div>

              {/* Waiting Payment / Due */}
              <div
                onClick={() => navigate("/bills")}
                className="col-span-2 sm:col-span-3 lg:col-span-2 bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 hover:border-amber-300 hover:shadow-sm transition cursor-pointer group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Waiting Payment</span>
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2.5">
                  <p className="text-2xl font-bold text-amber-600 tracking-tight">
                    {formatCurrency(dashboardData.stats.waitingPayment)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5 font-medium">Pending collection</p>
                </div>
              </div>

              {/* Total Enquiries */}
              <div
                onClick={() => navigate("/enquiries")}
                className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 hover:border-blue-300 hover:shadow-sm transition cursor-pointer group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Enquiries</span>
                  <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <ClipboardList className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="mt-2">
                  <p className="text-xl font-bold text-gray-900">{dashboardData.stats.totalEnquiries}</p>
                  <p className="text-[10px] text-blue-600 font-semibold mt-0.5">Total Received</p>
                </div>
              </div>

              {/* Conversion Rate */}
              <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Conversion</span>
                  <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                    <TrendingUp className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="mt-2">
                  <p className="text-xl font-bold text-purple-700">
                    {dashboardData.stats.conversionRate.toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5">Closed conversion</p>
                </div>
              </div>

              {/* Converted / Sales */}
              <div
                onClick={() => navigate("/enquiries")}
                className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 hover:border-teal-300 hover:shadow-sm transition cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Converted</span>
                  <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                    <CheckCircle className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="mt-2">
                  <p className="text-xl font-bold text-teal-600">{dashboardData.stats.salesEnquiries}</p>
                  <p className="text-[10px] text-teal-700 font-semibold mt-0.5">Sales orders</p>
                </div>
              </div>

              {/* Dropped */}
              <div
                onClick={() => navigate("/dropped")}
                className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 hover:border-rose-300 hover:shadow-sm transition cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Dropped</span>
                  <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                    <XCircle className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="mt-2">
                  <p className="text-xl font-bold text-rose-600">{dashboardData.stats.droppedEnquiries}</p>
                  <p className="text-[10px] text-rose-500 font-semibold mt-0.5">Lost leads</p>
                </div>
              </div>
            </section>

            {/* Quick Links Hub: Inventory, Bills, P&L */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div
                onClick={() => navigate("/inventory")}
                className="p-4 bg-white rounded-2xl shadow-xs border border-gray-200/90 hover:border-blue-300 transition cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Inventory Health</h4>
                    <p className="text-xs text-gray-500">
                      {stockAlerts.length > 0 ? (
                        <span className="text-rose-600 font-semibold">{stockAlerts.length} items need attention</span>
                      ) : (
                        "All products sufficiently stocked"
                      )}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
              </div>

              <div
                onClick={() => navigate("/bills")}
                className="p-4 bg-white rounded-2xl shadow-xs border border-gray-200/90 hover:border-emerald-300 transition cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Invoices & Billing</h4>
                    <p className="text-xs text-gray-500">
                      {dashboardData.stats.openInvoices} open / due invoices
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
              </div>

              <div
                onClick={() => navigate("/pnl")}
                className="p-4 bg-white rounded-2xl shadow-xs border border-gray-200/90 hover:border-purple-300 transition cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Profit & Loss (P&L)</h4>
                    <p className="text-xs text-gray-500">COGS, Wastage & Net Margins</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </section>

            {/* ============ CHARTS SECTION ============ */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Leads by Source */}
              <div className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-gray-500" />
                    <h3 className="font-bold text-sm text-gray-800">Leads by Acquisition Source</h3>
                  </div>
                  <span className="text-xs text-gray-400 font-medium">Channel share</span>
                </div>
                {dashboardData.leadsBySource.length > 0 ? (
                  <div className="w-full h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dashboardData.leadsBySource}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={renderCustomizedLabel}
                          outerRadius={80}
                          dataKey="value"
                        >
                          {dashboardData.leadsBySource.map((_, idx) => (
                            <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: any) => [`${v} leads`, "Count"]} />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[240px] flex items-center justify-center text-gray-400 text-xs">
                    No lead source data available for this selection.
                  </div>
                )}
              </div>

              {/* Status Funnel */}
              <div className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Filter className="w-5 h-5 text-gray-500" />
                    <h3 className="font-bold text-sm text-gray-800">Enquiry Status Funnel</h3>
                  </div>
                  <span className="text-xs text-gray-400 font-medium">Pipeline volume</span>
                </div>
                {dashboardData.statusDistribution.length > 0 ? (
                  <div className="w-full h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dashboardData.statusDistribution} layout="vertical" margin={{ left: 10, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: any) => [`${v} enquiries`, "Count"]} />
                        <Bar dataKey="value" barSize={28} radius={[0, 8, 8, 0]}>
                          {dashboardData.statusDistribution.map((_, idx) => (
                            <Cell key={`funnel-${idx}`} fill={COLORS[idx % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[240px] flex items-center justify-center text-gray-400 text-xs">
                    No pipeline records found.
                  </div>
                )}
              </div>

              {/* Employee Leads Comparison */}
              <div className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-gray-500" />
                    <h3 className="font-bold text-sm text-gray-800">
                      {user?.role === "manager" ? "Team Monthly Leads Comparison" : "Monthly Leads by Assigned Staff"}
                    </h3>
                  </div>
                  <span className="text-xs text-gray-400 font-medium">Monthly trend</span>
                </div>
                {dashboardData.employeeLeads.chartData.length > 0 ? (
                  <div className="w-full h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dashboardData.employeeLeads.chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        {dashboardData.employeeLeads.employeeNames.map((name, idx) => (
                          <Bar key={name} dataKey={name} fill={COLORS[idx % COLORS.length]} radius={[4, 4, 0, 0]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[240px] flex items-center justify-center text-gray-400 text-xs">
                    No monthly staff comparison data available.
                  </div>
                )}
              </div>

              {/* Daily Revenue Trend */}
              <div className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <LineChartIcon className="w-5 h-5 text-emerald-600" />
                    <h3 className="font-bold text-sm text-gray-800">Daily Revenue Performance</h3>
                  </div>
                  <span className="text-xs text-gray-400 font-medium">Realized sales</span>
                </div>
                {dashboardData.revenueTrend.length > 0 ? (
                  <div className="w-full h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dashboardData.revenueTrend}>
                        <defs>
                          <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `₹${v}`} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: any) => [formatCurrency(v), "Revenue"]} />
                        <Area type="monotone" dataKey="revenue" stroke="#10B981" fillOpacity={1} fill="url(#revenueGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[240px] flex items-center justify-center text-gray-400 text-xs">
                    No realized daily revenue data in this period.
                  </div>
                )}
              </div>
            </section>

            {/* ============ EMPLOYEE PERFORMANCE TABLE ============ */}
            {(user.role === "admin" || user.role === "manager") && (
              <section className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ListOrdered className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-bold text-sm text-gray-800">
                      Team Performance Leaderboard ({segmentMap[activeSegment]?.name})
                    </h3>
                  </div>
                  <span className="text-xs text-gray-400 font-medium">Ranked by Converted Value</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                        <th className="py-3 px-4">Rank / Employee</th>
                        <th className="py-3 px-3 text-right">Total Enquiries</th>
                        <th className="py-3 px-3 text-right">Sales Value</th>
                        <th className="py-3 px-4 text-right">Conversion %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {Object.keys(dashboardData.employeeSegmentPerformance).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-gray-400">
                            No team performance records available.
                          </td>
                        </tr>
                      ) : (
                        Object.entries(dashboardData.employeeSegmentPerformance)
                          .map(([empName, segs]) => {
                            const data = (segs as any)[activeSegment] || (segs as any).all;
                            return { name: empName, ...data };
                          })
                          .filter((r) => r.totalEnq > 0)
                          .sort((a, b) => b.salesValue - a.salesValue)
                          .map((row, idx) => (
                            <tr key={row.name} className="hover:bg-gray-50/80 transition">
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
                                <span>{row.name}</span>
                              </td>
                              <td className="py-3 px-3 text-right font-semibold text-gray-700">
                                {row.totalEnq}
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-gray-900">
                                {formatCurrency(row.salesValue)}
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-teal-600">
                                {row.conversion.toFixed(1)}%
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ============ ENQUIRIES LIST TABLE ============ */}
            <section className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-blue-600" />
                  <div>
                    <h3 className="font-bold text-sm text-gray-800">Recent Enquiries</h3>
                    <p className="text-xs text-gray-400">
                      Showing {filteredTableData.length} records in this view
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Search Bar */}
                  <div className="relative min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={tableSearchQuery}
                      onChange={(e) => {
                        setTableSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="Search customer, ID, staff..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  {/* Status Filter */}
                  <select
                    value={productStatusFilter}
                    onChange={(e) => {
                      setProductStatusFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl text-gray-700 font-semibold"
                  >
                    <option value="all">All Statuses</option>
                    {uniqueProductStatuses.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => navigate("/enquiries")}
                    className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition flex items-center gap-1 cursor-pointer"
                  >
                    <span>Full CRM</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {filteredTableData.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-xs">
                  No enquiries match the current filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                        <th className="py-3 px-4">Enquiry ID</th>
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-4">Customer / Organization</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Value</th>
                        <th className="py-3 px-4">Assigned Staff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {currentItems.map((row) => (
                        <tr
                          key={row.id}
                          onClick={() => navigate("/enquiries")}
                          className="hover:bg-blue-50/40 cursor-pointer transition"
                          title="Click to view in CRM"
                        >
                          <td className="py-3 px-4 font-mono font-bold text-blue-600">
                            {row.enqId}
                          </td>
                          <td className="py-3 px-3 text-gray-500 whitespace-nowrap">
                            {row.createdAt}
                          </td>
                          <td className="py-3 px-4 font-medium text-gray-900 max-w-[200px] truncate">
                            {row.customerName}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {getStatusBadge(row.status)}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-gray-900 whitespace-nowrap">
                            {formatCurrency(row.value)}
                          </td>
                          <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                            {row.employeeName}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Table Pagination */}
              {totalFilteredPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs text-gray-500">
                  <span>
                    Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredTableData.length)} of {filteredTableData.length} records
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => paginate(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 rounded-lg"
                    >
                      Prev
                    </button>
                    <span className="px-2 font-bold text-gray-800">
                      {currentPage} / {totalFilteredPages}
                    </span>
                    <button
                      onClick={() => paginate(currentPage + 1)}
                      disabled={currentPage === totalFilteredPages}
                      className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 rounded-lg"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* ============ STOCK ALERTS NOTIFICATION DRAWER ============ */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 bg-gradient-to-r from-rose-50 to-orange-50 border-b border-gray-200 flex items-center justify-between">
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
                onClick={() => setIsSidebarOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Alerts List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {stockAlerts.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-xs">
                  <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                  <p className="font-bold text-sm text-gray-800">All Stock Healthy</p>
                  <p className="mt-1">No low stock or out-of-stock items detected.</p>
                </div>
              ) : (
                stockAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    onClick={() => {
                      setIsSidebarOpen(false);
                      navigate("/inventory");
                    }}
                    className={`p-3.5 rounded-xl border transition cursor-pointer hover:shadow-xs flex items-start justify-between gap-3 ${
                      alert.status === "out"
                        ? "bg-rose-50/70 border-rose-200"
                        : "bg-amber-50/70 border-amber-200"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            alert.status === "out"
                              ? "bg-rose-200 text-rose-800"
                              : "bg-amber-200 text-amber-800"
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
                  setIsSidebarOpen(false);
                  navigate("/inventory");
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition cursor-pointer"
              >
                Go to Inventory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
