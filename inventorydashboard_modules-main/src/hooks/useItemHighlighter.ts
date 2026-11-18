import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";

export interface ItemHighlighterOptions {
  autoClearDuration?: number;
}

// Safely escape CSS attribute selector values
function safeEscape(str: string): string {
  return str.replace(/["\\]/g, "\\$&");
}

export function useItemHighlighter(options: ItemHighlighterOptions = {}) {
  const location = useLocation();
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [targetSearch, setTargetSearch] = useState<string | null>(null);
  const [targetName, setTargetName] = useState<string | null>(null);
  const [isBannerVisible, setIsBannerVisible] = useState(false);
  const [isLocated, setIsLocated] = useState(false);

  const bannerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeTargetsRef = useRef<string[]>([]);

  // DOM element finder
  const findElement = useCallback((targets: string[]): HTMLElement | null => {
    for (const rawTarget of targets) {
      if (!rawTarget || typeof rawTarget !== "string") continue;
      const t = rawTarget.trim();
      if (!t) continue;

      // 1. Direct and prefixed element IDs
      const directCandidates = [
        t,
        `product-row-${t}`,
        `task-row-${t}`,
        `bill-row-${t}`,
        `user-row-${t}`,
        `row-${t}`,
      ];

      for (const id of directCandidates) {
        const el = document.getElementById(id);
        if (el) return el;
      }

      // 2. Data attributes
      try {
        const escaped = safeEscape(t);
        const attributeQueries = [
          `[data-id="${escaped}"]`,
          `[data-product-id="${escaped}"]`,
          `[data-task-id="${escaped}"]`,
          `[data-bill-id="${escaped}"]`,
          `[data-invoice-number="${escaped}"]`,
          `[data-enq-id="${escaped}"]`,
          `[data-uid="${escaped}"]`,
          `[data-employee-id="${escaped}"]`,
          `[data-item-id="${escaped}"]`,
          `[data-highlight-id~="${escaped}"]`,
          `[data-highlight-id*="${escaped}"]`,
        ];

        for (const query of attributeQueries) {
          const el = document.querySelector<HTMLElement>(query);
          if (el) return el;
        }
      } catch {
        // Ignore CSS selector errors if unusual characters
      }
    }

    // 3. Fallback: Search for element with highlight match attribute
    const matchRow = document.querySelector<HTMLElement>(
      'tr[data-highlight-match="true"], [data-highlight-match="true"]'
    );
    if (matchRow) return matchRow;

    return null;
  }, []);

  // Polling scroll runner
  const startScrollRetry = useCallback(
    (explicitTargets?: (string | null | undefined)[]) => {
      if (retryTimerRef.current) {
        clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      const targets = (
        explicitTargets && explicitTargets.length > 0
          ? explicitTargets
          : [highlightId, targetSearch, targetName]
      )
        .filter((x): x is string => Boolean(x && typeof x === "string"))
        .map((x) => x.trim());

      if (targets.length === 0) return;
      activeTargetsRef.current = targets;

      let attempts = 0;
      const maxAttempts = 35; // 35 * 120ms ≈ 4.2 seconds

      const checkAndScroll = () => {
        attempts++;
        const el = findElement(activeTargetsRef.current);
        if (el) {
          if (retryTimerRef.current) {
            clearInterval(retryTimerRef.current);
            retryTimerRef.current = null;
          }
          setIsLocated(true);

          // Center element smoothly in viewport
          el.scrollIntoView({ behavior: "smooth", block: "center" });

          // Apply attention pulse ring
          el.classList.add("item-highlight-pulse");
          el.setAttribute("data-highlight-located", "true");

          setTimeout(() => {
            el.classList.remove("item-highlight-pulse");
          }, 5000);

          return true;
        }

        if (attempts >= maxAttempts) {
          if (retryTimerRef.current) {
            clearInterval(retryTimerRef.current);
            retryTimerRef.current = null;
          }
          return false;
        }
        return false;
      };

      // Try immediately
      if (!checkAndScroll()) {
        retryTimerRef.current = setInterval(checkAndScroll, 120);
      }
    },
    [findElement, highlightId, targetSearch, targetName]
  );

  // Parse location and state
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
      setIsLocated(false);

      const initialTargets = [finalId, finalSearch, finalName].filter(
        (x): x is string => Boolean(x)
      );
      startScrollRetry(initialTargets);

      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = setTimeout(() => {
        setIsBannerVisible(false);
      }, options.autoClearDuration || 14000);
    }

    return () => {
      if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    };
  }, [location.search, location.state, startScrollRetry, options.autoClearDuration]);

  const clearHighlight = useCallback(() => {
    setHighlightId(null);
    setTargetSearch(null);
    setTargetName(null);
    setIsBannerVisible(false);
    setIsLocated(false);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    if (retryTimerRef.current) clearInterval(retryTimerRef.current);

    const els = document.querySelectorAll(".item-highlight-pulse, [data-highlight-located]");
    els.forEach((el) => {
      el.classList.remove("item-highlight-pulse");
      el.removeAttribute("data-highlight-located");
    });
  }, []);

  const scrollToAndHighlight = useCallback(
    (...targets: (string | null | undefined)[]) => {
      startScrollRetry(targets);
    },
    [startScrollRetry]
  );

  const locateCurrentItem = useCallback(() => {
    startScrollRetry([highlightId, targetSearch, targetName]);
  }, [startScrollRetry, highlightId, targetSearch, targetName]);

  const isHighlighted = useCallback(
    (...ids: (string | number | undefined | null)[]) => {
      if (!highlightId && !targetSearch) return false;
      return ids.some((id) => {
        if (!id) return false;
        const strId = String(id).trim().toLowerCase();
        if (highlightId) {
          const h = highlightId.trim().toLowerCase();
          if (strId === h || strId.includes(h) || h.includes(strId)) return true;
        }
        if (targetSearch) {
          const s = targetSearch.trim().toLowerCase();
          if (strId === s || strId.includes(s) || s.includes(strId)) return true;
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
    isLocated,
    clearHighlight,
    isHighlighted,
    scrollToAndHighlight,
    locateCurrentItem,
  };
}

export default useItemHighlighter;
