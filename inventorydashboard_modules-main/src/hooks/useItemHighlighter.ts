import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";

export interface ItemHighlighterOptions {
  autoClearDuration?: number;
}

export function useItemHighlighter(options: ItemHighlighterOptions = {}) {
  const location = useLocation();
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [targetSearch, setTargetSearch] = useState<string | null>(null);
  const [targetName, setTargetName] = useState<string | null>(null);
  const [isBannerVisible, setIsBannerVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const idFromParam = params.get("highlightId") || params.get("id");
    const searchFromParam =
      params.get("search") || params.get("invoiceNumber") || params.get("enqId");
    const nameFromParam = params.get("name") || params.get("targetName");

    const state = location.state as Record<string, any> | null;
    const finalId = idFromParam || state?.highlightId || null;
    const finalSearch = searchFromParam || state?.search || null;
    const finalName = nameFromParam || state?.targetName || finalSearch || null;

    if (finalId || finalSearch) {
      setHighlightId(finalId);
      setTargetSearch(finalSearch);
      setTargetName(finalName);
      setIsBannerVisible(true);

      // Scroll to element after DOM settles
      const timeout = setTimeout(() => {
        if (finalId) {
          const el =
            document.getElementById(`row-${finalId}`) ||
            document.getElementById(`product-row-${finalId}`) ||
            document.getElementById(`bill-row-${finalId}`) ||
            document.getElementById(`task-row-${finalId}`) ||
            document.getElementById(`user-row-${finalId}`) ||
            document.getElementById(finalId);

          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      }, 350);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setIsBannerVisible(false);
      }, options.autoClearDuration || 9000);

      return () => clearTimeout(timeout);
    }
  }, [location.search, location.state]);

  const clearHighlight = useCallback(() => {
    setHighlightId(null);
    setTargetSearch(null);
    setTargetName(null);
    setIsBannerVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const scrollToAndHighlight = useCallback((elementId: string) => {
    setTimeout(() => {
      const el = document.getElementById(elementId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 250);
  }, []);

  const isHighlighted = useCallback(
    (...ids: (string | number | undefined | null)[]) => {
      if (!highlightId && !targetSearch) return false;
      return ids.some((id) => {
        if (!id) return false;
        const strId = String(id).trim().toLowerCase();
        if (highlightId && strId === highlightId.trim().toLowerCase()) return true;
        if (targetSearch && strId === targetSearch.trim().toLowerCase()) return true;
        // Check if substring or number match
        if (highlightId && (strId.includes(highlightId.trim().toLowerCase()) || highlightId.trim().toLowerCase().includes(strId))) {
          return true;
        }
        return false;
      });
    },
    [highlightId, targetSearch]
  );

  return {
    highlightId,
    targetSearch,
    targetName,
    isBannerVisible,
    clearHighlight,
    isHighlighted,
    scrollToAndHighlight,
  };
}

export default useItemHighlighter;

