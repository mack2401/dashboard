import React from "react";
import { Search } from "lucide-react";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = "",
}) => {
  return (
    <div className={`text-center py-12 md:py-16 px-4 bg-white rounded-2xl border border-gray-100 shadow-2xs ${className}`}>
      <div className="w-14 h-14 md:w-16 md:h-16 bg-[#F0F0FF] rounded-2xl flex items-center justify-center mx-auto mb-3.5 text-[#7889F5] shadow-2xs border border-[#E1E5F0]">
        {icon || <Search className="w-6 h-6 md:w-8 md:h-8" />}
      </div>
      <h3 className="text-base md:text-lg font-bold text-[#25324A] mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-xs md:text-sm text-[#78839A] max-w-sm mx-auto mb-4">
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#7889F5] to-[#293F70] text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer"
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      )}
    </div>
  );
};

export default EmptyState;
