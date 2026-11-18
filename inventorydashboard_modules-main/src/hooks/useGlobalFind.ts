import { useState, useEffect, useRef, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

export interface InPageMatch {
  index: number;
  element: HTMLElement;
  snippet: string;
  tagName: string;
}

export interface ModuleMatch {
  id: string;
  rawId: string;
  module: "bills" | "enquiries" | "inventory" | "tasks" | "users";
  moduleLabel: string;
  title: string;
  subtitle: string;
  matchField: string;
  snippet: string;
  link: string;
  searchParam: string;
}

export function useGlobalFind(searchQuery: string) {
  const [inPageMatches, setInPageMatches] = useState<InPageMatch[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState<number>(-1);
  const [moduleMatches, setModuleMatches] = useState<ModuleMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Cached system records for lightning-fast cross-module find
  const cacheRef = useRef<{
    bills?: any[];
    enquiries?: any[];
    products?: any[];
    tasks?: any[];
    employees?: any[];
    lastFetch?: number;
  }>({});

  // 1. In-Page Occurrence Finder
  const findInPageOccurrences = useCallback((query: string) => {
    // Clear old active highlight
    document.querySelectorAll(".active-find-match").forEach((el) => {
      el.classList.remove("active-find-match", "ring-4", "ring-blue-600", "bg-amber-200/90", "rounded-md");
    });

    if (!query || query.trim().length < 2) {
      setInPageMatches([]);
      setActiveMatchIndex(-1);
      return;
    }

    const q = query.trim().toLowerCase();
    const mainEl = document.querySelector("main");
    if (!mainEl) {
      setInPageMatches([]);
      setActiveMatchIndex(-1);
      return;
    }

    const matches: InPageMatch[] = [];
    const walker = document.createTreeWalker(mainEl, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName.toLowerCase();
        if (tag === "script" || tag === "style" || tag === "noscript" || tag === "input" || tag === "textarea") {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.textContent.toLowerCase().includes(q)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      },
    });

    let currentNode = walker.nextNode();
    const visitedParents = new Set<HTMLElement>();
    let idx = 0;

    while (currentNode && matches.length < 40) {
      const parent = currentNode.parentElement;
      if (parent && !visitedParents.has(parent)) {
        visitedParents.add(parent);
        const text = parent.textContent || "";
        const matchPos = text.toLowerCase().indexOf(q);
        const start = Math.max(0, matchPos - 20);
        const end = Math.min(text.length, matchPos + q.length + 30);
        const snippet =
          (start > 0 ? "..." : "") +
          text.substring(start, end).replace(/\s+/g, " ").trim() +
          (end < text.length ? "..." : "");

        matches.push({
          index: idx++,
          element: parent,
          snippet,
          tagName: parent.tagName.toLowerCase(),
        });
      }
      currentNode = walker.nextNode();
    }

    setInPageMatches(matches);
    if (matches.length > 0) {
      setActiveMatchIndex(0);
      highlightElement(matches[0].element);
    } else {
      setActiveMatchIndex(-1);
    }
  }, []);

  const highlightElement = (el: HTMLElement) => {
    document.querySelectorAll(".active-find-match").forEach((elem) => {
      elem.classList.remove("active-find-match", "ring-4", "ring-blue-600", "bg-amber-200/90", "rounded-md");
    });
    el.classList.add("active-find-match", "ring-4", "ring-blue-600", "bg-amber-200/90", "rounded-md");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const nextMatch = useCallback(() => {
    if (inPageMatches.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % inPageMatches.length;
    setActiveMatchIndex(nextIdx);
    highlightElement(inPageMatches[nextIdx].element);
  }, [inPageMatches, activeMatchIndex]);

  const prevMatch = useCallback(() => {
    if (inPageMatches.length === 0) return;
    const prevIdx = (activeMatchIndex - 1 + inPageMatches.length) % inPageMatches.length;
    setActiveMatchIndex(prevIdx);
    highlightElement(inPageMatches[prevIdx].element);
  }, [inPageMatches, activeMatchIndex]);

  const jumpToMatch = useCallback(
    (index: number) => {
      if (index >= 0 && index < inPageMatches.length) {
        setActiveMatchIndex(index);
        highlightElement(inPageMatches[index].element);
      }
    },
    [inPageMatches]
  );

  const clearHighlights = useCallback(() => {
    document.querySelectorAll(".active-find-match").forEach((el) => {
      el.classList.remove("active-find-match", "ring-4", "ring-blue-600", "bg-amber-200/90", "rounded-md");
    });
    setInPageMatches([]);
    setActiveMatchIndex(-1);
  }, []);

  // 2. Cross-Module Global Search Across Firestore
  const searchModules = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) {
      setModuleMatches([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const q = query.trim().toLowerCase();

    try {
      const now = Date.now();
      // Cache for 60 seconds to make typing instantaneous
      if (!cacheRef.current.lastFetch || now - cacheRef.current.lastFetch > 60000) {
        const [billsSnap, enqSnap, prodSnap, tasksSnap, empSnap] = await Promise.all([
          getDocs(collection(db, "bills")),
          getDocs(collection(db, "enquiries")),
          getDocs(collection(db, "products")),
          getDocs(collection(db, "tasks")),
          getDocs(collection(db, "employees")),
        ]);

        cacheRef.current = {
          bills: billsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          enquiries: enqSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          products: prodSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          tasks: tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          employees: empSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          lastFetch: now,
        };
      }

      const results: ModuleMatch[] = [];

      // A) Search Bills
      (cacheRef.current.bills || []).forEach((b) => {
        const inv = String(b.invoiceNumber || "");
        const cust = String(b.customerName || "");
        const city = String(b.customerCity || "");
        const contact = String(b.customerContact || "");
        const amt = String(b.totalAmount || "");

        if (
          inv.toLowerCase().includes(q) ||
          cust.toLowerCase().includes(q) ||
          city.toLowerCase().includes(q) ||
          contact.toLowerCase().includes(q) ||
          amt.includes(q)
        ) {
          const searchParam = inv || cust;
          results.push({
            id: `bill_${b.id}`,
            rawId: b.id,
            module: "bills",
            moduleLabel: "Bills & Invoices",
            title: `Invoice #${inv || b.id.slice(-6)}`,
            subtitle: `Customer: ${cust || "N/A"} • Amount: ₹${Number(amt).toLocaleString("en-IN")}`,
            matchField: inv.toLowerCase().includes(q) ? "Invoice #" : "Customer Details",
            snippet: `${cust} • ${city} • ${contact}`,
            link: `/bills?highlightId=${b.id}&invoiceNumber=${encodeURIComponent(inv)}&search=${encodeURIComponent(searchParam)}`,
            searchParam,
          });
        }
      });

      // B) Search Enquiries
      (cacheRef.current.enquiries || []).forEach((eq) => {
        const enqId = String(eq.enqId || "");
        const cust = String(eq.customerName || eq.name || "");
        const email = String(eq.email || "");
        const phone = String(eq.contactNumber || eq.phone || "");
        const comp = String(eq.companyName || "");
        const status = String(eq.status || "");

        if (
          enqId.toLowerCase().includes(q) ||
          cust.toLowerCase().includes(q) ||
          email.toLowerCase().includes(q) ||
          phone.toLowerCase().includes(q) ||
          comp.toLowerCase().includes(q) ||
          status.toLowerCase().includes(q)
        ) {
          const searchParam = enqId || cust;
          results.push({
            id: `enq_${eq.id}`,
            rawId: eq.id,
            module: "enquiries",
            moduleLabel: "Enquiries",
            title: `Enquiry #${enqId || eq.id.slice(-6)}`,
            subtitle: `${cust || "Customer"} • Status: ${status || "Active"}`,
            matchField: enqId.toLowerCase().includes(q) ? "Enquiry ID" : "Customer / Contact",
            snippet: `${cust} • ${phone} • ${comp || email}`,
            link: `/enquiries?highlightId=${eq.id}&enqId=${encodeURIComponent(enqId)}&search=${encodeURIComponent(searchParam)}`,
            searchParam,
          });
        }
      });

      // C) Search Inventory Products
      (cacheRef.current.products || []).forEach((p) => {
        const name = String(p.name || p.productName || "");
        const cat = String(p.category || "");
        const sku = String(p.sku || p.hsnCode || "");
        const qty = String(p.totalQuantity ?? p.quantity ?? 0);

        if (
          name.toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q) ||
          sku.toLowerCase().includes(q)
        ) {
          results.push({
            id: `prod_${p.id}`,
            rawId: p.id,
            module: "inventory",
            moduleLabel: "Inventory",
            title: name,
            subtitle: `Category: ${cat || "General"} • Stock: ${qty} units`,
            matchField: name.toLowerCase().includes(q) ? "Product Name" : "Category / SKU",
            snippet: `In stock: ${qty} • SKU: ${sku || "-"}`,
            link: `/inventory?highlightId=${p.id}&search=${encodeURIComponent(name)}`,
            searchParam: name,
          });
        }
      });

      // D) Search Tasks
      (cacheRef.current.tasks || []).forEach((t) => {
        const task = String(t.task || "");
        const emp = String(t.employeeName || "");
        const cat = String(t.category || "");
        const status = String(t.status || "");

        if (
          task.toLowerCase().includes(q) ||
          emp.toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q) ||
          status.toLowerCase().includes(q)
        ) {
          results.push({
            id: `task_${t.id}`,
            rawId: t.id,
            module: "tasks",
            moduleLabel: "Tasks",
            title: task,
            subtitle: `Assigned: ${emp || "Unassigned"} • Status: ${status}`,
            matchField: task.toLowerCase().includes(q) ? "Task Description" : "Assignee / Category",
            snippet: `Staff: ${emp} • ${cat} • ${status}`,
            link: `/task?highlightId=${t.id}&search=${encodeURIComponent(task)}`,
            searchParam: task,
          });
        }
      });

      // E) Search Users / Employees
      (cacheRef.current.employees || []).forEach((e) => {
        const name = String(e.employeeName || e.name || "");
        const email = String(e.email || "");
        const role = String(e.role || "");
        const phone = String(e.phone || "");

        if (
          name.toLowerCase().includes(q) ||
          email.toLowerCase().includes(q) ||
          role.toLowerCase().includes(q) ||
          phone.toLowerCase().includes(q)
        ) {
          const searchParam = name || email;
          results.push({
            id: `emp_${e.id}`,
            rawId: e.id,
            module: "users",
            moduleLabel: "User Directory",
            title: name || email,
            subtitle: `Role: ${role.toUpperCase()} • ${email}`,
            matchField: name.toLowerCase().includes(q) ? "Employee Name" : "Email / Role",
            snippet: `${email} • ${phone} • ${role}`,
            link: `/admin/manage-users?highlightId=${e.id}&search=${encodeURIComponent(searchParam)}`,
            searchParam,
          });
        }
      });

      setModuleMatches(results);
    } catch (err) {
      console.error("Global search error", err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      findInPageOccurrences(searchQuery);
      searchModules(searchQuery);
    }, 180);

    return () => clearTimeout(timer);
  }, [searchQuery, findInPageOccurrences, searchModules]);

  // Clean up highlights on unmount
  useEffect(() => {
    return () => {
      document.querySelectorAll(".active-find-match").forEach((el) => {
        el.classList.remove("active-find-match", "ring-4", "ring-blue-600", "bg-amber-200/90", "rounded-md");
      });
    };
  }, []);

  return {
    inPageMatches,
    activeMatchIndex,
    moduleMatches,
    isSearching,
    nextMatch,
    prevMatch,
    jumpToMatch,
    clearHighlights,
  };
}
