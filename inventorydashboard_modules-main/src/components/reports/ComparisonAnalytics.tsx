import React, { useState, useMemo } from "react";
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  Layers,
  ShoppingBag,
  IndianRupee,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Percent,
  CheckCircle,
  Clock,
  BarChart2,
  LineChart as LineChartIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import * as XLSX from "xlsx";

interface ComparisonAnalyticsProps {
  bills: any[];
  enquiries: any[];
  user: any;
}

interface NormalizedSale {
  id: string;
  date: Date;
  sellingPrice: number;
  quantity: number;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const parseDateSafely = (dateVal: any): Date | null => {
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

const formatINR = (val: number): string =>
  `₹${Number(val || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

export default function ComparisonAnalytics({
  bills,
  enquiries,
  user,
}: ComparisonAnalyticsProps) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // View state: MOM vs YOY
  const [comparisonMode, setComparisonMode] = useState<"mom" | "yoy">("mom");
  const [chartMetric, setChartMetric] = useState<"price" | "quantity">("price");

  // MOM Controls: Month 1 (Base) and Month 2 (Comparison)
  // Default Month 2 = Current Month, Month 1 = Previous Month
  const prevMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  const [m1Year, setM1Year] = useState<number>(prevMonthYear);
  const [m1Month, setM1Month] = useState<number>(prevMonthIndex);

  const [m2Year, setM2Year] = useState<number>(currentYear);
  const [m2Month, setM2Month] = useState<number>(currentMonth);

  // YOY Controls: Year 1 (Base) and Year 2 (Comparison)
  // Default Year 2 = Current Year, Year 1 = Previous Year
  const [y1Year, setY1Year] = useState<number>(currentYear - 1);
  const [y2Year, setY2Year] = useState<number>(currentYear);

  // Available Years extracted from data + current/past years
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([
      currentYear,
      currentYear - 1,
      currentYear - 2,
    ]);

    const addDateYears = (arr: any[]) => {
      arr.forEach((item) => {
        const raw = item.billDate || item.createdAt || item.paidDate;
        const d = parseDateSafely(raw);
        if (d) yearsSet.add(d.getFullYear());
      });
    };

    addDateYears(bills);
    addDateYears(enquiries);

    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [bills, enquiries, currentYear]);

  // Extract all normalized sales records (deduplicating linked bills and enquiries)
  const allSales = useMemo(() => {
    const salesList: NormalizedSale[] = [];
    const processedEnqIds = new Set<string>();

    // 1. Extract from Bills
    bills.forEach((b) => {
      const isDroppedOrRefunded =
        b.status === "dropped" ||
        b.paymentStatus === "refunded" ||
        b.refunded === true ||
        (typeof b.paymentSubStatus === "string" &&
          b.paymentSubStatus.toLowerCase().includes("refund")) ||
        (typeof b.enquiryStatus === "string" &&
          b.enquiryStatus.toLowerCase() === "dropped");
      if (isDroppedOrRefunded) return;

      if (b.enquiryId) processedEnqIds.add(b.enquiryId);
      if (b.enquiryEnqId) processedEnqIds.add(b.enquiryEnqId);

      const d = parseDateSafely(b.billDate || b.createdAt || b.updatedAt);
      if (!d) return;

      const subtotal = Number(b.subtotal || b.taxableValue || 0);
      const cgst = Number(b.cgst || 0);
      const sgst = Number(b.sgst || 0);
      const igst = Number(b.igst || 0);
      const shipping = Number(b.shippingCharges || 0);
      const sellingPrice = Number(
        b.totalAmount !== undefined && b.totalAmount !== null
          ? b.totalAmount
          : subtotal + cgst + sgst + igst + shipping
      );

      // Extract item quantities
      let itemsList: any[] = b.items;
      if (typeof itemsList === "string") {
        try {
          itemsList = JSON.parse(itemsList);
        } catch {
          itemsList = [];
        }
      }
      if (!Array.isArray(itemsList) || itemsList.length === 0) {
        const alt = b.materials || b.products;
        if (Array.isArray(alt)) itemsList = alt;
        else if (typeof alt === "string") {
          try {
            itemsList = JSON.parse(alt);
          } catch {
            itemsList = [];
          }
        }
      }

      let qty = 0;
      if (Array.isArray(itemsList) && itemsList.length > 0) {
        itemsList.forEach((it) => {
          qty += Number(it.quantity) || 1;
        });
      } else {
        qty = 1;
      }

      salesList.push({
        id: b.id,
        date: d,
        sellingPrice,
        quantity: qty,
      });
    });

    // 2. Extract from Enquiries
    enquiries.forEach((enq) => {
      if (user?.role !== "admin" && user?.role !== "manager") {
        if (enq.assignedTo !== user?.uid && enq.createdBy !== user?.uid) return;
      }

      if (
        processedEnqIds.has(enq.id) ||
        (enq.enqId && processedEnqIds.has(enq.enqId))
      ) {
        return;
      }

      const pStatus = String(enq.paymentStatus || "").toLowerCase();
      const status = String(enq.status || "").toLowerCase();
      const isPaid = pStatus === "paid" || pStatus === "completed";
      const isApproved =
        status === "approved" ||
        status === "completed" ||
        status === "sales" ||
        status === "delivered";
      if (!isPaid && !isApproved) return;

      const d = parseDateSafely(enq.paidDate || enq.createdAt);
      if (!d) return;

      const sellingPrice = Number(enq.finalTotal || enq.value || 0);

      let itemsList: any[] = enq.materials;
      if (typeof itemsList === "string") {
        try {
          itemsList = JSON.parse(itemsList);
        } catch {
          itemsList = [];
        }
      }
      let qty = 0;
      if (Array.isArray(itemsList) && itemsList.length > 0) {
        itemsList.forEach((it) => {
          qty += Number(it.quantity) || 1;
        });
      } else {
        qty = 1;
      }

      salesList.push({
        id: enq.id,
        date: d,
        sellingPrice,
        quantity: qty,
      });
    });

    return salesList;
  }, [bills, enquiries, user]);

  // ==========================================
  // MOM COMPUTATION (Day-by-Day comparison for 2 months)
  // ==========================================
  const momData = useMemo(() => {
    // Determine days in each month
    const daysInM1 = new Date(m1Year, m1Month + 1, 0).getDate();
    const daysInM2 = new Date(m2Year, m2Month + 1, 0).getDate();
    const maxDays = Math.max(daysInM1, daysInM2);

    // Group sales by day
    const m1DaySales = new Map<number, { price: number; qty: number }>();
    const m2DaySales = new Map<number, { price: number; qty: number }>();

    allSales.forEach((s) => {
      const y = s.date.getFullYear();
      const m = s.date.getMonth();
      const d = s.date.getDate();

      if (y === m1Year && m === m1Month) {
        const cur = m1DaySales.get(d) || { price: 0, qty: 0 };
        m1DaySales.set(d, {
          price: cur.price + s.sellingPrice,
          qty: cur.qty + s.quantity,
        });
      }

      if (y === m2Year && m === m2Month) {
        const cur = m2DaySales.get(d) || { price: 0, qty: 0 };
        m2DaySales.set(d, {
          price: cur.price + s.sellingPrice,
          qty: cur.qty + s.quantity,
        });
      }
    });

    let totalM1Price = 0;
    let totalM2Price = 0;
    let totalM1Qty = 0;
    let totalM2Qty = 0;

    let growthDaysCount = 0;
    let declineDaysCount = 0;

    const dailyRows = [];

    for (let day = 1; day <= maxDays; day++) {
      const m1Record = m1DaySales.get(day) || { price: 0, qty: 0 };
      const m2Record = m2DaySales.get(day) || { price: 0, qty: 0 };

      const m1Price = m1Record.price;
      const m2Price = m2Record.price;
      const m1Qty = m1Record.qty;
      const m2Qty = m2Record.qty;

      totalM1Price += m1Price;
      totalM2Price += m2Price;
      totalM1Qty += m1Qty;
      totalM2Qty += m2Qty;

      // Price difference and percentage
      const priceDiff = m2Price - m1Price;
      let priceDiffPct = 0;
      if (m1Price > 0) {
        priceDiffPct = ((m2Price - m1Price) / m1Price) * 100;
      } else if (m2Price > 0) {
        priceDiffPct = 100;
      }

      // Quantity difference and percentage
      const qtyDiff = m2Qty - m1Qty;
      let qtyDiffPct = 0;
      if (m1Qty > 0) {
        qtyDiffPct = ((m2Qty - m1Qty) / m1Qty) * 100;
      } else if (m2Qty > 0) {
        qtyDiffPct = 100;
      }

      if (priceDiff > 0 || qtyDiff > 0) growthDaysCount++;
      else if (priceDiff < 0 || qtyDiff < 0) declineDaysCount++;

      dailyRows.push({
        day: `Day ${String(day).padStart(2, "0")}`,
        dayNumber: day,
        m1Price,
        m2Price,
        priceDiff,
        priceDiffPct,
        m1Qty,
        m2Qty,
        qtyDiff,
        qtyDiffPct,
      });
    }

    const overallPriceDiff = totalM2Price - totalM1Price;
    const overallPricePct =
      totalM1Price > 0
        ? ((totalM2Price - totalM1Price) / totalM1Price) * 100
        : totalM2Price > 0
        ? 100
        : 0;

    const overallQtyDiff = totalM2Qty - totalM1Qty;
    const overallQtyPct =
      totalM1Qty > 0
        ? ((totalM2Qty - totalM1Qty) / totalM1Qty) * 100
        : totalM2Qty > 0
        ? 100
        : 0;

    return {
      dailyRows,
      totalM1Price,
      totalM2Price,
      overallPriceDiff,
      overallPricePct,
      totalM1Qty,
      totalM2Qty,
      overallQtyDiff,
      overallQtyPct,
      growthDaysCount,
      declineDaysCount,
      m1Label: `${MONTH_NAMES[m1Month]} ${m1Year}`,
      m2Label: `${MONTH_NAMES[m2Month]} ${m2Year}`,
    };
  }, [allSales, m1Year, m1Month, m2Year, m2Month]);

  // ==========================================
  // YOY COMPUTATION (Month-by-Month comparison for 2 years)
  // ==========================================
  const yoyData = useMemo(() => {
    const y1MonthSales = new Map<number, { price: number; qty: number }>();
    const y2MonthSales = new Map<number, { price: number; qty: number }>();

    allSales.forEach((s) => {
      const y = s.date.getFullYear();
      const m = s.date.getMonth();

      if (y === y1Year) {
        const cur = y1MonthSales.get(m) || { price: 0, qty: 0 };
        y1MonthSales.set(m, {
          price: cur.price + s.sellingPrice,
          qty: cur.qty + s.quantity,
        });
      }

      if (y === y2Year) {
        const cur = y2MonthSales.get(m) || { price: 0, qty: 0 };
        y2MonthSales.set(m, {
          price: cur.price + s.sellingPrice,
          qty: cur.qty + s.quantity,
        });
      }
    });

    let totalY1Price = 0;
    let totalY2Price = 0;
    let totalY1Qty = 0;
    let totalY2Qty = 0;

    let bestMonthName = "N/A";
    let bestMonthVal = -1;

    const monthlyRows = [];

    for (let m = 0; m < 12; m++) {
      const y1Record = y1MonthSales.get(m) || { price: 0, qty: 0 };
      const y2Record = y2MonthSales.get(m) || { price: 0, qty: 0 };

      const y1Price = y1Record.price;
      const y2Price = y2Record.price;
      const y1Qty = y1Record.qty;
      const y2Qty = y2Record.qty;

      totalY1Price += y1Price;
      totalY2Price += y2Price;
      totalY1Qty += y1Qty;
      totalY2Qty += y2Qty;

      if (y2Price > bestMonthVal) {
        bestMonthVal = y2Price;
        bestMonthName = MONTH_NAMES[m];
      }

      const priceDiff = y2Price - y1Price;
      let priceDiffPct = 0;
      if (y1Price > 0) {
        priceDiffPct = ((y2Price - y1Price) / y1Price) * 100;
      } else if (y2Price > 0) {
        priceDiffPct = 100;
      }

      const qtyDiff = y2Qty - y1Qty;
      let qtyDiffPct = 0;
      if (y1Qty > 0) {
        qtyDiffPct = ((y2Qty - y1Qty) / y1Qty) * 100;
      } else if (y2Qty > 0) {
        qtyDiffPct = 100;
      }

      monthlyRows.push({
        month: MONTH_NAMES[m],
        monthShort: MONTH_NAMES[m].slice(0, 3),
        monthIndex: m,
        y1Price,
        y2Price,
        priceDiff,
        priceDiffPct,
        y1Qty,
        y2Qty,
        qtyDiff,
        qtyDiffPct,
      });
    }

    const overallPriceDiff = totalY2Price - totalY1Price;
    const overallPricePct =
      totalY1Price > 0
        ? ((totalY2Price - totalY1Price) / totalY1Price) * 100
        : totalY2Price > 0
        ? 100
        : 0;

    const overallQtyDiff = totalY2Qty - totalY1Qty;
    const overallQtyPct =
      totalY1Qty > 0
        ? ((totalY2Qty - totalY1Qty) / totalY1Qty) * 100
        : totalY2Qty > 0
        ? 100
        : 0;

    return {
      monthlyRows,
      totalY1Price,
      totalY2Price,
      overallPriceDiff,
      overallPricePct,
      totalY1Qty,
      totalY2Qty,
      overallQtyDiff,
      overallQtyPct,
      bestMonthName,
      y1Label: String(y1Year),
      y2Label: String(y2Year),
    };
  }, [allSales, y1Year, y2Year]);

  // Excel Export Handler
  const handleExportComparison = () => {
    if (comparisonMode === "mom") {
      const dataForExcel = momData.dailyRows.map((r) => ({
        Day: r.day,
        [`${momData.m1Label} Sales (₹)`]: r.m1Price,
        [`${momData.m2Label} Sales (₹)`]: r.m2Price,
        "Sales Difference (₹)": r.priceDiff,
        "Sales Difference (%)": `${r.priceDiffPct >= 0 ? "+" : ""}${r.priceDiffPct.toFixed(1)}%`,
        [`${momData.m1Label} Quantity`]: r.m1Qty,
        [`${momData.m2Label} Quantity`]: r.m2Qty,
        "Quantity Difference": r.qtyDiff,
        "Quantity Difference (%)": `${r.qtyDiffPct >= 0 ? "+" : ""}${r.qtyDiffPct.toFixed(1)}%`,
      }));

      // Add Total Row
      dataForExcel.push({
        Day: "TOTAL / SUMMARY",
        [`${momData.m1Label} Sales (₹)`]: momData.totalM1Price,
        [`${momData.m2Label} Sales (₹)`]: momData.totalM2Price,
        "Sales Difference (₹)": momData.overallPriceDiff,
        "Sales Difference (%)": `${momData.overallPricePct >= 0 ? "+" : ""}${momData.overallPricePct.toFixed(1)}%`,
        [`${momData.m1Label} Quantity`]: momData.totalM1Qty,
        [`${momData.m2Label} Quantity`]: momData.totalM2Qty,
        "Quantity Difference": momData.overallQtyDiff,
        "Quantity Difference (%)": `${momData.overallQtyPct >= 0 ? "+" : ""}${momData.overallQtyPct.toFixed(1)}%`,
      });

      const ws = XLSX.utils.json_to_sheet(dataForExcel);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "MOM Comparison");
      XLSX.writeFile(
        wb,
        `MOM_Comparison_${momData.m1Label.replace(/\s+/g, "_")}_vs_${momData.m2Label.replace(/\s+/g, "_")}.xlsx`
      );
    } else {
      const dataForExcel = yoyData.monthlyRows.map((r) => ({
        Month: r.month,
        [`${yoyData.y1Label} Sales (₹)`]: r.y1Price,
        [`${yoyData.y2Label} Sales (₹)`]: r.y2Price,
        "Sales Difference (₹)": r.priceDiff,
        "Sales Difference (%)": `${r.priceDiffPct >= 0 ? "+" : ""}${r.priceDiffPct.toFixed(1)}%`,
        [`${yoyData.y1Label} Quantity`]: r.y1Qty,
        [`${yoyData.y2Label} Quantity`]: r.y2Qty,
        "Quantity Difference": r.qtyDiff,
        "Quantity Difference (%)": `${r.qtyDiffPct >= 0 ? "+" : ""}${r.qtyDiffPct.toFixed(1)}%`,
      }));

      // Add Total Row
      dataForExcel.push({
        Month: "FULL YEAR TOTAL",
        [`${yoyData.y1Label} Sales (₹)`]: yoyData.totalY1Price,
        [`${yoyData.y2Label} Sales (₹)`]: yoyData.totalY2Price,
        "Sales Difference (₹)": yoyData.overallPriceDiff,
        "Sales Difference (%)": `${yoyData.overallPricePct >= 0 ? "+" : ""}${yoyData.overallPricePct.toFixed(1)}%`,
        [`${yoyData.y1Label} Quantity`]: yoyData.totalY1Qty,
        [`${yoyData.y2Label} Quantity`]: yoyData.totalY2Qty,
        "Quantity Difference": yoyData.overallQtyDiff,
        "Quantity Difference (%)": `${yoyData.overallQtyPct >= 0 ? "+" : ""}${yoyData.overallQtyPct.toFixed(1)}%`,
      });

      const ws = XLSX.utils.json_to_sheet(dataForExcel);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "YOY Comparison");
      XLSX.writeFile(
        wb,
        `YOY_Comparison_${yoyData.y1Label}_vs_${yoyData.y2Label}.xlsx`
      );
    }
  };

  const renderBadge = (diffVal: number, pctVal: number, isCurrency: boolean = false) => {
    if (diffVal > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <ArrowUpRight className="w-3 h-3 text-emerald-600" />
          +{isCurrency ? formatINR(diffVal) : diffVal.toLocaleString("en-IN")}{" "}
          <span className="opacity-80">({pctVal.toFixed(1)}%)</span>
        </span>
      );
    }
    if (diffVal < 0) {
      return (
        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
          <ArrowDownRight className="w-3 h-3 text-rose-600" />
          {isCurrency ? formatINR(diffVal) : diffVal.toLocaleString("en-IN")}{" "}
          <span className="opacity-80">({pctVal.toFixed(1)}%)</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
        0.0%
      </span>
    );
  };

  return (
    <section className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-5 sm:p-6 mb-6 font-sans">
      {/* Top Header Bar & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center shadow-xs">
            <ArrowUpDown className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
                Sales & Volume Comparison
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider">
                MOM & YOY
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Compare daily selling prices and quantities between months, or monthly trends across years.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* MOM / YOY Switcher Tabs */}
          <div className="bg-gray-100 p-1 rounded-xl flex items-center border border-gray-200/80">
            <button
              onClick={() => setComparisonMode("mom")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                comparisonMode === "mom"
                  ? "bg-white text-blue-600 shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Month-over-Month (MOM)</span>
            </button>
            <button
              onClick={() => setComparisonMode("yoy")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                comparisonMode === "yoy"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Year-over-Year (YOY)</span>
            </button>
          </div>

          {/* Export to Excel */}
          <button
            onClick={handleExportComparison}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer shadow-2xs"
            title="Download comparison report to Excel spreadsheet"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Control Pickers & Presets Bar */}
      <div className="my-5 p-4 bg-slate-50 rounded-xl border border-gray-200/70 flex flex-wrap items-center justify-between gap-4">
        {comparisonMode === "mom" ? (
          <>
            {/* MOM Selectors */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Base Month */}
              <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-gray-300 shadow-2xs">
                <span className="text-xs text-gray-500 font-semibold">Base Month:</span>
                <select
                  value={m1Month}
                  onChange={(e) => setM1Month(Number(e.target.value))}
                  className="text-xs font-bold text-gray-800 bg-transparent outline-none cursor-pointer"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  value={m1Year}
                  onChange={(e) => setM1Year(Number(e.target.value))}
                  className="text-xs font-bold text-gray-800 bg-transparent outline-none cursor-pointer border-l border-gray-200 pl-1.5"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              <span className="text-xs font-bold text-gray-400">vs</span>

              {/* Comparison Month */}
              <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-blue-400 shadow-2xs ring-1 ring-blue-500/20">
                <span className="text-xs text-blue-600 font-semibold">Compare Month:</span>
                <select
                  value={m2Month}
                  onChange={(e) => setM2Month(Number(e.target.value))}
                  className="text-xs font-bold text-gray-900 bg-transparent outline-none cursor-pointer"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  value={m2Year}
                  onChange={(e) => setM2Year(Number(e.target.value))}
                  className="text-xs font-bold text-gray-900 bg-transparent outline-none cursor-pointer border-l border-gray-200 pl-1.5"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* MOM Quick Shortcuts */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-400 font-medium">Quick:</span>
              <button
                onClick={() => {
                  setM2Year(currentYear);
                  setM2Month(currentMonth);
                  setM1Year(currentMonth === 0 ? currentYear - 1 : currentYear);
                  setM1Month(currentMonth === 0 ? 11 : currentMonth - 1);
                }}
                className="px-2.5 py-1 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 font-semibold cursor-pointer text-[11px]"
              >
                Current vs Last Month
              </button>
              <button
                onClick={() => {
                  setM2Year(currentYear);
                  setM2Month(currentMonth);
                  setM1Year(currentYear - 1);
                  setM1Month(currentMonth);
                }}
                className="px-2.5 py-1 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 font-semibold cursor-pointer text-[11px]"
              >
                Same Month Last Year
              </button>
            </div>
          </>
        ) : (
          <>
            {/* YOY Selectors */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Base Year */}
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-300 shadow-2xs">
                <span className="text-xs text-gray-500 font-semibold">Base Year:</span>
                <select
                  value={y1Year}
                  onChange={(e) => setY1Year(Number(e.target.value))}
                  className="text-xs font-bold text-gray-800 bg-transparent outline-none cursor-pointer"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              <span className="text-xs font-bold text-gray-400">vs</span>

              {/* Comparison Year */}
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-indigo-400 shadow-2xs ring-1 ring-indigo-500/20">
                <span className="text-xs text-indigo-600 font-semibold">Compare Year:</span>
                <select
                  value={y2Year}
                  onChange={(e) => setY2Year(Number(e.target.value))}
                  className="text-xs font-bold text-gray-900 bg-transparent outline-none cursor-pointer"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* YOY Quick Shortcuts */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-400 font-medium">Quick:</span>
              <button
                onClick={() => {
                  setY2Year(currentYear);
                  setY1Year(currentYear - 1);
                }}
                className="px-2.5 py-1 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 font-semibold cursor-pointer text-[11px]"
              >
                {currentYear} vs {currentYear - 1}
              </button>
              <button
                onClick={() => {
                  setY2Year(currentYear - 1);
                  setY1Year(currentYear - 2);
                }}
                className="px-2.5 py-1 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 font-semibold cursor-pointer text-[11px]"
              >
                {currentYear - 1} vs {currentYear - 2}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Summary KPI Cards */}
      {comparisonMode === "mom" ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-6">
          {/* Selling Price / Revenue KPI */}
          <div className="bg-gradient-to-br from-blue-50/60 to-white p-4 rounded-xl border border-blue-100 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Total Selling Price
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <div>
                <p className="text-xl font-bold text-gray-900 tracking-tight">
                  {formatINR(momData.totalM2Price)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  vs {formatINR(momData.totalM1Price)} ({momData.m1Label})
                </p>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-blue-100/60 flex items-center justify-between">
              <span className="text-xs text-gray-600 font-medium">Net Change:</span>
              {renderBadge(momData.overallPriceDiff, momData.overallPricePct, true)}
            </div>
          </div>

          {/* Quantity Sold KPI */}
          <div className="bg-gradient-to-br from-emerald-50/60 to-white p-4 rounded-xl border border-emerald-100 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Total Quantity Sold
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <div>
                <p className="text-xl font-bold text-gray-900 tracking-tight">
                  {momData.totalM2Qty.toLocaleString("en-IN")} <span className="text-xs font-medium text-gray-500">units</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  vs {momData.totalM1Qty.toLocaleString("en-IN")} units ({momData.m1Label})
                </p>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-emerald-100/60 flex items-center justify-between">
              <span className="text-xs text-gray-600 font-medium">Volume Change:</span>
              {renderBadge(momData.overallQtyDiff, momData.overallQtyPct, false)}
            </div>
          </div>

          {/* Average Daily Velocity */}
          <div className="bg-gradient-to-br from-amber-50/60 to-white p-4 rounded-xl border border-amber-100 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Avg Daily Selling Price
            </span>
            <div className="mt-2">
              <p className="text-xl font-bold text-gray-900 tracking-tight">
                {formatINR(momData.totalM2Price / (momData.dailyRows.length || 1))}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                vs {formatINR(momData.totalM1Price / (momData.dailyRows.length || 1))} / day
              </p>
            </div>
            <div className="mt-2.5 pt-2 border-t border-amber-100/60 flex items-center justify-between text-xs text-gray-600">
              <span>Avg Daily Units:</span>
              <span className="font-bold text-gray-900">
                {(momData.totalM2Qty / (momData.dailyRows.length || 1)).toFixed(1)} units/day
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
          {/* YOY Annual Revenue */}
          <div className="bg-gradient-to-br from-indigo-50/60 to-white p-4 rounded-xl border border-indigo-100 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Annual Sales Revenue
            </span>
            <div className="mt-2">
              <p className="text-xl font-bold text-gray-900 tracking-tight">
                {formatINR(yoyData.totalY2Price)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                vs {formatINR(yoyData.totalY1Price)} in {yoyData.y1Label}
              </p>
            </div>
            <div className="mt-2.5 pt-2 border-t border-indigo-100/60 flex items-center justify-between">
              <span className="text-xs text-gray-600 font-medium">Annual Growth:</span>
              {renderBadge(yoyData.overallPriceDiff, yoyData.overallPricePct, true)}
            </div>
          </div>

          {/* YOY Annual Volume */}
          <div className="bg-gradient-to-br from-emerald-50/60 to-white p-4 rounded-xl border border-emerald-100 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Annual Quantity Sold
            </span>
            <div className="mt-2">
              <p className="text-xl font-bold text-gray-900 tracking-tight">
                {yoyData.totalY2Qty.toLocaleString("en-IN")} <span className="text-xs font-medium text-gray-500">units</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                vs {yoyData.totalY1Qty.toLocaleString("en-IN")} units in {yoyData.y1Label}
              </p>
            </div>
            <div className="mt-2.5 pt-2 border-t border-emerald-100/60 flex items-center justify-between">
              <span className="text-xs text-gray-600 font-medium">Volume Growth:</span>
              {renderBadge(yoyData.overallQtyDiff, yoyData.overallQtyPct, false)}
            </div>
          </div>

          {/* Best Month in Year 2 */}
          <div className="bg-gradient-to-br from-purple-50/60 to-white p-4 rounded-xl border border-purple-100 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Peak Month ({yoyData.y2Label})
            </span>
            <div className="mt-2">
              <p className="text-xl font-bold text-purple-700 tracking-tight">
                {yoyData.bestMonthName}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Highest selling velocity of the year
              </p>
            </div>
            <div className="mt-2.5 pt-2 border-t border-purple-100/60 flex items-center justify-between text-xs text-gray-600">
              <span>Months Compared:</span>
              <span className="font-bold text-gray-900">12 Months</span>
            </div>
          </div>

          {/* Monthly Run-Rate */}
          <div className="bg-gradient-to-br from-amber-50/60 to-white p-4 rounded-xl border border-amber-100 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Monthly Average Run-Rate
            </span>
            <div className="mt-2">
              <p className="text-xl font-bold text-gray-900 tracking-tight">
                {formatINR(yoyData.totalY2Price / 12)} / mo
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                vs {formatINR(yoyData.totalY1Price / 12)} / mo ({yoyData.y1Label})
              </p>
            </div>
            <div className="mt-2.5 pt-2 border-t border-amber-100/60 flex items-center justify-between text-xs text-gray-600">
              <span>Avg Monthly Units:</span>
              <span className="font-bold text-gray-900">
                {(yoyData.totalY2Qty / 12).toFixed(0)} units/mo
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Visual Chart Comparison */}
      <div className="bg-slate-50/70 p-4 rounded-xl border border-gray-200/80 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-gray-800">
              {comparisonMode === "mom"
                ? `Day-by-Day Trend: ${momData.m1Label} vs ${momData.m2Label}`
                : `12-Month Trend: ${yoyData.y1Label} vs ${yoyData.y2Label}`}
            </h3>
          </div>

          {/* Toggle between Price and Quantity Chart */}
          <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-gray-200">
            <button
              onClick={() => setChartMetric("price")}
              className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                chartMetric === "price"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Selling Price (₹)
            </button>
            <button
              onClick={() => setChartMetric("quantity")}
              className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                chartMetric === "quantity"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Quantity (Units)
            </button>
          </div>
        </div>

        <div className="h-64 w-full">
          {comparisonMode === "mom" ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={momData.dailyRows}
                margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="m1Color" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="m2Color" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="dayNumber" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) =>
                    chartMetric === "price"
                      ? `₹${(v / 1000).toFixed(0)}k`
                      : Number(v).toLocaleString("en-IN")
                  }
                />
                <Tooltip
                  formatter={(val: any, name: any) => [
                    chartMetric === "price" ? formatINR(val) : `${val} units`,
                    name,
                  ]}
                  labelFormatter={(l) => `Day ${l}`}
                />
                <Legend verticalAlign="top" height={36} />
                <Area
                  type="monotone"
                  dataKey={chartMetric === "price" ? "m1Price" : "m1Qty"}
                  name={`${momData.m1Label} (${chartMetric === "price" ? "₹" : "Qty"})`}
                  stroke="#3B82F6"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  fillOpacity={1}
                  fill="url(#m1Color)"
                />
                <Area
                  type="monotone"
                  dataKey={chartMetric === "price" ? "m2Price" : "m2Qty"}
                  name={`${momData.m2Label} (${chartMetric === "price" ? "₹" : "Qty"})`}
                  stroke="#10B981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#m2Color)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={yoyData.monthlyRows}
                margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="monthShort" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) =>
                    chartMetric === "price"
                      ? `₹${(v / 1000).toFixed(0)}k`
                      : Number(v).toLocaleString("en-IN")
                  }
                />
                <Tooltip
                  formatter={(val: any, name: any) => [
                    chartMetric === "price" ? formatINR(val) : `${val} units`,
                    name,
                  ]}
                />
                <Legend verticalAlign="top" height={36} />
                <Bar
                  dataKey={chartMetric === "price" ? "y1Price" : "y1Qty"}
                  name={`${yoyData.y1Label} (${chartMetric === "price" ? "₹" : "Qty"})`}
                  fill="#94A3B8"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey={chartMetric === "price" ? "y2Price" : "y2Qty"}
                  name={`${yoyData.y2Label} (${chartMetric === "price" ? "₹" : "Qty"})`}
                  fill="#6366F1"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Comprehensive Comparison Data Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="p-3.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              {comparisonMode === "mom"
                ? `Day-by-Day Difference Table (${momData.m1Label} vs ${momData.m2Label})`
                : `12-Month Difference Table (${yoyData.y1Label} vs ${yoyData.y2Label})`}
            </span>
          </div>
          <span className="text-xs text-gray-500">
            {comparisonMode === "mom"
              ? `${momData.dailyRows.length} days analyzed`
              : "12 months analyzed"}
          </span>
        </div>

        <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
          {comparisonMode === "mom" ? (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100 text-gray-700 font-bold uppercase tracking-wider text-[11px] border-b border-gray-200">
                <tr>
                  <th className="py-3 px-3.5">Day</th>
                  <th className="py-3 px-3 text-right">{momData.m1Label} Sales</th>
                  <th className="py-3 px-3 text-right bg-blue-50/60 text-blue-900">
                    {momData.m2Label} Sales
                  </th>
                  <th className="py-3 px-3 text-center">Sales Diff (₹ & %)</th>
                  <th className="py-3 px-3 text-right">{momData.m1Label} Qty</th>
                  <th className="py-3 px-3 text-right bg-emerald-50/60 text-emerald-900">
                    {momData.m2Label} Qty
                  </th>
                  <th className="py-3 px-3 text-center">Qty Diff (Units & %)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {momData.dailyRows.map((row) => (
                  <tr
                    key={row.day}
                    className="hover:bg-blue-50/30 transition-colors"
                  >
                    <td className="py-2.5 px-3.5 font-bold text-gray-900 font-mono">
                      {row.day}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-600 font-medium tabular-nums">
                      {formatINR(row.m1Price)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-gray-900 tabular-nums bg-blue-50/20">
                      {formatINR(row.m2Price)}
                    </td>
                    <td className="py-2.5 px-3 text-center tabular-nums">
                      {renderBadge(row.priceDiff, row.priceDiffPct, true)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-600 font-medium tabular-nums">
                      {row.m1Qty.toLocaleString("en-IN")}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-gray-900 tabular-nums bg-emerald-50/20">
                      {row.m2Qty.toLocaleString("en-IN")}
                    </td>
                    <td className="py-2.5 px-3 text-center tabular-nums">
                      {renderBadge(row.qtyDiff, row.qtyDiffPct, false)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-slate-100 font-bold text-gray-900 border-t-2 border-gray-300">
                <tr>
                  <td className="py-3 px-3.5 uppercase tracking-wider text-xs">
                    TOTAL / SUMMARY
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-xs">
                    {formatINR(momData.totalM1Price)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-xs text-blue-700 bg-blue-100/50">
                    {formatINR(momData.totalM2Price)}
                  </td>
                  <td className="py-3 px-3 text-center tabular-nums text-xs">
                    {renderBadge(momData.overallPriceDiff, momData.overallPricePct, true)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-xs">
                    {momData.totalM1Qty.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-xs text-emerald-700 bg-emerald-100/50">
                    {momData.totalM2Qty.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-3 text-center tabular-nums text-xs">
                    {renderBadge(momData.overallQtyDiff, momData.overallQtyPct, false)}
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100 text-gray-700 font-bold uppercase tracking-wider text-[11px] border-b border-gray-200">
                <tr>
                  <th className="py-3 px-3.5">Month</th>
                  <th className="py-3 px-3 text-right">{yoyData.y1Label} Sales</th>
                  <th className="py-3 px-3 text-right bg-indigo-50/60 text-indigo-900">
                    {yoyData.y2Label} Sales
                  </th>
                  <th className="py-3 px-3 text-center">Sales Diff (₹ & %)</th>
                  <th className="py-3 px-3 text-right">{yoyData.y1Label} Qty</th>
                  <th className="py-3 px-3 text-right bg-emerald-50/60 text-emerald-900">
                    {yoyData.y2Label} Qty
                  </th>
                  <th className="py-3 px-3 text-center">Qty Diff (Units & %)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {yoyData.monthlyRows.map((row) => (
                  <tr
                    key={row.month}
                    className="hover:bg-indigo-50/30 transition-colors"
                  >
                    <td className="py-3 px-3.5 font-bold text-gray-900">
                      {row.month}
                    </td>
                    <td className="py-3 px-3 text-right text-gray-600 font-medium tabular-nums">
                      {formatINR(row.y1Price)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-gray-900 tabular-nums bg-indigo-50/20">
                      {formatINR(row.y2Price)}
                    </td>
                    <td className="py-3 px-3 text-center tabular-nums">
                      {renderBadge(row.priceDiff, row.priceDiffPct, true)}
                    </td>
                    <td className="py-3 px-3 text-right text-gray-600 font-medium tabular-nums">
                      {row.y1Qty.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-gray-900 tabular-nums bg-emerald-50/20">
                      {row.y2Qty.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 px-3 text-center tabular-nums">
                      {renderBadge(row.qtyDiff, row.qtyDiffPct, false)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-slate-100 font-bold text-gray-900 border-t-2 border-gray-300">
                <tr>
                  <td className="py-3 px-3.5 uppercase tracking-wider text-xs">
                    FULL YEAR TOTAL
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-xs">
                    {formatINR(yoyData.totalY1Price)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-xs text-indigo-700 bg-indigo-100/50">
                    {formatINR(yoyData.totalY2Price)}
                  </td>
                  <td className="py-3 px-3 text-center tabular-nums text-xs">
                    {renderBadge(yoyData.overallPriceDiff, yoyData.overallPricePct, true)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-xs">
                    {yoyData.totalY1Qty.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-xs text-emerald-700 bg-emerald-100/50">
                    {yoyData.totalY2Qty.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-3 text-center tabular-nums text-xs">
                    {renderBadge(yoyData.overallQtyDiff, yoyData.overallQtyPct, false)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

