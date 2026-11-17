// components/BillTransactions.tsx - Updated with Proforma Invoice print view

import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
} from "firebase/firestore";
import { 
  getAuth, 
  onAuthStateChanged, 
  EmailAuthProvider, 
  reauthenticateWithCredential 
} from "firebase/auth";
import type { User } from "firebase/auth";
import { db } from "../firebase";
import { billService } from "../services/billService";
import type { Bill } from "../services/billService";

import {
  FileText,
  Eye,
  EyeOff,
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
  Lock,
  ShoppingBag,
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
  billType?: "B2B" | "B2C";
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

const formatContactNumber = (contact?: string | number): string => {
  if (!contact) return "-";
  const str = String(contact).trim();
  if (!str) return "-";
  // Remove spaces, hyphens, and dots between numbers to make it a single continuous number
  const cleaned = str.replace(/[\s\-\.]+/g, "");
  return cleaned || "-";
};

// Safe date resolver matching PNL.tsx
const getBillDate = (b: any): Date => {
  const raw = b?.billDate || b?.createdAt || b?.updatedAt;
  if (raw?.toDate && typeof raw.toDate === "function") return raw.toDate();
  if (raw instanceof Date) return raw;
  if (typeof raw === "string" || typeof raw === "number") {
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
};

// Unified date range filter matching PNL.tsx
const isDateInFilterRange = (d: Date, preset: string, customStart?: string, customEnd?: string): boolean => {
  if (!d || isNaN(d.getTime())) return preset === "all";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "all":
      return true;
    case "today":
      return d >= startOfToday;
    case "this_week": {
      const startOfWeek = new Date(startOfToday);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      return d >= startOfWeek;
    }
    case "this_month": {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return d >= startOfMonth;
    }
    case "last_month": {
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return d >= startOfLastMonth && d <= endOfLastMonth;
    }
    case "this_quarter": {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const startOfQuarter = new Date(now.getFullYear(), currentQuarter * 3, 1);
      return d >= startOfQuarter;
    }
    case "this_fy": {
      // Indian Financial Year: April 1 to March 31
      const currentYear = now.getFullYear();
      const fyStart = now.getMonth() >= 3 ? new Date(currentYear, 3, 1) : new Date(currentYear - 1, 3, 1);
      return d >= fyStart;
    }
    case "custom": {
      if (!customStart && !customEnd) return true;
      const start = customStart ? new Date(customStart) : new Date(0);
      start.setHours(0, 0, 0, 0);
      const end = customEnd ? new Date(customEnd) : new Date(2100, 0, 1);
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    }
    default: {
      if (preset.includes("-")) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        return `${yyyy}-${mm}` === preset;
      }
      return true;
    }
  }
};

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
  const [deleteAdminPassword, setDeleteAdminPassword] = useState("");
  const [showDeleteAdminPassword, setShowDeleteAdminPassword] = useState(false);
  const [deletePasswordError, setDeletePasswordError] = useState<string | null>(null);
  const savedSearchTermRef = useRef<string>("");

  // Dynamic filter state variables
  const [billTypeFilter, setBillTypeFilter] = useState<"all" | "b2b" | "b2c">("all");
  const [orderStatusFilter, setOrderStatusFilter] = useState<"all" | "approved" | "quotation" | "dropped">("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [statistics, setStatistics] = useState({
    purchaseValue: 0,
    sellValue: 0,
    netMargin: 0,
    marginPercentage: 0,
    refundValue: 0,
    refundCount: 0,
    activeBillsCount: 0,
    paidSellValue: 0,
    purchaseItemsCount: 0,

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
  const [productsMap, setProductsMap] = useState<Map<string, any>>(new Map());
  const [productsByName, setProductsByName] = useState<Map<string, any>>(new Map());
  const [productsList, setProductsList] = useState<any[]>([]);
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

  // Real-time synchronization with products collection in inventory dashboard
  useEffect(() => {
    const productsRef = collection(db, "products");
    const unsubscribe = onSnapshot(
      productsRef,
      (snapshot) => {
        const pMap = new Map<string, any>();
        const pNameMap = new Map<string, any>();
        const pList: any[] = [];

        snapshot.forEach((doc) => {
          const data = doc.data();

          // Exactly resolve purchase price as done in InventoryManagement.tsx
          let resolvedPurchasePrice = 0;
          if (data.currentPrice !== undefined && data.currentPrice !== null && !isNaN(Number(data.currentPrice))) {
            resolvedPurchasePrice = Number(data.currentPrice);
          } else if (data.stockEntries && Array.isArray(data.stockEntries) && data.stockEntries.length > 0) {
            const lastEntry = data.stockEntries[data.stockEntries.length - 1];
            if (lastEntry && lastEntry.unitPrice !== undefined && !isNaN(Number(lastEntry.unitPrice))) {
              resolvedPurchasePrice = Number(lastEntry.unitPrice);
            }
          } else if (data.price !== undefined && data.price !== null && !isNaN(Number(data.price))) {
            resolvedPurchasePrice = Number(data.price);
          } else if (data.unitprice !== undefined && data.unitprice !== null && !isNaN(Number(data.unitprice))) {
            resolvedPurchasePrice = Number(data.unitprice);
          }

          const prodObj = {
            id: doc.id,
            ...data,
            currentPrice: resolvedPurchasePrice,
            purchasePrice: data.purchasePrice !== undefined && data.purchasePrice !== null && !isNaN(Number(data.purchasePrice))
              ? Number(data.purchasePrice)
              : resolvedPurchasePrice,
          };

          pMap.set(doc.id, prodObj);
          pList.push(prodObj);

          if (data.name) {
            const trimmedLower = String(data.name).trim().toLowerCase();
            pNameMap.set(trimmedLower, prodObj);

            // Alphanumeric normalized (e.g. "arduinounor3" matches "Arduino Uno R3")
            const alphaNum = trimmedLower.replace(/[^a-z0-9]/g, "");
            if (alphaNum && alphaNum !== trimmedLower) {
              pNameMap.set(alphaNum, prodObj);
            }
          }

          if (data.sku) {
            const skuLower = String(data.sku).trim().toLowerCase();
            pNameMap.set(skuLower, prodObj);
          }
        });

        console.log(`[BillTransactions] Synced ${snapshot.size} inventory products from dashboard.`);
        setProductsMap(pMap);
        setProductsByName(pNameMap);
        setProductsList(pList);
      },
      (err) => {
        console.error("Error subscribing to products catalog in BillTransactions:", err);
      }
    );

    return () => unsubscribe();
  }, [authUser]);

  // Comprehensive inventory product matcher
  const findInventoryProduct = (item: any): any | null => {
    if (!item) return null;

    // 1. Direct ID match
    if (item.productId && productsMap.has(item.productId)) {
      return productsMap.get(item.productId);
    }

    // 2. Exact cleaned name match
    const rawName = String(item.productName || item.name || "").trim().toLowerCase();
    if (!rawName) return null;

    if (productsByName.has(rawName)) {
      return productsByName.get(rawName);
    }

    // 3. Alphanumeric stripped name match
    const alphaNum = rawName.replace(/[^a-z0-9]/g, "");
    if (alphaNum && productsByName.has(alphaNum)) {
      return productsByName.get(alphaNum);
    }

    // 4. SKU match
    const rawSku = String(item.sku || item.productId || "").trim().toLowerCase();
    if (rawSku && productsByName.has(rawSku)) {
      return productsByName.get(rawSku);
    }

    // 5. Substring / inclusion match in productsList
    for (const prod of productsList) {
      if (!prod.name) continue;
      const pName = String(prod.name).trim().toLowerCase();
      if (pName === rawName) return prod;
      if (pName.length >= 4 && (rawName.includes(pName) || pName.includes(rawName))) {
        return prod;
      }
    }

    // 6. Multi-token word overlap matching (>= 60% words match)
    const itemTokens = rawName.split(/[\s\-_,./]+/).filter((t) => t.length > 2);
    if (itemTokens.length > 0) {
      let bestMatch: any = null;
      let maxOverlap = 0;

      for (const prod of productsList) {
        if (!prod.name) continue;
        const prodTokens = String(prod.name).trim().toLowerCase().split(/[\s\-_,./]+/).filter((t) => t.length > 2);
        if (prodTokens.length === 0) continue;

        let overlap = 0;
        for (const t of itemTokens) {
          if (prodTokens.includes(t)) overlap++;
        }

        const matchRatio = overlap / Math.min(itemTokens.length, prodTokens.length);
        if (matchRatio >= 0.6 && overlap > maxOverlap) {
          maxOverlap = overlap;
          bestMatch = prod;
        }
      }

      if (bestMatch) {
        return bestMatch;
      }
    }

    return null;
  };

  // Helper to extract unit purchase cost (identical to PNL.tsx)
  const getProductUnitCost = (p: any, fallbackItem?: any): number => {
    if (fallbackItem) {
      const explicit =
        fallbackItem.purchasePrice ??
        fallbackItem.costPrice ??
        fallbackItem.cost ??
        fallbackItem.buyingPrice;
      if (explicit !== undefined && explicit !== null && !isNaN(Number(explicit)) && Number(explicit) > 0) {
        return Number(explicit);
      }
    }
    if (!p) return 0;
    if (p.currentPrice !== undefined && p.currentPrice !== null && !isNaN(Number(p.currentPrice)) && Number(p.currentPrice) > 0) {
      return Number(p.currentPrice);
    }
    if (p.purchasePrice !== undefined && p.purchasePrice !== null && !isNaN(Number(p.purchasePrice)) && Number(p.purchasePrice) > 0) {
      return Number(p.purchasePrice);
    }
    const stockEntries = (p as any).stockEntries || [];
    if (Array.isArray(stockEntries) && stockEntries.length > 0) {
      const addEntries = stockEntries.filter((e: any) => e.type !== "deliver");
      if (addEntries.length > 0) {
        const totalCost = addEntries.reduce(
          (sum: number, e: any) => sum + (Number(e.totalPrice) || ((Number(e.quantity) || 0) * (Number(e.unitPrice) || 0))),
          0
        );
        const totalQty = addEntries.reduce((sum: number, e: any) => sum + (Number(e.quantity) || 0), 0);
        if (totalQty > 0) return totalCost / totalQty;
        if (addEntries[addEntries.length - 1]?.unitPrice) {
          return Number(addEntries[addEntries.length - 1].unitPrice);
        }
      }
    }
    return Number(p.price || 0);
  };

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
        fetchedBills = await billService.getBills();
        console.log("Primary fetch successful:", fetchedBills.length, "bills");
      } catch (roleError: any) {
        console.warn("Primary fetch failed, using fallback query:", roleError.message);
        try {
          const billsRef = collection(db, "bills");
          const snap = await getDocs(billsRef);
          snap.forEach((doc) => {
            fetchedBills.push({ id: doc.id, ...doc.data() } as Bill);
          });
          console.log("Fallback fetched all bills:", fetchedBills.length);
        } catch (fallbackError) {
          console.error("Fallback also failed:", fallbackError);
          throw fallbackError;
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

      // Batch load enquiries map to avoid slow N+1 individual queries
      const enquiriesMap = new Map<string, any>();
      try {
        const enquiriesSnap = await getDocs(collection(db, "enquiries"));
        enquiriesSnap.forEach((docSnap) => {
          const d = { id: docSnap.id, ...docSnap.data() };
          if (d.enqId) {
            const rawId = String(d.enqId).trim();
            enquiriesMap.set(rawId, d);
            enquiriesMap.set(rawId.toLowerCase(), d);
            enquiriesMap.set(rawId.toUpperCase(), d);
          }
          enquiriesMap.set(docSnap.id, d);
          enquiriesMap.set(docSnap.id.toLowerCase(), d);
        });
      } catch (err) {
        console.warn("Could not batch load enquiries in BillTransactions:", err);
      }

      // Process each bill with enquiry data
      const processedTransactions = deduplicatedBills.map((bill) => {
        // Find matching enquiry across all possible bill identifiers
        const enqKeys = [
          bill.enquiryEnqId,
          bill.enquiryId,
          bill.billedTo?.enqId,
          (bill as any).enqId,
        ].filter(Boolean);

        let enquiryData: any = null;
        for (const k of enqKeys) {
          const strK = String(k).trim();
          if (enquiriesMap.has(strK)) {
            enquiryData = enquiriesMap.get(strK);
            break;
          }
          if (enquiriesMap.has(strK.toLowerCase())) {
            enquiryData = enquiriesMap.get(strK.toLowerCase());
            break;
          }
          if (enquiriesMap.has(strK.toUpperCase())) {
            enquiryData = enquiriesMap.get(strK.toUpperCase());
            break;
          }
        }

        // Secondary fallback by customer phone number if not found by ID
        if (!enquiryData && bill.customerContact) {
          const bPhoneDigits = String(bill.customerContact).replace(/\D/g, "");
          if (bPhoneDigits.length >= 7) {
            for (const [, enq] of enquiriesMap.entries()) {
              const ePhone = String(
                enq.contactNumber ||
                enq.customerContact ||
                enq.customer?.contactNumber ||
                enq.customer?.phone ||
                enq.phone ||
                ""
              ).replace(/\D/g, "");
              if (ePhone && (ePhone.includes(bPhoneDigits) || bPhoneDigits.includes(ePhone))) {
                enquiryData = enq;
                break;
              }
            }
          }
        }

        const paymentSubStatus = enquiryData?.paymentSubStatus || (bill as any).paymentSubStatus || "N/A";

        const gstin = (
          bill.billedTo?.gstin ||
          enquiryData?.companyDetails?.companyGST ||
          enquiryData?.gstin ||
          (bill as any).gstin ||
          ""
        ).trim();

        const hasValidGstin =
          gstin.length >= 5 &&
          gstin.toLowerCase() !== "urp" &&
          gstin.toLowerCase() !== "n/a" &&
          gstin.toLowerCase() !== "none";

        const hasTax =
          (bill.cgst && bill.cgst > 0) ||
          (bill.sgst && bill.sgst > 0) ||
          (bill.igst && bill.igst > 0) ||
          bill.taxType === "cgst_sgst" ||
          bill.taxType === "igst";

        const isGST = !!gstin || hasTax;
        const companyName = bill.billedTo?.name || enquiryData?.companyDetails?.companyName || "";
        const placeOfSupply = bill.placeOfSupply || bill.billedTo?.state || enquiryData?.state || "Tamil Nadu";

        // Determine B2B vs B2C:
        // Priority 1: The enquiry's explicit type is the master source of truth (as shown in the Enquiry eye button)
        const enqType = String(enquiryData?.type || "").toUpperCase().trim();
        const clientType = String(
          (bill as any).clientType ||
          (bill as any).customerType ||
          (bill as any).enquiryType ||
          ""
        ).toUpperCase().trim();

        let billType: "B2B" | "B2C" = "B2C";

        if (enqType.includes("B2C") || clientType.includes("B2C")) {
          // Explicitly B2C in enquiry or bill client record
          billType = "B2C";
        } else if (enqType.includes("B2B") || clientType.includes("B2B")) {
          // Explicitly B2B in enquiry or bill client record
          billType = "B2B";
        } else if (hasValidGstin) {
          // Has valid customer GSTIN registration number -> B2B
          billType = "B2B";
        } else if (
          companyName &&
          (companyName.toLowerCase().includes("pvt") ||
            companyName.toLowerCase().includes("ltd") ||
            companyName.toLowerCase().includes("inc") ||
            companyName.toLowerCase().includes("technologies") ||
            companyName.toLowerCase().includes("solutions") ||
            companyName.toLowerCase().includes("enterprises"))
        ) {
          // Corporate company name with registered business structure -> B2B
          billType = "B2B";
        } else {
          // Default: Retail / individual consumer transaction without buyer GSTIN -> B2C
          billType = "B2C";
        }

        // Safely parse bill items if stored as JSON string
        let billItems = bill.items;
        if (typeof billItems === "string") {
          try {
            billItems = JSON.parse(billItems);
          } catch (e) {
            billItems = [];
          }
        }

        if ((!billItems || !Array.isArray(billItems) || billItems.length === 0) && enquiryData) {
          try {
            let parsed = enquiryData.materials || enquiryData.products || enquiryData.items;
            if (typeof parsed === "string") {
              parsed = JSON.parse(parsed);
            }
            if (Array.isArray(parsed)) {
              billItems = parsed.map((m: any) => ({
                productId: m.productId || m.id,
                productName: m.productName || m.name || "Item",
                quantity: Number(m.quantity) || 1,
                price: Number(m.price) || 0,
                total: Number(m.totalAmount || m.total || (Number(m.price || 0) * Number(m.quantity || 1))),
                purchasePrice: m.purchasePrice !== undefined ? Number(m.purchasePrice) : undefined,
                costPrice: m.costPrice,
                cost: m.cost,
                buyingPrice: m.buyingPrice,
                sku: m.sku,
                category: m.category,
                hsn: m.hsn || m.hsnCode || "",
              }));
            }
          } catch (e) {
            console.warn("Could not parse enquiry materials for bill:", bill.id, e);
          }
        }

        const productStatus = enquiryData?.status || (bill as any).enquiryStatus || "";
        const paymentStatus = enquiryData?.paymentStatus || (bill as any).paymentStatus || "";

        let status: "quotation" | "paid" | "dropped" = "quotation";
        let transactionPaymentStatus: "pending" | "completed" = "pending";

        if (
          productStatus.toLowerCase() === "dropped" ||
          enquiryData?.status?.toLowerCase() === "dropped" ||
          bill.status === "dropped"
        ) {
          status = "dropped";
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
          items: Array.isArray(billItems) ? billItems : [],
          status,
          paymentStatus: transactionPaymentStatus,
          paymentType: paymentSubStatus,
          paymentSubStatus,
          enquiryEnqId: bill.enquiryEnqId,
          gstin,
          isGST,
          billType,
          companyName,
          enquiryStatus: productStatus,
          placeOfSupply,
        } as BillTransaction;
      });

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
  }, [filteredTransactions, productsMap, productsByName, productsList]);

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

    // 2. Bill Type Filter (B2B vs B2C)
    if (billTypeFilter === "b2b" || (billTypeFilter as string) === "gst") {
      filtered = filtered.filter((b) => b.billType === "B2B");
    } else if (billTypeFilter === "b2c" || (billTypeFilter as string) === "non_gst") {
      filtered = filtered.filter((b) => b.billType === "B2C");
    }

    // 3. Order Status Filter (All, Approved/Paid, Quotation, Dropped)
    if (orderStatusFilter === "approved") {
      filtered = filtered.filter((b) => b.status === "paid");
    } else if (orderStatusFilter === "quotation") {
      filtered = filtered.filter((b) => b.status === "quotation");
    } else if (orderStatusFilter === "dropped") {
      filtered = filtered.filter((b) => b.status === "dropped");
    }

    // 4. Unified Date Range Filter (matching PNL presets & monthly ledger)
    filtered = filtered.filter((b) => {
      const d = getBillDate(b);
      return isDateInFilterRange(d, monthFilter, startDate, endDate);
    });

    setFilteredTransactions(filtered);
    setCurrentPage(1);
  };

  const calculateStatistics = () => {
    let purchaseVal = 0;
    let sellVal = 0;
    let refundVal = 0;
    let refundCnt = 0;
    let activeBillsCnt = 0;
    let paidSellVal = 0;
    let purchaseItemsCnt = 0;

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
      const billTotal = Number(
        bill.totalAmount !== undefined && bill.totalAmount !== null
          ? bill.totalAmount
          : subtotal + cgst + sgst + igst + shipping
      );

      totalTaxable += subtotal;
      totalCGST += cgst;
      totalSGST += sgst;
      totalIGST += igst;
      totalShipping += shipping;
      totalGrandRevenue += billTotal;

      // Check if this record is dropped / cancelled / refunded
      const isDroppedOrRefunded =
        bill.status === "dropped" ||
        bill.paymentStatus === "refunded" ||
        (bill as any).refunded === true ||
        (typeof bill.paymentSubStatus === "string" && bill.paymentSubStatus.toLowerCase().includes("refund")) ||
        (typeof bill.enquiryStatus === "string" && bill.enquiryStatus.toLowerCase() === "dropped");

      if (isDroppedOrRefunded) {
        refundVal += billTotal;
        refundCnt++;
      } else {
        sellVal += billTotal;
        activeBillsCnt++;
        if (isPaid) {
          paidSellVal += billTotal;
        }

        // Calculate Purchase Value for this active bill record (identical to PNL.tsx)
        let billPurchase = 0;
        let billItemsQty = 0;

        // Resolve items array safely (handle JSON strings if any)
        let itemsList: any[] = bill.items;
        if (typeof itemsList === "string") {
          try {
            itemsList = JSON.parse(itemsList);
          } catch (e) {
            itemsList = [];
          }
        }
        if (!Array.isArray(itemsList) || itemsList.length === 0) {
          const altItems = (bill as any).materials || (bill as any).products;
          if (Array.isArray(altItems)) {
            itemsList = altItems;
          } else if (typeof altItems === "string") {
            try {
              itemsList = JSON.parse(altItems);
            } catch (e) {
              itemsList = [];
            }
          }
        }

        if (Array.isArray(itemsList) && itemsList.length > 0) {
          for (const item of itemsList) {
            const qty = Number(item.quantity) || 1;
            billItemsQty += qty;
            const matchedProd = findInventoryProduct(item);
            const unitCost = getProductUnitCost(matchedProd, item);
            billPurchase += unitCost * qty;
          }
        }

        // If no item-level purchase cost was found, fall back to explicit bill-level cost if available
        if (billPurchase === 0) {
          const explicitBillCost = (bill as any).purchaseValue ?? (bill as any).totalCost;
          if (
            explicitBillCost !== undefined &&
            explicitBillCost !== null &&
            !isNaN(Number(explicitBillCost)) &&
            Number(explicitBillCost) > 0
          ) {
            billPurchase = Number(explicitBillCost);
          }
        }

        purchaseVal += billPurchase;
        purchaseItemsCnt += billItemsQty;
      }
    });

    const netMarg = sellVal - purchaseVal;
    const margPct = sellVal > 0 ? (netMarg / sellVal) * 100 : 0;
    const totalGST = totalCGST + totalSGST + totalIGST;

    setStatistics({
      purchaseValue: purchaseVal,
      sellValue: sellVal,
      netMargin: netMarg,
      marginPercentage: margPct,
      refundValue: refundVal,
      refundCount: refundCnt,
      activeBillsCount: activeBillsCnt,
      paidSellValue: paidSellVal,
      purchaseItemsCount: purchaseItemsCnt,

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
    const billTerms = (bill as any).terms || defaultTerms;
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
    savedSearchTermRef.current = searchTerm;
    setBillToDelete(bill);
    setDeleteAdminPassword("");
    setShowDeleteAdminPassword(false);
    setDeletePasswordError(null);
    setShowDeleteConfirm(true);
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
    setBillToDelete(null);
    setDeleteAdminPassword("");
    setShowDeleteAdminPassword(false);
    setDeletePasswordError(null);
    // Restore search term in case browser credential manager autofill injected text into search
    setSearchTerm(savedSearchTermRef.current || "");
  };

  const handleConfirmDelete = async () => {
    if (!billToDelete) return;
    
    if (userRole !== "admin" && userRole !== "manager") {
      setError("You don't have permission to delete bills.");
      setShowDeleteConfirm(false);
      setBillToDelete(null);
      return;
    }

    if (!deleteAdminPassword.trim()) {
      setDeletePasswordError("Please enter your admin password to confirm deletion.");
      return;
    }

    setDeleting(true);
    setDeletePasswordError(null);

    // Verify admin password with Firebase Auth
    try {
      const authInstance = getAuth();
      const currentUser = authInstance.currentUser || authUser;
      if (!currentUser || !currentUser.email) {
        setDeletePasswordError("No signed-in admin user found. Please reload and log in again.");
        setDeleting(false);
        return;
      }

      const credential = EmailAuthProvider.credential(currentUser.email, deleteAdminPassword);
      await reauthenticateWithCredential(currentUser, credential);
    } catch (authErr: any) {
      console.error("Admin password reauthentication failed:", authErr);
      const code = authErr?.code;
      if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential" ||
        code === "auth/invalid-password"
      ) {
        setDeletePasswordError("Incorrect admin password. Deletion cancelled.");
      } else if (code === "auth/too-many-requests") {
        setDeletePasswordError("Too many failed attempts. Please try again later.");
      } else {
        setDeletePasswordError(authErr.message || "Failed to verify admin password.");
      }
      setDeleting(false);
      return;
    }
    
    try {
      if (billToDelete.id) {
        await billService.deleteBill(billToDelete.id);
      }
      setShowDeleteConfirm(false);
      setBillToDelete(null);
      setDeleteAdminPassword("");
      await fetchTransactions();
    } catch (error) {
      console.error("Error deleting bill:", error);
      try {
        if (billToDelete.id) {
          await billService.softDeleteBill(billToDelete.id);
          setShowDeleteConfirm(false);
          setBillToDelete(null);
          setDeleteAdminPassword("");
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
                  <div>Date: ${getBillDate(bill)?.toLocaleDateString('en-IN') || new Date().toLocaleDateString('en-IN')}</div>
                  <div>PO Date: ${getBillDate(bill)?.toLocaleDateString('en-IN') || new Date().toLocaleDateString('en-IN')}</div>
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
                  <div>Date: ${getBillDate(selectedBill)?.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) || new Date().toLocaleDateString('en-IN')}</div>
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

              ${selectedBill.notes ? `
              <div class="notes-section">
                <strong>Notes:</strong><br>
                ${selectedBill.notes.replace(/\n/g, '<br>')}
              </div>
              ` : ''}

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
      "S.No.",
      "Enquiry ID",
      "Invoice #",
      "Invoice Date",
      "Customer / Company Name",
      "Contact Number",
      "GSTIN",
      "Place of Supply",
      "Bill Type",
      "Tax Type",
      "Taxable Values (INR)",
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

    const csvData = filteredTransactions.map((bill, index) => {
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
      const billTypeStr = bill.billType || (bill.isGST ? "B2B" : "B2C");
      const taxTypeStr =
        bill.taxType === "cgst_sgst"
          ? "CGST + SGST"
          : bill.taxType === "igst"
          ? "IGST"
          : bill.isGST
          ? "GST"
          : "None";

      return [
        index + 1,
        `"${bill.enquiryEnqId || ""}"`,
        `"${bill.invoiceNumber || ""}"`,
        `"${dateStr}"`,
        `"${(customerDisp || "").replace(/"/g, '""')}"`,
        `"${formatContactNumber(bill.customerContact)}"`,
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
    if (billTypeFilter === "b2b") filePrefix = "B2B_bills";
    else if (billTypeFilter === "b2c") filePrefix = "B2C_bills";
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
      if (status === "dropped") return "bg-red-100 text-red-800";
      return "bg-yellow-100 text-yellow-800";
    } else {
      return status === "completed" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800";
    }
  };

  const getStatusDisplay = (status: string) => {
    if (status === "paid") return "Approved";
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
  const droppedCount = transactions.filter((b) => b.status === "dropped").length;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex justify-center items-center p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-xs text-gray-500 font-medium">
            {authLoading ? "Checking authentication..." : "Loading bill transactions..."}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 font-sans">
        <div className="max-w-7xl mx-auto bg-rose-50 border border-rose-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-rose-700">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-semibold">Error: {error}</p>
          </div>
          <button onClick={fetchTransactions} className="mt-2 text-rose-600 hover:text-rose-800 text-xs font-semibold underline cursor-pointer">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                    Bill Transactions
                  </h1>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${getRoleBadgeColor(userRole)}`}>
                    {userRole}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                  Real-time ledger of invoices, quotations, GST filings, and revenue analytics.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={fetchTransactions}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white hover:bg-gray-50 text-gray-700 rounded-xl border border-gray-200/90 shadow-xs transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Top Summary Statistics Cards (Purchase Values, Sale Values, Net Margin, Refund / Dropped Values) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. Purchase Values */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Purchase Values</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-xl font-bold text-gray-900 tracking-tight truncate">
                ₹{statistics.purchaseValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                {statistics.purchaseItemsCount > 0 ? `${statistics.purchaseItemsCount} items billed` : "Cost of goods"} &bull; Billed Purchase
              </p>
            </div>
          </div>

          {/* 2. Sale Values */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Sale Values</span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-xl font-bold text-blue-700 tracking-tight truncate">
                ₹{statistics.sellValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-blue-600 mt-0.5 truncate">
                {statistics.activeBillsCount} Active {statistics.activeBillsCount === 1 ? "Bill" : "Bills"} &bull; ₹{statistics.paidSellValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Paid
              </p>
            </div>
          </div>

          {/* 3. Net Margin */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Net Margin</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <IndianRupee className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className={`text-xl font-bold tracking-tight truncate ${statistics.netMargin >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                ₹{statistics.netMargin.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] mt-0.5 truncate">
                <span className={statistics.marginPercentage >= 0 ? "text-emerald-700 font-semibold" : "text-rose-600 font-semibold"}>
                  {statistics.marginPercentage >= 0 ? "+" : ""}{statistics.marginPercentage.toFixed(1)}% margin
                </span>{" "}
                &bull; Sale - Purchase
              </p>
            </div>
          </div>

          {/* 4. Refund / Dropped Values */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Refund / Dropped Values</span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <RotateCcw className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-xl font-bold text-amber-700 tracking-tight truncate">
                ₹{statistics.refundValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-amber-600 mt-0.5 truncate">
                {statistics.refundCount} Dropped / Cancelled {statistics.refundCount === 1 ? "Bill" : "Bills"}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Filter Pill Tabs with Counts */}
        <div className="p-1.5 bg-gray-100/90 rounded-2xl border border-gray-200/90 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setOrderStatusFilter("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              orderStatusFilter === "all"
                ? "bg-white text-gray-900 shadow-xs border border-gray-200/80"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/60"
            }`}
          >
            All ({allCount})
          </button>
          <button
            onClick={() => setOrderStatusFilter("approved")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              orderStatusFilter === "approved"
                ? "bg-white text-emerald-800 shadow-xs border border-emerald-200/80"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/60"
            }`}
          >
            Invoices ({invoiceCount})
          </button>
          <button
            onClick={() => setOrderStatusFilter("quotation")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              orderStatusFilter === "quotation"
                ? "bg-white text-amber-800 shadow-xs border border-amber-200/80"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/60"
            }`}
          >
            Quotations ({quotationCount})
          </button>
          {droppedCount > 0 && (
            <button
              onClick={() => setOrderStatusFilter("dropped")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                orderStatusFilter === "dropped"
                  ? "bg-white text-rose-800 shadow-xs border border-rose-200/80"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/60"
              }`}
            >
              Dropped ({droppedCount})
            </button>
          )}
        </div>

        {/* Multi-Criteria Filters Panel */}
        <div className="p-4 bg-white rounded-2xl shadow-xs border border-gray-200/90 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Filter className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-gray-800">Filter Transactions</span>
              {(billTypeFilter !== "all" ||
                orderStatusFilter !== "all" ||
                monthFilter !== "all" ||
                searchTerm ||
                startDate ||
                endDate) && (
                <span className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200/80 px-2 py-0.5 rounded-lg font-bold">
                  Active Filter
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
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 cursor-pointer transition"
              >
                <X className="w-3.5 h-3.5" />
                Reset All Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Search */}
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Search className="w-3 h-3 text-gray-400" />
                Search
              </label>
              <div className="relative">
                <input
                  type="search"
                  name="billing_search_filter_query"
                  id="billing_search_filter_query"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  placeholder="Customer, Company, GSTIN, Inv #..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-purple-600" />
                Bill Type
              </label>
              <select
                value={billTypeFilter}
                onChange={(e) => setBillTypeFilter(e.target.value as any)}
                className="w-full px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">All Types</option>
                <option value="b2b">B2B</option>
                <option value="b2c">B2C</option>
              </select>
            </div>

            {/* 3. Order Status */}
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Layers className="w-3 h-3 text-emerald-600" />
                Order Status
              </label>
              <select
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value as any)}
                className="w-full px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">All Statuses</option>
                <option value="approved">Approved</option>
                <option value="quotation">Quotation</option>
                <option value="dropped">Dropped</option>
              </select>
            </div>

            {/* 4. Date Period */}
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-blue-600" />
                Date Period
              </label>
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="this_week">This Week</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="this_quarter">This Quarter</option>
                <option value="this_fy">This Financial Year (FY)</option>
                {availableMonths.length > 0 && <option disabled>── Monthly Ledger ──</option>}
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthLabel(m)}
                  </option>
                ))}
                <option value="custom">Custom Date Range...</option>
              </select>
            </div>
          </div>

          {/* Custom Date Range Inputs */}
          {monthFilter === "custom" && (
            <div className="flex flex-wrap items-center gap-3 pt-2.5 border-t border-gray-100">
              <span className="text-xs text-gray-500 font-medium">Custom Range:</span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg bg-gray-50 text-gray-800"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg bg-gray-50 text-gray-800"
                />
              </div>
            </div>
          )}
        </div>

        {/* Transactions Table Card */}
        <div className="bg-white rounded-2xl shadow-xs border border-gray-200/90 overflow-hidden">

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50/90 border-b border-gray-200/90">
                <tr>
                  <th className="px-2.5 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap w-10">
                    S.No.
                  </th>
                  <th className="px-2.5 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Enquiry ID
                  </th>
                  <th className="px-2.5 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Invoice #
                  </th>
                  <th className="px-2.5 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Date
                  </th>
                  <th className="px-2.5 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Customer
                  </th>
                  <th className="px-2.5 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Contact
                  </th>
                  <th className="px-2.5 py-3 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Amount
                  </th>
                  <th className="px-2.5 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-2.5 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Payment
                  </th>
                  <th className="px-2.5 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Payment Type
                  </th>
                  <th className="px-2.5 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Generated By
                  </th>
                  <th className="px-2.5 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap w-14">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
            {currentItems.length > 0 ? (
              currentItems.map((bill, index) => {
                const serialNumber = indexOfFirstItem + index + 1;
                return (
                  <tr key={bill.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-2 py-2.5 whitespace-nowrap text-center text-xs font-bold text-gray-600">
                      {serialNumber}
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap text-center">
                      <span className="text-xs font-mono font-semibold text-blue-600">
                        {bill.enquiryEnqId || "N/A"}
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <div className="text-xs font-semibold text-gray-900">{bill.invoiceNumber}</div>
                      <div className="text-[10px] text-gray-400 font-mono">ID: {bill.billId?.slice(-6) || bill.id?.slice(-6)}</div>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-xs text-gray-600 text-center font-medium">
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
                    <td className="px-2.5 py-2.5 max-w-[130px]">
                      <div className="text-xs font-semibold text-gray-900 truncate" title={bill.customerName}>
                        {bill.customerName}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                          bill.billType === "B2B"
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>
                          {bill.billType || "B2C"}
                        </span>
                        {bill.gstin ? (
                          <div className="text-[10px] font-mono text-purple-700 bg-purple-50 px-1 py-0.5 rounded border border-purple-200 truncate max-w-[90px]" title={`GSTIN: ${bill.gstin}`}>
                            GST: {bill.gstin}
                          </div>
                        ) : bill.customerCity ? (
                          <div className="text-[10px] text-gray-400 truncate max-w-[90px]" title={bill.customerCity}>
                            {bill.customerCity}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-xs text-gray-600 font-mono">
                      {formatContactNumber(bill.customerContact)}
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap text-xs text-gray-900 text-right font-bold tabular-nums">
                      ₹{(bill.totalAmount || 0).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        bill.status === "paid" || bill.status === "approved"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                          : bill.status === "dropped"
                          ? "bg-rose-50 text-rose-700 border border-rose-200/80"
                          : "bg-amber-50 text-amber-700 border border-amber-200/80"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          bill.status === "paid" || bill.status === "approved" ? "bg-emerald-500" :
                          bill.status === "dropped" ? "bg-rose-500" : "bg-amber-500"
                        }`} />
                        {getStatusDisplay(bill.status)}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        bill.paymentStatus === "completed"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                          : "bg-amber-50 text-amber-700 border border-amber-200/80"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          bill.paymentStatus === "completed" ? "bg-emerald-500" : "bg-amber-500"
                        }`} />
                        {bill.paymentStatus === "completed" ? "Paid" : "Not Paid"}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-center text-xs text-gray-700 font-medium">
                      {bill.paymentType || "-"}
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-center">
                      <div className="text-xs text-gray-800 font-medium">{bill.assignedToName || "-"}</div>
                      <div className="text-[10px] text-gray-400 capitalize">{bill.createdByRole}</div>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-center w-14">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleViewBill(bill)}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg cursor-pointer transition"
                          title="View Bill"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {hasDeleteAccess && (
                          <button
                            onClick={() => handleDeleteClick(bill)}
                            className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg cursor-pointer transition"
                            title="Delete Bill"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
          ) : (
              <tr>
                <td colSpan={12} className="text-center py-12 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
                    <FileText className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-gray-800">No bill transactions match your filters</p>
                  <p className="text-xs text-gray-400 mt-1">Try adjusting your Bill type, Order status, or Date filters</p>
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
                      className="mt-4 px-3.5 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200/80 rounded-xl hover:bg-blue-100 font-bold transition cursor-pointer"
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
        <div className="px-5 py-3.5 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-3 bg-gray-50/50">
          <div className="text-xs font-medium text-gray-500">
            Showing <span className="font-bold text-gray-800">{indexOfFirstItem + 1}</span> to <span className="font-bold text-gray-800">{Math.min(indexOfLastItem, filteredTransactions.length)}</span> of <span className="font-bold text-gray-800">{filteredTransactions.length}</span> entries
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 border border-gray-200/80 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white text-gray-700 transition shadow-xs"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-gray-700 px-2">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 border border-gray-200/80 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white text-gray-700 transition shadow-xs"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  </div>

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
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Invoice Number</p>
                  <p className="font-semibold">{selectedBill.invoiceNumber}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Enquiry ID</p>
                  <p className="font-semibold text-blue-600">{selectedBill.enquiryEnqId || "N/A"}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Bill Type</p>
                  <p className="font-semibold">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                      selectedBill.billType === "B2B"
                        ? "bg-purple-100 text-purple-800 border border-purple-200"
                        : "bg-blue-100 text-blue-800 border border-blue-200"
                    }`}>
                      {selectedBill.billType || "B2C"}
                    </span>
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Date</p>
                  <p className="font-semibold">{getBillDate(selectedBill)?.toLocaleDateString('en-IN') || "N/A"}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Total Amount</p>
                  <p className="font-semibold text-green-600">₹{selectedBill.totalAmount?.toFixed(2)}</p>
                </div>
              </div>

              <div className={`mb-6 p-4 rounded-lg ${
                selectedBill.paymentStatus === "completed" ? "bg-green-50 border border-green-200" : 
                "bg-yellow-50 border border-yellow-200"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {selectedBill.paymentStatus === "completed" ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-yellow-600" />
                    )}
                    <span className={`font-semibold ${
                      selectedBill.paymentStatus === "completed" ? "text-green-800" : 
                      "text-yellow-800"
                    }`}>
                      Payment Status:
                    </span>
                  </div>
                  <span className={`px-3 py-1 rounded-full font-semibold ${
                    selectedBill.paymentStatus === "completed" ? "bg-green-100 text-green-800" : 
                    "bg-yellow-100 text-yellow-800"
                  }`}>
                    {selectedBill.paymentStatus === "completed" ? "PAID" : "NOT PAID"}
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

              {selectedBill.notes && (
                <div className="bg-blue-50 p-4 rounded-lg mb-6 border border-blue-200">
                  <h4 className="font-semibold mb-2">Notes</h4>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{selectedBill.notes}</p>
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
                  Print Bill
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

      {/* Delete Confirmation Modal with Admin Password Verification */}
      {showDeleteConfirm && billToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={handleCancelDelete}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={(e) => { e.preventDefault(); handleConfirmDelete(); }} autoComplete="off">
              {/* Hidden decoy fields to trap browser password managers from touching the page's search input */}
              <input type="text" name="decoy_user_field" style={{ display: "none" }} tabIndex={-1} autoComplete="username" />
              <input type="password" name="decoy_pwd_field" style={{ display: "none" }} tabIndex={-1} autoComplete="current-password" />

              <div className="flex items-center gap-3 mb-4">
                <div className="bg-red-100 p-2.5 rounded-xl text-red-600">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Confirm Deletion</h3>
                  <p className="text-xs text-gray-500">Admin authorization required</p>
                </div>
              </div>

              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 mb-4 text-xs space-y-1.5 text-gray-700">
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Invoice #:</span>
                  <span className="font-semibold text-gray-900">{billToDelete.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Enquiry ID:</span>
                  <span className="font-mono text-blue-600 font-semibold">{billToDelete.enquiryEnqId || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Customer:</span>
                  <span className="font-semibold text-gray-900 truncate max-w-[200px]">{billToDelete.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Total Amount:</span>
                  <span className="font-bold text-gray-900">₹{(billToDelete.totalAmount || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Admin Password Input */}
              <div className="mb-5">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-red-600" />
                  Enter your Admin Password ({authUser?.email || "Signed-in Admin"}):
                </label>
                <div className="relative">
                  <input
                    type={showDeleteAdminPassword ? "text" : "password"}
                    name="admin_delete_auth_secret_key"
                    id="admin_delete_auth_secret_key"
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-form-type="other"
                    placeholder="Enter your login password to delete"
                    value={deleteAdminPassword}
                    onChange={(e) => {
                      setDeleteAdminPassword(e.target.value);
                      if (deletePasswordError) setDeletePasswordError(null);
                    }}
                    autoFocus
                    className={`w-full pl-3 pr-10 py-2.5 text-sm border rounded-xl outline-none transition ${
                      deletePasswordError
                        ? "border-red-500 ring-2 ring-red-100 bg-red-50/20"
                        : "border-gray-300 focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-white"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeleteAdminPassword(!showDeleteAdminPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showDeleteAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {deletePasswordError && (
                  <p className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {deletePasswordError}
                  </p>
                )}
                <p className="mt-2 text-[11px] text-gray-400">
                  This transaction will be permanently removed. Password verification ensures only the authorized admin can delete this bill.
                </p>
              </div>

              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleCancelDelete}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition cursor-pointer"
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs sm:text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                  disabled={deleting}
                >
                  {deleting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Verifying & Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Verify & Delete
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillTransactions;