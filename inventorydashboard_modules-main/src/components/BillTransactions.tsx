// components/BillTransactions.tsx - Updated with Proforma Invoice print view

import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";
import { db } from "../firebase";
import { billService } from "../services/billService";
import type { Bill } from "../services/billService";

import {
  FileText,
  Eye,
  Printer,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  IndianRupee,
  Trash2,
  RefreshCw,
  Edit3,
  Check,
  RotateCcw,
  Filter,
  Hash,
  Building2,
  Calendar,
  Layers,
} from "lucide-react";

interface MaterialItem {
  productId?: string;
  productName: string;
  price: number;
  quantity: number;
  total: number;
  totalAmount?: number;
  hsn?: string;
}

interface BankDetails {
  beneficiaryName: string;
  bankName: string;
  accountNo: string;
  ifscCode: string;
  branch: string;
}

interface TermsCondition {
  id: number;
  text: string;
}

interface BillTransaction extends Bill {
  id: string;
  originalBillId?: string;
  paymentType?: string;
  paymentSubStatus?: string;
  enquiryEnqId?: string;
  gstin?: string;
  isGST?: boolean;
  companyName?: string;
  enquiryStatus?: string;
  placeOfSupply?: string;
}

const defaultBankDetails: BankDetails = {
  beneficiaryName: "Protowiz Private Limited",
  bankName: "ICICI Bank",
  accountNo: "615205044958",
  ifscCode: "ICIC0008152",
  branch: "Ram Nagar Branch",
};

const defaultTerms: TermsCondition[] = [
  { id: 1, text: "Payment: 100% advance" },
  { id: 2, text: "Delivery: 10-12 days maximum from advance initiation" },
  { id: 3, text: "Quote Validity: 2 days" },
];

const BillTransactions: React.FC = () => {
  const [transactions, setTransactions] = useState<BillTransaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<BillTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBill, setSelectedBill] = useState<BillTransaction | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [billToDelete, setBillToDelete] = useState<BillTransaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Dynamic filter state variables
  const [billTypeFilter, setBillTypeFilter] = useState<"all" | "gst" | "gst_cgst_sgst" | "gst_igst" | "non_gst">("all");
  const [orderStatusFilter, setOrderStatusFilter] = useState<"all" | "approved" | "quotation" | "proforma" | "dropped">("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [statistics, setStatistics] = useState({
    totalBills: 0,
    paidBillsCount: 0,
    quoteBillsCount: 0,
    gstBillsCount: 0,
    taxableValue: 0,
    totalGST: 0,
    totalCGST: 0,
    totalSGST: 0,
    totalIGST: 0,
    totalShipping: 0,
    totalRevenue: 0,
    paidAmount: 0,
    quotedAmount: 0,
    averageBillValue: 0,
  });
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string>("staff");
  const [authLoading, setAuthLoading] = useState(true);

  // Edit state for bank details and terms in the bill details modal
  const [editingBankDetails, setEditingBankDetails] = useState(false);
  const [editingTerms, setEditingTerms] = useState(false);
  const [editBankDetails, setEditBankDetails] = useState<BankDetails>(defaultBankDetails);
  const [editTerms, setEditTerms] = useState<TermsCondition[]>(defaultTerms);
  const [editIncludeSignature, setEditIncludeSignature] = useState<boolean>(true);
  const [newTerm, setNewTerm] = useState("");

  // Logo URL constant
  const LOGO_URL = "https://ibots.in/wp-content/uploads/2024/07/ibots-logo.png";
  const SIGNATURE_URL = "/sign.jpg";

  // Only admin and manager can delete
  const hasDeleteAccess = userRole === "admin" || userRole === "manager";

  // Listen for auth state changes
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log("Auth state changed:", user?.uid);
      setAuthUser(user);
      setAuthLoading(false);
      
      if (!user) {
        setLoading(false);
        setError("Please log in to view transactions");
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch user role when auth user changes
  useEffect(() => {
    if (!authUser) return;

    const fetchUserRole = async () => {
      try {
        console.log("Fetching role for user:", authUser.uid);
        
        const employeesRef = collection(db, "employees");
        
        let q = query(employeesRef, where("id", "==", authUser.uid));
        let snap = await getDocs(q);
        
        if (!snap.empty) {
          const role = snap.docs[0].data().role;
          console.log("User role found by id:", role);
          setUserRole(role || "staff");
          return;
        }
        
        if (authUser.email) {
          q = query(employeesRef, where("email", "==", authUser.email.toLowerCase()));
          snap = await getDocs(q);
          
          if (!snap.empty) {
            const role = snap.docs[0].data().role;
            console.log("User role found by email:", role);
            setUserRole(role || "staff");
            return;
          }
        }
        
        const allSnap = await getDocs(employeesRef);
        let found = false;
        
        allSnap.forEach((doc) => {
          if (!found) {
            const data = doc.data();
            if (data.uid === authUser.uid || 
                (data.email && authUser.email && 
                 data.email.toLowerCase() === authUser.email.toLowerCase())) {
              const role = data.role;
              console.log("User role found by scanning:", role);
              setUserRole(role || "staff");
              found = true;
            }
          }
        });
        
        if (!found) {
          console.log("No role found, defaulting to staff");
        }
      } catch (err) {
        console.error("Error fetching user role:", err);
      }
    };

    fetchUserRole();
  }, [authUser]);

  // Fetch transactions when auth and role are ready
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) return;
    
    console.log("Starting fetch with user:", authUser.uid, "Role:", userRole);
    fetchTransactions();
  }, [authUser, userRole, authLoading]);

  const fetchTransactions = async () => {
    if (!authUser) return;

    setLoading(true);
    setError(null);

    try {
      console.log("Fetching bills for:", authUser.uid, "Role:", userRole);
      
      let fetchedBills: Bill[] = [];
      
      try {
        if (userRole === "admin" || userRole === "manager") {
          console.log("Admin/Manager: Fetching all bills");
          fetchedBills = await billService.getBills();
        } else {
          console.log("Staff: Fetching staff bills");
          fetchedBills = await billService.getStaffBills(authUser.uid);
        }
        console.log("Primary fetch successful:", fetchedBills.length, "bills");
      } catch (roleError: any) {
        console.warn("Primary fetch failed:", roleError.message);
        
        if (roleError.message?.includes("index") || roleError.message?.includes("permission")) {
          console.log("Using fallback query with client-side filtering");
          
          try {
            const billsRef = collection(db, "bills");
            const simpleQuery = query(billsRef, orderBy("createdAt", "desc"));
            const snap = await getDocs(simpleQuery);
            
            snap.forEach((doc) => {
              fetchedBills.push({ id: doc.id, ...doc.data() } as Bill);
            });
            
            console.log("Fallback fetched:", fetchedBills.length, "bills before filtering");
            
            if (userRole !== "admin" && userRole !== "manager") {
              fetchedBills = fetchedBills.filter(bill => 
                bill.createdBy === authUser.uid || 
                bill.assignedTo === authUser.uid
              );
              console.log("After staff filtering:", fetchedBills.length, "bills");
            }
          } catch (fallbackError) {
            console.error("Fallback also failed:", fallbackError);
            throw fallbackError;
          }
        } else {
          throw roleError;
        }
      }

      // DEDUPLICATE: Keep only the latest bill per enquiryEnqId
      const billMap = new Map<string, Bill>();
      
      const sortedBills = [...fetchedBills].sort((a, b) => {
        const dateA = a.updatedAt?.toDate?.() || a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.updatedAt?.toDate?.() || b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      
      sortedBills.forEach(bill => {
        const key = bill.enquiryEnqId || bill.enquiryId || bill.id || `bill-${Math.random()}`;
        if (!billMap.has(key)) {
          billMap.set(key, bill);
        } else {
          console.log(`Deduplicating: Removing older bill ${bill.id} for enquiry ${key}, keeping newer one`);
        }
      });
      
      const deduplicatedBills = Array.from(billMap.values());
      console.log("After deduplication:", deduplicatedBills.length, "bills (from", fetchedBills.length, "total)");

      // Process each bill with enquiry data
      const processedTransactions = await Promise.all(
        deduplicatedBills.map(async (bill) => {
          let enquiryData: any = null;
          let paymentSubStatus = "N/A";

          if (bill.enquiryEnqId) {
            try {
              const enquiriesRef = collection(db, "enquiries");
              const enquiryQuery = query(
                enquiriesRef,
                where("enqId", "==", bill.enquiryEnqId)
              );
              const enquirySnapshot = await getDocs(enquiryQuery);

              if (!enquirySnapshot.empty) {
                enquiryData = enquirySnapshot.docs[0].data();
                paymentSubStatus = enquiryData?.paymentSubStatus || "N/A";
                console.log(`Found paymentSubStatus for bill ${bill.id}: ${paymentSubStatus}`);
              }
            } catch (err) {
              console.error(`Error fetching enquiry for bill ${bill.id}:`, err);
            }
          }

          const gstin = (bill.billedTo?.gstin || enquiryData?.companyDetails?.companyGST || enquiryData?.gstin || "").trim();
          const hasTax = (bill.cgst && bill.cgst > 0) || (bill.sgst && bill.sgst > 0) || (bill.igst && bill.igst > 0) || bill.taxType === "cgst_sgst" || bill.taxType === "igst";
          const isGST = !!gstin || hasTax;
          const companyName = bill.billedTo?.name || enquiryData?.companyDetails?.companyName || "";
          const placeOfSupply = bill.placeOfSupply || bill.billedTo?.state || enquiryData?.state || "Tamil Nadu";

          if (!enquiryData) {
            return {
              ...bill,
              status: "quotation" as const,
              paymentStatus: "pending" as const,
              paymentType: "N/A",
              paymentSubStatus: "N/A",
              gstin,
              isGST,
              companyName,
              placeOfSupply,
            } as BillTransaction;
          }

          const productStatus = enquiryData?.status || "";
          const paymentStatus = enquiryData?.paymentStatus || "";
          const isProformaInvoice = bill.isProformaInvoice || enquiryData?.isProformaInvoice || false;

          let status: "quotation" | "paid" | "proforma" | "dropped" = "quotation";
          let transactionPaymentStatus: "pending" | "completed" = "pending";

          if (productStatus.toLowerCase() === "dropped" || enquiryData?.status?.toLowerCase() === "dropped") {
            status = "dropped";
            transactionPaymentStatus = "pending";
          } else if (isProformaInvoice) {
            status = "proforma";
            transactionPaymentStatus = "pending";
          } else if (
            productStatus === "Approved" ||
            productStatus === "Delivered" ||
            productStatus === "Dispatched" ||
            paymentStatus === "Paid" ||
            paymentStatus === "PAID" ||
            bill.paymentStatus === "completed" ||
            bill.status === "paid"
          ) {
            status = "paid";
            transactionPaymentStatus = "completed";
          } else {
            status = "quotation";
            transactionPaymentStatus = "pending";
          }

          return {
            ...bill,
            status,
            paymentStatus: transactionPaymentStatus,
            paymentType: paymentSubStatus,
            paymentSubStatus,
            enquiryEnqId: bill.enquiryEnqId,
            gstin,
            isGST,
            companyName,
            enquiryStatus: productStatus,
            placeOfSupply,
          } as BillTransaction;
        })
      );

      console.log("Final processed transactions:", processedTransactions.length);
      setTransactions(processedTransactions);
    } catch (err) {
      console.error("Error fetching transactions:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch transactions");
    } finally {
      setLoading(false);
    }
  };

  // Extract distinct available months from transactions
  const availableMonths = React.useMemo(() => {
    const monthsSet = new Set<string>();
    transactions.forEach((b) => {
      const d = b.billDate?.toDate ? b.billDate.toDate() : (b.billDate ? new Date(b.billDate) : (b.createdAt?.toDate ? b.createdAt.toDate() : null));
      if (d && !isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        monthsSet.add(`${yyyy}-${mm}`);
      }
    });
    return Array.from(monthsSet).sort().reverse();
  }, [transactions]);

  const formatMonthLabel = (yyyyMm: string) => {
    const [year, month] = yyyyMm.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  };

  useEffect(() => {
    filterTransactions();
  }, [transactions, searchTerm, billTypeFilter, orderStatusFilter, monthFilter, startDate, endDate]);

  useEffect(() => {
    calculateStatistics();
  }, [filteredTransactions]);

  const filterTransactions = () => {
    let filtered = [...transactions];

    // 1. Search Filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (bill) =>
          bill.customerName?.toLowerCase().includes(term) ||
          bill.companyName?.toLowerCase().includes(term) ||
          bill.gstin?.toLowerCase().includes(term) ||
          bill.invoiceNumber?.toLowerCase().includes(term) ||
          bill.customerContact?.includes(term) ||
          bill.billId?.includes(term) ||
          bill.enquiryEnqId?.toLowerCase().includes(term)
      );
    }

    // 2. Bill Type Filter (GST vs Non-GST)
    if (billTypeFilter === "gst") {
      filtered = filtered.filter((b) => b.isGST);
    } else if (billTypeFilter === "gst_cgst_sgst") {
      filtered = filtered.filter(
        (b) =>
          b.isGST &&
          (b.taxType === "cgst_sgst" ||
            (b.placeOfSupply && b.placeOfSupply.toLowerCase().includes("tamil nadu")) ||
            (!b.taxType && !b.igst))
      );
    } else if (billTypeFilter === "gst_igst") {
      filtered = filtered.filter(
        (b) =>
          b.isGST &&
          (b.taxType === "igst" ||
            (b.igst && b.igst > 0) ||
            (b.placeOfSupply && !b.placeOfSupply.toLowerCase().includes("tamil nadu")))
      );
    } else if (billTypeFilter === "non_gst") {
      filtered = filtered.filter((b) => !b.isGST);
    }

    // 3. Order Status Filter (All, Approved/Paid, Quotation, Proforma, Dropped)
    if (orderStatusFilter === "approved") {
      filtered = filtered.filter((b) => b.status === "paid");
    } else if (orderStatusFilter === "quotation") {
      filtered = filtered.filter((b) => b.status === "quotation");
    } else if (orderStatusFilter === "proforma") {
      filtered = filtered.filter((b) => b.status === "proforma");
    } else if (orderStatusFilter === "dropped") {
      filtered = filtered.filter((b) => b.status === "dropped");
    }

    // 4. Month / Date Range Filter
    if (monthFilter === "custom") {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filtered = filtered.filter((b) => {
          const d = b.billDate?.toDate
            ? b.billDate.toDate()
            : b.billDate
            ? new Date(b.billDate)
            : b.createdAt?.toDate
            ? b.createdAt.toDate()
            : new Date(0);
          return d >= start;
        });
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filtered = filtered.filter((b) => {
          const d = b.billDate?.toDate
            ? b.billDate.toDate()
            : b.billDate
            ? new Date(b.billDate)
            : b.createdAt?.toDate
            ? b.createdAt.toDate()
            : new Date(0);
          return d <= end;
        });
      }
    } else if (monthFilter !== "all") {
      // monthFilter is "YYYY-MM", e.g. "2026-08"
      filtered = filtered.filter((b) => {
        const d = b.billDate?.toDate
          ? b.billDate.toDate()
          : b.billDate
          ? new Date(b.billDate)
          : b.createdAt?.toDate
          ? b.createdAt.toDate()
          : null;
        if (!d || isNaN(d.getTime())) return false;
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        return `${yyyy}-${mm}` === monthFilter;
      });
    }

    setFilteredTransactions(filtered);
    setCurrentPage(1);
  };

  const calculateStatistics = () => {
    let totalTaxable = 0;
    let totalCGST = 0;
    let totalSGST = 0;
    let totalIGST = 0;
    let totalShipping = 0;
    let totalGrandRevenue = 0;
    let paidCount = 0;
    let quoteCount = 0;
    let gstCount = 0;

    filteredTransactions.forEach((bill) => {
      const isPaid = bill.status === "paid" || bill.paymentStatus === "completed";
      if (isPaid) paidCount++;
      else quoteCount++;

      if (bill.isGST) gstCount++;

      const subtotal = Number(bill.subtotal || bill.taxableValue || 0);
      const cgst = Number(bill.cgst || 0);
      const sgst = Number(bill.sgst || 0);
      const igst = Number(bill.igst || 0);
      const shipping = Number(bill.shippingCharges || 0);
      const total = Number(bill.totalAmount || subtotal + cgst + sgst + igst + shipping);

      totalTaxable += subtotal;
      totalCGST += cgst;
      totalSGST += sgst;
      totalIGST += igst;
      totalShipping += shipping;
      totalGrandRevenue += total;
    });

    const totalGST = totalCGST + totalSGST + totalIGST;

    setStatistics({
      totalBills: filteredTransactions.length,
      paidBillsCount: paidCount,
      quoteBillsCount: quoteCount,
      gstBillsCount: gstCount,
      taxableValue: totalTaxable,
      totalGST: totalGST,
      totalCGST: totalCGST,
      totalSGST: totalSGST,
      totalIGST: totalIGST,
      totalShipping: totalShipping,
      totalRevenue: totalGrandRevenue,
      paidAmount: totalGrandRevenue,
      quotedAmount: 0,
      averageBillValue: filteredTransactions.length ? totalGrandRevenue / filteredTransactions.length : 0,
    });
  };

  const handleViewBill = (bill: BillTransaction) => {
    setSelectedBill(bill);
    setEditingBankDetails(false);
    setEditingTerms(false);
    // Load terms from bill or use defaults
    const billTerms = (bill as any).terms || (bill.status === "proforma" ? defaultTerms : defaultTerms);
    setEditBankDetails((bill as any).bankDetails || defaultBankDetails);
    setEditTerms(Array.isArray(billTerms) ? billTerms : defaultTerms);
    setEditIncludeSignature((bill as any).includeSignature !== undefined ? (bill as any).includeSignature : true);
    setNewTerm("");
  };

  const handleToggleSignature = async (newVal: boolean) => {
    setEditIncludeSignature(newVal);
    if (selectedBill?.id) {
      try {
        const billRef = doc(db, "bills", selectedBill.id);
        await updateDoc(billRef, { includeSignature: newVal });
        setSelectedBill((prev) => prev ? ({ ...prev, includeSignature: newVal } as any) : null);
      } catch (err) {
        console.error("Error updating signature setting:", err);
      }
    }
  };

  const handleDeleteClick = (bill: BillTransaction) => {
    if (userRole !== "admin" && userRole !== "manager") {
      setError("You don't have permission to delete bills. Only admins and managers can delete.");
      setTimeout(() => setError(null), 3000);
      return;
    }
    setBillToDelete(bill);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!billToDelete) return;
    
    if (userRole !== "admin" && userRole !== "manager") {
      setError("You don't have permission to delete bills.");
      setShowDeleteConfirm(false);
      setBillToDelete(null);
      return;
    }
    
    setDeleting(true);
    try {
      if (billToDelete.id) {
        await billService.deleteBill(billToDelete.id);
      }
      setShowDeleteConfirm(false);
      setBillToDelete(null);
      await fetchTransactions();
    } catch (error) {
      console.error("Error deleting bill:", error);
      try {
        if (billToDelete.id) {
          await billService.softDeleteBill(billToDelete.id);
          setShowDeleteConfirm(false);
          setBillToDelete(null);
          await fetchTransactions();
          return;
        }
      } catch (softDeleteError) {
        console.error("Error soft deleting bill:", softDeleteError);
      }
      setError(error instanceof Error ? error.message : "Failed to delete bill");
    } finally {
      setDeleting(false);
    }
  };

  // Bank Details Handlers
  const handleBankDetailChange = (field: keyof BankDetails, value: string) => {
    setEditBankDetails(prev => ({ ...prev, [field]: value }));
  };

  const resetBankDetails = () => {
    setEditBankDetails((selectedBill as any)?.bankDetails || defaultBankDetails);
  };

  // Terms Handlers
  const handleTermChange = (id: number, value: string) => {
    setEditTerms(prev => prev.map(term => 
      term.id === id ? { ...term, text: value } : term
    ));
  };

  const handleAddTerm = () => {
    if (newTerm.trim()) {
      const newId = Math.max(...editTerms.map(t => t.id), 0) + 1;
      setEditTerms(prev => [...prev, { id: newId, text: newTerm.trim() }]);
      setNewTerm("");
    }
  };

  const handleRemoveTerm = (id: number) => {
    setEditTerms(prev => prev.filter(term => term.id !== id));
  };

  const resetTerms = () => {
    const billTerms = (selectedBill as any)?.terms;
    setEditTerms(Array.isArray(billTerms) ? billTerms : defaultTerms);
  };

  // Number to words conversion
  const numberToWords = (num: number) => {
    if (num === 0) return 'Zero';
    
    const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    const convert = (n: number): string => {
      if (n < 20) return units[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + units[n % 10] : '');
      if (n < 1000) return units[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
      if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
      if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
      return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
    };
    
    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);
    
    let words = convert(rupees) + ' Rupees';
    if (paise > 0) {
      words += ' and ' + convert(paise) + ' Paise';
    }
    return words + ' Only';
  };

  const printHtmlDocument = (htmlContent: string) => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch (e) {
          console.warn("Auto-print error:", e);
        }
      }, 400);
    } else {
      // Fallback using hidden iframe (bypasses browser popup blockers)
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "none";
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(htmlContent);
        doc.close();
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.warn("Iframe print error:", e);
          }
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 60000);
        }, 500);
      }
    }
  };

  // Print Proforma Invoice
  const handlePrintProformaInvoice = (bill: BillTransaction) => {
    const bankDetailsToPrint = (bill as any).bankDetails || defaultBankDetails;
    const termsToPrint = (bill as any).terms || defaultTerms;
    const shouldIncludeSignature = editIncludeSignature !== undefined ? editIncludeSignature : ((bill as any).includeSignature !== false);
    
    const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Proforma Invoice - ${bill.invoiceNumber}</title>
            <script>
              window.addEventListener('DOMContentLoaded', function() {
                setTimeout(function() {
                  window.focus();
                  window.print();
                }, 300);
              });
            </script>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: 'Arial', sans-serif; padding: 30px 40px; background: white; color: #1a1a1a; font-size: 13px; }
              .document-container { max-width: 1000px; margin: 0 auto; background: white; }
              .letterhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e9ecef; }
              .letterhead-logo { flex-shrink: 0; text-align: center; }
              .letterhead-logo img { width: 160px; height: auto; }
              .letterhead-logo .tagline { font-size: 11px; color: #666; margin-top: 2px; }
              .letterhead-company { text-align: right; flex: 1; }
              .letterhead-company .company-name { font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px; }
              .letterhead-company .company-info { font-size: 11px; color: #555; line-height: 1.6; }
              .doc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #e9ecef; }
              .doc-type { font-size: 24px; font-weight: bold; color: #1a1a1a; letter-spacing: 2px; }
              .doc-meta { text-align: right; font-size: 12px; color: #333; line-height: 1.6; }
              .billing-section { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 15px; }
              .billing-label { font-weight: bold; font-size: 12px; color: #333; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
              .billing-content { font-size: 12px; color: #555; line-height: 1.6; }
              .billing-content strong { color: #1a1a1a; }
              .supply-bar { margin: 12px 0 18px 0; padding: 8px 15px; background: #f8f9fa; border-radius: 3px; font-size: 12px; border-left: 3px solid #007bff; }
              .items-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
              .items-table th { background: #f8f9fa; padding: 8px 10px; text-align: left; border: 1px solid #dee2e6; font-size: 12px; font-weight: 600; color: #333; }
              .items-table td { padding: 8px 10px; border: 1px solid #dee2e6; font-size: 12px; color: #555; }
              .items-table .text-center { text-align: center; }
              .items-table .text-right { text-align: right; }
              .bottom-section { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 20px; }
              .bank-details { padding: 12px 15px; background: #f8f9fa; border-radius: 4px; font-size: 11px; line-height: 1.8; color: #555; }
              .bank-details .bank-title { font-weight: bold; color: #333; margin-bottom: 5px; font-size: 12px; }
              .totals-box { width: 100%; }
              .total-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; }
              .total-row .label { color: #666; }
              .total-row .value { color: #333; font-weight: 500; }
              .discount-row .label, .discount-row .value { color: #28a745; }
              .grand-total-row { display: flex; justify-content: space-between; padding: 10px 0; margin-top: 6px; border-top: 2px solid #333; font-size: 16px; font-weight: bold; }
              .grand-total-row .value { color: #007bff; }
              .amount-words { margin: 15px 0; padding: 8px 15px; background: #f8f9fa; border-radius: 3px; font-size: 12px; }
              .amount-words strong { color: #333; }
              .terms-section { margin: 15px 0; padding: 8px 15px; background: #fff3cd; border-radius: 3px; font-size: 12px; border-left: 3px solid #ffc107; }
              .terms-section .terms-title { font-weight: bold; color: #333; margin-bottom: 4px; }
              .terms-section ul { list-style: none; padding: 0; margin: 0; }
              .terms-section ul li { padding: 1px 0; }
              .notes-section { margin: 15px 0; padding: 8px 15px; background: #d4edda; border-radius: 3px; font-size: 12px; border-left: 3px solid #28a745; }
              .description-content { margin: 10px 0; padding: 10px 15px; background: #f3e8ff; border-radius: 3px; font-size: 12px; border-left: 3px solid #8b5cf6; color: #4a1a7a; }
              .footer-section { padding-top: 12px; margin-top: 20px; border-top: 1px solid #e9ecef; display: flex; justify-content: flex-end; align-items: flex-end; }
              .footer-left { flex: 1; }
              .footer-right { text-align: right; }
              .footer-company { font-weight: bold; color: #1a1a1a; font-size: 13px; margin-bottom: 8px; }
              .signature-container { margin-top: 8px; display: flex; justify-content: flex-end; }
              .signature-image { max-width: 150px; max-height: 60px; object-fit: contain; }
              .footer-signatory { font-size: 11px; color: #666; margin-top: 5px; }
              .status-badge { display: inline-block; padding: 3px 10px; border-radius: 3px; font-weight: bold; font-size: 10px; letter-spacing: 1px; background: #fff3cd; color: #856404; }
              @media print { body { padding: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none; } }
            </style>
          </head>
          <body>
            <div class="document-container">
              <div class="letterhead">
                <div class="letterhead-logo">
                  <img src="${LOGO_URL}" alt="iBots" onerror="this.style.display='none'">
                  <div class="tagline">Unleash the power of Electronics</div>
                </div>
                <div class="letterhead-company">
                  <div class="company-name">Protowiz Private Limited</div>
                  <div class="company-info">
                    Office : 34/17A, First floor, Ramalingam nagar,<br>
                    4th cross street, Saibaba colony, Coimbatore - 641011, Tamil Nadu<br>
                    E-mail : info@ibots.in  PH No : 80152 98233<br>
                    Visit us : www.ibots.in<br>
                    GST No : 33AAKCP9459K1ZO / PAN : AAMCP9459K
                  </div>
                </div>
              </div>

              <div class="doc-header">
                <div class="doc-type">PROFORMA INVOICE</div>
                <div class="doc-meta">
                  <div>Proforma No: ${bill.invoiceNumber}</div>
                  <div>Date: ${bill.billDate?.toDate().toLocaleDateString('en-IN') || new Date().toLocaleDateString('en-IN')}</div>
                  <div>PO Date: ${bill.billDate?.toDate().toLocaleDateString('en-IN') || new Date().toLocaleDateString('en-IN')}</div>
                  <div style="margin-top: 4px;"><span class="status-badge">PROFORMA</span></div>
                </div>
              </div>

              <div class="billing-section">
                <div>
                  <div class="billing-label">Billed by</div>
                  <div class="billing-content">
                    <strong>${bill.billedBy?.name || 'N/A'}</strong><br>
                    ${bill.billedBy?.address || 'Protowiz Private Limited,34/17A, First floor, 4th Cross Rd, Ramalingam Nagar, Saibaba Colony, Coimbatore, Tamil Nadu 641011'}
                    ${bill.billedBy?.gstin ? `<br>GSTIN: ${bill.billedBy.gstin}` : ''}
                  </div>
                </div>
                <div>
                  <div class="billing-label">Billed to</div>
                  <div class="billing-content">
                    <strong>${bill.billedTo?.name || bill.customerName}</strong><br>
                    ${bill.billedTo?.address || bill.customerAddress ? `Address: ${bill.billedTo?.address || bill.customerAddress}<br>` : ''}
                    Contact: ${bill.billedTo?.contactNumber || bill.customerContact}<br>
                    State: ${bill.billedTo?.state || 'Tamil Nadu'}
                    ${bill.billedTo?.gstin ? `<br>GSTIN: ${bill.billedTo.gstin}` : ''}
                  </div>
                </div>
              </div>

              <div class="supply-bar">
                <strong>Place of Supply:</strong> ${bill.placeOfSupply || bill.billedTo?.state || 'Tamil Nadu'} &nbsp;&nbsp;|&nbsp;&nbsp; 
                <strong>Tax Type:</strong> ${bill.taxType === 'cgst_sgst' ? 'CGST + SGST' : 'IGST'}
              </div>

              ${bill.description ? `
                <div class="description-content">
                  ${bill.description}
                </div>
              ` : ''}

              <table class="items-table">
                <thead>
                  <tr>
                    <th>SI No</th>
                    <th>Description of Goods</th>
                    <th>HSN Code</th>
                    <th class="text-center">Qty</th>
                    <th class="text-right">Rate</th>
                    <th class="text-center">Tax (%)</th>
                    <th class="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${bill.items?.map((item, index) => `
                    <tr>
                      <td>${index + 1}</td>
                      <td>${item.productName}</td>
                      <td>${item.hsn || '00'}</td>
                      <td class="text-center">${item.quantity}</td>
                      <td class="text-right">₹${item.price.toFixed(2)}</td>
                      <td class="text-center">${bill.taxRate || 0}%</td>
                      <td class="text-right">₹${item.total.toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>

              <div class="bottom-section">
                <div class="bank-details">
                  <div class="bank-title">Bank Details</div>
                  <div>
                    <strong>Beneficiary Name:</strong> ${bankDetailsToPrint.beneficiaryName}<br>
                    <strong>Bank Name:</strong> ${bankDetailsToPrint.bankName}<br>
                    <strong>Account No:</strong> ${bankDetailsToPrint.accountNo}<br>
                    <strong>IFSC Code:</strong> ${bankDetailsToPrint.ifscCode}<br>
                    <strong>Branch:</strong> ${bankDetailsToPrint.branch}
                  </div>
                </div>

                <div class="totals-box">
                  <div class="total-row">
                    <span class="label">Sub Total</span>
                    <span class="value">₹${bill.subtotal?.toFixed(2) || '0.00'}</span>
                  </div>
                  ${bill.discountAmount && bill.discountAmount > 0 ? `
                  <div class="total-row discount-row">
                    <span class="label">Discount (${bill.discountPercentage || 0}%)</span>
                    <span class="value">-₹${bill.discountAmount.toFixed(2)}</span>
                  </div>
                  ` : ''}
                  ${bill.taxType === 'cgst_sgst' ? `
                  <div class="total-row">
                    <span class="label">CGST (${(bill.taxRate || 0)/2}%)</span>
                    <span class="value">₹${bill.cgst?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div class="total-row">
                    <span class="label">SGST (${(bill.taxRate || 0)/2}%)</span>
                    <span class="value">₹${bill.sgst?.toFixed(2) || '0.00'}</span>
                  </div>
                  ` : `
                  <div class="total-row">
                    <span class="label">IGST (${bill.taxRate || 0}%)</span>
                    <span class="value">₹${bill.igst?.toFixed(2) || '0.00'}</span>
                  </div>
                  `}
                  ${bill.cessAmount && bill.cessAmount > 0 ? `
                  <div class="total-row">
                    <span class="label">Cess Amount</span>
                    <span class="value">₹${bill.cessAmount.toFixed(2)}</span>
                  </div>
                  ` : ''}
                  <div class="grand-total-row">
                    <span>Grand Total</span>
                    <span class="value">₹${bill.totalAmount?.toFixed(2) || '0.00'}</span>
                  </div>
                </div>
              </div>

              <div class="amount-words">
                <strong>Amount Chargeable (In Words) :</strong> ${numberToWords(bill.totalAmount || 0)}
              </div>

              <!-- Terms & Conditions Section -->
              <div class="terms-section">
                <div class="terms-title">Terms & Conditions:</div>
                <ul>
                  ${termsToPrint && termsToPrint.length > 0 ? 
                    termsToPrint.map((term, index) => `<li>${index + 1}. ${term.text}</li>`).join('') 
                    : `
                      <li>1. Payment: 100% advance</li>
                      <li>2. Delivery: 10-12 days maximum from advance initiation</li>
                      <li>3. Quote Validity: 2 days</li>
                    `
                  }
                </ul>
              </div>

              <div class="footer-section">
                <div class="footer-left"></div>
                <div class="footer-right">
                  <div class="footer-company">For Protowiz Private Limited</div>
                  ${shouldIncludeSignature ? `
                    <div class="signature-container">
                      <img src="${SIGNATURE_URL}" alt="Authorized Signature" class="signature-image" onerror="this.style.display='none'" />
                    </div>
                  ` : `
                    <div style="height: 50px;"></div>
                  `}
                  <div class="footer-signatory">Authorised Signatory</div>
                </div>
              </div>
            </div>
            
            <div class="no-print" style="text-align: center; margin-top: 25px;">
              <button onclick="window.print();" style="padding: 10px 24px; background: #007bff; color: white; border: none; border-radius: 5px; margin: 8px; cursor: pointer; font-size: 14px;">🖨 Print</button>
              <button onclick="window.close();" style="padding: 10px 24px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">✕ Close</button>
            </div>
          </body>
        </html>
      `;

    printHtmlDocument(htmlContent);
  };

  // Print bill format (existing)
  const handlePrintBill = () => {
    if (!selectedBill) return;
    
    // Check if it's a proforma invoice
    if (selectedBill.status === "proforma") {
      handlePrintProformaInvoice(selectedBill);
      return;
    }
    
    const isQuotation = selectedBill.status === "quotation";
    const isPaid = selectedBill.paymentStatus === "completed";
    const isApprovedAndPaid = !isQuotation && isPaid;
    
    const bankDetailsToPrint = editingBankDetails ? editBankDetails : (selectedBill as any).bankDetails || defaultBankDetails;
    const termsToPrint = editingTerms ? editTerms : (selectedBill as any).terms || defaultTerms;
    const shouldIncludeSignature = editIncludeSignature !== undefined ? editIncludeSignature : ((selectedBill as any).includeSignature !== false);
    const displayPaymentType = selectedBill.paymentType || "N/A";
    const displayPaymentSubStatus = selectedBill.paymentSubStatus || "N/A";
    
    let documentType = "QUOTATION";
    let documentLabel = "Quote No";
    let displayStatus = "";
    let statusClass = "";
    
    if (isApprovedAndPaid) {
      documentType = "TAX INVOICE";
      documentLabel = "Invoice #";
      displayStatus = "PAID";
      statusClass = "status-paid";
    } else if (isQuotation) {
      documentType = "QUOTATION";
      documentLabel = "Quote No";
      displayStatus = "";
      statusClass = "";
    } else {
      documentType = "INVOICE";
      documentLabel = "Invoice #";
      displayStatus = isPaid ? "PAID" : "NOT PAID";
      statusClass = isPaid ? "status-paid" : "status-not-paid";
    }

    const getTableHeaders = () => {
      if (isApprovedAndPaid) {
        return `
          <th>SI No</th>
          <th>Description of Goods</th>
          <th>HSN Code</th>
          <th class="text-center">Qty</th>
          <th class="text-right">Unit Price</th>
          <th class="text-right">Amount</th>
        `;
      } else {
        return `
          <th>SI No</th>
          <th>Description of Goods</th>
          <th>HSN Code</th>
          <th class="text-center">Qty</th>
          <th class="text-center">UOM</th>
          <th class="text-right">Unit Price</th>
          <th class="text-center">Tax (%)</th>
          <th class="text-right">Amount</th>
          <th class="text-right">Tax Amt</th>
        `;
      }
    };

    const getTableRows = () => {
      if (isApprovedAndPaid) {
        return selectedBill.items?.map((item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${item.productName}</td>
            <td>${item.hsn || '00'}</td>
            <td class="text-center">${item.quantity}</td>
            <td class="text-right">₹${item.price.toFixed(2)}</td>
            <td class="text-right">₹${item.total.toFixed(2)}</td>
          </tr>
        `).join('');
      } else {
        return selectedBill.items?.map((item, index) => {
          const itemTotal = (item as any).total || (item.price * item.quantity);
          const taxAmt = (item as any).taxAmount || 0;
          const taxPct = (item as any).taxRate !== undefined ? (item as any).taxRate : (selectedBill.taxRate || 0);
          return `
            <tr>
              <td>${index + 1}</td>
              <td>${item.productName}</td>
              <td>${item.hsn || '00'}</td>
              <td class="text-center">${item.quantity}</td>
              <td class="text-right">₹${item.price.toFixed(2)}</td>
              <td class="text-center">Nos</td>
              <td class="text-center">${taxPct}%</td>
              <td class="text-right">₹${Number(itemTotal).toFixed(2)}</td>
              <td class="text-right">₹${Number(taxAmt).toFixed(2)}</td>
            </tr>
          `;
        }).join('');
      }
    };

    const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>${documentType} - ${selectedBill.invoiceNumber}</title>
            <script>
              window.addEventListener('DOMContentLoaded', function() {
                setTimeout(function() {
                  window.focus();
                  window.print();
                }, 300);
              });
            </script>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { 
                font-family: 'Arial', sans-serif; 
                padding: 30px 40px; 
                background: white;
                color: #1a1a1a;
                font-size: 13px;
              }
              .document-container { 
                max-width: 1000px; 
                margin: 0 auto; 
                background: white;
              }
              
              .letterhead {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 2px solid #e9ecef;
              }
              .letterhead-logo {
                flex-shrink: 0;
                text-align: center;
              }
              .letterhead-logo img {
                width: 160px;
                height: auto;
              }
              .letterhead-logo .tagline {
                font-size: 11px;
                color: #666;
                margin-top: 2px;
              }
              .letterhead-company {
                text-align: right;
                flex: 1;
              }
              .letterhead-company .company-name {
                font-size: 18px;
                font-weight: bold;
                color: #1a1a1a;
                margin-bottom: 4px;
              }
              .letterhead-company .company-info {
                font-size: 11px;
                color: #555;
                line-height: 1.6;
              }
              
              .doc-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 20px;
                padding-bottom: 10px;
                border-bottom: 1px solid #e9ecef;
              }
              .doc-type {
                font-size: 24px;
                font-weight: bold;
                color: #1a1a1a;
                letter-spacing: 2px;
              }
              .doc-meta {
                text-align: right;
                font-size: 12px;
                color: #333;
                line-height: 1.6;
              }
              .status-badge {
                display: inline-block;
                padding: 3px 10px;
                border-radius: 3px;
                font-weight: bold;
                font-size: 10px;
                letter-spacing: 1px;
              }
              .status-paid {
                background: #d4edda;
                color: #155724;
              }
              .status-not-paid {
                background: #f8d7da;
                color: #721c24;
              }
              .payment-type-label {
                font-size: 10px;
                color: #666;
                margin-top: 2px;
              }
              .payment-substatus-label {
                font-size: 10px;
                color: #666;
                margin-top: 2px;
                font-weight: 500;
              }
              .invoice-info {
                font-size: 11px;
                color: #555;
                margin-top: 3px;
                padding: 3px 8px;
                background: #f8f9fa;
                border-radius: 3px;
              }
              
              .billing-section {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 30px;
                margin-bottom: 15px;
              }
              .billing-label {
                font-weight: bold;
                font-size: 12px;
                color: #333;
                margin-bottom: 4px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }
              .billing-content {
                font-size: 12px;
                color: #555;
                line-height: 1.6;
              }
              .billing-content strong {
                color: #1a1a1a;
              }
              
              .supply-bar {
                margin: 12px 0 18px 0;
                padding: 8px 15px;
                background: #f8f9fa;
                border-radius: 3px;
                font-size: 12px;
                border-left: 3px solid #007bff;
              }
              
              .items-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 15px;
              }
              .items-table th {
                background: #f8f9fa;
                padding: 8px 10px;
                text-align: left;
                border: 1px solid #dee2e6;
                font-size: 12px;
                font-weight: 600;
                color: #333;
              }
              .items-table td {
                padding: 8px 10px;
                border: 1px solid #dee2e6;
                font-size: 12px;
                color: #555;
              }
              .items-table .text-center { text-align: center; }
              .items-table .text-right { text-align: right; }
              
              .bottom-section {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 30px;
                margin-bottom: 20px;
              }
              
              .bank-details {
                padding: 12px 15px;
                background: #f8f9fa;
                border-radius: 4px;
                font-size: 11px;
                line-height: 1.8;
                color: #555;
              }
              .bank-details .bank-title {
                font-weight: bold;
                color: #333;
                margin-bottom: 5px;
                font-size: 12px;
              }
              
              .totals-box {
                width: 100%;
              }
              .total-row {
                display: flex;
                justify-content: space-between;
                padding: 5px 0;
                font-size: 12px;
              }
              .total-row .label { color: #666; }
              .total-row .value { color: #333; font-weight: 500; }
              .discount-row .label, .discount-row .value { color: #28a745; }
              .grand-total-row {
                display: flex;
                justify-content: space-between;
                padding: 10px 0;
                margin-top: 6px;
                border-top: 2px solid #333;
                font-size: 16px;
                font-weight: bold;
              }
              .grand-total-row .value { color: #007bff; }
              
              .terms-section {
                margin-bottom: 25px;
                font-size: 11px;
                color: #555;
              }
              .terms-title {
                font-weight: bold;
                color: #333;
                margin-bottom: 4px;
                font-size: 12px;
              }
              .terms-list {
                list-style: none;
                padding: 0;
              }
              .terms-list li {
                padding: 1px 0;
              }
              
              .footer-section { 
                padding-top: 12px; 
                margin-top: 20px;
                border-top: 1px solid #e9ecef; 
                display: flex;
                justify-content: flex-end;
                align-items: flex-end;
              }
              .footer-left { flex: 1; }
              .footer-right { text-align: right; }
              .footer-company { 
                font-weight: bold; 
                color: #1a1a1a; 
                font-size: 13px; 
                margin-bottom: 8px; 
              }
              .signature-container { 
                margin-top: 8px; 
                display: flex; 
                justify-content: flex-end; 
              }
              .signature-image { 
                max-width: 150px; 
                max-height: 60px; 
                object-fit: contain; 
              }
              .footer-signatory { 
                font-size: 11px; 
                color: #666; 
                margin-top: 5px; 
              }
              
              @media print { 
                body { 
                  padding: 20px; 
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                } 
                .no-print { display: none; }
                .status-paid {
                  background: #d4edda !important;
                  color: #155724 !important;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                .status-not-paid {
                  background: #f8d7da !important;
                  color: #721c24 !important;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                .items-table th {
                  background: #f8f9fa !important;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                .bank-details {
                  background: #f8f9fa !important;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                .signature-image {
                  max-width: 150px;
                  max-height: 60px;
                }
                .payment-type-label, .payment-substatus-label, .invoice-info {
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
              }
            </style>
          </head>
          <body>
            <div class="document-container">
              
              <div class="letterhead">
                <div class="letterhead-logo">
                  <img src="${LOGO_URL}" alt="iBots" onerror="this.style.display='none'">
                  <div class="tagline">Unleash the power of Electronics</div>
                </div>
                <div class="letterhead-company">
                  <div class="company-name">Protowiz Private Limited</div>
                  <div class="company-info">
                    Office : 34/17A, First floor, Ramalingam nagar,<br>
                    4th cross street, Saibaba colony, Coimbatore - 641011, Tamil Nadu<br>
                    E-mail : info@ibots.in  PH No : 80152 98233<br>
                    Visit us : www.ibots.in<br>
                    GST No : 33AAKCP9459K1ZO / PAN : AAMCP9459K
                  </div>
                </div>
              </div>

              <div class="doc-header">
                <div class="doc-type">${documentType}</div>
                <div class="doc-meta">
                  <div>${documentLabel}: ${selectedBill.invoiceNumber}</div>
                  <div>Date: ${selectedBill.billDate?.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) || new Date().toLocaleDateString('en-IN')}</div>
                  ${!isQuotation && displayStatus ? `
                    <div><span class="status-badge ${statusClass}">${displayStatus}</span></div>
                  ` : ''}
                  ${displayPaymentType && !isQuotation ? `
                    <div class="payment-type-label">Payment Type: ${displayPaymentType}</div>
                  ` : ''}
                  ${displayPaymentSubStatus && !isQuotation ? `
                    <div class="invoice-info">Payment Status: ${displayPaymentSubStatus}</div>
                  ` : ''}
                </div>
              </div>

              <div class="billing-section">
                <div>
                  <div class="billing-label">Billed by</div>
                  <div class="billing-content">
                    <strong>${selectedBill.billedBy?.name || 'N/A'}</strong><br>
                    ${selectedBill.billedBy?.address || 'Protowiz Private Limited,34/17A, First floor, 4th Cross Rd, Ramalingam Nagar, Saibaba Colony, Coimbatore, Tamil Nadu 641011'}
                    ${selectedBill.billedBy?.gstin ? `<br>GSTIN: ${selectedBill.billedBy.gstin}` : ''}
                    ${selectedBill.billedBy?.pan ? `<br>PAN: ${selectedBill.billedBy.pan}` : ''}
                  </div>
                </div>
                <div>
                  <div class="billing-label">Billed to</div>
                  <div class="billing-content">
                    <strong>${selectedBill.billedTo?.name || selectedBill.customerName}</strong><br>
                    Enquiry ID: ${selectedBill.billedTo?.enqId || selectedBill.enquiryEnqId || 'N/A'}<br>
                    Contact: ${selectedBill.billedTo?.contactNumber || selectedBill.customerContact}<br>
                    City: ${selectedBill.billedTo?.city || selectedBill.customerCity}<br>
                    State: ${selectedBill.billedTo?.state || 'Tamil Nadu'}
                    ${selectedBill.billedTo?.gstin ? `<br>GSTIN: ${selectedBill.billedTo.gstin}` : ''}
                    ${!isQuotation && displayPaymentType ? `<br>Payment Type: ${displayPaymentType}` : ''}
                    ${!isQuotation && displayPaymentSubStatus ? `<br>Payment Status: ${displayPaymentSubStatus}` : ''}
                  </div>
                </div>
              </div>

              <div class="supply-bar">
                <strong>Place of Supply:</strong> ${selectedBill.placeOfSupply || selectedBill.billedTo?.state || 'Tamil Nadu'} &nbsp;&nbsp;|&nbsp;&nbsp; <strong>Tax Type:</strong> ${selectedBill.taxType === 'cgst_sgst' ? 'CGST + SGST' : 'IGST'}
              </div>

              <table class="items-table">
                <thead>
                  <tr>
                    ${getTableHeaders()}
                  </tr>
                </thead>
                <tbody>
                  ${getTableRows()}
                </tbody>
              </table>

              <div class="bottom-section">
                <div class="bank-details">
                  <div class="bank-title">Bank Details</div>
                  <div>
                    <strong>Beneficiary Name:</strong> ${bankDetailsToPrint.beneficiaryName}<br>
                    <strong>Bank Name:</strong> ${bankDetailsToPrint.bankName}<br>
                    <strong>Account No:</strong> ${bankDetailsToPrint.accountNo}<br>
                    <strong>IFSC Code:</strong> ${bankDetailsToPrint.ifscCode}<br>
                    <strong>Branch:</strong> ${bankDetailsToPrint.branch}
                  </div>
                </div>

                <div class="totals-box">
                  <div class="total-row">
                    <span class="label">Sub Total</span>
                    <span class="value">₹${selectedBill.subtotal?.toFixed(2) || '0.00'}</span>
                  </div>
                  ${selectedBill.discountAmount && selectedBill.discountAmount > 0 ? `
                  <div class="total-row discount-row">
                    <span class="label">Discount (${selectedBill.discountPercentage || 0}%)</span>
                    <span class="value">-₹${selectedBill.discountAmount.toFixed(2)}</span>
                  </div>
                  ` : ''}
                  ${selectedBill.taxType === 'cgst_sgst' ? `
                  <div class="total-row">
                    <span class="label">CGST (${(selectedBill.taxRate || 0)/2}%)</span>
                    <span class="value">₹${selectedBill.cgst?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div class="total-row">
                    <span class="label">SGST (${(selectedBill.taxRate || 0)/2}%)</span>
                    <span class="value">₹${selectedBill.sgst?.toFixed(2) || '0.00'}</span>
                  </div>
                  ` : `
                  <div class="total-row">
                    <span class="label">IGST (${selectedBill.taxRate || 0}%)</span>
                    <span class="value">₹${selectedBill.igst?.toFixed(2) || '0.00'}</span>
                  </div>
                  `}
                  <div class="grand-total-row">
                    <span>Grand Total</span>
                    <span class="value">₹${selectedBill.totalAmount?.toFixed(2) || '0.00'}</span>
                  </div>
                </div>
              </div>

              <div class="terms-section">
                <div class="terms-title">Terms & Conditions:</div>
                <ul class="terms-list">
                  ${termsToPrint && termsToPrint.length > 0 ? 
                    termsToPrint.map((term, index) => `
                      <li>${index + 1}. ${term.text}</li>
                    `).join('') 
                    : `
                      <li>1. Payment: 100% advance</li>
                      <li>2. Delivery: 10-12 days maximum from advance initiation</li>
                      <li>3. Quote Validity: 2 days</li>
                    `
                  }
                </ul>
              </div>

              <div class="footer-section">
                <div class="footer-left"></div>
                <div class="footer-right">
                  <div class="footer-company">For Protowiz Private Limited</div>
                  ${shouldIncludeSignature ? `
                    <div class="signature-container">
                      <img 
                        src="${SIGNATURE_URL}" 
                        alt="Authorized Signature" 
                        class="signature-image"
                        onerror="this.style.display='none'"
                      />
                    </div>
                  ` : `
                    <div style="height: 50px;"></div>
                  `}
                  <div class="footer-signatory">Authorised Signatory</div>
                </div>
              </div>

            </div>
            
            <div class="no-print" style="text-align: center; margin-top: 25px;">
              <button onclick="window.print();" style="padding: 10px 24px; background: #007bff; color: white; border: none; border-radius: 5px; margin: 8px; cursor: pointer; font-size: 14px;">🖨 Print ${documentType}</button>
              <button onclick="window.close();" style="padding: 10px 24px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">✕ Close</button>
            </div>
          </body>
        </html>
      `;

    printHtmlDocument(htmlContent);
  };

  const handleExportCSV = () => {
    const headers = [
      "Invoice #",
      "Enquiry ID",
      "Invoice Date",
      "Customer / Company Name",
      "Contact Number",
      "GSTIN",
      "Place of Supply",
      "Bill Type",
      "Tax Type",
      "Taxable Value (INR)",
      "CGST (INR)",
      "SGST (INR)",
      "IGST (INR)",
      "Shipping Charges (INR)",
      "Total Amount (INR)",
      "Status",
      "Payment Status",
      "Payment Type",
      "Generated By",
    ];

    const csvData = filteredTransactions.map((bill) => {
      const d = bill.billDate?.toDate
        ? bill.billDate.toDate()
        : bill.billDate
        ? new Date(bill.billDate)
        : bill.createdAt?.toDate
        ? bill.createdAt.toDate()
        : null;
      const dateStr = d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN") : "N/A";
      const customerDisp = bill.companyName ? `${bill.companyName} (${bill.customerName})` : bill.customerName;
      const taxable = Number(bill.subtotal || bill.taxableValue || 0).toFixed(2);
      const cgst = Number(bill.cgst || 0).toFixed(2);
      const sgst = Number(bill.sgst || 0).toFixed(2);
      const igst = Number(bill.igst || 0).toFixed(2);
      const shipping = Number(bill.shippingCharges || 0).toFixed(2);
      const total = Number(bill.totalAmount || 0).toFixed(2);
      const billTypeStr = bill.isGST ? "GST (B2B)" : "Non-GST (B2C)";
      const taxTypeStr =
        bill.taxType === "cgst_sgst"
          ? "CGST + SGST"
          : bill.taxType === "igst"
          ? "IGST"
          : bill.isGST
          ? "GST"
          : "None";

      return [
        `"${bill.invoiceNumber || ""}"`,
        `"${bill.enquiryEnqId || ""}"`,
        `"${dateStr}"`,
        `"${(customerDisp || "").replace(/"/g, '""')}"`,
        `"${bill.customerContact || ""}"`,
        `"${bill.gstin || "URP"}"`,
        `"${bill.placeOfSupply || "Tamil Nadu"}"`,
        `"${billTypeStr}"`,
        `"${taxTypeStr}"`,
        taxable,
        cgst,
        sgst,
        igst,
        shipping,
        total,
        `"${getStatusDisplay(bill.status)}"`,
        `"${bill.paymentStatus === "completed" ? "Paid" : "Not Paid"}"`,
        `"${bill.paymentType || "N/A"}"`,
        `"${bill.assignedToName || "Staff"}"`,
      ];
    });

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...csvData.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);

    let filePrefix = "bills";
    if (billTypeFilter === "gst") filePrefix = "GST_B2B_bills";
    else if (billTypeFilter === "non_gst") filePrefix = "Non_GST_B2C_bills";
    if (orderStatusFilter !== "all") filePrefix += `_${orderStatusFilter}`;
    if (monthFilter !== "all" && monthFilter !== "custom") filePrefix += `_${monthFilter}`;

    link.setAttribute("download", `${filePrefix}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadgeColor = (status: string, type: "status" | "payment") => {
    if (type === "status") {
      if (status === "paid") return "bg-green-100 text-green-800";
      if (status === "proforma") return "bg-purple-100 text-purple-800";
      if (status === "dropped") return "bg-red-100 text-red-800";
      return "bg-yellow-100 text-yellow-800";
    } else {
      return status === "completed" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800";
    }
  };

  const getStatusDisplay = (status: string) => {
    if (status === "paid") return "Approved";
    if (status === "proforma") return "Proforma";
    if (status === "dropped") return "Dropped";
    return "Quotation";
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-red-100 text-red-800";
      case "manager":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredTransactions.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

  // Get exact mutually-exclusive counts for filter tabs
  const allCount = transactions.length;
  const invoiceCount = transactions.filter((b) => b.status === "paid").length;
  const quotationCount = transactions.filter((b) => b.status === "quotation").length;
  const proformaCount = transactions.filter((b) => b.status === "proforma").length;
  const droppedCount = transactions.filter((b) => b.status === "dropped").length;

  if (authLoading || loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">
            {authLoading ? "Checking authentication..." : "Loading transactions..."}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-6">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <p className="font-medium">Error: {error}</p>
        </div>
        <button onClick={fetchTransactions} className="mt-2 text-red-600 hover:text-red-800 text-sm underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Bill Transactions</h2>
            <p className="text-sm text-gray-500 mt-1">
              View and manage your generated invoices, quotations, and proforma invoices
              <span className={`ml-2 px-2 py-1 rounded-full text-xs capitalize ${getRoleBadgeColor(userRole)}`}>
                {userRole}
              </span>
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={fetchTransactions}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Quick Filter Pill Tabs with Counts */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={() => setOrderStatusFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              orderStatusFilter === "all"
                ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-600 ring-offset-1"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            All ({allCount})
          </button>
          <button
            onClick={() => setOrderStatusFilter("approved")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              orderStatusFilter === "approved"
                ? "bg-green-600 text-white shadow-sm ring-2 ring-green-600 ring-offset-1"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Invoice ({invoiceCount})
          </button>
          <button
            onClick={() => setOrderStatusFilter("quotation")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              orderStatusFilter === "quotation"
                ? "bg-yellow-600 text-white shadow-sm ring-2 ring-yellow-600 ring-offset-1"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Quotation ({quotationCount})
          </button>
          <button
            onClick={() => setOrderStatusFilter("proforma")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              orderStatusFilter === "proforma"
                ? "bg-purple-600 text-white shadow-sm ring-2 ring-purple-600 ring-offset-1"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Proforma ({proformaCount})
          </button>
          {droppedCount > 0 && (
            <button
              onClick={() => setOrderStatusFilter("dropped")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                orderStatusFilter === "dropped"
                  ? "bg-red-600 text-white shadow-sm ring-2 ring-red-600 ring-offset-1"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Dropped ({droppedCount})
            </button>
          )}
        </div>
        
        {/* Dynamic Multi-Criteria Filters Panel */}
        <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-200 mb-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 pb-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-gray-800">Dynamic Bill Filters</span>
              {(billTypeFilter !== "all" ||
                orderStatusFilter !== "all" ||
                monthFilter !== "all" ||
                searchTerm ||
                startDate ||
                endDate) && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                  Active
                </span>
              )}
            </div>
            {(billTypeFilter !== "all" ||
              orderStatusFilter !== "all" ||
              monthFilter !== "all" ||
              searchTerm ||
              startDate ||
              endDate) && (
              <button
                onClick={() => {
                  setBillTypeFilter("all");
                  setOrderStatusFilter("all");
                  setMonthFilter("all");
                  setStartDate("");
                  setEndDate("");
                  setSearchTerm("");
                }}
                className="text-xs text-red-600 hover:text-red-800 font-medium flex items-center gap-1 hover:underline"
              >
                <X className="w-3.5 h-3.5" />
                Reset All Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Search */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
                <Search className="w-3.5 h-3.5 text-gray-400" />
                Search
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Customer, Company, GSTIN, Inv #..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* 2. Bill Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-purple-600" />
                Bill type:
              </label>
              <select
                value={billTypeFilter}
                onChange={(e) => setBillTypeFilter(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="all">All</option>
                <option value="gst">GST (B2B) - All</option>
                <option value="gst_cgst_sgst">&nbsp;&nbsp;↳ GST (B2B) - CGST + SGST</option>
                <option value="gst_igst">&nbsp;&nbsp;↳ GST (B2B) - IGST</option>
                <option value="non_gst">Non-GST (B2C)</option>
              </select>
            </div>

            {/* 3. Order Status */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-green-600" />
                Order status:
              </label>
              <select
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="all">All</option>
                <option value="approved">Approved</option>
                <option value="quotation">Quotation</option>
                <option value="proforma">Proforma</option>
                <option value="dropped">Dropped</option>
              </select>
            </div>

            {/* 4. Month / Date Range */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                Month:
              </label>
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="all">All Months</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthLabel(m)}
                  </option>
                ))}
                <option value="custom">Custom Date Range...</option>
              </select>
            </div>
          </div>

          {/* Custom Date Range Inputs (Shown when 'custom' is selected) */}
          {monthFilter === "custom" && (
            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 font-medium">From:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border rounded-lg bg-white text-gray-800"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 font-medium">To:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border rounded-lg bg-white text-gray-800"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6 bg-gray-50 border-b">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Records</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{statistics.totalBills}</p>
              <p className="text-xs text-gray-400 mt-0.5 font-medium">
                {statistics.gstBillsCount} GST (B2B) &bull; {statistics.totalBills - statistics.gstBillsCount} Non-GST
              </p>
            </div>
            <FileText className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Taxable Value</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">
                ₹{statistics.taxableValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">Base Amount (Excl. Tax)</p>
            </div>
            <IndianRupee className="w-8 h-8 text-indigo-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">GST Collected</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">
                ₹{statistics.totalGST.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-purple-600 mt-0.5 font-medium">
                CGST+SGST: ₹{(statistics.totalCGST + statistics.totalSGST).toLocaleString("en-IN", { maximumFractionDigits: 0 })} &bull; IGST: ₹{statistics.totalIGST.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-purple-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                ₹{statistics.totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-green-600 mt-0.5 font-medium">
                {statistics.paidBillsCount} Paid ({((statistics.paidBillsCount / (statistics.totalBills || 1)) * 100).toFixed(0)}%)
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Invoice #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Enquiry ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap max-w-[150px]">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Contact</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Amount</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Status</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Payment</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Payment Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Generated By</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currentItems.length > 0 ? (
              currentItems.map((bill) => (
                <tr key={bill.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{bill.invoiceNumber}</div>
                    <div className="text-xs text-gray-500">ID: {bill.billId?.slice(-6) || bill.id?.slice(-6)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Hash className="w-3 h-3 text-gray-400" />
                      <span className="text-sm font-mono text-blue-600">
                        {bill.enquiryEnqId || "N/A"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(() => {
                      const d = bill.billDate?.toDate
                        ? bill.billDate.toDate()
                        : bill.billDate
                        ? new Date(bill.billDate)
                        : bill.createdAt?.toDate
                        ? bill.createdAt.toDate()
                        : null;
                      return d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN") : "N/A";
                    })()}
                  </td>
                  <td className="px-6 py-4 max-w-[150px]">
                    <div className="text-sm font-medium text-gray-900 truncate" title={bill.customerName}>
                      {bill.customerName}
                    </div>
                    {bill.gstin ? (
                      <div className="text-[11px] font-mono text-purple-700 bg-purple-50 px-1 rounded inline-block border border-purple-200 mt-0.5" title={`GSTIN: ${bill.gstin}`}>
                        GST: {bill.gstin}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 truncate" title={bill.customerCity}>
                        {bill.customerCity}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {bill.customerContact}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-semibold">
                    ₹{(bill.totalAmount || 0).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadgeColor(bill.status, "status")}`}>
                      {getStatusDisplay(bill.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadgeColor(bill.paymentStatus, "payment")}`}>
                      {bill.paymentStatus === "completed" ? "Paid" : "Not Paid"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                      {bill.paymentType || "N/A"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${getRoleBadgeColor(bill.createdByRole)}`}>
                      {bill.assignedToName}
                    </span>
                    <div className="text-xs text-gray-500 mt-1 capitalize">{bill.createdByRole}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => handleViewBill(bill)}
                        className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
                        title="View Bill"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      {hasDeleteAccess && (
                        <button
                          onClick={() => handleDeleteClick(bill)}
                          className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50"
                          title="Delete Bill"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={11} className="text-center py-12">
                  <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-base font-medium text-gray-700">No bill transactions match your filters</p>
                  <p className="text-xs text-gray-400 mt-1">Try adjusting your Bill type, Order status, or Month filters</p>
                  {(billTypeFilter !== "all" ||
                    orderStatusFilter !== "all" ||
                    monthFilter !== "all" ||
                    searchTerm ||
                    startDate ||
                    endDate) && (
                    <button
                      onClick={() => {
                        setBillTypeFilter("all");
                        setOrderStatusFilter("all");
                        setMonthFilter("all");
                        setStartDate("");
                        setEndDate("");
                        setSearchTerm("");
                      }}
                      className="mt-4 px-4 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium"
                    >
                      Reset All Filters
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-6 py-4 border-t flex justify-between items-center">
          <div className="text-sm text-gray-500">
            Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredTransactions.length)} of {filteredTransactions.length} entries
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border rounded-lg disabled:opacity-50 hover:bg-gray-50"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="px-3 py-1">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border rounded-lg disabled:opacity-50 hover:bg-gray-50"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Bill Details Modal */}
      {selectedBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto my-8">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
              <h3 className="text-xl font-bold">Bill Details</h3>
              <button onClick={() => setSelectedBill(null)} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Invoice Number</p>
                  <p className="font-semibold">{selectedBill.invoiceNumber}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Enquiry ID</p>
                  <p className="font-semibold text-blue-600">{selectedBill.enquiryEnqId || "N/A"}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Date</p>
                  <p className="font-semibold">{selectedBill.billDate?.toDate().toLocaleDateString()}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Total Amount</p>
                  <p className="font-semibold text-green-600">₹{selectedBill.totalAmount?.toFixed(2)}</p>
                </div>
              </div>

              <div className={`mb-6 p-4 rounded-lg ${
                selectedBill.status === "proforma" ? "bg-purple-50 border border-purple-200" :
                selectedBill.paymentStatus === "completed" ? "bg-green-50 border border-green-200" : 
                "bg-yellow-50 border border-yellow-200"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {selectedBill.status === "proforma" ? (
                      <FileText className="w-5 h-5 text-purple-600" />
                    ) : selectedBill.paymentStatus === "completed" ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-yellow-600" />
                    )}
                    <span className={`font-semibold ${
                      selectedBill.status === "proforma" ? "text-purple-800" :
                      selectedBill.paymentStatus === "completed" ? "text-green-800" : 
                      "text-yellow-800"
                    }`}>
                      {selectedBill.status === "proforma" ? "Proforma Invoice" : "Payment Status:"}
                    </span>
                  </div>
                  <span className={`px-3 py-1 rounded-full font-semibold ${
                    selectedBill.status === "proforma" ? "bg-purple-100 text-purple-800" :
                    selectedBill.paymentStatus === "completed" ? "bg-green-100 text-green-800" : 
                    "bg-yellow-100 text-yellow-800"
                  }`}>
                    {selectedBill.status === "proforma" ? "PROFORMA" :
                     selectedBill.paymentStatus === "completed" ? "PAID" : "NOT PAID"}
                  </span>
                </div>
                <div className="mt-2 text-sm">
                  <span className="text-gray-600">Payment Type: </span>
                  <span className="font-medium">{selectedBill.paymentType || "N/A"}</span>
                </div>
                {selectedBill.paymentSubStatus && (
                  <div className="mt-1 text-sm">
                    <span className="text-gray-600">Payment Sub Status: </span>
                    <span className="font-medium">{selectedBill.paymentSubStatus}</span>
                  </div>
                )}
              </div>

              <h4 className="font-semibold mb-3">Items</h4>
              <div className="overflow-x-auto mb-6">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-3 text-left">Product</th>
                      <th className="border p-3 text-center">Quantity</th>
                      <th className="border p-3 text-right">Price</th>
                      <th className="border p-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBill.items?.map((item, idx) => (
                      <tr key={idx}>
                        <td className="border p-3">{item.productName}</td>
                        <td className="border p-3 text-center">{item.quantity}</td>
                        <td className="border p-3 text-right">₹{item.price.toFixed(2)}</td>
                        <td className="border p-3 text-right">₹{item.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Editable Bank Details */}
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">Bank Details</h4>
                  <div className="flex gap-2">
                    {!editingBankDetails ? (
                      <button
                        onClick={() => setEditingBankDetails(true)}
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs"
                      >
                        <Edit3 className="w-3 h-3" />
                        Edit
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditingBankDetails(false)}
                          className="text-green-600 hover:text-green-800 flex items-center gap-1 text-xs"
                        >
                          <Check className="w-3 h-3" />
                          Done
                        </button>
                        <button
                          onClick={resetBankDetails}
                          className="text-gray-600 hover:text-gray-800 flex items-center gap-1 text-xs"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reset
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {editingBankDetails ? (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">Beneficiary Name</label>
                      <input
                        type="text"
                        value={editBankDetails.beneficiaryName}
                        onChange={(e) => handleBankDetailChange('beneficiaryName', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">Bank Name</label>
                      <input
                        type="text"
                        value={editBankDetails.bankName}
                        onChange={(e) => handleBankDetailChange('bankName', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">Account No</label>
                      <input
                        type="text"
                        value={editBankDetails.accountNo}
                        onChange={(e) => handleBankDetailChange('accountNo', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">IFSC Code</label>
                      <input
                        type="text"
                        value={editBankDetails.ifscCode}
                        onChange={(e) => handleBankDetailChange('ifscCode', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">Branch</label>
                      <input
                        type="text"
                        value={editBankDetails.branch}
                        onChange={(e) => handleBankDetailChange('branch', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1 text-sm">
                    <p><strong>Beneficiary Name:</strong> {editBankDetails.beneficiaryName}</p>
                    <p><strong>Bank Name:</strong> {editBankDetails.bankName}</p>
                    <p><strong>Account No:</strong> {editBankDetails.accountNo}</p>
                    <p><strong>IFSC Code:</strong> {editBankDetails.ifscCode}</p>
                    <p><strong>Branch:</strong> {editBankDetails.branch}</p>
                  </div>
                )}
              </div>

              {/* Editable Terms & Conditions - Now shown for Proforma as well */}
              <div className="bg-gray-50 p-4 rounded-lg mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">Terms & Conditions</h4>
                  <div className="flex gap-2">
                    {!editingTerms ? (
                      <button
                        onClick={() => setEditingTerms(true)}
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs"
                      >
                        <Edit3 className="w-3 h-3" />
                        Edit
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditingTerms(false)}
                          className="text-green-600 hover:text-green-800 flex items-center gap-1 text-xs"
                        >
                          <Check className="w-3 h-3" />
                          Done
                        </button>
                        <button
                          onClick={resetTerms}
                          className="text-gray-600 hover:text-gray-800 flex items-center gap-1 text-xs"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reset
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {editingTerms ? (
                  <div className="space-y-2">
                    {editTerms.map((term, index) => (
                      <div key={term.id} className="flex items-center gap-2">
                        <span className="text-gray-600">{index + 1}.</span>
                        <input
                          type="text"
                          value={term.text}
                          onChange={(e) => handleTermChange(term.id, e.target.value)}
                          className="flex-1 px-2 py-1 border rounded text-xs"
                        />
                        <button
                          onClick={() => handleRemoveTerm(term.id)}
                          className="text-red-500 hover:text-red-700 text-xs"
                          title="Remove term"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">{editTerms.length + 1}.</span>
                      <input
                        type="text"
                        value={newTerm}
                        onChange={(e) => setNewTerm(e.target.value)}
                        placeholder="Add new term..."
                        className="flex-1 px-2 py-1 border rounded text-xs"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            handleAddTerm();
                          }
                        }}
                      />
                      <button
                        onClick={handleAddTerm}
                        className="text-green-600 hover:text-green-800 text-xs font-semibold whitespace-nowrap"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                ) : (
                  <ul className="list-none space-y-1 text-sm">
                    {editTerms.map((term, index) => (
                      <li key={term.id}>{index + 1}. {term.text}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Sign & Seal Edit Option */}
              <div className="bg-gray-50 p-4 rounded-lg mb-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-800">Sign & Seal</h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Choose whether to include the authorized signature & seal on the printed Invoice/Quotation.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIncludeSignature}
                      onChange={(e) => handleToggleSignature(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    <span className="ml-3 text-sm font-semibold text-gray-700">
                      {editIncludeSignature ? "Included" : "Excluded"}
                    </span>
                  </label>
                </div>
                {editIncludeSignature && (
                  <div className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-3">
                    <img src={SIGNATURE_URL} alt="Sign & Seal" className="h-10 w-auto object-contain bg-white p-1 border rounded" />
                    <span className="text-xs text-gray-500">Sign & seal will be printed on the final document.</span>
                  </div>
                )}
              </div>

              {/* Notes Section for Proforma */}
              {selectedBill.status === "proforma" && selectedBill.notes && (
                <div className="bg-yellow-50 p-4 rounded-lg mb-6 border border-yellow-200">
                  <h4 className="font-semibold mb-2">Notes</h4>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{selectedBill.notes}</p>
                </div>
              )}

              <div className="bg-gray-50 p-4 rounded-lg mb-6">
                <h4 className="font-semibold mb-3">Tax Summary</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium">₹{selectedBill.subtotal?.toFixed(2) || "0.00"}</span>
                  </div>
                  {selectedBill.discountAmount && selectedBill.discountAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Discount ({selectedBill.discountPercentage || 0}%):</span>
                      <span className="text-green-600 font-medium">-₹{selectedBill.discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Taxable Amount:</span>
                    <span className="font-medium">₹{((selectedBill.subtotal || 0) - (selectedBill.discountAmount || 0)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tax Type:</span>
                    <span className="font-medium capitalize">
                      {selectedBill.taxType === "cgst_sgst" ? "CGST + SGST" : "IGST"} ({selectedBill.taxRate || 0}%)
                    </span>
                  </div>
                  {selectedBill.taxType === "cgst_sgst" ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">CGST ({(selectedBill.taxRate || 0) / 2}%):</span>
                        <span className="font-medium">₹{selectedBill.cgst?.toFixed(2) || "0.00"}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">SGST ({(selectedBill.taxRate || 0) / 2}%):</span>
                        <span className="font-medium">₹{selectedBill.sgst?.toFixed(2) || "0.00"}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">IGST ({selectedBill.taxRate || 0}%):</span>
                      <span className="font-medium">₹{selectedBill.igst?.toFixed(2) || "0.00"}</span>
                    </div>
                  )}
                  {selectedBill.cessAmount && selectedBill.cessAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Cess Amount:</span>
                      <span className="font-medium">₹{selectedBill.cessAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t">
                    <span>Total Amount:</span>
                    <span className="text-green-600">₹{selectedBill.totalAmount?.toFixed(2) || "0.00"}</span>
                  </div>
                </div>
              </div>

              {selectedBill.notes && selectedBill.status !== "proforma" && (
                <div className="bg-blue-50 p-4 rounded-lg mb-6">
                  <h4 className="font-semibold mb-2">Notes</h4>
                  <p className="text-sm text-gray-700">{selectedBill.notes}</p>
                </div>
              )}
            </div>
            
            <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
              {/* Quick Sign & Seal Toggle */}
              <div className="flex items-center gap-2.5 bg-white px-3 py-1.5 rounded-lg border border-gray-200">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIncludeSignature}
                    onChange={(e) => handleToggleSignature(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  <span className="ml-2.5 text-xs font-semibold text-gray-700 select-none">
                    Sign & Seal: <span className={editIncludeSignature ? "text-purple-600 font-bold" : "text-gray-400 font-normal"}>{editIncludeSignature ? "Included" : "Excluded"}</span>
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handlePrintBill}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 text-sm font-medium"
                >
                  <Printer className="w-4 h-4" />
                  {selectedBill.status === "proforma" ? "Print Proforma" : "Print Bill"}
                </button>
                <button
                  onClick={() => setSelectedBill(null)}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && billToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 p-2 rounded-full">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold">Confirm Delete</h3>
            </div>
            <p className="text-gray-600 mb-2">Are you sure you want to delete this bill transaction?</p>
            <p className="text-sm text-gray-500 mb-6">
              <strong>Invoice:</strong> {billToDelete.invoiceNumber}<br />
              <strong>Enquiry ID:</strong> {billToDelete.enquiryEnqId || "N/A"}<br />
              <strong>Customer:</strong> {billToDelete.customerName}<br />
              <strong>Amount:</strong> ₹{billToDelete.totalAmount?.toFixed(2)}<br />
              <strong className="text-red-600">This action cannot be undone. The transaction will be permanently removed.</strong>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setBillToDelete(null);
                }}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete Transaction
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillTransactions;