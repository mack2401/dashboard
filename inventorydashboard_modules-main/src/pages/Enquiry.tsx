// src/pages/EnquiryPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import DataTable from "../components/Table/DataTable";
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
} from "lucide-react";

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

export default function EnquiryPage() {
  const { user } = useAuth();
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
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
  const [categoryFilter, setCategoryFilter] = useState<"all" | "ecommerce" | "academic">("all");
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

  // Total value of all enquiries that match current filters (across all pages)
  const filteredTotalValue = useMemo(() => {
    return filteredEnquiries.reduce((sum, enquiry) => {
      const val = enquiry.value;
      const num = typeof val === 'number' ? val : Number(val);
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
  }, [filteredEnquiries]);

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

  // Get the range of pages to show (max 5 pages at a time)
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5;

    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      const startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
      const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

      for (let i = startPage; i <= endPage; i++) {
        pageNumbers.push(i);
      }
    }

    return pageNumbers;
  };

  const pageNumbers = getPageNumbers();

  // Column definitions with "Sr." column for continuous numbering
  const columns = useMemo<ColumnDef<Enquiry, any>[]>(() => {
    return [
      {
        id: "srNo",
        header: "Sr.",
        cell: ({ row }) => {
          // Calculate the continuous serial number across all pages
          const serialNumber = startIndex + row.index + 1;
          return <span className="font-medium text-gray-600">{serialNumber}</span>;
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
        header: "Enquiry Date",
        accessorFn: (r: any) => r.createdAt ?? null,
        cell: ({ row }) => {
          const ts: any = row.original.createdAt;
          if (!ts) return "-";
          if (typeof ts.toDate === "function") return ts.toDate().toLocaleString();
          const d = new Date(ts);
          return isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
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
            <div className="py-0.5">
              <div className="font-semibold text-gray-900">{customerName}</div>
              {mobile && (
                <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5 font-normal">
                  <Phone className="w-3 h-3 text-blue-600 inline flex-shrink-0" />
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
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">
                <GraduationCap className="w-3 h-3 text-purple-600" />
                Academic
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
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
          const value = row.original.value;
          if (value === null || value === undefined || value === "") return "-";

          const formattedValue = new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
          }).format(value);

          return formattedValue;
        }
      },
      {
        id: "mode",
        header: "Source of Enquiry",
        accessorFn: (r: any) => r.mode ?? "-",
        cell: ({ row }) => {
          const mode = row.original.mode;
          if (!mode) return <span className="text-gray-400">-</span>;
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
              {mode}
            </span>
          );
        }
      },
      {
        id: "status",
        header: "Product Status",
        accessorFn: (r: any) => r.status ?? "-",
        cell: ({ row }) => {
          const rawStatus = (row.original.status || "").toLowerCase().trim();
          if (rawStatus === "testing") {
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                🧪 Testing
              </span>
            );
          }
          if (rawStatus === "approved" || rawStatus === "delivered" || rawStatus === "dispatched") {
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 capitalize">
                ✓ {row.original.status || "Approved"}
              </span>
            );
          }
          if (rawStatus === "dropped") {
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                ✕ Dropped
              </span>
            );
          }
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
              {row.original.status || "-"}
            </span>
          );
        }
      },
      {
        id: "paymentStatus",
        header: "Payment Status",
        accessorFn: (r: any) => r.paymentStatus ?? "-",
        cell: ({ row }) => {
          const ps = (row.original.paymentStatus || "").toLowerCase().trim();
          if (ps === "paid" || ps === "completed") {
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                Paid
              </span>
            );
          }
          if (ps === "pending") {
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                Pending
              </span>
            );
          }
          return <span>{row.original.paymentStatus || "-"}</span>;
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
        cell: ({ row }) => {
          const assignedUid = row.original.assignedTo as string;
          if (!assignedUid) return "UNASSIGNED";
          const employee = employeesByUid[assignedUid];
          return employee?.employeeName || employee?.name || "Unknown";
        },
      },
      {
        id: "materials",
        header: "Materials",
        accessorFn: (r: any) => r.materials ?? "-"
      },
      {
        id: "remarks",
        header: "Remarks",
        accessorFn: (r: any) => r.remarks ?? "-"
      },
      {
        id: "type",
        header: "Type",
        accessorFn: (r: any) => r.type ?? "-"
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
      }
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
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
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
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                  Manage pipeline, customer enquiries, quotation progress, and orders.
                </p>
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
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              + New Enquiry
            </button>
          </div>
        </div>

        {/* Top Summary Statistics KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. Total Enquiries */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Total Enquiries</span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-xl font-bold text-gray-900 tracking-tight truncate">
                {statistics.totalCount}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                {statistics.activeCount} Active &bull; {statistics.conversionRate.toFixed(1)}% Conversion
              </p>
            </div>
          </div>

          {/* 2. Pipeline Value */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Pipeline Value</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <IndianRupee className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-xl font-bold text-emerald-700 tracking-tight truncate">
                ₹{statistics.totalPipelineVal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-emerald-600 mt-0.5 truncate">
                ₹{statistics.approvedVal.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Approved Value
              </p>
            </div>
          </div>

          {/* 3. Approved Orders */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Approved Orders</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-xl font-bold text-indigo-700 tracking-tight truncate">
                {statistics.approvedCnt}
              </p>
              <p className="text-[11px] text-indigo-600 mt-0.5 truncate">
                {statistics.dispatchedCnt + statistics.deliveredCnt} Dispatched / Delivered
              </p>
            </div>
          </div>

          {/* 4. In Progress & Testing */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">In Progress & Testing</span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-xl font-bold text-amber-700 tracking-tight truncate">
                {statistics.inProgressCnt + statistics.testingCnt}
              </p>
              <p className="text-[11px] text-amber-600 mt-0.5 truncate">
                {statistics.testingCnt} Testing &bull; {statistics.droppedCnt} Dropped
              </p>
            </div>
          </div>
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
              <p className="text-[11px] text-gray-500">Filter enquiries between E-commerce components and Academic training</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl overflow-x-auto">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                categoryFilter === "all"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>All Channels ({categoryCounts.all})</span>
            </button>

            <button
              onClick={() => setCategoryFilter("ecommerce")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                categoryFilter === "ecommerce"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50"
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>E-commerce ({categoryCounts.ecommerce})</span>
            </button>

            <button
              onClick={() => setCategoryFilter("academic")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                categoryFilter === "academic"
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
                  ${
                    isActive
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100/70"
                  }
                `}
              >
                <span>{tab.label}</span>
                <span
                  className={`
                    px-2 py-0.5 rounded-full text-[10px] font-bold
                    ${
                      isActive
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
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50/70 border border-gray-200 rounded-xl text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
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
                  className="w-full px-3 py-2.5 bg-slate-50/70 border border-gray-200 rounded-xl text-xs sm:text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer font-medium"
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
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
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
              <span className="text-gray-500 font-medium">
                Filtered Total Value: <strong className="text-gray-900 font-semibold">₹{filteredTotalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong>
              </span>
            </div>
          )}
        </div>

        {/* DataTable Container */}
        <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden">
          <DataTable<Enquiry>
            title="Enquiries List"
            columns={columns}
            data={currentData}
            loading={isLoading}
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
              'channel',
              'mode',
              'value',
              'status',
              'paymentStatus',
              'shipmentStatus',
              'assignedToName'
            ]}
            sumColumn="value"
            sumLabel="Total Value"
            showIndexColumn={false}
            disableInternalFiltering={true}
            columnSearchValues={columnSearch}
            dateRangeValues={dateRangeFilters}
            onColumnSearchChange={(key, value) => setColumnSearch((prev) => ({ ...prev, [key]: value }))}
            onDateRangeChange={(key, range) => setDateRangeFilters((prev) => ({ ...prev, [key]: range }))}
            columnUniqueValues={columnUniqueValues}
            filteredTotal={filteredTotalValue}
            filteredTotalLabel="Total (Filtered)"
            totalRecords={enquiries.length}
            onExportAllPages={fetchAllEnquiries}
          />
        </div>

        {/* Clean Modern Pagination Footer */}
        {!isLoading && filteredEnquiries.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-gray-200/90 shadow-xs">
            <div className="text-xs sm:text-sm text-gray-600 font-medium">
              Showing <span className="font-semibold text-gray-900">{startEntry}</span> to{" "}
              <span className="font-semibold text-gray-900">{endEntry}</span> of{" "}
              <span className="font-semibold text-gray-900">{filteredEnquiries.length}</span> entries
              {filteredEnquiries.length !== enquiries.length && (
                <span className="text-xs text-gray-400 ml-1.5 font-normal">
                  (filtered from {enquiries.length} total)
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`
                  p-2 rounded-xl border transition-all duration-200 cursor-pointer
                  ${
                    currentPage === 1
                      ? "text-gray-300 border-gray-100 cursor-not-allowed bg-gray-50"
                      : "text-gray-700 border-gray-200 hover:bg-gray-100 hover:text-gray-900 bg-white"
                  }
                `}
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {pageNumbers.map((pageNum) => (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`
                    min-w-[36px] h-9 px-3 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer
                    ${
                      currentPage === pageNum
                        ? "bg-slate-900 text-white shadow-xs"
                        : "text-gray-700 bg-white border border-gray-200 hover:bg-gray-50"
                    }
                  `}
                >
                  {pageNum}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className={`
                  p-2 rounded-xl border transition-all duration-200 cursor-pointer
                  ${
                    currentPage === totalPages || totalPages === 0
                      ? "text-gray-300 border-gray-100 cursor-not-allowed bg-gray-50"
                      : "text-gray-700 border-gray-200 hover:bg-gray-100 hover:text-gray-900 bg-white"
                  }
                `}
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
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

      {/* Customer Details Modern Modal */}
      {viewModalOpen && selectedEnquiry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-gray-100 overflow-hidden animate-fade-in">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">
                    Customer Details
                  </h2>
                  <p className="text-xs text-gray-500 font-mono">
                    Enquiry ID: {selectedEnquiry.enqId || "-"}
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

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Customer Name
                  </span>
                  <p className="text-sm font-semibold text-gray-900">
                    {getEnquiryCustomerName(selectedEnquiry) || "-"}
                  </p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Contact Number
                  </span>
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-blue-600" />
                    {getEnquiryMobile(selectedEnquiry) || "-"}
                  </p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Organization / Type
                  </span>
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-indigo-600" />
                    {selectedEnquiry.type || "-"}
                  </p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    City / Location
                  </span>
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                    {selectedEnquiry.city ? `${selectedEnquiry.city}${selectedEnquiry.state ? `, ${selectedEnquiry.state}` : ""}` : "-"}
                  </p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 sm:col-span-2">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Email Address
                  </span>
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 break-all">
                    <Mail className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                    {selectedEnquiry.email || "-"}
                  </p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Enquiry Value
                  </span>
                  <p className="text-base font-bold text-emerald-700">
                    {selectedEnquiry.value
                      ? `₹${Number(selectedEnquiry.value).toLocaleString("en-IN")}`
                      : "-"}
                  </p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Status
                  </span>
                  <p className="text-sm font-semibold text-gray-800 capitalize">
                    {selectedEnquiry.status || "-"}
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-slate-50/70 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setViewModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 transition cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setViewModalOpen(false);
                  setModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition cursor-pointer"
              >
                Edit Enquiry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}