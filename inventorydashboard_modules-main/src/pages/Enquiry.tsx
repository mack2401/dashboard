// src/pages/EnquiryPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { type ColumnDef } from "@tanstack/react-table";
import DataTable from "../components/Table/DataTable";
import Pagination from "../components/Pagination";
import KPICard from "../components/KPICard";
import { useItemHighlighter } from "../hooks/useItemHighlighter";
import { ItemLocatedBanner } from "../components/common/ItemLocatedBanner";
import type { Enquiry } from "../types/enquiry";
import AddEditModal from "../components/modals/AddEditModal";
import {
  deleteDoc,
  doc,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  getDocs,
  where,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../App";
import {
  User,
  Phone,
  Mail,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  MessageSquare,
  IndianRupee,
  CheckCircle2,
  AlertCircle,
  Filter,
  Plus,
  RefreshCw,
  Layers,
  Calendar,
  Building,
  MapPin,
  Clock,
  Check,
  ShoppingCart,
  GraduationCap,
  Package,
  FileText,
  Edit3,
} from "lucide-react";

interface ParsedMaterialItem {
  productName: string;
  quantity: number;
}

const parseMaterialsList = (raw: any): ParsedMaterialItem[] => {
  if (!raw) return [];
  let list: any[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "-" || trimmed.toLowerCase() === "n/a") return [];
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        list = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return trimmed.split(",").map((s) => ({
          productName: s.trim(),
          quantity: 1,
        })).filter((p) => p.productName);
      }
    } else {
      return trimmed.split(",").map((s) => ({
        productName: s.trim(),
        quantity: 1,
      })).filter((p) => p.productName);
    }
  } else if (typeof raw === "object") {
    list = [raw];
  }

  return list.map((item) => {
    if (typeof item === "string") {
      return { productName: item.trim(), quantity: 1 };
    }
    const name = String(
      item.productName ||
      item.name ||
      item.product ||
      item.title ||
      item.description ||
      item.productId ||
      "Item"
    ).trim();
    const qty = Number(item.quantity ?? item.qty ?? item.count ?? 1) || 1;
    return { productName: name, quantity: qty };
  }).filter((m) => m.productName && m.productName !== "undefined" && m.productName !== "null");
};

const getEnquiryDate = (ts: any): Date | null => {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts instanceof Date) return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
};

const formatEnquiryDateString = (ts: any): string => {
  const d = getEnquiryDate(ts);
  if (!d) return "";
  const localeStr = d.toLocaleString().toLowerCase();
  const dateStr = d.toLocaleDateString().toLowerCase();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const customFormats = `${day}/${month}/${year} ${day}-${month}-${year} ${year}-${month}-${day} ${month}/${day}/${year}`;
  return `${localeStr} ${dateStr} ${customFormats}`;
};

const getEnquiryMobile = (enquiry: any): string => {
  if (!enquiry) return "";
  const val =
    enquiry.contactNumber ??
    enquiry.customerContact ??
    enquiry.mobile ??
    enquiry.phone ??
    enquiry.customer?.contactNumber ??
    enquiry.customer?.phone ??
    enquiry.customer?.mobile ??
    enquiry.companyDetails?.companyMobile ??
    "";
  return String(val ?? "").trim();
};

const getEnquiryCustomerName = (enquiry: any): string => {
  if (!enquiry) return "";
  const val =
    enquiry.customer?.name ??
    enquiry.customerName ??
    enquiry.contactPerson ??
    "";
  return String(val ?? "").trim();
};

const matchPhone = (phoneStr: string, query: string): boolean => {
  if (!phoneStr || !query) return false;
  const pRaw = phoneStr.toLowerCase();
  const qRaw = query.toLowerCase();
  if (pRaw.includes(qRaw)) return true;

  // Compare cleaned digits (ignores spaces, +, -, (), etc.)
  const pDigits = phoneStr.replace(/\D/g, "");
  const qDigits = query.replace(/\D/g, "");
  if (qDigits.length >= 1 && pDigits.includes(qDigits)) {
    return true;
  }
  return false;
};

const getEnquiryCategory = (enquiry: any): "ecommerce" | "academic" => {
  if (!enquiry) return "ecommerce";
  const enqType = String(enquiry.type || "").toLowerCase().trim();
  const enqMode = String(enquiry.mode || enquiry.source || "").toLowerCase().trim();
  const enqCourse = String(enquiry.course || enquiry.preferredCourse || enquiry.trainingCourse || "").toLowerCase().trim();
  const materials = String(enquiry.materials || enquiry.productName || enquiry.description || "").toLowerCase().trim();

  if (
    enqType === "academic" ||
    enqType === "training" ||
    enqType.includes("train") ||
    enqType.includes("course") ||
    enqType.includes("workshop") ||
    enqType.includes("academic") ||
    enqMode === "training" ||
    enqMode.includes("academic") ||
    enqCourse.length > 0 ||
    materials.includes("training") ||
    materials.includes("course") ||
    materials.includes("workshop") ||
    materials.includes("internship")
  ) {
    return "academic";
  }
  return "ecommerce";
};

type UserProfile = {
  id: string;
  role: "admin" | "manager" | "staff";
  [key: string]: any;
};

type EmployeeDoc = {
  id?: string;
  employeeName?: string;
  name?: string;
  email?: string;
  uid?: string;
  [k: string]: any;
};

interface EnquiryPageProps {
  defaultCategory?: "all" | "ecommerce" | "academic";
}

export default function EnquiryPage({ defaultCategory }: EnquiryPageProps = {}) {
  const { user } = useAuth();
  const location = useLocation();

  // Helper to determine initial category from props, path, or query params
  const resolveInitialCategory = (): "all" | "ecommerce" | "academic" => {
    if (defaultCategory) return defaultCategory;
    if (location.pathname.includes("/ecommerce")) return "ecommerce";
    if (location.pathname.includes("/academic")) return "academic";
    const params = new URLSearchParams(location.search);
    const typeParam = params.get("type") || params.get("category");
    if (typeParam === "ecommerce") return "ecommerce";
    if (typeParam === "academic") return "academic";
    return "all";
  };

  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);

  // Prevent background page from scrolling when view modal or add/edit modal is open
  useEffect(() => {
    if (viewModalOpen || modalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [viewModalOpen, modalOpen]);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeDoc[]>([]);
  const [employeesByEmail, setEmployeesByEmail] = useState<Record<string, EmployeeDoc>>({});
  const [employeesByUid, setEmployeesByUid] = useState<Record<string, EmployeeDoc>>({});

  // Filter states for controlled filtering
  const [globalSearch, setGlobalSearch] = useState<string>("");
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});
  const [dateRangeFilters, setDateRangeFilters] = useState<Record<string, { from: string; to: string }>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "testing" | "pending" | "dropped">("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "ecommerce" | "academic">(resolveInitialCategory);

  // Global search & notification deep-linking highlighter
  const {
    highlightId,
    targetSearch,
    targetName,
    isBannerVisible,
    clearHighlight,
    scrollToAndHighlight,
  } = useItemHighlighter();

  // Populate search filter when navigated from search/notification
  useEffect(() => {
    if (targetSearch) {
      setGlobalSearch(targetSearch);
    }
  }, [targetSearch]);

  // Sync category filter when URL changes (e.g. clicking sidebar E-Commerce or Academic links)
  useEffect(() => {
    setCategoryFilter(resolveInitialCategory());
  }, [location.pathname, location.search, defaultCategory]);
  const [modeFilter, setModeFilter] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshTrigger((prev) => prev + 1);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case "admin":
        return "bg-rose-50 text-rose-700 border border-rose-200";
      case "manager":
        return "bg-blue-50 text-blue-700 border border-blue-200";
      default:
        return "bg-slate-100 text-slate-700 border border-slate-200";
    }
  };

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Reset to first page when any search or filter criteria changes
  useEffect(() => {
    setCurrentPage(1);
  }, [globalSearch, columnSearch, dateRangeFilters, statusFilter, modeFilter, categoryFilter]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "employees"), (snap) => {
      const byEmail: Record<string, EmployeeDoc> = {};
      const byUid: Record<string, EmployeeDoc> = {};
      const allEmployees: EmployeeDoc[] = [];
      snap.docs.forEach((d) => {
        const data = { id: d.id, ...d.data() } as EmployeeDoc;
        const email = (data.email ?? "").toString().toLowerCase();

        if (email) byEmail[email] = data;
        byUid[data.id!] = data;
        allEmployees.push(data);
      });
      setEmployeesByEmail(byEmail);
      setEmployeesByUid(byUid);
      setEmployees(allEmployees);
    }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setIsLoading(false);
      return;
    }
    const userDocRef = doc(db, "employees", user.uid);
    const unsubProfile = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setCurrentUserProfile({ id: docSnap.id, ...docSnap.data() } as UserProfile);
      } else {
        setIsLoading(false);
        console.error("Current user profile not found in 'employees' collection.");
      }
    });
    return () => unsubProfile();
  }, [user]);

  useEffect(() => {
    if (!currentUserProfile) return;

    setIsLoading(true);

    const enquiriesRef = collection(db, "enquiries");
    const employeesRef = collection(db, "employees");

    const loadData = async () => {
      const empSnap = await getDocs(employeesRef);

      const employeeMap: Record<string, string> = {};
      empSnap.forEach((doc) => {
        const empData = doc.data() as EmployeeDoc;
        employeeMap[doc.id] = empData.employeeName || empData.name || "Unknown";
      });

      let q = query(enquiriesRef, orderBy("createdAt", "desc"));

      if (currentUserProfile.role === "staff") {
        q = query(
          enquiriesRef,
          where("assignedTo", "==", currentUserProfile.id),
          orderBy("createdAt", "desc")
        );
      } else if (currentUserProfile.role === "manager") {
        const teamsQuery = query(
          collection(db, "teams"),
          where("managerId", "==", currentUserProfile.id),
          limit(1)
        );

        const teamSnap = await getDocs(teamsQuery);

        const staffIds = !teamSnap.empty
          ? (teamSnap.docs[0].data().staff || []).map((s: any) => s.id)
          : [];

        const visibleIds = [currentUserProfile.id, ...staffIds].filter(Boolean);

        if (visibleIds.length > 0) {
          q = query(
            enquiriesRef,
            where("assignedTo", "in", visibleIds),
            orderBy("createdAt", "desc")
          );
        }
      }

      const unsub = onSnapshot(q, (snap) => {
        const data: Enquiry[] = snap.docs.map((doc) => {
          const enquiryData = doc.data() as Enquiry;

          return {
            ...enquiryData,
            id: doc.id,
            assignedToName:
              employeeMap[enquiryData.assignedTo] || "Not Assigned",
          };
        });

        setEnquiries(data);
        setIsLoading(false);
        // Reset to first page when new data loads
        setCurrentPage(1);
      });

      return unsub;
    };

    let unsubscribe: (() => void) | undefined;

    loadData().then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentUserProfile, refreshTrigger]);

  // Category counts for All / E-commerce / Academic
  const categoryCounts = useMemo(() => {
    let ecommerce = 0;
    let academic = 0;
    enquiries.forEach((e) => {
      const cat = getEnquiryCategory(e);
      if (cat === "academic") academic++;
      else ecommerce++;
    });
    return { all: enquiries.length, ecommerce, academic };
  }, [enquiries]);

  // Apply filters to the full dataset
  const filteredEnquiries = useMemo(() => {
    const qLower = globalSearch.trim().toLowerCase();

    return enquiries.filter((enquiry) => {
      // 0a. Channel / Category filter (all | ecommerce | academic)
      if (categoryFilter !== "all") {
        const cat = getEnquiryCategory(enquiry);
        if (cat !== categoryFilter) return false;
      }

      // 0b. Status filter tab
      if (statusFilter !== "all") {
        const s = (enquiry.status || "").toLowerCase().trim();
        const isApproved = s === "approved" || s === "delivered" || s === "dispatched";
        const isTesting = s === "testing";
        const isDropped = s === "dropped";
        const isInProgress = !isApproved && !isTesting && !isDropped;

        if (statusFilter === "approved" && !isApproved) return false;
        if (statusFilter === "testing" && !isTesting) return false;
        if (statusFilter === "dropped" && !isDropped) return false;
        if (statusFilter === "pending" && !isInProgress) return false;
      }

      // 0c. Mode / Source filter dropdown
      if (modeFilter !== "all") {
        const m = (enquiry.mode || "").toLowerCase().trim();
        if (m !== modeFilter.toLowerCase().trim()) return false;
      }

      // 1. Global search across all key fields (Customer Name, Mobile Number, Date, Enq ID, City, Status, etc.)
      if (qLower) {
        const custName = getEnquiryCustomerName(enquiry).toLowerCase();
        const mobile = getEnquiryMobile(enquiry);
        const enqId = (enquiry.enqId || "").toLowerCase();
        const dateStr = formatEnquiryDateString(enquiry.createdAt);
        const city = (enquiry.city || "").toLowerCase();
        const state = (enquiry.state || "").toLowerCase();
        const type = (enquiry.type || "").toLowerCase();
        const status = (enquiry.status || "").toLowerCase();
        const paymentStatus = (enquiry.paymentStatus || "").toLowerCase();
        const paymentSubStatus = (enquiry.paymentSubStatus || "").toLowerCase();
        const shipmentStatus = (enquiry.shipmentStatus || "").toLowerCase();
        const remarks = (enquiry.remarks || "").toLowerCase();
        const assigned = (enquiry.assignedToName || "").toLowerCase();

        const matchesGlobal =
          custName.includes(qLower) ||
          matchPhone(mobile, qLower) ||
          dateStr.includes(qLower) ||
          enqId.includes(qLower) ||
          city.includes(qLower) ||
          state.includes(qLower) ||
          type.includes(qLower) ||
          status.includes(qLower) ||
          paymentStatus.includes(qLower) ||
          paymentSubStatus.includes(qLower) ||
          shipmentStatus.includes(qLower) ||
          remarks.includes(qLower) ||
          assigned.includes(qLower);

        if (!matchesGlobal) return false;
      }

      // 2. Column-specific search (partial substring match, case-insensitive)
      const textMatch = Object.entries(columnSearch).every(([key, queryVal]) => {
        if (!queryVal || !queryVal.trim()) return true;
        const target = queryVal.trim().toLowerCase();

        if (key === "customerName") {
          const custName = getEnquiryCustomerName(enquiry).toLowerCase();
          const mobile = getEnquiryMobile(enquiry);
          return custName.includes(target) || matchPhone(mobile, target);
        }

        if (key === "contactNumber") {
          const mobile = getEnquiryMobile(enquiry);
          return matchPhone(mobile, target);
        }

        if (key === "createdAt") {
          const dateStr = formatEnquiryDateString(enquiry.createdAt);
          return dateStr.includes(target);
        }

        const value = (enquiry as any)[key];
        if (value === undefined || value === null) return false;
        let displayValue = "";
        if (value?.toDate) displayValue = value.toDate().toLocaleString();
        else displayValue = String(value);
        return displayValue.toLowerCase().includes(target);
      });

      if (!textMatch) return false;

      // 3. Date range filters
      const dateRangeMatch = Object.entries(dateRangeFilters).every(([key, range]) => {
        if (!range.from && !range.to) return true;
        const value = (enquiry as any)[key];
        if (!value) return false;
        const dateValue = getEnquiryDate(value);
        if (!dateValue || isNaN(dateValue.getTime())) return false;
        if (range.from && dateValue < new Date(range.from)) return false;
        if (range.to) {
          const toDate = new Date(range.to);
          toDate.setHours(23, 59, 59, 999);
          if (dateValue > toDate) return false;
        }
        return true;
      });

      return dateRangeMatch;
    });
  }, [enquiries, globalSearch, columnSearch, dateRangeFilters, statusFilter, modeFilter, categoryFilter]);

  // Executive summary statistics for top KPI cards (reflects selected category filter)
  const statistics = useMemo(() => {
    const pool =
      categoryFilter === "all"
        ? enquiries
        : enquiries.filter((e) => getEnquiryCategory(e) === categoryFilter);

    let totalCount = pool.length;
    let activeCount = 0;
    let totalPipelineVal = 0;
    let approvedCnt = 0;
    let approvedVal = 0;
    let testingCnt = 0;
    let testingVal = 0;
    let droppedCnt = 0;
    let droppedVal = 0;
    let inProgressCnt = 0;
    let inProgressVal = 0;
    let dispatchedCnt = 0;
    let deliveredCnt = 0;

    pool.forEach((enq) => {
      const rawVal = enq.value;
      const val = typeof rawVal === "number" ? rawVal : Number(rawVal) || 0;
      totalPipelineVal += val;

      const s = (enq.status || "").toLowerCase().trim();
      const isApproved = s === "approved" || s === "delivered" || s === "dispatched";
      const isTesting = s === "testing";
      const isDropped = s === "dropped";

      if (s === "dispatched") dispatchedCnt++;
      if (s === "delivered") deliveredCnt++;

      if (isApproved) {
        approvedCnt++;
        approvedVal += val;
        activeCount++;
      } else if (isTesting) {
        testingCnt++;
        testingVal += val;
        activeCount++;
      } else if (isDropped) {
        droppedCnt++;
        droppedVal += val;
      } else {
        inProgressCnt++;
        inProgressVal += val;
        activeCount++;
      }
    });

    const conversionRate = totalCount > 0 ? (approvedCnt / totalCount) * 100 : 0;

    return {
      totalCount,
      activeCount,
      totalPipelineVal,
      approvedCnt,
      approvedVal,
      testingCnt,
      testingVal,
      droppedCnt,
      droppedVal,
      inProgressCnt,
      inProgressVal,
      dispatchedCnt,
      deliveredCnt,
      conversionRate,
    };
  }, [enquiries, categoryFilter]);

  // Available unique modes for dropdown
  const availableModes = useMemo(() => {
    const modes = new Set<string>();
    enquiries.forEach((e) => {
      if (e.mode && typeof e.mode === "string" && e.mode.trim()) {
        modes.add(e.mode.trim());
      }
    });
    return Array.from(modes).sort();
  }, [enquiries]);

  // Compute unique values for each column (for the autocomplete dropdown)
  const columnUniqueValues = useMemo(() => {
    const uniqueMap: Record<string, Set<string>> = {};
    // Use the full enquiries (unfiltered) to get all possible values
    enquiries.forEach((enquiry) => {
      Object.keys(enquiry).forEach((key) => {
        const value = (enquiry as any)[key];
        if (value === undefined || value === null) return;
        let displayValue = "";
        if (value?.toDate) displayValue = value.toDate().toLocaleString();
        else displayValue = String(value);
        if (displayValue.trim() === "") return;
        if (!uniqueMap[key]) uniqueMap[key] = new Set();
        uniqueMap[key].add(displayValue);
      });
    });
    // Convert Sets to sorted arrays
    const result: Record<string, string[]> = {};
    Object.keys(uniqueMap).forEach((key) => {
      result[key] = Array.from(uniqueMap[key]).sort();
    });
    return result;
  }, [enquiries]);

  // 🔥 UPDATED: Function to fetch ALL enquiries for export with date range filtering
  const fetchAllEnquiries = async (dateRange?: { from: string; to: string }): Promise<Enquiry[]> => {
    try {
      // We need to fetch all enquiries based on the user's role
      const enquiriesRef = collection(db, "enquiries");
      let q = query(enquiriesRef, orderBy("createdAt", "desc"));

      // 🔥 FIX: Apply date range filter at the database level if provided
      if (dateRange && dateRange.from && dateRange.to) {
        const fromDate = new Date(dateRange.from);
        const toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999);

        q = query(
          enquiriesRef,
          where("createdAt", ">=", fromDate),
          where("createdAt", "<=", toDate),
          orderBy("createdAt", "desc")
        );
      }

      if (currentUserProfile?.role === "staff") {
        q = query(
          q,
          where("assignedTo", "==", currentUserProfile.id)
        );
      } else if (currentUserProfile?.role === "manager") {
        const teamsQuery = query(
          collection(db, "teams"),
          where("managerId", "==", currentUserProfile.id),
          limit(1)
        );
        const teamSnap = await getDocs(teamsQuery);
        const staffIds = !teamSnap.empty
          ? (teamSnap.docs[0].data().staff || []).map((s: any) => s.id)
          : [];
        const visibleIds = [currentUserProfile.id, ...staffIds].filter(Boolean);
        if (visibleIds.length > 0) {
          q = query(
            q,
            where("assignedTo", "in", visibleIds)
          );
        }
      }

      // Fetch all documents (no limit)
      const querySnapshot = await getDocs(q);

      // Get employee map for assignedToName
      const empSnap = await getDocs(collection(db, "employees"));
      const employeeMap: Record<string, string> = {};
      empSnap.forEach((doc) => {
        const empData = doc.data() as EmployeeDoc;
        employeeMap[doc.id] = empData.employeeName || empData.name || "Unknown";
      });

      const allEnquiries = querySnapshot.docs.map((doc) => {
        const enquiryData = doc.data() as Enquiry;
        return {
          ...enquiryData,
          id: doc.id,
          assignedToName: employeeMap[enquiryData.assignedTo] || "Not Assigned",
        };
      });

      return allEnquiries;
    } catch (error) {
      console.error("Error fetching all enquiries for export:", error);
      throw error;
    }
  };

  // Calculate pagination values
  const totalPages = Math.ceil(filteredEnquiries.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = filteredEnquiries.slice(startIndex, endIndex);

  // Ensure targeted enquiry is on current page and scrolled to
  useEffect(() => {
    if (highlightId && filteredEnquiries.length > 0) {
      const foundIdx = filteredEnquiries.findIndex(
        (e) => e.id === highlightId || e.enqId === highlightId
      );
      if (foundIdx >= 0) {
        const targetPage = Math.floor(foundIdx / itemsPerPage) + 1;
        if (currentPage !== targetPage) {
          setCurrentPage(targetPage);
        }
        scrollToAndHighlight(`row-${highlightId}`);
      }
    }
  }, [highlightId, filteredEnquiries, itemsPerPage, currentPage, scrollToAndHighlight]);

  // Column definitions with "Sr." column for continuous numbering
  const columns = useMemo<ColumnDef<Enquiry, any>[]>(() => {
    return [
      {
        id: "srNo",
        header: "Sr.",
        cell: ({ row }) => {
          // Calculate the continuous serial number across all pages
          const serialNumber = startIndex + row.index + 1;
          return <span className="text-xs font-bold text-gray-600 block text-center">{serialNumber}</span>;
        },
      },
      {
        id: "enqId",
        header: "Enquiry ID",
        cell: ({ row }) => (
          <button
            onClick={() => {
              setSelectedEnquiry(row.original);
              setViewModalOpen(true);
            }}
            className="text-blue-600 hover:text-blue-800 hover:underline font-mono text-xs font-semibold cursor-pointer"
          >
            {row.original.enqId}
          </button>
        ),
      },
      {
        id: "createdAt",
        header: "Date",
        accessorFn: (r: any) => r.createdAt ?? null,
        cell: ({ row }) => {
          const d = getEnquiryDate(row.original.createdAt);
          if (!d) return <span className="text-gray-400 text-xs">-</span>;
          return (
            <span className="text-xs text-gray-600 font-medium whitespace-nowrap">
              {d.toLocaleDateString("en-IN")}
            </span>
          );
        },
      },
      {
        id: "customerName",
        header: "Customer",
        accessorFn: (r: any) => getEnquiryCustomerName(r) || "-",
        cell: ({ row }) => {
          const customerName = getEnquiryCustomerName(row.original) || "-";
          const mobile = getEnquiryMobile(row.original);

          return (
            <div className="py-0.5 max-w-[130px] sm:max-w-[150px]">
              <div className="text-xs font-semibold text-gray-900 truncate" title={customerName}>{customerName}</div>
              {mobile && (
                <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5 font-normal font-mono truncate" title={mobile}>
                  <Phone className="w-3 h-3 text-slate-700 inline flex-shrink-0" />
                  <span>{mobile}</span>
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: "channel",
        header: "Channel",
        accessorFn: (r: any) => getEnquiryCategory(r),
        cell: ({ row }) => {
          const cat = getEnquiryCategory(row.original);
          if (cat === "academic") {
            return (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">
                <GraduationCap className="w-3 h-3 text-purple-600" />
                Academic
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
              <ShoppingCart className="w-3 h-3 text-blue-600" />
              E-commerce
            </span>
          );
        },
      },
      {
        id: "value",
        header: "Value",
        accessorFn: (r: any) => r.value ?? null,
        cell: ({ row }) => {
          const val = row.original.value;
          if (val === null || val === undefined || val === "") return <span className="text-gray-400 text-xs">-</span>;
          const num = typeof val === 'number' ? val : parseFloat(String(val));
          if (isNaN(num)) return <span className="text-gray-400 text-xs">-</span>;

          return (
            <span className="text-xs font-bold text-gray-900 font-mono">
              ₹{num.toLocaleString("en-IN")}
            </span>
          );
        }
      },
      {
        id: "mode",
        header: "Source",
        accessorFn: (r: any) => r.mode ?? "-",
              cell: ({row}) => {
          const mode = row.original.mode;
          if (!mode) return <span className="text-gray-400">-</span>;
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
              {mode}
            </span>
          );
        }
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (r: any) => r.status ?? "-",
              cell: ({row}) => {
          const rawStatus = (row.original.status || "").toLowerCase().trim();
              if (rawStatus === "testing") {
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                🧪 Testing
              </span>
            );
          }
                if (rawStatus === "approved" || rawStatus === "delivered" || rawStatus === "dispatched") {
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 capitalize">
                ✓ {row.original.status || "Approved"}
              </span>
            );
          }
                  if (rawStatus === "dropped") {
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                ✕ Dropped
              </span>
            );
          }
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
              {row.original.status || "-"}
            </span>
          );
        }
      },
      {
        id: "paymentStatus",
        header: "Payment",
        accessorFn: (r: any) => r.paymentStatus ?? "-",
                    cell: ({row}) => {
          const ps = (row.original.paymentStatus || "").toLowerCase().trim();
                    if (ps === "paid" || ps === "completed") {
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                PAID
              </span>
            );
          }
                      if (ps === "pending") {
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                PENDING
              </span>
            );
          }
                        return <span>{row.original.paymentStatus || "-"}</span>;
                        return <span className="text-xs text-gray-600 font-medium">{row.original.paymentStatus || "-"}</span>;
        }
      },
                        {
                          id: "paymentSubStatus",
                        header: "Payment Sub Status",
        accessorFn: (r: any) => r.paymentSubStatus ?? "-"
      },
                        {
                          id: "shipmentStatus",
                        header: "Shipment Status",
        accessorFn: (r: any) => r.shipmentStatus ?? "-"
      },
                        {
                          id: "subStatus",
                        header: "Sub-Status",
        accessorFn: (r: any) => r.subStatus ?? "-"
      },
                        {
                          id: "reason",
                        header: "Reason",
        accessorFn: (r: any) => r.reason ?? "-"
      },
                        {
                          id: "assignedToName",
                        header: "Assigned To",
        accessorFn: (row: any) => row.assignedTo ?? null,
                        cell: ({row}) => {
          const assignedUid = row.original.assignedTo as string;
          if (!assignedUid) return <span className="text-gray-400 text-xs">Unassigned</span>;
          const employee = employeesByUid[assignedUid];
          const name = employee?.employeeName || employee?.name || "Unassigned";
          return <span className="text-xs font-medium text-gray-700 max-w-[110px] truncate block" title={name}>{name}</span>;
        },
      },
                        {
                          id: "materials",
                        header: "Materials",
        accessorFn: (r: any) => r.materials ?? "-",
                        cell: ({row}) => {
          const items = parseMaterialsList(row.original.materials);
                        if (items.length === 0) return <span className="text-gray-400 text-xs">-</span>;
                        return (
                        <div className="flex flex-col gap-1 py-1 max-w-[220px]">
                          {items.slice(0, 2).map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-gray-800 truncate" title={item.productName}>
                                {item.productName}
                              </span>
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 font-mono flex-shrink-0">
                                × {item.quantity}
                              </span>
                            </div>
                          ))}
                          {items.length > 2 && (
                            <span className="text-[10px] font-semibold text-gray-400">
                              +{items.length - 2} more items
                            </span>
                          )}
                        </div>
                        );
        },
      },
      {
        id: "remarks",
        header: "Remarks",
        accessorFn: (r: any) => r.remarks ?? "-"
      },
      {
        id: "type",
        header: "Type",
        accessorFn: (r: any) => r.type ?? "-",
        cell: ({ row }) => {
          const t = String(row.original.type || "").toUpperCase().trim();
          if (t.includes("B2B")) {
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                B2B
              </span>
            );
          }
          if (t.includes("B2C")) {
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                B2C
              </span>
            );
          }
          return <span className="text-gray-600 text-xs font-medium">{row.original.type || "-"}</span>;
        }
      },
      {
        id: "state",
        header: "State",
        accessorFn: (r: any) => r.state ?? "-"
      },
      {
        id: "city",
        header: "City",
        accessorFn: (r: any) => r.city ?? "-"
      },
      {
        id: "contactNumber",
        header: "Contact",
        accessorFn: (r: any) => r.contactNumber ?? "-"
      },
      {
        id: "email",
        header: "Email",
        accessorFn: (r: any) => r.email ?? "-"
      },
    ];
  }, [employeesByUid, startIndex]);

  const handleDelete = async (item: Enquiry) => {
    if (!item.id) {
                              console.error("Cannot delete: item is missing a document ID.");
                            return;
    }
                            try {
                              await deleteDoc(doc(db, "enquiries", item.id));
    } catch (err) {
                              console.error("Failed to delete enquiry:", err);
                            console.error("User needs to be notified: There was an error deleting the enquiry.");
    }
  };

                            const generateNextEnqId = async (): Promise<string> => {
    try {
      const q = query(collection(db, "enquiries"), orderBy("createdAt", "desc"), limit(1));
                              const snap = await getDocs(q);

                              if (!snap.empty) {
        const lastId = snap.docs[0].data().enqId as string;
                              console.log("Last ID found:", lastId);
                              const num = parseInt(lastId.replace("IB", ""), 10) || 0;
                              const nextNum = num + 1;
                              return `IB${nextNum.toString().padStart(3, "0")}`;
      }
                              return "IB001";
    } catch (err) {
                                console.error("Error generating next Enquiry ID:", err);
                              return "IB001";
    }

  };


                              // Calculate the display range for the "Showing X to Y of Z entries" text
                              const startEntry = filteredEnquiries.length === 0 ? 0 : startIndex + 1;
                              const endEntry = Math.min(endIndex, filteredEnquiries.length);

                              return (
                              <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 font-sans">
                                <div className="max-w-7xl mx-auto space-y-6">
                                  {/* Page Header */}
                                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
                                          <MessageSquare className="w-5 h-5" />
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                                              Customer Enquiries
                                            </h1>
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${getRoleBadgeColor(currentUserProfile?.role)}`}>
                                              {currentUserProfile?.role || "Staff"}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex flex-wrap items-center gap-2.5">
                                      <button
                                        onClick={handleRefresh}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white hover:bg-gray-50 text-gray-700 rounded-xl border border-gray-200/90 shadow-xs transition cursor-pointer"
                                      >
                                        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                                        Refresh
                                      </button>
                                      <button
                                        onClick={async () => {
                                          const nextId = await generateNextEnqId();
                                          setSelectedEnquiry({
                                            enqId: nextId,
                                            assignedTo: user?.uid ?? "",
                                            statusHistory: [],
                                          } as Enquiry);
                                          setModalOpen(true);
                                        }}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-xs transition cursor-pointer"
                                      >
                                        <Plus className="w-4 h-4" />
                                        + New Enquiry
                                      </button>
                                    </div>
                                  </div>

                                  {/* Top Summary Statistics KPI Cards */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                                    <KPICard
                                      title="Total Enquiries"
                                      value={statistics.totalCount}
                                      icon={<MessageSquare className="w-4 h-4" />}
                                      iconBg="bg-slate-100"
                                      iconColor="text-slate-700"
                                      subtitle={`${statistics.activeCount} Active • ${statistics.conversionRate.toFixed(1)}% Conversion`}
                                    />

                                    <KPICard
                                      title="Pipeline Value"
                                      value={`₹${statistics.totalPipelineVal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                      icon={<IndianRupee className="w-4 h-4" />}
                                      iconBg="bg-emerald-50"
                                      iconColor="text-emerald-600"
                                      valueColor="text-emerald-700"
                                      titleColor="text-emerald-700"
                                      subtitle={`₹${statistics.approvedVal.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Approved Value`}
                                    />

                                    <KPICard
                                      title="Approved Orders"
                                      value={statistics.approvedCnt}
                                      icon={<CheckCircle2 className="w-4 h-4" />}
                                      iconBg="bg-indigo-50"
                                      iconColor="text-indigo-600"
                                      valueColor="text-indigo-700"
                                      titleColor="text-indigo-700"
                                      subtitle={`${statistics.dispatchedCnt + statistics.deliveredCnt} Dispatched / Delivered`}
                                    />

                                    <KPICard
                                      title="In Progress & Testing"
                                      value={statistics.inProgressCnt + statistics.testingCnt}
                                      icon={<Clock className="w-4 h-4" />}
                                      iconBg="bg-amber-50"
                                      iconColor="text-amber-600"
                                      valueColor="text-amber-700"
                                      titleColor="text-amber-700"
                                      subtitle={`${statistics.testingCnt} Testing • ${statistics.droppedCnt} Dropped`}
                                    />
                                  </div>

                                  {/* Channel / Category Selector (All Channels / E-commerce / Academic) */}
                                  <div className="bg-white p-3 rounded-2xl border border-gray-200/90 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-semibold">
                                        <Filter className="w-4 h-4 text-slate-600" />
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Channel View</h3>
                                          <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                            {categoryFilter === "all" ? "Viewing Both" : categoryFilter === "ecommerce" ? "E-commerce Only" : "Academic Only"}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl overflow-x-auto">
                                      <button
                                        onClick={() => setCategoryFilter("all")}
                                        className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${categoryFilter === "all"
                                          ? "bg-white text-gray-900 shadow-xs"
                                          : "text-gray-600 hover:text-gray-900"
                                          }`}
                                      >
                                        <Layers className="w-3.5 h-3.5" />
                                        <span>All Channels ({categoryCounts.all})</span>
                                      </button>

                                      <button
                                        onClick={() => setCategoryFilter("ecommerce")}
                                        className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${categoryFilter === "ecommerce"
                                          ? "bg-slate-900 text-white shadow-xs"
                                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50"
                                          }`}
                                      >
                                        <ShoppingCart className="w-3.5 h-3.5" />
                                        <span>E-commerce ({categoryCounts.ecommerce})</span>
                                      </button>

                                      <button
                                        onClick={() => setCategoryFilter("academic")}
                                        className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${categoryFilter === "academic"
                                          ? "bg-purple-600 text-white shadow-xs"
                                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50"
                                          }`}
                                      >
                                        <GraduationCap className="w-3.5 h-3.5" />
                                        <span>Academic ({categoryCounts.academic})</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Status Filter Tabs (Segmented Control Pill Bar) */}
                                  <div className="flex items-center gap-1.5 p-1 bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-x-auto">
                                    {[
                                      { id: "all", label: "All Enquiries", count: statistics.totalCount },
                                      { id: "approved", label: "Approved / Orders", count: statistics.approvedCnt },
                                      { id: "testing", label: "Testing", count: statistics.testingCnt },
                                      { id: "pending", label: "In Progress", count: statistics.inProgressCnt },
                                      { id: "dropped", label: "Dropped", count: statistics.droppedCnt },
                                    ].map((tab) => {
                                      const isActive = statusFilter === tab.id;
                                      return (
                                        <button
                                          key={tab.id}
                                          onClick={() => setStatusFilter(tab.id as any)}
                                          className={`
                  flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap
                  ${isActive
                                              ? "bg-slate-900 text-white shadow-xs"
                                              : "text-gray-600 hover:text-gray-900 hover:bg-gray-100/70"
                                            }
                `}
                                        >
                                          <span>{tab.label}</span>
                                          <span
                                            className={`
                    px-2 py-0.5 rounded-full text-[10px] font-bold
                    ${isActive
                                                ? "bg-white/20 text-white"
                                                : "bg-gray-100 text-gray-600"
                                              }
                  `}
                                          >
                                            {tab.count}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {/* Multi-Criteria Filter & Search Panel */}
                                  <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90">
                                    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                                      {/* Search Input */}
                                      <div className="relative flex-1">
                                        <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                        <input
                                          type="text"
                                          value={globalSearch}
                                          onChange={(e) => setGlobalSearch(e.target.value)}
                                          placeholder="Search by Customer, Mobile, Enq ID, City, Remarks..."
                                          className="w-full pl-10 pr-10 py-2.5 bg-slate-50/70 border border-gray-200 rounded-xl text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-400 focus:bg-white transition-all"
                                        />
                                        {globalSearch && (
                                          <button
                                            onClick={() => setGlobalSearch("")}
                                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                                            title="Clear search"
                                          >
                                            <X className="w-4 h-4" />
                                          </button>
                                        )}
                                      </div>

                                      {/* Source / Mode Filter Dropdown */}
                                      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
                                        <div className="relative w-full sm:w-56">
                                          <select
                                            value={modeFilter}
                                            onChange={(e) => setModeFilter(e.target.value)}
                                            className="w-full px-3 py-2.5 bg-slate-50/70 border border-gray-200 rounded-xl text-xs sm:text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-400 focus:bg-white transition-all cursor-pointer font-medium"
                                          >
                                            <option value="all">All Sources / Modes</option>
                                            {availableModes.map((mode) => (
                                              <option key={mode} value={mode}>
                                                {mode}
                                              </option>
                                            ))}
                                          </select>
                                        </div>

                                        {(globalSearch || modeFilter !== "all" || statusFilter !== "all" || categoryFilter !== "all") && (
                                          <button
                                            onClick={() => {
                                              setGlobalSearch("");
                                              setModeFilter("all");
                                              setStatusFilter("all");
                                              setCategoryFilter("all");
                                            }}
                                            className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/70 rounded-xl transition cursor-pointer whitespace-nowrap"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                            Reset Filters
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* Active Filter notification badge */}
                                    {(globalSearch || modeFilter !== "all" || statusFilter !== "all" || categoryFilter !== "all") && (
                                      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
                                        <div className="flex items-center gap-2">
                                          <span className="w-2 h-2 rounded-full bg-slate-700 animate-pulse"></span>
                                          <span>
                                            Showing <strong>{filteredEnquiries.length}</strong> of <strong>{enquiries.length}</strong> enquiries
                                            {categoryFilter !== "all" && (
                                              <span> &bull; Channel: <strong className="capitalize">{categoryFilter}</strong></span>
                                            )}
                                            {globalSearch && (
                                              <span> matching "<strong>{globalSearch}</strong>"</span>
                                            )}
                                            {modeFilter !== "all" && (
                                              <span> &bull; Mode: <strong>{modeFilter}</strong></span>
                                            )}
                                            {statusFilter !== "all" && (
                                              <span> &bull; Status: <strong className="capitalize">{statusFilter}</strong></span>
                                            )}
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </div>

        {isBannerVisible && (
          <ItemLocatedBanner
            itemLabel="Enquiry"
            title={targetName || targetSearch || undefined}
            onClear={() => {
              clearHighlight();
              setGlobalSearch("");
            }}
          />
        )}

        {/* DataTable Container */}
        <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden">
          <DataTable<Enquiry>
            title="Enquiries List"
            columns={columns}
            data={currentData}
            loading={isLoading}
            highlightId={highlightId}
            highlightQuery={targetSearch}
            headerBgColor="bg-slate-900"
            onAdd={async () => {
              const nextId = await generateNextEnqId();
              setSelectedEnquiry({
                enqId: nextId,
                assignedTo: user?.uid ?? "",
                statusHistory: [],
              } as Enquiry);
              setModalOpen(true);
            }}
            onView={(item) => {
              setSelectedEnquiry(item);
              setViewModalOpen(true);
            }}
            onEdit={(item) => {
              setSelectedEnquiry(item);
              setModalOpen(true);
            }}
            onDelete={handleDelete}
            defaultVisibleColumnIds={[
              'srNo',
              'enqId',
              'createdAt',
              'customerName',
              'type',
              'channel',
              'mode',
              'value',
              'status',
              'paymentStatus',
              'assignedToName'
            ]}
            showIndexColumn={false}
            disableInternalFiltering={true}
            columnSearchValues={columnSearch}
            dateRangeValues={dateRangeFilters}
            onColumnSearchChange={(key, value) => setColumnSearch((prev) => ({ ...prev, [key]: value }))}
            onDateRangeChange={(key, range) => setDateRangeFilters((prev) => ({ ...prev, [key]: range }))}
            columnUniqueValues={columnUniqueValues}
            totalRecords={enquiries.length}
            onExportAllPages={fetchAllEnquiries}
          />
        </div>

                                  {/* Clean Modern Pagination Footer */}
                                  {!isLoading && filteredEnquiries.length > 0 && (
                                    <Pagination
                                      currentPage={currentPage}
                                      totalPages={totalPages}
                                      onPageChange={setCurrentPage}
                                      totalItems={filteredEnquiries.length}
                                      itemsPerPage={itemsPerPage}
                                      filteredFromTotal={enquiries.length}
                                      className="rounded-2xl border border-gray-200/90 shadow-xs"
                                    />
                                  )}
                                </div>

                                {modalOpen && (
                                  <AddEditModal
                                    open={modalOpen}
                                    initial={selectedEnquiry}
                                    onClose={() => {
                                      setModalOpen(false);
                                      setSelectedEnquiry(null);
                                    }}
                                    onSave={() => {
                                      setModalOpen(false);
                                      setSelectedEnquiry(null);
                                    }}
                                    currentUserProfile={currentUserProfile}
                                    employees={employees}
                                  />
                                )}

                                {/* Modern Enquiry Details Modal */}
                                {viewModalOpen && selectedEnquiry && (() => {
                                  const parsedMaterials = parseMaterialsList(selectedEnquiry.materials);
                                  const enqDate = getEnquiryDate(selectedEnquiry.createdAt);
                                  const dateStr = enqDate ? enqDate.toLocaleDateString("en-IN") : "-";
                                  const assignedUid = (selectedEnquiry as any).assignedTo;
                                  const assignedName = assignedUid ? (employeesByUid[assignedUid]?.employeeName || employeesByUid[assignedUid]?.name || "Unassigned") : "Unassigned";

                                  return (
                                    <div
                                      onClick={() => setViewModalOpen(false)}
                                      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain"
                                    >
                                      <div
                                        onClick={(e) => e.stopPropagation()}
                                        onWheel={(e) => e.stopPropagation()}
                                        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-gray-100 overflow-hidden my-6 animate-fade-in flex flex-col max-h-[90vh] overscroll-contain"
                                      >
                                        {/* Modal Header */}
                                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-slate-50/70 flex-shrink-0">
                                          <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-2xl bg-slate-800 text-white flex items-center justify-center shadow-xs">
                                              <FileText className="w-5 h-5" />
                                            </div>
                                            <div>
                                              <div className="flex items-center gap-2">
                                                <h2 className="text-base font-bold text-gray-900">Enquiry Details</h2>
                                                <span className="font-mono text-xs font-semibold text-slate-700 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200">
                                                  {selectedEnquiry.enqId || "-"}
                                                </span>
                                              </div>
                                              <p className="text-xs text-gray-500 mt-0.5">
                                                Date: <span className="font-medium text-gray-700">{dateStr}</span> &nbsp;|&nbsp; Assigned: <span className="font-medium text-gray-700">{assignedName}</span>
                                              </p>
                                            </div>
                                          </div>
                                          <button
                                            onClick={() => setViewModalOpen(false)}
                                            className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-200/50 transition cursor-pointer"
                                          >
                                            <X className="w-4 h-4" />
                                          </button>
                                        </div>

                                        {/* Modal Body (Scrollable) */}
                                        <div
                                          onWheel={(e) => e.stopPropagation()}
                                          className="p-6 overflow-y-auto space-y-5 flex-1 overscroll-contain"
                                        >
                                          {/* Details Grid */}
                                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                            <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100">
                                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                                Customer Name
                                              </span>
                                              <p className="text-xs font-bold text-gray-900 truncate">
                                                {getEnquiryCustomerName(selectedEnquiry) || "-"}
                                              </p>
                                            </div>

                                            <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100">
                                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                                Contact Number
                                              </span>
                                              <p className="text-xs font-semibold text-gray-800 flex items-center gap-1.5 font-mono">
                                                <Phone className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                                                {getEnquiryMobile(selectedEnquiry) || "-"}
                                              </p>
                                            </div>

                                            <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100">
                                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                                Enquiry Type
                                              </span>
                                              <div className="flex items-center gap-1.5">
                                                <Building className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                                                {selectedEnquiry.type ? (
                                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${String(selectedEnquiry.type).toUpperCase().includes("B2B")
                                                    ? "bg-purple-100 text-purple-800 border border-purple-200"
                                                    : String(selectedEnquiry.type).toUpperCase().includes("B2C")
                                                      ? "bg-blue-100 text-blue-800 border border-blue-200"
                                                      : "bg-gray-100 text-gray-800 border border-gray-200"
                                                    }`}>
                                                    {selectedEnquiry.type}
                                                  </span>
                                                ) : (
                                                  <span className="text-xs text-gray-600">-</span>
                                                )}
                                              </div>
                                            </div>

                                            <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100">
                                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                                City / Location
                                              </span>
                                              <p className="text-xs font-semibold text-gray-800 flex items-center gap-1 truncate">
                                                <MapPin className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                                {selectedEnquiry.city ? `${selectedEnquiry.city}${selectedEnquiry.state ? `, ${selectedEnquiry.state}` : ""}` : "-"}
                                              </p>
                                            </div>

                                            <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100">
                                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                                Status
                                              </span>
                                              <p className="text-xs font-bold text-gray-800 capitalize">
                                                {selectedEnquiry.status || "-"}
                                              </p>
                                            </div>

                                            <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100">
                                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                                Total Value
                                              </span>
                                              <p className="text-sm font-bold text-emerald-700">
                                                {selectedEnquiry.value
                                                  ? `₹${Number(selectedEnquiry.value).toLocaleString("en-IN")}`
                                                  : "-"}
                                              </p>
                                            </div>

                                            {selectedEnquiry.email && (
                                              <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100 sm:col-span-2 md:col-span-3">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                                  Email Address
                                                </span>
                                                <p className="text-xs font-semibold text-gray-900 flex items-center gap-1.5 break-all">
                                                  <Mail className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                                                  {selectedEnquiry.email}
                                                </p>
                                              </div>
                                            )}
                                          </div>

                                          {/* Materials & Products Section */}
                                          <div className="bg-white rounded-2xl border border-gray-200/90 overflow-hidden shadow-xs">
                                            <div className="bg-slate-50/90 px-4 py-3 border-b border-gray-200/80 flex items-center justify-between">
                                              <div className="flex items-center gap-2">
                                                <Package className="w-4 h-4 text-slate-700" />
                                                <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                                                  Products & Materials
                                                </h3>
                                              </div>
                                              <span className="text-[11px] font-semibold text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                                                {parsedMaterials.length} {parsedMaterials.length === 1 ? "item" : "items"}
                                              </span>
                                            </div>

                                            {parsedMaterials.length > 0 ? (
                                              <div className="overflow-x-auto">
                                                <table className="w-full text-xs">
                                                  <thead className="bg-gray-50/50 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                                                    <tr>
                                                      <th className="px-4 py-2.5 text-left w-12">#</th>
                                                      <th className="px-4 py-2.5 text-left">Product Name</th>
                                                      <th className="px-4 py-2.5 text-right w-28">Quantity</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody className="divide-y divide-gray-100">
                                                    {parsedMaterials.map((mat, idx) => (
                                                      <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                                                        <td className="px-4 py-2.5 text-gray-400 font-mono text-[11px] font-medium">
                                                          {idx + 1}
                                                        </td>
                                                        <td className="px-4 py-2.5 font-semibold text-gray-900">
                                                          {mat.productName}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right">
                                                          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-lg text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200/80 font-mono">
                                                            {mat.quantity}
                                                          </span>
                                                        </td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                            ) : (
                                              <div className="py-8 text-center text-gray-400 text-xs">
                                                <Package className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
                                                No materials or products listed for this enquiry
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        {/* Modal Footer */}
                                        <div className="px-6 py-3.5 border-t border-gray-100 bg-slate-50/70 flex items-center justify-between flex-shrink-0">
                                          <span className="text-[11px] text-gray-400">
                                            Enquiry Record View
                                          </span>
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={() => {
                                                setViewModalOpen(false);
                                                setModalOpen(true);
                                              }}
                                              className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition cursor-pointer flex items-center gap-1.5"
                                            >
                                              <Edit3 className="w-3.5 h-3.5" />
                                              Edit Enquiry
                                            </button>
                                            <button
                                              onClick={() => setViewModalOpen(false)}
                                              className="px-4 py-1.5 rounded-xl text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 transition cursor-pointer"
                                            >
                                              Close
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                              );
}