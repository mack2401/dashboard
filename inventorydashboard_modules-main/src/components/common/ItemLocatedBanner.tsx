import React from "react";
import { Target, X } from "lucide-react";

export interface ItemLocatedBannerProps {
  title?: string;
  itemLabel?: string;
  onClear: () => void;
  className?: string;
}

export const ItemLocatedBanner: React.FC<ItemLocatedBannerProps> = ({
  title,
  itemLabel = "Item",
  onClear,
  className = "",
}) => {
  return (
    <div
      className={`bg-gradient-to-r from-[#F0F0FF] via-white to-[#F5F6FC] border-2 border-[#7889F5]/40 rounded-2xl p-3 sm:p-3.5 mb-4 shadow-sm flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#7889F5] to-[#293F70] text-white flex items-center justify-center shrink-0 shadow-2xs">
          <Target className="w-4 h-4 animate-pulse" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-[#1E315B] uppercase tracking-wider">
              {itemLabel} Located
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#7889F5] text-white shadow-2xs">
              Highlighted Below
            </span>
          </div>
          <p className="text-xs text-[#25324A] font-semibold truncate mt-0.5">
            {title ? `Matched: "${title}"` : "Scrolled to matching record"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-white border border-[#E1E5F0] text-[#78839A] hover:text-[#1E315B] hover:border-[#7889F5]/40 hover:bg-[#F0F0FF] transition-all cursor-pointer shadow-2xs flex items-center gap-1"
        >
          <X className="w-3.5 h-3.5" />
          <span>Dismiss</span>
        </button>
      </div>
    </div>
  );
};

export default ItemLocatedBanner;

