import React from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Receipt,
  Layers,
  Package,
  ListTodo,
  Users,
  Search,
  CornerDownLeft,
} from "lucide-react";
import type { InPageMatch, ModuleMatch } from "../hooks/useGlobalFind";

interface SearchFindPopoverProps {
  searchQuery: string;
  inPageMatches: InPageMatch[];
  activeMatchIndex: number;
  moduleMatches: ModuleMatch[];
  isSearching: boolean;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  onJumpToPageMatch: (index: number) => void;
  onClose: () => void;
}

export default function SearchFindPopover({
  searchQuery,
  inPageMatches,
  activeMatchIndex,
  moduleMatches,
  isSearching,
  onNextMatch,
  onPrevMatch,
  onJumpToPageMatch,
  onClose,
}: SearchFindPopoverProps) {
  const navigate = useNavigate();

  const totalOccurrences = inPageMatches.length + moduleMatches.length;

  const handleModuleClick = (m: ModuleMatch) => {
    onClose();
    if (m.link) {
      navigate(m.link, {
        state: {
          highlightId: m.rawId || m.id,
          targetName: m.title,
          search: m.searchParam || searchQuery,
        },
      });
    }
  };

  const getModuleIcon = (module: string) => {
    switch (module) {
      case "bills":
        return <Receipt size={14} className="text-purple-600" />;
      case "enquiries":
        return <Layers size={14} className="text-emerald-600" />;
      case "inventory":
        return <Package size={14} className="text-amber-600" />;
      case "tasks":
        return <ListTodo size={14} className="text-[#7889F5]" />;
      case "users":
        return <Users size={14} className="text-sky-600" />;
      default:
        return <Search size={14} className="text-gray-500" />;
    }
  };

  const getModuleBadgeColor = (module: string) => {
    switch (module) {
      case "bills":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "enquiries":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "inventory":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "tasks":
        return "bg-[#F0F0FF] text-[#7889F5] border-[#E1E5F0]";
      case "users":
        return "bg-sky-50 text-sky-700 border-sky-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  // Helper to highlight matching text in snippet
  const renderHighlightedText = (text: string, query: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-amber-200 text-[#1E315B] font-bold px-0.5 rounded">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div className="absolute left-0 mt-2 w-80 sm:w-[460px] md:w-[520px] bg-white border border-[#E1E5F0] rounded-2xl shadow-2xl shadow-[#1E315B]/15 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 text-left">
      {/* Header Banner */}
      <div className="p-3.5 bg-gradient-to-r from-[#F5F6FC] via-white to-[#F0F0FF] border-b border-[#E1E5F0] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-white border border-[#E1E5F0] shadow-2xs flex items-center justify-center text-[#7889F5]">
            <Search size={16} />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#1E315B]">
              Find Results for "{searchQuery}"
            </h3>
            <span className="text-[11px] font-semibold text-[#78839A]">
              {totalOccurrences > 0
                ? `${totalOccurrences} occurrence${totalOccurrences > 1 ? "s" : ""} found`
                : isSearching
                ? "Searching..."
                : "No occurrences found"}
            </span>
          </div>
        </div>

        {/* Quick In-Page Match Stepper */}
        {inPageMatches.length > 0 && (
          <div className="flex items-center gap-1.5 bg-white border border-[#E1E5F0] px-2 py-1 rounded-xl shadow-2xs text-xs font-bold text-[#1E315B]">
            <span className="text-[11px] text-[#7889F5] mr-1">
              {activeMatchIndex + 1} of {inPageMatches.length}
            </span>
            <button
              type="button"
              onClick={onPrevMatch}
              className="p-1 hover:bg-[#F0F0FF] rounded-md text-[#78839A] hover:text-[#7889F5] transition-colors cursor-pointer"
              title="Previous match (Shift + Enter)"
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              onClick={onNextMatch}
              className="p-1 hover:bg-[#F0F0FF] rounded-md text-[#78839A] hover:text-[#7889F5] transition-colors cursor-pointer"
              title="Next match (Enter)"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Results Container */}
      <div className="max-h-[420px] overflow-y-auto divide-y divide-[#E1E5F0]/60">
        {totalOccurrences === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-[#F0F0FF] border border-[#E1E5F0] flex items-center justify-center text-[#7889F5] mb-2.5 shadow-xs">
              <Search size={22} />
            </div>
            <p className="text-xs font-bold text-[#1E315B]">No occurrences found</p>
            <p className="text-[11px] text-[#78839A] mt-0.5 max-w-[260px]">
              "{searchQuery}" was not found on this page or across other modules. Try another keyword.
            </p>
          </div>
        ) : (
          <>
            {/* Section 1: In-Page Occurrences */}
            {inPageMatches.length > 0 && (
              <div className="p-2.5">
                <div className="px-2 py-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#7889F5]">
                  <span>On This Page ({inPageMatches.length})</span>
                  <span className="text-[10px] font-normal text-[#78839A]">Click to scroll into view</span>
                </div>

                <div className="space-y-1 mt-1">
                  {inPageMatches.map((m) => (
                    <div
                      key={m.index}
                      onClick={() => onJumpToPageMatch(m.index)}
                      className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between group ${
                        activeMatchIndex === m.index
                          ? "bg-[#F0F0FF] border border-[#7889F5]/40 shadow-xs ring-1 ring-[#7889F5]/30"
                          : "hover:bg-[#F5F6FC] border border-transparent"
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-white border border-[#E1E5F0] text-[#78839A] uppercase">
                            Match #{m.index + 1}
                          </span>
                          <span className="text-[10px] text-[#A0AABA] font-mono uppercase">
                            &lt;{m.tagName}&gt;
                          </span>
                        </div>
                        <p className="text-xs text-[#25324A] font-medium leading-relaxed truncate">
                          {renderHighlightedText(m.snippet, searchQuery)}
                        </p>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg shrink-0 transition-opacity ${
                          activeMatchIndex === m.index
                            ? "bg-[#7889F5] text-white"
                            : "text-[#7889F5] opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        {activeMatchIndex === m.index ? "Active" : "Jump"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 2: Cross-Module System Occurrences */}
            {moduleMatches.length > 0 && (
              <div className="p-2.5 bg-[#FAFBFD]">
                <div className="px-2 py-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#1E315B]">
                  <span>Across Other Modules ({moduleMatches.length})</span>
                  <span className="text-[10px] font-normal text-[#78839A]">Click to open module</span>
                </div>

                <div className="space-y-1 mt-1">
                  {moduleMatches.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => handleModuleClick(m)}
                      className="p-2.5 rounded-xl hover:bg-white border border-transparent hover:border-[#E1E5F0] hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1 pr-3">
                        <div className="p-1.5 rounded-lg bg-white border border-[#E1E5F0] shrink-0 mt-0.5">
                          {getModuleIcon(m.module)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.2 rounded-full border ${getModuleBadgeColor(
                                m.module
                              )}`}
                            >
                              {m.moduleLabel}
                            </span>
                            <span className="text-[10px] text-[#A0AABA]">
                              Matched: {m.matchField}
                            </span>
                          </div>

                          <p className="text-xs font-bold text-[#1E315B] truncate">
                            {renderHighlightedText(m.title, searchQuery)}
                          </p>
                          <p className="text-[11px] text-[#78839A] truncate mt-0.5">
                            {renderHighlightedText(m.subtitle, searchQuery)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] font-bold text-[#7889F5] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span>Open</span>
                        <ExternalLink size={11} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer Instructions */}
      <div className="p-2.5 bg-[#F5F6FC] border-t border-[#E1E5F0] flex items-center justify-between text-[10px] text-[#78839A]">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 font-medium">
            <kbd className="px-1.5 py-0.5 bg-white border border-[#E1E5F0] rounded shadow-2xs text-[#1E315B] font-mono">
              Enter
            </kbd>
            <span>Next</span>
          </span>
          <span className="flex items-center gap-1 font-medium">
            <kbd className="px-1.5 py-0.5 bg-white border border-[#E1E5F0] rounded shadow-2xs text-[#1E315B] font-mono">
              Shift + Enter
            </kbd>
            <span>Prev</span>
          </span>
          <span className="flex items-center gap-1 font-medium">
            <kbd className="px-1.5 py-0.5 bg-white border border-[#E1E5F0] rounded shadow-2xs text-[#1E315B] font-mono">
              Esc
            </kbd>
            <span>Close</span>
          </span>
        </div>

        <span className="font-semibold text-[#7889F5]">Global Find Tool</span>
      </div>
    </div>
  );
}
