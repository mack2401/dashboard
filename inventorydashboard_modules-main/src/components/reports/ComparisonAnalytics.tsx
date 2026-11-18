import React, { useState, useMemo, useEffect } from "react";
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
  ChevronLeft,
  ChevronRight,
  Percent,
  CheckCircle,
  Clock,
  BarChart2,
  BarChart3,
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
import * as XLSX from "xlsx-js-style";
import { isSoldBill, isDroppedBill, getBillTotal, getBillDate } from "../../utils/billUtils";

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

const formatMonthShortYear = (monthIndex: number, year: number): string => {
  const shortName = (MONTH_NAMES[monthIndex] || "").slice(0, 3).toUpperCase();
  const shortYear = String(year).slice(-2);
  return `${shortName} '${shortYear}`;
};

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
  const [isOpen, setIsOpen] = useState<boolean>(false);

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

  // Pagination for MoM table
  const [momPage, setMomPage] = useState<number>(1);
  const momPageSize = 10;

  useEffect(() => {
    setMomPage(1);
  }, [m1Year, m1Month, m2Year, m2Month]);

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

    // 1. Extract from Bills (strictly sold bills only)
    bills.forEach((b) => {
      if (isDroppedBill(b)) return;
      if (!isSoldBill(b)) return;

      if (b.enquiryId) processedEnqIds.add(b.enquiryId);
      if (b.enquiryEnqId) processedEnqIds.add(b.enquiryEnqId);

      const d = getBillDate(b);
      if (!d || isNaN(d.getTime()) || d.getTime() === 0) return;

      const sellingPrice = getBillTotal(b);

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
      m1Label: formatMonthShortYear(m1Month, m1Year),
      m2Label: formatMonthShortYear(m2Month, m2Year),
    };
  }, [allSales, m1Year, m1Month, m2Year, m2Month]);

  const totalMomPages = Math.max(1, Math.ceil(momData.dailyRows.length / momPageSize));
  const momStartIndex = (momPage - 1) * momPageSize;
  const momEndIndex = Math.min(momStartIndex + momPageSize, momData.dailyRows.length);
  const paginatedMomRows = useMemo(() => {
    return momData.dailyRows.slice(momStartIndex, momEndIndex);
  }, [momData.dailyRows, momStartIndex, momEndIndex]);

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

  // Styled Excel Export Handler using xlsx-js-style
  const handleExportComparison = () => {
    const isMOM = comparisonMode === "mom";
    const wb = XLSX.utils.book_new();

    const titleText = isMOM
      ? `Values & Volume Comparison — Month-over-Month (MOM)`
      : `Values & Volume Comparison — Year-over-Year (YOY)`;

    const periodText = isMOM
      ? `Base Period: ${momData.m1Label} | Comparison Period: ${momData.m2Label} | Generated on ${new Date().toLocaleDateString("en-IN")}`
      : `Base Year: ${yoyData.y1Label} | Comparison Year: ${yoyData.y2Label} | Generated on ${new Date().toLocaleDateString("en-IN")}`;

    const headers = isMOM
      ? [
          "Day",
          `${momData.m1Label} Values (₹)`,
          `${momData.m2Label} Values (₹)`,
          "Value Diff (₹)",
          "Value %",
          `${momData.m1Label} Quantity`,
          `${momData.m2Label} Quantity`,
          "Quantity Diff",
          "Qty %",
        ]
      : [
          "Month",
          `${yoyData.y1Label} Values (₹)`,
          `${yoyData.y2Label} Values (₹)`,
          "Value Diff (₹)",
          "Value %",
          `${yoyData.y1Label} Quantity`,
          `${yoyData.y2Label} Quantity`,
          "Quantity Diff",
          "Qty %",
        ];

    const dataRows = isMOM
      ? momData.dailyRows.map((r) => [
          r.day,
          r.m1Price,
          r.m2Price,
          r.priceDiff,
          `${r.priceDiffPct >= 0 ? "+" : ""}${r.priceDiffPct.toFixed(1)}%`,
          r.m1Qty,
          r.m2Qty,
          r.qtyDiff,
          `${r.qtyDiffPct >= 0 ? "+" : ""}${r.qtyDiffPct.toFixed(1)}%`,
        ])
      : yoyData.monthlyRows.map((r) => [
          r.month,
          r.y1Price,
          r.y2Price,
          r.priceDiff,
          `${r.priceDiffPct >= 0 ? "+" : ""}${r.priceDiffPct.toFixed(1)}%`,
          r.y1Qty,
          r.y2Qty,
          r.qtyDiff,
          `${r.qtyDiffPct >= 0 ? "+" : ""}${r.qtyDiffPct.toFixed(1)}%`,
        ]);

    const totalRow = isMOM
      ? [
          "TOTAL / SUMMARY",
          momData.totalM1Price,
          momData.totalM2Price,
          momData.overallPriceDiff,
          `${momData.overallPricePct >= 0 ? "+" : ""}${momData.overallPricePct.toFixed(1)}%`,
          momData.totalM1Qty,
          momData.totalM2Qty,
          momData.overallQtyDiff,
          `${momData.overallQtyPct >= 0 ? "+" : ""}${momData.overallQtyPct.toFixed(1)}%`,
        ]
      : [
          "FULL YEAR TOTAL",
          yoyData.totalY1Price,
          yoyData.totalY2Price,
          yoyData.overallPriceDiff,
          `${yoyData.overallPricePct >= 0 ? "+" : ""}${yoyData.overallPricePct.toFixed(1)}%`,
          yoyData.totalY1Qty,
          yoyData.totalY2Qty,
          yoyData.overallQtyDiff,
          `${yoyData.overallQtyPct >= 0 ? "+" : ""}${yoyData.overallQtyPct.toFixed(1)}%`,
        ];

    const allSheetData = [
      [titleText, "", "", "", "", "", "", "", ""],
      [periodText, "", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", ""],
      headers,
      ...dataRows,
      totalRow,
    ];

    const ws = XLSX.utils.aoa_to_sheet(allSheetData);

    // Merge Title and Subtitle rows across 9 columns
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
    ];

    // Explicit neat column widths
    ws["!cols"] = [
      { wch: 14 }, // Day / Month
      { wch: 22 }, // Base Values
      { wch: 22 }, // Compare Values
      { wch: 18 }, // Value Diff
      { wch: 16 }, // Value % Change
      { wch: 18 }, // Base Qty
      { wch: 18 }, // Compare Qty
      { wch: 16 }, // Qty Diff
      { wch: 16 }, // Qty % Change
    ];

    // Explicit row heights
    const rowHeights = [
      { hpt: 30 }, // Title
      { hpt: 20 }, // Subtitle
      { hpt: 10 }, // Blank
      { hpt: 26 }, // Headers
    ];
    for (let i = 0; i < dataRows.length; i++) {
      rowHeights.push({ hpt: 20 });
    }
    rowHeights.push({ hpt: 24 }); // Total row
    ws["!rows"] = rowHeights;

    // Apply styles to Title (A1) & Subtitle (A2)
    if (ws["A1"]) {
      ws["A1"].s = {
        font: { sz: 14, bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "1E3A8A" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
    }
    if (ws["A2"]) {
      ws["A2"].s = {
        font: { sz: 10, bold: true, color: { rgb: "1E40AF" } },
        fill: { fgColor: { rgb: "DBEAFE" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
    }

    // Apply styles to Headers (Row 4, index 3)
    const headerFills = [
      "334155", // Col 0: Slate
      "1D4ED8", // Col 1: Deep Blue
      "1D4ED8", // Col 2: Deep Blue
      "4338CA", // Col 3: Indigo
      "4338CA", // Col 4: Indigo
      "047857", // Col 5: Emerald
      "047857", // Col 6: Emerald
      "0F766E", // Col 7: Teal
      "0F766E", // Col 8: Teal
    ];

    for (let c = 0; c < 9; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: 3, c });
      if (ws[cellRef]) {
        ws[cellRef].s = {
          font: { sz: 10, bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: headerFills[c] } },
          alignment: {
            horizontal: c === 0 ? "left" : c === 4 || c === 8 ? "center" : "right",
            vertical: "center",
          },
          border: {
            top: { style: "thin", color: { rgb: "94A3B8" } },
            bottom: { style: "thin", color: { rgb: "94A3B8" } },
            left: { style: "thin", color: { rgb: "94A3B8" } },
            right: { style: "thin", color: { rgb: "94A3B8" } },
          },
        };
      }
    }

    // Apply styles to Data Rows
    for (let r = 0; r < dataRows.length; r++) {
      const rowIndex = 4 + r;
      const isOdd = r % 2 === 1;
      const rowData = dataRows[r];
      const valDiff = Number(rowData[3]) || 0;
      const valPct = String(rowData[4] || "");
      const qtyDiff = Number(rowData[7]) || 0;
      const qtyPct = String(rowData[8] || "");

      for (let c = 0; c < 9; c++) {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c });
        if (!ws[cellRef]) continue;

        const baseBorder = {
          bottom: { style: "thin", color: { rgb: "E2E8F0" } },
          left: { style: "thin", color: { rgb: "E2E8F0" } },
          right: { style: "thin", color: { rgb: "E2E8F0" } },
        };

        if (c === 0) {
          ws[cellRef].s = {
            font: { sz: 10, bold: true, color: { rgb: "1E293B" } },
            fill: { fgColor: { rgb: isOdd ? "F8FAFC" : "FFFFFF" } },
            alignment: { horizontal: "left", vertical: "center" },
            border: baseBorder,
          };
        } else if (c === 1 || c === 2) {
          ws[cellRef].s = {
            font: { sz: 10, bold: c === 2, color: { rgb: "0F172A" } },
            fill: {
              fgColor: { rgb: c === 2 ? (isOdd ? "EFF6FF" : "F0F9FF") : isOdd ? "F8FAFC" : "FFFFFF" },
            },
            alignment: { horizontal: "right", vertical: "center" },
            border: baseBorder,
          };
        } else if (c === 3) {
          const isPos = valDiff > 0;
          const isNeg = valDiff < 0;
          ws[cellRef].s = {
            font: {
              sz: 10,
              bold: isPos || isNeg,
              color: { rgb: isPos ? "15803D" : isNeg ? "B91C1C" : "64748B" },
            },
            fill: {
              fgColor: { rgb: isPos ? "DCFCE7" : isNeg ? "FEE2E2" : isOdd ? "F8FAFC" : "FFFFFF" },
            },
            alignment: { horizontal: "right", vertical: "center" },
            border: baseBorder,
          };
        } else if (c === 4) {
          const isPos = valPct.startsWith("+");
          const isNeg = valPct.startsWith("-");
          ws[cellRef].s = {
            font: {
              sz: 10,
              bold: true,
              color: { rgb: isPos ? "15803D" : isNeg ? "B91C1C" : "64748B" },
            },
            fill: {
              fgColor: { rgb: isPos ? "DCFCE7" : isNeg ? "FEE2E2" : isOdd ? "F8FAFC" : "FFFFFF" },
            },
            alignment: { horizontal: "center", vertical: "center" },
            border: baseBorder,
          };
        } else if (c === 5 || c === 6) {
          ws[cellRef].s = {
            font: { sz: 10, bold: c === 6, color: { rgb: "0F172A" } },
            fill: {
              fgColor: { rgb: c === 6 ? (isOdd ? "F0FDF4" : "F7FEE7") : isOdd ? "F8FAFC" : "FFFFFF" },
            },
            alignment: { horizontal: "right", vertical: "center" },
            border: baseBorder,
          };
        } else if (c === 7) {
          const isPos = qtyDiff > 0;
          const isNeg = qtyDiff < 0;
          ws[cellRef].s = {
            font: {
              sz: 10,
              bold: isPos || isNeg,
              color: { rgb: isPos ? "15803D" : isNeg ? "B91C1C" : "64748B" },
            },
            fill: {
              fgColor: { rgb: isPos ? "DCFCE7" : isNeg ? "FEE2E2" : isOdd ? "F8FAFC" : "FFFFFF" },
            },
            alignment: { horizontal: "right", vertical: "center" },
            border: baseBorder,
          };
        } else if (c === 8) {
          const isPos = qtyPct.startsWith("+");
          const isNeg = qtyPct.startsWith("-");
          ws[cellRef].s = {
            font: {
              sz: 10,
              bold: true,
              color: { rgb: isPos ? "15803D" : isNeg ? "B91C1C" : "64748B" },
            },
            fill: {
              fgColor: { rgb: isPos ? "DCFCE7" : isNeg ? "FEE2E2" : isOdd ? "F8FAFC" : "FFFFFF" },
            },
            alignment: { horizontal: "center", vertical: "center" },
            border: baseBorder,
          };
        }
      }
    }

    // Apply styles to Total Row
    const totalRowIndex = 4 + dataRows.length;
    for (let c = 0; c < 9; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: totalRowIndex, c });
      if (!ws[cellRef]) continue;

      const totalBorder = {
        top: { style: "medium", color: { rgb: "475569" } },
        bottom: { style: "double", color: { rgb: "0F172A" } },
        left: { style: "thin", color: { rgb: "CBD5E1" } },
        right: { style: "thin", color: { rgb: "CBD5E1" } },
      };

      ws[cellRef].s = {
        font: { sz: 11, bold: true, color: { rgb: "0F172A" } },
        fill: { fgColor: { rgb: "FEF3C7" } }, // Soft Amber
        alignment: {
          horizontal: c === 0 ? "left" : c === 4 || c === 8 ? "center" : "right",
          vertical: "center",
        },
        border: totalBorder,
      };
    }

    const sheetName = isMOM ? "MOM Comparison" : "YOY Comparison";
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const filename = isMOM
      ? `Values_Volume_MOM_${momData.m1Label.replace(/'/g, "").replace(/\s+/g, "_")}_vs_${momData.m2Label.replace(/'/g, "").replace(/\s+/g, "_")}.xlsx`
      : `Values_Volume_YOY_${yoyData.y1Label}_vs_${yoyData.y2Label}.xlsx`;

    XLSX.writeFile(wb, filename);
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

  const renderDiffBadge = (diffVal: number, isCurrency: boolean = false) => {
    if (diffVal > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 font-bold text-emerald-700">
          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          +{isCurrency ? formatINR(diffVal) : diffVal.toLocaleString("en-IN")}
        </span>
      );
    }
    if (diffVal < 0) {
      return (
        <span className="inline-flex items-center gap-0.5 font-bold text-rose-700">
          <ArrowDownRight className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          {isCurrency ? formatINR(diffVal) : diffVal.toLocaleString("en-IN")}
        </span>
      );
    }
    return (
      <span className="font-semibold text-gray-500">
        {isCurrency ? "₹0" : "0"}
      </span>
    );
  };

  const renderPctBadge = (pctVal: number) => {
    if (pctVal > 0) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          +{pctVal.toFixed(1)}%
        </span>
      );
    }
    if (pctVal < 0) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
          {pctVal.toFixed(1)}%
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
    <section className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-4 sm:p-5 mb-6 font-sans transition-all">
      {/* Top Header Bar & Tabs */}
      <div 
        onClick={() => setIsOpen(prev => !prev)}
        className={`flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none ${
          isOpen ? "pb-5 border-b border-gray-100" : ""
        }`}
      >
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
                Values & Volume Comparison
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(prev => !prev);
            }}
            className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
            title={isOpen ? "Collapse section" : "Expand section"}
          >
            <ChevronDown className={`w-5 h-5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        <div className="flex items-center gap-2.5 self-end md:self-auto">
          {isOpen && (
            <div className="flex flex-wrap items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
              {/* MOM / YOY Switcher Tabs */}
              <div className="bg-gray-100 p-1 rounded-xl flex items-center border border-gray-200/80">
                <button
                  type="button"
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
                  type="button"
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

              {/* Export to Excel - Darkened Button Option */}
              <button
                type="button"
                onClick={handleExportComparison}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 border border-slate-950 shadow-md shadow-slate-900/25 transition-all cursor-pointer hover:scale-102 active:scale-98"
                title="Download comparison report to formatted Excel spreadsheet"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Export Excel</span>
              </button>
            </div>
          )}

          {/* Expand/Collapse Chevron Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(prev => !prev);
            }}
            className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
            title={isOpen ? "Collapse section" : "Expand section"}
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="animate-in fade-in duration-200">

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
          {/* Values / Revenue KPI */}
          <div className="bg-gradient-to-br from-blue-50/60 to-white p-4 rounded-xl border border-blue-100 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Total Values
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
              Avg Daily Values
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
              Annual Values
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

      {/* Comprehensive Comparison Data Table (Placed ABOVE the graph) */}
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs mb-6">
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
                  <th className="py-3 px-3 text-right">{momData.m1Label} Values</th>
                  <th className="py-3 px-3 text-right bg-blue-50/60 text-blue-900">
                    {momData.m2Label} Values
                  </th>
                  <th className="py-3 px-3 text-right">Value Diff (₹)</th>
                  <th className="py-3 px-3 text-center bg-blue-50/30 text-blue-900">Value %</th>
                  <th className="py-3 px-3 text-right">{momData.m1Label} Qty</th>
                  <th className="py-3 px-3 text-right bg-emerald-50/60 text-emerald-900">
                    {momData.m2Label} Qty
                  </th>
                  <th className="py-3 px-3 text-right">Qty Diff</th>
                  <th className="py-3 px-3 text-center bg-emerald-50/30 text-emerald-900">Qty %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {paginatedMomRows.map((row) => (
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
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {renderDiffBadge(row.priceDiff, true)}
                    </td>
                    <td className="py-2.5 px-3 text-center tabular-nums bg-blue-50/10">
                      {renderPctBadge(row.priceDiffPct)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-600 font-medium tabular-nums">
                      {row.m1Qty.toLocaleString("en-IN")}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-gray-900 tabular-nums bg-emerald-50/20">
                      {row.m2Qty.toLocaleString("en-IN")}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {renderDiffBadge(row.qtyDiff, false)}
                    </td>
                    <td className="py-2.5 px-3 text-center tabular-nums bg-emerald-50/10">
                      {renderPctBadge(row.qtyDiffPct)}
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
                  <td className="py-3 px-3 text-right tabular-nums text-xs">
                    {renderDiffBadge(momData.overallPriceDiff, true)}
                  </td>
                  <td className="py-3 px-3 text-center tabular-nums text-xs bg-blue-100/30">
                    {renderPctBadge(momData.overallPricePct)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-xs">
                    {momData.totalM1Qty.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-xs text-emerald-700 bg-emerald-100/50">
                    {momData.totalM2Qty.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-xs">
                    {renderDiffBadge(momData.overallQtyDiff, false)}
                  </td>
                  <td className="py-3 px-3 text-center tabular-nums text-xs bg-emerald-100/30">
                    {renderPctBadge(momData.overallQtyPct)}
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100 text-gray-700 font-bold uppercase tracking-wider text-[11px] border-b border-gray-200">
                <tr>
                  <th className="py-3 px-3.5">Month</th>
                  <th className="py-3 px-3 text-right">{yoyData.y1Label} Values</th>
                  <th className="py-3 px-3 text-right bg-indigo-50/60 text-indigo-900">
                    {yoyData.y2Label} Values
                  </th>
                  <th className="py-3 px-3 text-right">Value Diff (₹)</th>
                  <th className="py-3 px-3 text-center bg-indigo-50/30 text-indigo-900">Value %</th>
                  <th className="py-3 px-3 text-right">{yoyData.y1Label} Qty</th>
                  <th className="py-3 px-3 text-right bg-emerald-50/60 text-emerald-900">
                    {yoyData.y2Label} Qty
                  </th>
                  <th className="py-3 px-3 text-right">Qty Diff</th>
                  <th className="py-3 px-3 text-center bg-emerald-50/30 text-emerald-900">Qty %</th>
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
                    <td className="py-3 px-3 text-right tabular-nums">
                      {renderDiffBadge(row.priceDiff, true)}
                    </td>
                    <td className="py-3 px-3 text-center tabular-nums bg-indigo-50/10">
                      {renderPctBadge(row.priceDiffPct)}
                    </td>
                    <td className="py-3 px-3 text-right text-gray-600 font-medium tabular-nums">
                      {row.y1Qty.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-gray-900 tabular-nums bg-emerald-50/20">
                      {row.y2Qty.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      {renderDiffBadge(row.qtyDiff, false)}
                    </td>
                    <td className="py-3 px-3 text-center tabular-nums bg-emerald-50/10">
                      {renderPctBadge(row.qtyDiffPct)}
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
                  <td className="py-3 px-3 text-right tabular-nums text-xs">
                    {renderDiffBadge(yoyData.overallPriceDiff, true)}
                  </td>
                  <td className="py-3 px-3 text-center tabular-nums text-xs bg-indigo-100/30">
                    {renderPctBadge(yoyData.overallPricePct)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-xs">
                    {yoyData.totalY1Qty.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-xs text-emerald-700 bg-emerald-100/50">
                    {yoyData.totalY2Qty.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-xs">
                    {renderDiffBadge(yoyData.overallQtyDiff, false)}
                  </td>
                  <td className="py-3 px-3 text-center tabular-nums text-xs bg-emerald-100/30">
                    {renderPctBadge(yoyData.overallQtyPct)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {comparisonMode === "mom" && momData.dailyRows.length > momPageSize && (
          <div className="p-3 px-4 border-t border-gray-200 bg-slate-50 flex items-center justify-between text-xs text-gray-500">
            <span>Showing {momStartIndex + 1}-{momEndIndex} of {momData.dailyRows.length} days</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setMomPage((p) => Math.max(p - 1, 1))}
                disabled={momPage === 1}
                className="px-2.5 py-1 bg-white border border-gray-300 rounded-md text-[11px] font-semibold hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
              >
                Prev
              </button>
              <span className="text-[11px] font-bold px-2">{momPage} of {totalMomPages}</span>
              <button
                onClick={() => setMomPage((p) => Math.min(p + 1, totalMomPages))}
                disabled={momPage === totalMomPages}
                className="px-2.5 py-1 bg-white border border-gray-300 rounded-md text-[11px] font-semibold hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Visual Chart Comparison (Brought BELOW the table) */}
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

          {/* Toggle between Values and Quantity Chart */}
          <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-gray-200">
            <button
              onClick={() => setChartMetric("price")}
              className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                chartMetric === "price"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Values (₹)
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
                  name={`${momData.m1Label} (${chartMetric === "price" ? "Values ₹" : "Qty"})`}
                  stroke="#3B82F6"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  fillOpacity={1}
                  fill="url(#m1Color)"
                />
                <Area
                  type="monotone"
                  dataKey={chartMetric === "price" ? "m2Price" : "m2Qty"}
                  name={`${momData.m2Label} (${chartMetric === "price" ? "Values ₹" : "Qty"})`}
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
                  name={`${yoyData.y1Label} (${chartMetric === "price" ? "Values ₹" : "Qty"})`}
                  fill="#94A3B8"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey={chartMetric === "price" ? "y2Price" : "y2Qty"}
                  name={`${yoyData.y2Label} (${chartMetric === "price" ? "Values ₹" : "Qty"})`}
                  fill="#6366F1"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      </div>
      )}
    </section>
  );
}

