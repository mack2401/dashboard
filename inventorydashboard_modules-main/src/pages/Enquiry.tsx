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
import { User, Phone, Mail, X, ChevronLeft, ChevronRight, Search } from "lucide-react";

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

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Reset to first page when any search or filter criteria changes
  useEffect(() => {
    setCurrentPage(1);
  }, [globalSearch, columnSearch, dateRangeFilters]);

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
  }, [currentUserProfile]);

  // Apply filters to the full dataset
  const filteredEnquiries = useMemo(() => {
    const qLower = globalSearch.trim().toLowerCase();

    return enquiries.filter((enquiry) => {
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
  }, [enquiries, globalSearch, columnSearch, dateRangeFilters]);

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
            className="text-blue-600 hover:text-blue-800 hover:underline font-semibold"
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
                  <Phone className="w-3 h-3 text-purple-600 inline flex-shrink-0" />
                  <span>{mobile}</span>
                </div>
              )}
            </div>
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
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
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
          const status = row.original.status;
          if (status === "Testing") {
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                🧪 Testing
              </span>
            );
          }
          if (status === "Approved") {
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                Approved
              </span>
            );
          }
          return <span>{status || "-"}</span>;
        }
      },
      {
        id: "paymentStatus",
        header: "Payment Status",
        accessorFn: (r: any) => r.paymentStatus ?? "-"
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
    <div className="p-4 min-h-screen">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-semibold ml-10 md:ml-0">Enquiries</h2>
          <div className="text-sm text-gray-600">Signed in: {user?.email ?? "not signed in"}</div>
        </div>

        {/* Global Search across all records */}
        <div className="relative w-full sm:w-80 md:w-96">
          <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Search by Customer, Mobile, Date..."
            className="w-full pl-10 pr-10 py-2 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none shadow-sm transition-all"
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
      </div>

      {/* Search match notification */}
      {globalSearch && (
        <div className="mb-3 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700 flex items-center justify-between">
          <span>
            Searching for "<strong>{globalSearch}</strong>" across all records — found <strong>{filteredEnquiries.length}</strong> matching {filteredEnquiries.length === 1 ? "enquiry" : "enquiries"}.
          </span>
          <button
            onClick={() => setGlobalSearch("")}
            className="text-purple-600 hover:text-purple-800 underline font-medium ml-2"
          >
            Clear Filter
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <DataTable<Enquiry>
          title="Enquiries List"
          columns={columns}
          data={currentData}
          loading={isLoading}
          onAdd={async () => {
            const nextId = await generateNextEnqId();
            console.log("Generated Enquiry ID:", nextId);
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
            'mode',
            'value',
            'status',
            'paymentStatus',
            'shipmentStatus',
            'assignedToName'
          ]}
          sumColumn="value"
          sumLabel="Total Value"
          // Disable the DataTable's default index column if it exists
          showIndexColumn={false}

          disableInternalFiltering={true}
          columnSearchValues={columnSearch}
          dateRangeValues={dateRangeFilters}
          onColumnSearchChange={(key, value) => setColumnSearch(prev => ({ ...prev, [key]: value }))}
          onDateRangeChange={(key, range) => setDateRangeFilters(prev => ({ ...prev, [key]: range }))}
          columnUniqueValues={columnUniqueValues}
          filteredTotal={filteredTotalValue}
          filteredTotalLabel="Total (Filtered)"
          totalRecords={enquiries.length} // Pass the total number of records
          onExportAllPages={fetchAllEnquiries} // 👈 THIS ENABLES "ALL PAGES" EXPORT
        />
      </div>

      {/* Pagination Component */}
      {!isLoading && enquiries.length > 0 && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 px-4">
          {/* Showing info */}
          <div className="text-sm text-gray-600">
            Showing {startEntry} to {endEntry} of {filteredEnquiries.length} entries
            {filteredEnquiries.length !== enquiries.length && (
              <span className="text-xs text-gray-400 ml-1.5">(filtered from {enquiries.length} total)</span>
            )}
          </div>

          {/* Pagination controls */}
          <div className="flex items-center gap-2">
            {/* Previous button */}
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className={`
                p-2 rounded-lg transition-all duration-200
                ${currentPage === 1
                  ? 'text-gray-400 cursor-not-allowed bg-gray-100'
                  : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }
              `}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Page numbers */}
            {pageNumbers.map(pageNum => (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`
                  min-w-[40px] h-10 px-3 rounded-lg font-medium transition-all duration-200
                  ${currentPage === pageNum
                    ? 'bg-purple-600 text-white shadow-md hover:bg-purple-700'
                    : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                {pageNum}
              </button>
            ))}

            {/* Next button */}
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className={`
                p-2 rounded-lg transition-all duration-200
                ${currentPage === totalPages
                  ? 'text-gray-400 cursor-not-allowed bg-gray-100'
                  : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }
              `}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

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

      {viewModalOpen && selectedEnquiry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-fade-in">
            <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50">
              <h2 className="text-lg font-semibold text-gray-800">
                Customer Details
              </h2>
              <button
                onClick={() => setViewModalOpen(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <User className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <div className="flex-grow">
                  <label className="text-xs font-semibold text-gray-500">Customer Name</label>
                  <p className="text-md text-gray-900">{selectedEnquiry.customerName || "-"}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.593 23.593 0 0112 15c-3.18 0-6.24-.95-9-2.745M12 9l.01 0M10.5 4.5l1.5 1.5 1.5-1.5M6 13a4 4 0 11-8 0 4 4 0 018 0zm10 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                <div className="flex-grow">
                  <label className="text-xs font-semibold text-gray-500">Organization</label>
                  <p className="text-md text-gray-900">{selectedEnquiry.type || "-"}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <div className="flex-grow">
                  <label className="text-xs font-semibold text-gray-500">City</label>
                  <p className="text-md text-gray-900">{selectedEnquiry.city || "-"}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Phone className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <div className="flex-grow">
                  <label className="text-xs font-semibold text-gray-500">Contact Number</label>
                  <p className="text-md text-gray-900">{selectedEnquiry.contactNumber || "-"}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Mail className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <div className="flex-grow">
                  <label className="text-xs font-semibold text-gray-500">Email Address</label>
                  <p className="text-md text-gray-900 break-all">{selectedEnquiry.email || "-"}</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setViewModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}