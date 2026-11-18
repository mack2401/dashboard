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
        return <Receipt size={14} className="text-slate-700" />;
      case "enquiries":
        return <Layers size={14} className="text-slate-700" />;
      case "inventory":
        return <Package size={14} className="text-slate-700" />;
      case "tasks":
        return <ListTodo size={14} className="text-slate-700" />;
      case "users":
        return <Users size={14} className="text-slate-700" />;
      default:
        return <Search size={14} className="text-slate-500" />;
    }
  };

  const getModuleBadgeColor = (module: string) => {
    switch (module) {
      case "bills":
        return "bg-slate-100 text-slate-800 border-slate-200";
      case "enquiries":
        return "bg-slate-100 text-slate-800 border-slate-200";
      case "inventory":
        return "bg-slate-100 text-slate-800 border-slate-200";
      case "tasks":
        return "bg-slate-100 text-slate-800 border-slate-200";
      case "users":
        return "bg-slate-100 text-slate-800 border-slate-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
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
            <mark key={i} className="bg-amber-100 text-amber-950 font-semibold px-0.5 rounded">
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
    <div className="absolute left-0 mt-2 w-80 sm:w-[460px] md:w-[520px] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 text-left">
      {/* Header Banner */}
      <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 shadow-2xs flex items-center justify-center text-slate-700">
            <Search size={16} />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Find Results for "{searchQuery}"
            </h3>
            <span className="text-[11px] font-medium text-slate-500">
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
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-1 rounded-lg shadow-2xs text-xs font-bold text-slate-800">
            <span className="text-[11px] text-slate-600 mr-1">
              {activeMatchIndex + 1} of {inPageMatches.length}
            </span>
            <button
              type="button"
              onClick={onPrevMatch}
              className="p-1 hover:bg-slate-100 rounded-md text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              title="Previous match (Shift + Enter)"
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              onClick={onNextMatch}
              className="p-1 hover:bg-slate-100 rounded-md text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              title="Next match (Enter)"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Results Container */}
      <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100">
        {totalOccurrences === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mb-2.5 shadow-2xs">
              <Search size={22} />
            </div>
            <p className="text-xs font-bold text-slate-800">No occurrences found</p>
            <p className="text-[11px] text-slate-500 mt-0.5 max-w-[260px]">
              "{searchQuery}" was not found on this page or across other modules.
            </p>
          </div>
        ) : (
          <>
            {/* Section 1: In-Page Occurrences */}
            {inPageMatches.length > 0 && (
              <div className="p-2.5">
                <div className="px-2 py-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  <span>On This Page ({inPageMatches.length})</span>
                  <span className="text-[10px] font-normal text-slate-400">Click to scroll into view</span>
                </div>

                <div className="space-y-1 mt-1">
                  {inPageMatches.map((m) => (
                    <div
                      key={m.index}
                      onClick={() => onJumpToPageMatch(m.index)}
                      className={`p-2.5 rounded-lg transition-all cursor-pointer flex items-center justify-between group ${
                        activeMatchIndex === m.index
                          ? "bg-slate-100 border border-slate-300 shadow-2xs"
                          : "hover:bg-slate-50 border border-transparent"
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-white border border-slate-200 text-slate-600 uppercase">
                            Match #{m.index + 1}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono uppercase">
                            &lt;{m.tagName}&gt;
                          </span>
                        </div>
                        <p className="text-xs text-slate-800 font-medium leading-relaxed truncate">
                          {renderHighlightedText(m.snippet, searchQuery)}
                        </p>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 transition-opacity ${
                          activeMatchIndex === m.index
                            ? "bg-slate-900 text-white"
                            : "text-slate-600 opacity-0 group-hover:opacity-100"
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
              <div className="p-2.5 bg-slate-50/60">
                <div className="px-2 py-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-800">
                  <span>Across Other Modules ({moduleMatches.length})</span>
                  <span className="text-[10px] font-normal text-slate-400">Click to open module</span>
                </div>

                <div className="space-y-1 mt-1">
                  {moduleMatches.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => handleModuleClick(m)}
                      className="p-2.5 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 hover:shadow-2xs transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1 pr-3">
                        <div className="p-1.5 rounded-md bg-white border border-slate-200 shrink-0 mt-0.5 text-slate-700">
                          {getModuleIcon(m.module)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.2 rounded-full border ${getModuleBadgeColor(
                                m.module
                              )}`}
                            >
                              {m.moduleLabel}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Field: {m.matchField}
                            </span>
                          </div>

                          <p className="text-xs font-bold text-slate-800 truncate">
                            {renderHighlightedText(m.title, searchQuery)}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {renderHighlightedText(m.subtitle, searchQuery)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
      <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 font-medium">
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded shadow-2xs text-slate-800 font-mono">
              Enter
            </kbd>
            <span>Next</span>
          </span>
          <span className="flex items-center gap-1 font-medium">
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded shadow-2xs text-slate-800 font-mono">
              Shift + Enter
            </kbd>
            <span>Prev</span>
          </span>
          <span className="flex items-center gap-1 font-medium">
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded shadow-2xs text-slate-800 font-mono">
              Esc
            </kbd>
            <span>Close</span>
          </span>
        </div>

        <span className="font-semibold text-slate-600">Global Find</span>
      </div>
    </div>
  );
}
