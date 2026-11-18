import React from "react";
import { Calendar, X } from "lucide-react";

export type DatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_month"
  | "last_30_days"
  | "this_quarter"
  | "this_fy"
  | "custom";

export interface DateFilterPresetOption {
  value: DatePreset | string;
  label: string;
}

export interface DateFilterProps {
  preset: DatePreset | string;
  onPresetChange: (preset: any) => void;
  startDate?: string;
  onStartDateChange?: (date: string) => void;
  endDate?: string;
  onEndDateChange?: (date: string) => void;
  presets?: DateFilterPresetOption[];
  monthlyOptions?: string[];
  variant?: "select" | "pills";
  label?: string;
  showIcon?: boolean;
  onClear?: () => void;
  className?: string;
}

// Universal date parser for Date, Firestore Timestamp, ISO string, and epoch number
export function parseAnyDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val?.toDate === "function") {
    try {
      const d = val.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof val === "object" && typeof val?.seconds === "number") {
    return new Date(val.seconds * 1000);
  }
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// Unified date range matching engine across all modules
export function isDateInPresetRange(
  rawDate: any,
  preset: DatePreset | string,
  customStart?: string,
  customEnd?: string
): boolean {
  if (!preset || preset === "all") return true;

  const d = parseAnyDate(rawDate);
  if (!d) return false;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case "all":
      return true;

    case "today":
      return d >= startOfToday && d <= endOfToday;

    case "yesterday": {
      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);
      const endOfYesterday = new Date(endOfToday);
      endOfYesterday.setDate(endOfYesterday.getDate() - 1);
      return d >= startOfYesterday && d <= endOfYesterday;
    }

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
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return d >= startOfLastMonth && d <= endOfLastMonth;
    }

    case "last_30_days": {
      const thirtyDaysAgo = new Date(startOfToday);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return d >= thirtyDaysAgo;
    }

    case "this_quarter": {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const startOfQuarter = new Date(now.getFullYear(), currentQuarter * 3, 1);
      return d >= startOfQuarter;
    }

    case "this_fy": {
      // Indian Financial Year: April 1 to March 31
      const currentYear = now.getFullYear();
      const fyStart =
        now.getMonth() >= 3
          ? new Date(currentYear, 3, 1)
          : new Date(currentYear - 1, 3, 1);
      return d >= fyStart;
    }

    case "custom": {
      if (!customStart && !customEnd) return true;
      const start = customStart ? new Date(customStart) : new Date(0);
      start.setHours(0, 0, 0, 0);
      const end = customEnd ? new Date(customEnd) : new Date(2100, 0, 1);
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    }

    default: {
      // Monthly ledger check (e.g. "2024-03")
      if (typeof preset === "string" && preset.includes("-")) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        return `${yyyy}-${mm}` === preset;
      }
      return true;
    }
  }
}

export const DEFAULT_DATE_PRESETS: DateFilterPresetOption[] = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "this_fy", label: "This Financial Year (FY)" },
  { value: "custom", label: "Custom Date Range..." },
];

export const DateFilter: React.FC<DateFilterProps> = ({
  preset,
  onPresetChange,
  startDate = "",
  onStartDateChange,
  endDate = "",
  onEndDateChange,
  presets = DEFAULT_DATE_PRESETS,
  monthlyOptions = [],
  variant = "select",
  label = "Date Filter",
  showIcon = true,
  onClear,
  className = "",
}) => {
  const isCustom = preset === "custom";
  const hasActiveFilter = preset !== "all" || Boolean(startDate) || Boolean(endDate);

  const formatMonthLabel = (m: string) => {
    const [year, month] = m.split("-");
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return d.toLocaleString("en-IN", { month: "long", year: "numeric" });
  };

  // --- Variant 1: Segmented Pill Buttons (Used in Reports, Dashboards) ---
  if (variant === "pills") {
    return (
      <div className={`space-y-2.5 ${className}`}>
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#F5F6FC] rounded-xl border border-[#E1E5F0]">
          {presets.map((p) => {
            const isActive = preset === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => onPresetChange(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? "bg-gradient-to-r from-[#7889F5] to-[#293F70] text-white shadow-xs"
                    : "text-[#78839A] hover:text-[#1E315B] hover:bg-white/80"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Custom Date Range Row */}
        {isCustom && onStartDateChange && onEndDateChange && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs animate-in fade-in duration-150">
            <span className="text-[#78839A] font-medium">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="px-2.5 py-1 text-xs border border-[#E1E5F0] rounded-lg bg-white text-[#25324A] focus:outline-none focus:ring-1 focus:ring-[#7889F5]"
            />
            <span className="text-[#78839A] font-medium">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="px-2.5 py-1 text-xs border border-[#E1E5F0] rounded-lg bg-white text-[#25324A] focus:outline-none focus:ring-1 focus:ring-[#7889F5]"
            />
            {onClear && hasActiveFilter && (
              <button
                type="button"
                onClick={onClear}
                className="text-xs text-[#7889F5] hover:text-[#1E315B] font-semibold underline ml-1 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // --- Variant 2: Compact Select Dropdown (Default, used in BillTransactions, PNL) ---
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex items-center">
          {showIcon && (
            <Calendar className="w-3.5 h-3.5 text-[#78839A] absolute left-2.5 pointer-events-none" />
          )}
          <select
            value={preset}
            onChange={(e) => onPresetChange(e.target.value)}
            className={`text-xs font-semibold rounded-xl border border-[#E1E5F0] bg-white text-[#25324A] py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-[#7889F5] cursor-pointer shadow-2xs transition ${
              showIcon ? "pl-8" : "pl-3"
            } ${hasActiveFilter ? "border-[#7889F5]/60 bg-[#F0F0FF]/30" : ""}`}
            aria-label={label}
          >
            {presets.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}

            {monthlyOptions.length > 0 && (
              <>
                <option disabled>── Monthly Ledger ──</option>
                {monthlyOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthLabel(m)}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>

        {/* Quick clear button */}
        {onClear && hasActiveFilter && (
          <button
            type="button"
            onClick={onClear}
            className="p-1 rounded-lg text-[#78839A] hover:text-[#1E315B] hover:bg-[#F0F0FF] transition cursor-pointer"
            title="Clear date filter"
            aria-label="Clear date filter"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Inline Custom Date Inputs when 'custom' is active */}
      {isCustom && onStartDateChange && onEndDateChange && (
        <div className="flex flex-wrap items-center gap-2 text-xs pt-1 animate-in fade-in duration-150">
          <span className="text-[#78839A] text-[11px] font-medium">Range:</span>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="px-2 py-1 text-xs border border-[#E1E5F0] rounded-lg bg-white text-[#25324A] focus:outline-none focus:ring-1 focus:ring-[#7889F5]"
            />
            <span className="text-[#78839A] text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="px-2 py-1 text-xs border border-[#E1E5F0] rounded-lg bg-white text-[#25324A] focus:outline-none focus:ring-1 focus:ring-[#7889F5]"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default DateFilter;
