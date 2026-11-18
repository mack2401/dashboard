import React from "react";

export interface KPICardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: {
    text: string;
    variant?: "success" | "danger" | "warning" | "info" | "neutral";
  } | string;
  trend?: {
    value: string | number;
    isPositive?: boolean;
    label?: string;
  };
  iconBg?: string;
  iconColor?: string;
  valueColor?: string;
  titleColor?: string;
  layout?: "compact" | "horizontal" | "clean";
  isActive?: boolean;
  activeRingColor?: string;
  onClick?: () => void;
  className?: string;
  tooltip?: string;
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  icon,
  subtitle,
  badge,
  trend,
  iconBg = "bg-slate-100",
  iconColor = "text-slate-700",
  valueColor = "text-gray-900",
  titleColor = "text-gray-500",
  layout = "compact",
  isActive = false,
  activeRingColor = "border-slate-800 ring-2 ring-slate-800/20 bg-slate-50",
  onClick,
  className = "",
  tooltip,
}) => {
  const isClickable = Boolean(onClick);

  const badgeObj = typeof badge === "string" ? { text: badge, variant: "neutral" as const } : badge;

  const getBadgeClasses = (variant: string = "neutral") => {
    switch (variant) {
      case "success":
        return "bg-emerald-50 text-emerald-700 border-emerald-200/80";
      case "danger":
        return "bg-rose-50 text-rose-700 border-rose-200/80";
      case "warning":
        return "bg-amber-50 text-amber-700 border-amber-200/80";
      case "info":
        return "bg-sky-50 text-sky-700 border-sky-200/80";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  // Horizontal Layout (used in Reports/Dashboard styles)
  if (layout === "horizontal") {
    return (
      <div
        onClick={onClick}
        title={tooltip}
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onKeyDown={isClickable ? (e) => e.key === "Enter" && onClick?.() : undefined}
        className={`bg-white rounded-2xl border border-gray-200/90 shadow-2xs p-4 sm:p-5 flex items-center justify-between gap-4 transition-all duration-200 ${
          isClickable ? "cursor-pointer hover:shadow-md hover:border-slate-400 group" : ""
        } ${isActive ? activeRingColor : ""} ${className}`}
      >
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] sm:text-xs font-bold uppercase tracking-wider truncate ${titleColor}`}>
              {title}
            </span>
            {badgeObj && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${getBadgeClasses(badgeObj.variant)}`}>
                {badgeObj.text}
              </span>
            )}
          </div>
          <div className={`text-xl sm:text-2xl font-bold tracking-tight truncate ${valueColor}`}>
            {value}
          </div>
          {subtitle && (
            <div className="text-[11px] text-gray-400 truncate">
              {subtitle}
            </div>
          )}
        </div>

        {icon && (
          <div
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 border border-gray-100 shadow-2xs transition-transform duration-200 ${
              isClickable ? "group-hover:scale-105" : ""
            } ${iconBg} ${iconColor}`}
          >
            {icon}
          </div>
        )}
      </div>
    );
  }

  // Standard Compact Layout (used in BillTransactions, Enquiry, Inventory, Reports)
  return (
    <div
      onClick={onClick}
      title={tooltip}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === "Enter" && onClick?.() : undefined}
      className={`bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between transition-all duration-200 min-w-0 ${
        isClickable ? "cursor-pointer hover:shadow-md hover:border-slate-400 group" : ""
      } ${isActive ? activeRingColor : ""} ${className}`}
    >
      {/* Top row: Title and Icon */}
      <div className="flex items-center justify-between gap-1.5">
        <span className={`text-[11px] font-bold uppercase tracking-wider truncate ${titleColor}`}>
          {title}
        </span>
        {icon && (
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border border-gray-100/70 transition-transform duration-200 ${
              isClickable ? "group-hover:scale-105" : ""
            } ${iconBg} ${iconColor}`}
          >
            {icon}
          </div>
        )}
      </div>

      {/* Value and Subtitle */}
      <div className="mt-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`text-xl font-bold tracking-tight truncate ${valueColor}`}>
            {value}
          </p>
          {trend && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                trend.isPositive !== false
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              }`}
            >
              {trend.isPositive !== false ? "+" : ""}{trend.value}
            </span>
          )}
        </div>

        {subtitle && (
          <div className="text-[11px] text-gray-400 mt-0.5 truncate">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};

export default KPICard;
