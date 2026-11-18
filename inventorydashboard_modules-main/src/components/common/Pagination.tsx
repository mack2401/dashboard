import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  itemsPerPage?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  itemLabel?: string;
  filteredFromTotal?: number;
  showDetails?: boolean;
  showPageNumbers?: boolean;
  showFastJump?: boolean;
  maxVisiblePages?: number;
  className?: string;
  hideOnSinglePage?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage = 10,
  pageSizeOptions,
  onPageSizeChange,
  itemLabel = "entries",
  filteredFromTotal,
  showDetails = true,
  showPageNumbers = true,
  showFastJump = false,
  maxVisiblePages = 5,
  className = "",
  hideOnSinglePage = false,
}) => {
  // Safe bounded page count
  const validTotalPages = Math.max(1, totalPages || 1);
  const validCurrentPage = Math.min(Math.max(1, currentPage || 1), validTotalPages);

  // If hideOnSinglePage is requested and there's only 1 page
  if (hideOnSinglePage && validTotalPages <= 1) {
    return null;
  }

  // Calculate entry indices
  const startIndex = totalItems === 0 ? 0 : (validCurrentPage - 1) * itemsPerPage + 1;
  const endIndex = totalItems !== undefined ? Math.min(validCurrentPage * itemsPerPage, totalItems) : validCurrentPage * itemsPerPage;

  // Generate intelligent page numbers window with ellipsis
  const pageNumbers = useMemo(() => {
    if (validTotalPages <= maxVisiblePages) {
      return Array.from({ length: validTotalPages }, (_, i) => i + 1);
    }

    const pages: (number | "ellipsis")[] = [];
    const half = Math.floor(maxVisiblePages / 2);

    let start = Math.max(1, validCurrentPage - half);
    let end = Math.min(validTotalPages, validCurrentPage + half);

    if (validCurrentPage <= half) {
      end = maxVisiblePages;
    } else if (validCurrentPage + half >= validTotalPages) {
      start = validTotalPages - maxVisiblePages + 1;
    }

    // Always show page 1
    if (start > 1) {
      pages.push(1);
      if (start > 2) {
        pages.push("ellipsis");
      }
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    // Always show last page
    if (end < validTotalPages) {
      if (end < validTotalPages - 1) {
        pages.push("ellipsis");
      }
      pages.push(validTotalPages);
    }

    return pages;
  }, [validCurrentPage, validTotalPages, maxVisiblePages]);

  const handlePageClick = (page: number) => {
    if (page >= 1 && page <= validTotalPages && page !== validCurrentPage) {
      onPageChange(page);
    }
  };

  return (
    <div
      className={`px-4 py-3 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#E1E5F0] bg-white/90 backdrop-blur-xs rounded-b-2xl transition-all ${className}`}
    >
      {/* Left side: Showing X to Y of Z info & page size select */}
      <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-[#78839A] font-medium">
        {showDetails && totalItems !== undefined && (
          <div>
            Showing <span className="font-bold text-[#25324A]">{startIndex}</span> to{" "}
            <span className="font-bold text-[#25324A]">{endIndex}</span> of{" "}
            <span className="font-bold text-[#25324A]">{totalItems}</span> {itemLabel}
            {filteredFromTotal !== undefined && filteredFromTotal !== totalItems && (
              <span className="text-xs text-gray-400 ml-1.5 font-normal">
                (filtered from {filteredFromTotal} total)
              </span>
            )}
          </div>
        )}

        {pageSizeOptions && onPageSizeChange && (
          <div className="flex items-center gap-1.5 ml-0 sm:ml-2">
            <span className="text-xs text-slate-500">Rows per page:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-slate-300 transition cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right side: Page navigation controls */}
      <div className="flex items-center gap-1.5">
        {/* Fast jump to first page */}
        {showFastJump && (
          <button
            type="button"
            onClick={() => handlePageClick(1)}
            disabled={validCurrentPage === 1}
            className="p-1.5 sm:p-2 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-slate-400 transition cursor-pointer shadow-2xs"
            title="First Page"
            aria-label="First Page"
          >
            <ChevronsLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        )}

        {/* Previous page button */}
        <button
          type="button"
          onClick={() => handlePageClick(validCurrentPage - 1)}
          disabled={validCurrentPage === 1}
          className="p-1.5 sm:p-2 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-slate-400 transition cursor-pointer shadow-2xs"
          title="Previous Page"
          aria-label="Previous Page"
        >
          <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        {/* Numbered page buttons or compact Page X of Y */}
        {showPageNumbers ? (
          <div className="flex items-center gap-1">
            {pageNumbers.map((page, idx) => {
              if (page === "ellipsis") {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-xs text-slate-400 select-none"
                  >
                    ...
                  </span>
                );
              }

              const isActive = validCurrentPage === page;

              return (
                <button
                  key={page}
                  type="button"
                  onClick={() => handlePageClick(page)}
                  className={`min-w-[28px] h-7 sm:min-w-[34px] sm:h-8 px-2 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer flex items-center justify-center ${
                    isActive
                      ? "bg-slate-900 text-white shadow-2xs border border-slate-900"
                      : "text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {page}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="text-xs font-semibold text-slate-800 px-2 whitespace-nowrap">
            Page {validCurrentPage} of {validTotalPages}
          </span>
        )}

        {/* Next page button */}
        <button
          type="button"
          onClick={() => handlePageClick(validCurrentPage + 1)}
          disabled={validCurrentPage >= validTotalPages}
          className="p-1.5 sm:p-2 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-slate-400 transition cursor-pointer shadow-2xs"
          title="Next Page"
          aria-label="Next Page"
        >
          <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        {/* Fast jump to last page */}
        {showFastJump && (
          <button
            type="button"
            onClick={() => handlePageClick(validTotalPages)}
            disabled={validCurrentPage >= validTotalPages}
            className="p-1.5 sm:p-2 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-slate-400 transition cursor-pointer shadow-2xs"
            title="Last Page"
            aria-label="Last Page"
          >
            <ChevronsRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default Pagination;
