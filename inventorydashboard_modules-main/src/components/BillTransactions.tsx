// components/BillTransactions.tsx - Updated with Proforma Invoice print view
import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useItemHighlighter } from "../hooks/useItemHighlighter";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
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
import * as XLSX from "xlsx-js-style";
import Pagination from "./Pagination";
import KPICard from "./KPICard";
import { DateFilter, isDateInPresetRange } from "./common/DateFilter";
import { isSoldBill, isDroppedBill, isQuotationBill } from "../utils/billUtils";
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
  Package,
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
interface BillTransaction extends Omit<Bill, "status"> {
  id: string;
  status: 'pending' | 'paid' | 'cancelled' | 'quotation' | 'dropped' | 'approved' | string;
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
  taxableValue?: number;
  shippingCharges?: number;
  customerAddress?: string;
  description?: string;
  cessAmount?: number;
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
  return isDateInPresetRange(d, preset, customStart, customEnd);
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

  // Global search & notification deep-linking highlighter
  const {
    highlightId,
    targetSearch,
    targetName,
    isBannerVisible,
    clearHighlight,
    isHighlighted,
    scrollToAndHighlight,
    locateCurrentItem,
  } = useItemHighlighter();

  // Handle deep-linking navigation: reset conflicting filters immediately when target is present
  useEffect(() => {
    if (!highlightId && !targetSearch && !targetName) return;

    setBillTypeFilter("all");
    setOrderStatusFilter("all");
    setMonthFilter("all");
    setStartDate("");
    setEndDate("");
    if (searchTerm) {
      setSearchTerm("");
    }
  }, [highlightId, targetSearch, targetName]);

  // Ensure targeted bill is located in filteredTransactions, switched to correct page, and highlighted
  useEffect(() => {
    if ((!highlightId && !targetSearch && !targetName) || filteredTransactions.length === 0) return;

    const h = (highlightId || "").trim().toLowerCase();
    const s = (targetSearch || "").trim().toLowerCase();
    const n = (targetName || "").trim().toLowerCase();

    const foundIdx = filteredTransactions.findIndex((b) => {
      const bId = (b.id || "").toLowerCase();
      const bBillId = (b.billId || "").toLowerCase();
      const bInv = (b.invoiceNumber || (b as any).billNumber || (b as any).quoteNo || "").toLowerCase();
      const bCust = (b.customerName || b.billedTo?.name || (b as any).clientName || "").toLowerCase();
      const bEnq = (b.enquiryEnqId || "").toLowerCase();

      if (h) {
        if (bId === h || bBillId === h || bInv === h || bEnq === h) return true;
        if (bId.includes(h) || h.includes(bId)) return true;
        if (bInv.includes(h) || h.includes(bInv)) return true;
      }
      if (s) {
        if (bInv.includes(s) || s.includes(bInv)) return true;
        if (bCust.includes(s) || s.includes(bCust)) return true;
        if (bId === s || bBillId === s) return true;
      }
      if (n) {
        if (bInv.includes(n) || n.includes(bInv)) return true;
        if (bCust.includes(n) || n.includes(bCust)) return true;
      }
      return false;
    });

    if (foundIdx >= 0) {
      const targetPage = Math.floor(foundIdx / itemsPerPage) + 1;
      if (currentPage !== targetPage) {
        setCurrentPage(targetPage);
      }
      const matchedBill = filteredTransactions[foundIdx];
      scrollToAndHighlight(
        `bill-row-${matchedBill.id}`,
        matchedBill.id,
        matchedBill.invoiceNumber,
        matchedBill.billId,
        matchedBill.customerName,
        matchedBill.billedTo?.name
      );
    }
  }, [highlightId, targetSearch, targetName, filteredTransactions, itemsPerPage, currentPage, scrollToAndHighlight]);

  // Prevent background page from scrolling when view modal or delete confirmation is open
  useEffect(() => {
    if (selectedBill || showDeleteConfirm) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [selectedBill, showDeleteConfirm]);

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
            fetchedBills.push({ ...doc.data(), id: doc.id } as Bill);
          });
          console.log("Fallback fetched all bills:", fetchedBills.length);
        } catch (fallbackError) {
          console.error("Fallback also failed:", fallbackError);
          throw fallbackError;
        }
      }

      // Deduplicate duplicate drafts/revisions: keep the latest revision of identical invoice number or document ID
      const billMap = new Map<string, Bill>();
      
      const sortedBills = [...fetchedBills].sort((a, b) => {
        const dateA = a.updatedAt?.toDate?.() || a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.updatedAt?.toDate?.() || b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      
      sortedBills.forEach((bill) => {
        const invNum = (bill.invoiceNumber || (bill as any).billNumber || (bill as any).quoteNo || "").trim();
        const key = invNum ? `inv_${invNum.toLowerCase()}` : (bill.id || `bill_${Math.random()}`);
        if (!billMap.has(key)) {
          billMap.set(key, bill);
        } else {
          console.log(`Deduplicating duplicate bill revision: keeping newest of ${key}`);
        }
      });
      
      const deduplicatedBills = Array.from(billMap.values());
      console.log("After deduplication:", deduplicatedBills.length, "bills (from", fetchedBills.length, "total)");

      // Batch load enquiries map to avoid slow N+1 individual queries
      const enquiriesMap = new Map<string, any>();
      const allEnquiriesList: any[] = [];
      try {
        const enquiriesSnap = await getDocs(collection(db, "enquiries"));
        enquiriesSnap.forEach((docSnap) => {
          const d: any = { id: docSnap.id, ...docSnap.data() };
          allEnquiriesList.push(d);
          if (d.enqId) {
            const rawId = String(d.enqId).trim();
            enquiriesMap.set(rawId, d);
            enquiriesMap.set(rawId.toLowerCase(), d);
            enquiriesMap.set(rawId.toUpperCase(), d);
            const compactId = rawId.replace(/[\s-_]/g, "");
            if (compactId) {
              enquiriesMap.set(compactId.toLowerCase(), d);
              enquiriesMap.set(compactId.toUpperCase(), d);
            }
          }
          enquiriesMap.set(docSnap.id, d);
          enquiriesMap.set(docSnap.id.toLowerCase(), d);
        });
      } catch (err) {
        console.warn("Could not batch load enquiries in BillTransactions:", err);
      }

      // Process each bill with enquiry data
      const processedTransactions = deduplicatedBills.map((bill) => {
        // Step 1: Find matching enquiry across all possible bill identifiers
        const enqKeys = [
          bill.enquiryEnqId,
          bill.enquiryId,
          bill.billedTo?.enqId,
          (bill as any).enqId,
          (bill as any).quotationId,
          (bill as any).quoteNo,
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
          const compactK = strK.replace(/[\s-_]/g, "");
          if (compactK && enquiriesMap.has(compactK.toLowerCase())) {
            enquiryData = enquiriesMap.get(compactK.toLowerCase());
            break;
          }
        }

        // Step 2: Fallback by customer phone number if not found by ID
        if (!enquiryData) {
          const rawBillPhone = String(
            bill.customerContact ||
            bill.billedTo?.contactNumber ||
            (bill as any).phone ||
            (bill as any).mobile ||
            (bill as any).contact ||
            ""
          );
          const bPhoneDigits = rawBillPhone.replace(/\D/g, "");
          if (bPhoneDigits.length >= 7) {
            for (const enq of allEnquiriesList) {
              const ePhone = String(
                enq.contactNumber ||
                enq.customerContact ||
                enq.customer?.contactNumber ||
                enq.customer?.phone ||
                enq.customer?.mobile ||
                enq.phone ||
                enq.mobile ||
                enq.companyDetails?.companyMobile ||
                ""
              ).replace(/\D/g, "");
              if (ePhone && (ePhone.includes(bPhoneDigits) || bPhoneDigits.includes(ePhone))) {
                enquiryData = enq;
                break;
              }
            }
          }
        }

        // Step 3: Fallback by customer name if not found by ID or phone
        if (!enquiryData) {
          const rawCustName = String(
            bill.customerName ||
            bill.billedTo?.name ||
            (bill as any).clientName ||
            (bill as any).customer ||
            ""
          ).trim().toLowerCase();

          const cleanCustName = rawCustName
            .replace(/^(mr\.|mrs\.|ms\.|dr\.|m\/s\.?)\s+/i, "")
            .trim();

          if (cleanCustName.length >= 3) {
            for (const enq of allEnquiriesList) {
              const rawEnqName = String(
                enq.customerName ||
                enq.customer?.name ||
                enq.contactPerson ||
                enq.name ||
                enq.clientName ||
                ""
              ).trim().toLowerCase();

              const cleanEnqName = rawEnqName
                .replace(/^(mr\.|mrs\.|ms\.|dr\.|m\/s\.?)\s+/i, "")
                .trim();

              if (cleanEnqName.length >= 3) {
                if (
                  cleanEnqName === cleanCustName ||
                  cleanEnqName.includes(cleanCustName) ||
                  cleanCustName.includes(cleanEnqName)
                ) {
                  enquiryData = enq;
                  break;
                }
              }
            }
          }
        }

        const paymentSubStatus = enquiryData?.paymentSubStatus || (bill as any).paymentSubStatus || "N/A";

        // Extract customer (buyer) GSTIN strictly.
        // Never treat the seller's/store's GSTIN (33AAKCP9459K1ZO) as the customer's GSTIN.
        const rawCustomerGstin = (
          bill.billedTo?.gstin ||
          enquiryData?.companyDetails?.companyGST ||
          enquiryData?.gstin ||
          ""
        ).trim().toUpperCase();

        const isCompanyGstin =
          rawCustomerGstin === "33AAKCP9459K1ZO" ||
          rawCustomerGstin.includes("33AAKCP9459K1ZO") ||
          rawCustomerGstin.includes("AAMCP9459K");

        const dummyGstins = [
          "URP", "N/A", "NA", "NONE", "NIL", "NULL", "UNDEFINED",
          "UNREGISTERED", "NOT APPLICABLE", "CONSUMER", "NOT PROVIDED", "-"
        ];

        const hasValidGstin =
          !isCompanyGstin &&
          rawCustomerGstin.length >= 10 &&
          !dummyGstins.includes(rawCustomerGstin) &&
          /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z|z][0-9A-Z]{1}$/.test(rawCustomerGstin.replace(/\s/g, ""));

        const customerGstinForDisplay = !isCompanyGstin && !dummyGstins.includes(rawCustomerGstin) ? rawCustomerGstin : "";

        const hasTax =
          (bill.cgst && bill.cgst > 0) ||
          (bill.sgst && bill.sgst > 0) ||
          (bill.igst && bill.igst > 0) ||
          bill.taxType === "cgst_sgst" ||
          bill.taxType === "igst";

        const isGST = !!customerGstinForDisplay || hasTax;
        const companyName = enquiryData?.companyDetails?.companyName || (bill as any).companyName || "";
        const placeOfSupply = bill.placeOfSupply || bill.billedTo?.state || enquiryData?.state || "Tamil Nadu";

        // Determine B2B vs B2C:
        // Priority 1: The enquiry's explicit type is the master source of truth (as shown in the Enquiry eye button)
        const enqType = String(
          enquiryData?.type ||
          enquiryData?.customerType ||
          enquiryData?.clientType ||
          enquiryData?.enquiryType ||
          enquiryData?.customer?.type ||
          ""
        ).toUpperCase().trim();

        const clientType = String(
          (bill as any).clientType ||
          (bill as any).customerType ||
          (bill as any).enquiryType ||
          (bill as any).billType ||
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
          // Has valid buyer GSTIN registration number -> B2B
          billType = "B2B";
        } else if (
          companyName &&
          (companyName.toLowerCase().includes("pvt") ||
            companyName.toLowerCase().includes("ltd") ||
            companyName.toLowerCase().includes("inc") ||
            companyName.toLowerCase().includes("technologies") ||
            companyName.toLowerCase().includes("solutions") ||
            companyName.toLowerCase().includes("enterprises") ||
            companyName.toLowerCase().includes("corporation") ||
            companyName.toLowerCase().includes("llp"))
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

        const billWithContext = { ...bill, enquiryStatus: productStatus, paymentStatus };

        if (
          productStatus.toLowerCase() === "dropped" ||
          enquiryData?.status?.toLowerCase() === "dropped" ||
          (bill.status as string) === "dropped" ||
          isDroppedBill(billWithContext)
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
          bill.status === "paid" ||
          bill.status === "completed" ||
          isSoldBill(billWithContext)
        ) {
          status = "paid";
          transactionPaymentStatus = "completed";
        } else {
          status = "quotation";
          transactionPaymentStatus = "pending";
        }

        const customerName =
          bill.customerName ||
          bill.billedTo?.name ||
          (bill as any).clientName ||
          (bill as any).customer ||
          enquiryData?.customerName ||
          enquiryData?.name ||
          enquiryData?.contactPerson ||
          "";

        const customerContact =
          bill.customerContact ||
          bill.billedTo?.contactNumber ||
          (bill as any).phone ||
          (bill as any).mobile ||
          enquiryData?.contactNumber ||
          "";

        const invoiceNumber =
          bill.invoiceNumber ||
          (bill as any).billNumber ||
          (bill as any).quoteNo ||
          (bill as any).quotationNumber ||
          (bill as any).proformaInvoiceNumber ||
          bill.billId ||
          "";

        return {
          ...bill,
          id: bill.id,
          customerName,
          customerContact,
          invoiceNumber,
          items: Array.isArray(billItems) ? billItems : [],
          status,
          paymentStatus: transactionPaymentStatus,
          paymentType: paymentSubStatus,
          paymentSubStatus,
          enquiryEnqId: bill.enquiryEnqId || enquiryData?.enqId || "",
          gstin: customerGstinForDisplay,
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
      const d = getBillDate(b);
      if (d && !isNaN(d.getTime()) && d.getTime() > 0) {
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

    const hasActiveSearch = searchTerm.trim().length > 0;

    // 1. Search Filter
    if (hasActiveSearch) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((bill) => {
        const custName = (bill.customerName || bill.billedTo?.name || (bill as any).clientName || (bill as any).customer || "").toLowerCase();
        const compName = (bill.companyName || (bill as any).clientCompanyName || "").toLowerCase();
        const gst = (bill.gstin || bill.billedTo?.gstin || "").toLowerCase();
        const inv = (bill.invoiceNumber || (bill as any).billNumber || (bill as any).quoteNo || (bill as any).quotationNumber || bill.billId || "").toLowerCase();
        const contact = (bill.customerContact || bill.billedTo?.contactNumber || (bill as any).phone || (bill as any).mobile || "").toLowerCase();
        const bId = (bill.billId || bill.id || "").toLowerCase();
        const enq = (bill.enquiryEnqId || "").toLowerCase();

        return (
          custName.includes(term) ||
          compName.includes(term) ||
          gst.includes(term) ||
          inv.includes(term) ||
          contact.includes(term) ||
          bId.includes(term) ||
          enq.includes(term)
        );
      });
    }

    // 2. Bill Type Filter (B2B vs B2C)
    if (billTypeFilter === "b2b" || (billTypeFilter as string) === "gst") {
      filtered = filtered.filter((b) => b.billType === "B2B");
    } else if (billTypeFilter === "b2c" || (billTypeFilter as string) === "non_gst") {
      filtered = filtered.filter((b) => b.billType === "B2C");
    }

    // 3. Order Status Filter (All, Approved/Paid, Quotation, Dropped)
    // If a search term is actively typed and would yield 0 results in current tab, don't restrict by tab
    if (orderStatusFilter === "approved") {
      const statusFiltered = filtered.filter((b) => b.status === "paid");
      filtered = hasActiveSearch && statusFiltered.length === 0 ? filtered : statusFiltered;
    } else if (orderStatusFilter === "quotation") {
      const statusFiltered = filtered.filter((b) => b.status === "quotation");
      filtered = hasActiveSearch && statusFiltered.length === 0 ? filtered : statusFiltered;
    } else if (orderStatusFilter === "dropped") {
      const statusFiltered = filtered.filter((b) => b.status === "dropped");
      filtered = hasActiveSearch && statusFiltered.length === 0 ? filtered : statusFiltered;
    }

    // 4. Unified Date Range Filter (matching PNL presets & monthly ledger)
    // If a search term is actively typed and yields 0 results within date range, don't restrict by date
    if (monthFilter !== "all" || startDate || endDate) {
      const dateFiltered = filtered.filter((b) => {
        const d = getBillDate(b);
        return isDateInFilterRange(d, monthFilter, startDate, endDate);
      });
      filtered = hasActiveSearch && dateFiltered.length === 0 ? filtered : dateFiltered;
    }

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
    let quotedAmountVal = 0;
    let paidCount = 0;
    let quoteCount = 0;
    let gstCount = 0;

    filteredTransactions.forEach((bill) => {
      const isDropped = bill.status === "dropped" || isDroppedBill(bill);
      const isQuotation = !isDropped && (bill.status === "quotation" || isQuotationBill(bill));
      const isSold = !isDropped && !isQuotation && (bill.status === "paid" || bill.paymentStatus === "completed" || isSoldBill(bill));

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

      if (isDropped) {
        refundVal += billTotal;
        refundCnt++;
      } else if (isQuotation) {
        quoteCount++;
        quotedAmountVal += billTotal;
      } else if (isSold) {
        paidCount++;
        sellVal += billTotal;
        paidSellVal += billTotal;
        activeBillsCnt++;

        totalTaxable += subtotal;
        totalCGST += cgst;
        totalSGST += sgst;
        totalIGST += igst;
        totalShipping += shipping;
        totalGrandRevenue += billTotal;

        // Calculate Purchase Value for this sold bill record (identical to PNL.tsx)
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
      quotedAmount: quotedAmountVal,
      averageBillValue: activeBillsCnt > 0 ? totalGrandRevenue / activeBillsCnt : 0,
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
                    termsToPrint.map((term: any, index: number) => `<li>${index + 1}. ${term.text}</li>`).join('') 
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
                    termsToPrint.map((term: any, index: number) => `
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

  // Downloadable Excel Report Generation (Fully Styled, Bordered & Themed via xlsx-js-style matching PNL)
  const handleDownloadExcel = () => {
    try {
      const workbook = XLSX.utils.book_new();

      const thinBorder = {
        top: { style: "thin", color: { rgb: "E2E8F0" } },
        bottom: { style: "thin", color: { rgb: "E2E8F0" } },
        left: { style: "thin", color: { rgb: "E2E8F0" } },
        right: { style: "thin", color: { rgb: "E2E8F0" } },
      };

      const doubleBottomBorder = {
        top: { style: "thin", color: { rgb: "94A3B8" } },
        bottom: { style: "double", color: { rgb: "0F172A" } },
        left: { style: "thin", color: { rgb: "E2E8F0" } },
        right: { style: "thin", color: { rgb: "E2E8F0" } },
      };

      const b2bTransactions = filteredTransactions.filter(
        (b) => (b.billType || "").toUpperCase() === "B2B"
      );
      const b2cTransactions = filteredTransactions.filter(
        (b) => (b.billType || "").toUpperCase() !== "B2B"
      );

      const totalTaxable = filteredTransactions.reduce(
        (sum, b) => sum + Number(b.subtotal || b.taxableValue || 0),
        0
      );
      const totalCGST = filteredTransactions.reduce(
        (sum, b) => sum + Number(b.cgst || 0),
        0
      );
      const totalSGST = filteredTransactions.reduce(
        (sum, b) => sum + Number(b.sgst || 0),
        0
      );
      const totalIGST = filteredTransactions.reduce(
        (sum, b) => sum + Number(b.igst || 0),
        0
      );
      const totalShipping = filteredTransactions.reduce(
        (sum, b) => sum + Number(b.shippingCharges || 0),
        0
      );
      const soldTransactions = filteredTransactions.filter(
        (b) => b.status === "paid" || isSoldBill(b)
      );
      const b2bSoldTransactions = soldTransactions.filter((b) => b.billType === "B2B");
      const b2cSoldTransactions = soldTransactions.filter((b) => b.billType === "B2C");

      const totalAmount = soldTransactions.reduce(
        (sum, b) => sum + Number(b.totalAmount || 0),
        0
      );

      const b2bTotalAmount = b2bSoldTransactions.reduce(
        (sum, b) => sum + Number(b.totalAmount || 0),
        0
      );
      const b2cTotalAmount = b2cSoldTransactions.reduce(
        (sum, b) => sum + Number(b.totalAmount || 0),
        0
      );

      // ==========================================
      // SHEET 1: Billing Summary (Navy Blue #1E3A8A)
      // ==========================================
      const summaryRows = [
        ["BILLS & INVOICES FINANCIAL SUMMARY", "", ""],
        ["Comprehensive analysis of Invoices, Tax Collections (CGST, SGST, IGST), B2B vs B2C Breakdown, and Revenues", "", ""],
        [],
        ["Report Parameter", "Selected Value", ""],
        ["Report Generated On", new Date().toLocaleString("en-IN"), ""],
        ["Bill Type Filter", billTypeFilter === "all" ? "All Invoices (B2B & B2C)" : billTypeFilter.toUpperCase(), ""],
        ["Order Status Filter", orderStatusFilter === "all" ? "All Statuses" : getStatusDisplay(orderStatusFilter), ""],
        ["Date Window / Filter", monthFilter === "all" ? "All Recorded Dates" : monthFilter === "custom" && (startDate || endDate) ? `${startDate || "Start"} to ${endDate || "Present"}` : monthFilter.replace(/_/g, " ").toUpperCase(), ""],
        [],
        ["FINANCIAL METRIC", "AMOUNT (₹) / COUNT", "ANALYSIS & BREAKDOWN"],
        ["Total Realized Sales Revenue", totalAmount, `Total realized revenue across ${soldTransactions.length} sold invoices`],
        ["  • B2B Sales (Business)", b2bTotalAmount, `${b2bSoldTransactions.length} Sold Invoices (${totalAmount > 0 ? ((b2bTotalAmount / totalAmount) * 100).toFixed(1) : 0}% share)`],
        ["  • B2C Sales (Consumer)", b2cTotalAmount, `${b2cSoldTransactions.length} Sold Invoices (${totalAmount > 0 ? ((b2cTotalAmount / totalAmount) * 100).toFixed(1) : 0}% share)`],
        ["Total Taxable Value", totalTaxable, "Subtotal of all billed items before GST"],
        ["Total GST Tax Collected", totalCGST + totalSGST + totalIGST, "Total tax accumulated across all transactions"],
        ["  • Central GST (CGST)", totalCGST, "CGST collected on intra-state billing"],
        ["  • State GST (SGST)", totalSGST, "SGST collected on intra-state billing"],
        ["  • Integrated GST (IGST)", totalIGST, "IGST collected on inter-state billing"],
        ["Total Shipping Charges", totalShipping, "Shipping and transport fees collected"],
        ["Total Purchase Cost of Goods", statistics.purchaseValue, "Cost valuation of delivered goods"],
        ["Gross Margin (Profit)", statistics.netMargin, "Total Revenue - Purchase Cost"],
        ["Total Invoices Generated", filteredTransactions.length, "Total transaction records"],
        ["Paid Invoices", statistics.paidBillsCount, `${statistics.totalBills > 0 ? ((statistics.paidBillsCount / statistics.totalBills) * 100).toFixed(1) : 0}% settlement rate`],
        ["Pending / Unpaid Invoices", statistics.quoteBillsCount, `${statistics.totalBills > 0 ? ((statistics.quoteBillsCount / statistics.totalBills) * 100).toFixed(1) : 0}% pending invoices`],
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      wsSummary["!cols"] = [{ wch: 42 }, { wch: 24 }, { wch: 60 }];
      wsSummary["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
        { s: { r: 3, c: 1 }, e: { r: 3, c: 2 } },
      ];

      if (wsSummary["A1"]) {
        wsSummary["A1"].s = {
          fill: { fgColor: { rgb: "1E3A8A" } },
          font: { name: "Calibri", sz: 14, bold: true, color: { rgb: "FFFFFF" } },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
      if (wsSummary["A2"]) {
        wsSummary["A2"].s = {
          fill: { fgColor: { rgb: "F1F5F9" } },
          font: { name: "Calibri", sz: 10, italic: true, color: { rgb: "475569" } },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }

      ["A4", "B4"].forEach((cell) => {
        if (wsSummary[cell]) {
          wsSummary[cell].s = {
            fill: { fgColor: { rgb: "E2E8F0" } },
            font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "1E293B" } },
            alignment: { horizontal: "left", vertical: "center" },
            border: thinBorder,
          };
        }
      });

      for (let r = 4; r <= 7; r++) {
        const aCell = XLSX.utils.encode_cell({ r, c: 0 });
        const bCell = XLSX.utils.encode_cell({ r, c: 1 });
        if (wsSummary[aCell]) {
          wsSummary[aCell].s = {
            fill: { fgColor: { rgb: "F8FAFC" } },
            font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "334155" } },
            alignment: { horizontal: "left", vertical: "center" },
            border: thinBorder,
          };
        }
        if (wsSummary[bCell]) {
          wsSummary[bCell].s = {
            fill: { fgColor: { rgb: "FFFFFF" } },
            font: { name: "Calibri", sz: 10, color: { rgb: "0F172A" } },
            alignment: { horizontal: "left", vertical: "center" },
            border: thinBorder,
          };
        }
      }

      ["A10", "B10", "C10"].forEach((cell) => {
        if (wsSummary[cell]) {
          wsSummary[cell].s = {
            fill: { fgColor: { rgb: "1E3A8A" } },
            font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
            alignment: { horizontal: "center", vertical: "center" },
            border: {
              top: { style: "thin", color: { rgb: "1E3A8A" } },
              bottom: { style: "medium", color: { rgb: "0F172A" } },
              left: { style: "thin", color: { rgb: "E2E8F0" } },
              right: { style: "thin", color: { rgb: "E2E8F0" } },
            },
          };
        }
      });

      const metricStyles: Record<number, { bg: string; bold?: boolean; numFmt?: string; textColor?: string }> = {
        10: { bg: "EFF6FF", bold: true, numFmt: "₹#,##0.00", textColor: "1E3A8A" },
        11: { bg: "FFFFFF", bold: false, numFmt: "₹#,##0.00", textColor: "475569" },
        12: { bg: "FFFFFF", bold: false, numFmt: "₹#,##0.00", textColor: "475569" },
        13: { bg: "FFFFFF", bold: false, numFmt: "₹#,##0.00", textColor: "334155" },
        14: { bg: "FEF3C7", bold: true, numFmt: "₹#,##0.00", textColor: "92400E" },
        15: { bg: "FFFFFF", bold: false, numFmt: "₹#,##0.00", textColor: "475569" },
        16: { bg: "FFFFFF", bold: false, numFmt: "₹#,##0.00", textColor: "475569" },
        17: { bg: "FFFFFF", bold: false, numFmt: "₹#,##0.00", textColor: "475569" },
        18: { bg: "FFFFFF", bold: false, numFmt: "₹#,##0.00", textColor: "475569" },
        19: { bg: "FEF3C7", bold: false, numFmt: "₹#,##0.00", textColor: "92400E" },
        20: { bg: "ECFDF5", bold: true, numFmt: "₹#,##0.00", textColor: "065F46" },
        21: { bg: "F8FAFC", bold: false, numFmt: "#,##0", textColor: "334155" },
        22: { bg: "ECFDF5", bold: false, numFmt: "#,##0", textColor: "15803D" },
        23: { bg: "FEF2F2", bold: false, numFmt: "#,##0", textColor: "DC2626" },
      };

      for (let r = 10; r <= 23; r++) {
        const conf = metricStyles[r] || { bg: "FFFFFF" };
        const isDoubleBottom = r === 20 || r === 23;
        const cellBorder = isDoubleBottom ? doubleBottomBorder : thinBorder;

        for (let c = 0; c <= 2; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          if (!wsSummary[cellRef]) continue;

          let align: "left" | "center" | "right" = "left";
          if (c === 1) align = "right";
          if (c === 2) align = "left";

          wsSummary[cellRef].s = {
            fill: { fgColor: { rgb: conf.bg } },
            font: {
              name: "Calibri",
              sz: r === 10 || r === 20 ? 12 : 11,
              bold: !!conf.bold,
              color: { rgb: conf.textColor || "0F172A" },
            },
            alignment: { horizontal: align, vertical: "center" },
            numFmt: c === 1 ? conf.numFmt : undefined,
            border: cellBorder,
          };
        }
      }

      wsSummary["!rows"] = [
        { hpt: 30 },
        { hpt: 20 },
        { hpt: 10 },
        { hpt: 20 },
        { hpt: 18 },
        { hpt: 18 },
        { hpt: 18 },
        { hpt: 18 },
        { hpt: 10 },
        { hpt: 26 },
        ...Array(14).fill({ hpt: 22 }),
      ];

      XLSX.utils.book_append_sheet(workbook, wsSummary, "Billing Summary");

      // Helper function to style standard table sheets
      const applyTableSheetStyling = (
        ws: any,
        cols: any[],
        dataLength: number,
        headerBg: string,
        titleSubtitleBg: string,
        totalsBg: string
      ) => {
        ws["!cols"] = cols.map((c) => ({ wch: c.width }));
        ws["!merges"] = [
          { s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } },
          { s: { r: 1, c: 0 }, e: { r: 1, c: cols.length - 1 } },
        ];

        // Title & Subtitle
        if (ws["A1"]) {
          ws["A1"].s = {
            fill: { fgColor: { rgb: headerBg } },
            font: { name: "Calibri", sz: 13, bold: true, color: { rgb: "FFFFFF" } },
            alignment: { horizontal: "center", vertical: "center" },
          };
        }
        if (ws["A2"]) {
          ws["A2"].s = {
            fill: { fgColor: { rgb: titleSubtitleBg } },
            font: { name: "Calibri", sz: 10, italic: true, color: { rgb: headerBg } },
            alignment: { horizontal: "center", vertical: "center" },
          };
        }

        // Header row (Row index 3)
        for (let c = 0; c < cols.length; c++) {
          const ref = XLSX.utils.encode_cell({ r: 3, c });
          if (ws[ref]) {
            ws[ref].s = {
              fill: { fgColor: { rgb: headerBg } },
              font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
              alignment: { horizontal: "center", vertical: "center", wrapText: true },
              border: {
                top: { style: "thin", color: { rgb: headerBg } },
                bottom: { style: "medium", color: { rgb: "0F172A" } },
                left: { style: "thin", color: { rgb: "E2E8F0" } },
                right: { style: "thin", color: { rgb: "E2E8F0" } },
              },
            };
          }
        }

        // Data rows (Row index 4 to 3 + dataLength)
        for (let idx = 0; idx < dataLength; idx++) {
          const rIdx = 4 + idx;
          const bg = idx % 2 === 1 ? "F8FAFC" : "FFFFFF";

          cols.forEach((col, cIdx) => {
            const ref = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
            if (!ws[ref]) return;
            const cellVal = ws[ref].v;
            const textColor = col.colorFn && typeof cellVal === "number" ? col.colorFn(cellVal) : col.isBold ? "0F172A" : "334155";

            ws[ref].s = {
              fill: { fgColor: { rgb: bg } },
              font: { name: "Calibri", sz: 11, bold: !!col.isBold, color: { rgb: textColor } },
              alignment: { horizontal: col.align, vertical: "center" },
              numFmt: typeof cellVal === "number" ? col.numFmt : undefined,
              border: thinBorder,
            };
          });
        }

        // Totals row (Row index 4 + dataLength)
        const totalRowIdx = 4 + dataLength;
        cols.forEach((col, cIdx) => {
          const ref = XLSX.utils.encode_cell({ r: totalRowIdx, c: cIdx });
          if (!ws[ref]) return;
          const cellVal = ws[ref].v;
          const textColor = col.colorFn && typeof cellVal === "number" ? col.colorFn(cellVal) : "0F172A";

          ws[ref].s = {
            fill: { fgColor: { rgb: totalsBg } },
            font: { name: "Calibri", sz: 11, bold: true, color: { rgb: textColor } },
            alignment: { horizontal: col.align, vertical: "center" },
            numFmt: typeof cellVal === "number" ? col.numFmt : undefined,
            border: doubleBottomBorder,
          };
        });

        ws["!rows"] = [
          { hpt: 28 },
          { hpt: 20 },
          { hpt: 10 },
          { hpt: 26 },
          ...Array(dataLength).fill({ hpt: 22 }),
          { hpt: 24 },
        ];
      };

      // ==========================================
      // SHEET 2: All Invoices (Navy Blue #1E3A8A)
      // ==========================================
      const allCols = [
        { header: "S.No.", key: "sr", width: 8, align: "center" as const },
        { header: "Invoice #", key: "invoiceNumber", width: 16, align: "center" as const, isBold: true },
        { header: "Invoice Date", key: "invoiceDate", width: 14, align: "center" as const },
        { header: "Enquiry ID", key: "enquiryEnqId", width: 14, align: "center" as const },
        { header: "Bill Type", key: "billType", width: 12, align: "center" as const, isBold: true },
        { header: "Customer Name", key: "customerName", width: 24, align: "left" as const, isBold: true },
        { header: "Company Name", key: "companyName", width: 24, align: "left" as const },
        { header: "Contact Number", key: "customerContact", width: 16, align: "center" as const },
        { header: "GSTIN", key: "gstin", width: 18, align: "center" as const },
        { header: "Place of Supply", key: "placeOfSupply", width: 18, align: "left" as const },
        { header: "Tax Type", key: "taxType", width: 14, align: "center" as const },
        { header: "Taxable Value (₹)", key: "taxableValue", width: 18, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "CGST (₹)", key: "cgst", width: 14, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "SGST (₹)", key: "sgst", width: 14, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "IGST (₹)", key: "igst", width: 14, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Shipping (₹)", key: "shippingCharges", width: 14, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Total Amount (₹)", key: "totalAmount", width: 18, align: "right" as const, numFmt: "₹#,##0.00", isBold: true, colorFn: () => "1E3A8A" },
        { header: "Order Status", key: "orderStatus", width: 14, align: "center" as const },
        { header: "Payment Status", key: "paymentStatus", width: 14, align: "center" as const, isBold: true },
        { header: "Payment Type", key: "paymentType", width: 14, align: "center" as const },
        { header: "Generated By", key: "assignedToName", width: 16, align: "left" as const },
      ];

      const allSheetData: any[][] = [
        ["ALL INVOICES & BILL TRANSACTIONS"],
        ["Complete real-time transaction ledger including B2B & B2C records with full tax breakdowns"],
        [],
        allCols.map((c) => c.header),
      ];

      filteredTransactions.forEach((bill, index) => {
        const d = getBillDate(bill);
        const dateStr = d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN") : "-";
        const taxable = Number(bill.subtotal || bill.taxableValue || 0);
        const cgst = Number(bill.cgst || 0);
        const sgst = Number(bill.sgst || 0);
        const igst = Number(bill.igst || 0);
        const shipping = Number(bill.shippingCharges || 0);
        const total = Number(bill.totalAmount || (taxable + cgst + sgst + igst + shipping));

        const rowObj = {
          sr: index + 1,
          invoiceNumber: bill.invoiceNumber || "-",
          invoiceDate: dateStr,
          enquiryEnqId: bill.enquiryEnqId || "-",
          billType: bill.billType || "B2C",
          customerName: bill.customerName || "-",
          companyName: bill.companyName || "-",
          customerContact: formatContactNumber(bill.customerContact),
          gstin: bill.gstin || (bill.billType === "B2B" ? "URP" : "-"),
          placeOfSupply: bill.placeOfSupply || "Tamil Nadu",
          taxType: bill.taxType === "cgst_sgst" ? "CGST + SGST" : bill.taxType === "igst" ? "IGST" : bill.isGST ? "GST" : "None",
          taxableValue: taxable,
          cgst: cgst,
          sgst: sgst,
          igst: igst,
          shippingCharges: shipping,
          totalAmount: total,
          orderStatus: getStatusDisplay(bill.status) || "-",
          paymentStatus: (bill.status === "paid" || bill.paymentStatus === "completed") ? "Paid" : "Pending",
          paymentType: bill.paymentType || "-",
          assignedToName: bill.assignedToName || "Staff",
        };

        allSheetData.push(allCols.map((col) => (rowObj as any)[col.key]));
      });

      const allTotalsRow = {
        sr: "TOTALS",
        invoiceNumber: `${filteredTransactions.length} Invoices`,
        invoiceDate: "-",
        enquiryEnqId: "-",
        billType: "-",
        customerName: "-",
        companyName: "-",
        customerContact: "-",
        gstin: "-",
        placeOfSupply: "-",
        taxType: "-",
        taxableValue: totalTaxable,
        cgst: totalCGST,
        sgst: totalSGST,
        igst: totalIGST,
        shippingCharges: totalShipping,
        totalAmount: totalAmount,
        orderStatus: "-",
        paymentStatus: "-",
        paymentType: "-",
        assignedToName: "-",
      };
      allSheetData.push(allCols.map((col) => (allTotalsRow as any)[col.key]));

      const wsAll = XLSX.utils.aoa_to_sheet(allSheetData);
      applyTableSheetStyling(wsAll, allCols, filteredTransactions.length, "1E3A8A", "DBEAFE", "FEF3C7");
      XLSX.utils.book_append_sheet(workbook, wsAll, "All Invoices");

      // ==========================================
      // SHEET 3: B2B Invoices (Purple #4F46E5)
      // ==========================================
      const b2bCols = [
        { header: "S.No.", key: "sr", width: 8, align: "center" as const },
        { header: "Invoice #", key: "invoiceNumber", width: 16, align: "center" as const, isBold: true },
        { header: "Invoice Date", key: "invoiceDate", width: 14, align: "center" as const },
        { header: "Enquiry ID", key: "enquiryEnqId", width: 14, align: "center" as const },
        { header: "Company Name", key: "companyName", width: 28, align: "left" as const, isBold: true },
        { header: "Customer / Contact", key: "customerName", width: 22, align: "left" as const },
        { header: "GSTIN", key: "gstin", width: 18, align: "center" as const, isBold: true },
        { header: "Place of Supply", key: "placeOfSupply", width: 18, align: "left" as const },
        { header: "Contact Number", key: "customerContact", width: 16, align: "center" as const },
        { header: "Taxable Value (₹)", key: "taxableValue", width: 18, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "CGST (₹)", key: "cgst", width: 14, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "SGST (₹)", key: "sgst", width: 14, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "IGST (₹)", key: "igst", width: 14, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Shipping (₹)", key: "shippingCharges", width: 14, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Total Amount (₹)", key: "totalAmount", width: 18, align: "right" as const, numFmt: "₹#,##0.00", isBold: true, colorFn: () => "4F46E5" },
        { header: "Order Status", key: "orderStatus", width: 14, align: "center" as const },
        { header: "Payment Status", key: "paymentStatus", width: 14, align: "center" as const, isBold: true },
        { header: "Generated By", key: "assignedToName", width: 16, align: "left" as const },
      ];

      const b2bSheetData: any[][] = [
        ["B2B INVOICES (BUSINESS-TO-BUSINESS)"],
        ["Registered business invoices with Company details, GSTIN, Place of Supply, and GST Tax Breakdown"],
        [],
        b2bCols.map((c) => c.header),
      ];

      const b2bTaxable = b2bTransactions.reduce((sum, b) => sum + Number(b.subtotal || b.taxableValue || 0), 0);
      const b2bCGST = b2bTransactions.reduce((sum, b) => sum + Number(b.cgst || 0), 0);
      const b2bSGST = b2bTransactions.reduce((sum, b) => sum + Number(b.sgst || 0), 0);
      const b2bIGST = b2bTransactions.reduce((sum, b) => sum + Number(b.igst || 0), 0);
      const b2bShipping = b2bTransactions.reduce((sum, b) => sum + Number(b.shippingCharges || 0), 0);

      b2bTransactions.forEach((bill, index) => {
        const d = getBillDate(bill);
        const dateStr = d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN") : "-";
        const taxable = Number(bill.subtotal || bill.taxableValue || 0);
        const cgst = Number(bill.cgst || 0);
        const sgst = Number(bill.sgst || 0);
        const igst = Number(bill.igst || 0);
        const shipping = Number(bill.shippingCharges || 0);
        const total = Number(bill.totalAmount || (taxable + cgst + sgst + igst + shipping));

        const rowObj = {
          sr: index + 1,
          invoiceNumber: bill.invoiceNumber || "-",
          invoiceDate: dateStr,
          enquiryEnqId: bill.enquiryEnqId || "-",
          companyName: bill.companyName || "-",
          customerName: bill.customerName || "-",
          gstin: bill.gstin || "URP",
          placeOfSupply: bill.placeOfSupply || "Tamil Nadu",
          customerContact: formatContactNumber(bill.customerContact),
          taxableValue: taxable,
          cgst: cgst,
          sgst: sgst,
          igst: igst,
          shippingCharges: shipping,
          totalAmount: total,
          orderStatus: getStatusDisplay(bill.status) || "-",
          paymentStatus: (bill.status === "paid" || bill.paymentStatus === "completed") ? "Paid" : "Pending",
          assignedToName: bill.assignedToName || "Staff",
        };

        b2bSheetData.push(b2bCols.map((col) => (rowObj as any)[col.key]));
      });

      const b2bTotalsRow = {
        sr: "TOTALS",
        invoiceNumber: `${b2bTransactions.length} Invoices`,
        invoiceDate: "-",
        enquiryEnqId: "-",
        companyName: "-",
        customerName: "-",
        gstin: "-",
        placeOfSupply: "-",
        customerContact: "-",
        taxableValue: b2bTaxable,
        cgst: b2bCGST,
        sgst: b2bSGST,
        igst: b2bIGST,
        shippingCharges: b2bShipping,
        totalAmount: b2bTotalAmount,
        orderStatus: "-",
        paymentStatus: "-",
        assignedToName: "-",
      };
      b2bSheetData.push(b2bCols.map((col) => (b2bTotalsRow as any)[col.key]));

      const wsB2B = XLSX.utils.aoa_to_sheet(b2bSheetData);
      applyTableSheetStyling(wsB2B, b2bCols, b2bTransactions.length, "4F46E5", "EDE9FE", "FEF3C7");
      XLSX.utils.book_append_sheet(workbook, wsB2B, "B2B Invoices");

      // ==========================================
      // SHEET 4: B2C Invoices (Sky Blue #0284C7)
      // ==========================================
      const b2cCols = [
        { header: "S.No.", key: "sr", width: 8, align: "center" as const },
        { header: "Invoice #", key: "invoiceNumber", width: 16, align: "center" as const, isBold: true },
        { header: "Invoice Date", key: "invoiceDate", width: 14, align: "center" as const },
        { header: "Enquiry ID", key: "enquiryEnqId", width: 14, align: "center" as const },
        { header: "Customer Name", key: "customerName", width: 28, align: "left" as const, isBold: true },
        { header: "Contact Number", key: "customerContact", width: 16, align: "center" as const },
        { header: "City", key: "customerCity", width: 18, align: "left" as const },
        { header: "Place of Supply", key: "placeOfSupply", width: 18, align: "left" as const },
        { header: "Taxable Value (₹)", key: "taxableValue", width: 18, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "CGST (₹)", key: "cgst", width: 14, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "SGST (₹)", key: "sgst", width: 14, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "IGST (₹)", key: "igst", width: 14, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Shipping (₹)", key: "shippingCharges", width: 14, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Total Amount (₹)", key: "totalAmount", width: 18, align: "right" as const, numFmt: "₹#,##0.00", isBold: true, colorFn: () => "0284C7" },
        { header: "Order Status", key: "orderStatus", width: 14, align: "center" as const },
        { header: "Payment Status", key: "paymentStatus", width: 14, align: "center" as const, isBold: true },
        { header: "Generated By", key: "assignedToName", width: 16, align: "left" as const },
      ];

      const b2cSheetData: any[][] = [
        ["B2C INVOICES (BUSINESS-TO-CONSUMER)"],
        ["Consumer retail invoices and component orders with customer contact and delivery details"],
        [],
        b2cCols.map((c) => c.header),
      ];

      const b2cTaxable = b2cTransactions.reduce((sum, b) => sum + Number(b.subtotal || b.taxableValue || 0), 0);
      const b2cCGST = b2cTransactions.reduce((sum, b) => sum + Number(b.cgst || 0), 0);
      const b2cSGST = b2cTransactions.reduce((sum, b) => sum + Number(b.sgst || 0), 0);
      const b2cIGST = b2cTransactions.reduce((sum, b) => sum + Number(b.igst || 0), 0);
      const b2cShipping = b2cTransactions.reduce((sum, b) => sum + Number(b.shippingCharges || 0), 0);

      b2cTransactions.forEach((bill, index) => {
        const d = getBillDate(bill);
        const dateStr = d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN") : "-";
        const taxable = Number(bill.subtotal || bill.taxableValue || 0);
        const cgst = Number(bill.cgst || 0);
        const sgst = Number(bill.sgst || 0);
        const igst = Number(bill.igst || 0);
        const shipping = Number(bill.shippingCharges || 0);
        const total = Number(bill.totalAmount || (taxable + cgst + sgst + igst + shipping));

        const rowObj = {
          sr: index + 1,
          invoiceNumber: bill.invoiceNumber || "-",
          invoiceDate: dateStr,
          enquiryEnqId: bill.enquiryEnqId || "-",
          customerName: bill.customerName || "-",
          customerContact: formatContactNumber(bill.customerContact),
          customerCity: bill.customerCity || "-",
          placeOfSupply: bill.placeOfSupply || "Tamil Nadu",
          taxableValue: taxable,
          cgst: cgst,
          sgst: sgst,
          igst: igst,
          shippingCharges: shipping,
          totalAmount: total,
          orderStatus: getStatusDisplay(bill.status) || "-",
          paymentStatus: (bill.status === "paid" || bill.paymentStatus === "completed") ? "Paid" : "Pending",
          assignedToName: bill.assignedToName || "Staff",
        };

        b2cSheetData.push(b2cCols.map((col) => (rowObj as any)[col.key]));
      });

      const b2cTotalsRow = {
        sr: "TOTALS",
        invoiceNumber: `${b2cTransactions.length} Invoices`,
        invoiceDate: "-",
        enquiryEnqId: "-",
        customerName: "-",
        customerContact: "-",
        customerCity: "-",
        placeOfSupply: "-",
        taxableValue: b2cTaxable,
        cgst: b2cCGST,
        sgst: b2cSGST,
        igst: b2cIGST,
        shippingCharges: b2cShipping,
        totalAmount: b2cTotalAmount,
        orderStatus: "-",
        paymentStatus: "-",
        assignedToName: "-",
      };
      b2cSheetData.push(b2cCols.map((col) => (b2cTotalsRow as any)[col.key]));

      const wsB2C = XLSX.utils.aoa_to_sheet(b2cSheetData);
      applyTableSheetStyling(wsB2C, b2cCols, b2cTransactions.length, "0284C7", "E0F2FE", "FEF3C7");
      XLSX.utils.book_append_sheet(workbook, wsB2C, "B2C Invoices");

      // ==========================================
      // SHEET 5: Billed Items & Products (Indigo #3730A3)
      // ==========================================
      const itemCols = [
        { header: "S.No.", key: "sr", width: 8, align: "center" as const },
        { header: "Invoice #", key: "invoiceNumber", width: 16, align: "center" as const, isBold: true },
        { header: "Invoice Date", key: "invoiceDate", width: 14, align: "center" as const },
        { header: "Bill Type", key: "billType", width: 12, align: "center" as const },
        { header: "Customer / Company", key: "customer", width: 28, align: "left" as const },
        { header: "Product / Material Name", key: "productName", width: 36, align: "left" as const, isBold: true },
        { header: "HSN Code", key: "hsn", width: 14, align: "center" as const },
        { header: "Quantity", key: "quantity", width: 12, align: "center" as const, numFmt: "#,##0" },
        { header: "Unit Price (₹)", key: "unitPrice", width: 18, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Total Value (₹)", key: "totalAmount", width: 20, align: "right" as const, numFmt: "₹#,##0.00", isBold: true, colorFn: () => "3730A3" },
      ];

      const itemSheetData: any[][] = [
        ["PRODUCT-WISE BILLED ITEMS BREAKDOWN"],
        ["Itemized materials, quantities, unit prices, and total billed values extracted from customer invoices"],
        [],
        itemCols.map((c) => c.header),
      ];

      const billedItemsData: any[] = [];
      let itemSr = 1;
      let totalItemsQty = 0;
      let totalItemsVal = 0;

      filteredTransactions.forEach((bill) => {
        let itemsList: any[] = bill.items;
        if (typeof itemsList === "string") {
          try {
            itemsList = JSON.parse(itemsList);
          } catch (e) {
            itemsList = [];
          }
        }
        if (!Array.isArray(itemsList) || itemsList.length === 0) {
          const alt = (bill as any).materials || (bill as any).products;
          if (Array.isArray(alt)) itemsList = alt;
          else if (typeof alt === "string") {
            try {
              itemsList = JSON.parse(alt);
            } catch (e) {
              itemsList = [];
            }
          }
        }

        const d = getBillDate(bill);
        const dateStr = d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN") : "-";
        const customer = bill.companyName
          ? `${bill.companyName} (${bill.customerName})`
          : bill.customerName || "-";

        if (Array.isArray(itemsList) && itemsList.length > 0) {
          itemsList.forEach((item) => {
            const qty = Number(item.quantity) || 1;
            const unitPrice = Number(item.price) || 0;
            const itemTotal = Number(item.totalAmount || item.total || (unitPrice * qty));

            totalItemsQty += qty;
            totalItemsVal += itemTotal;

            const row = {
              sr: itemSr++,
              invoiceNumber: bill.invoiceNumber || "-",
              invoiceDate: dateStr,
              billType: bill.billType || "B2C",
              customer: customer,
              productName: item.productName || item.name || "Item",
              hsn: item.hsn || item.hsnCode || "-",
              quantity: qty,
              unitPrice: unitPrice,
              totalAmount: itemTotal,
            };
            billedItemsData.push(row);
            itemSheetData.push(itemCols.map((col) => (row as any)[col.key]));
          });
        }
      });

      const itemTotalsRow = {
        sr: "TOTALS",
        invoiceNumber: `${billedItemsData.length} Items`,
        invoiceDate: "-",
        billType: "-",
        customer: "-",
        productName: "-",
        hsn: "-",
        quantity: totalItemsQty,
        unitPrice: "-",
        totalAmount: totalItemsVal,
      };
      itemSheetData.push(itemCols.map((col) => (itemTotalsRow as any)[col.key]));

      const wsItems = XLSX.utils.aoa_to_sheet(itemSheetData);
      applyTableSheetStyling(wsItems, itemCols, billedItemsData.length, "3730A3", "E0E7FF", "FEF3C7");
      XLSX.utils.book_append_sheet(workbook, wsItems, "Billed Items");

      // File name format matching PNL.tsx
      let filePrefix = "Bills_Report";
      if (billTypeFilter === "b2b") filePrefix = "B2B_Bills_Report";
      else if (billTypeFilter === "b2c") filePrefix = "B2C_Bills_Report";
      if (orderStatusFilter !== "all") filePrefix += `_${orderStatusFilter}`;
      if (monthFilter !== "all" && monthFilter !== "custom") filePrefix += `_${monthFilter}`;

      const fileName = `${filePrefix}_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error("Export Bills Report error:", err);
      alert("Failed to export Excel report. Please try again.");
    }
  };

  const handleExportCSV = handleDownloadExcel;

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
              onClick={handleDownloadExcel}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Report (Excel)
            </button>
          </div>
        </div>

        {/* Top Summary Statistics Cards (Purchase Values, Sale Values, Net Margin, Refund / Dropped Values) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <KPICard
            title="Purchase Values"
            value={`₹${statistics.purchaseValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={<ShoppingBag className="w-4 h-4" />}
            iconBg="bg-indigo-50"
            iconColor="text-indigo-600"
            subtitle={`${statistics.purchaseItemsCount > 0 ? `${statistics.purchaseItemsCount} items billed` : "Cost of goods"} • Billed Purchase`}
          />

          <KPICard
            title="Sale Values"
            value={`₹${statistics.sellValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={<TrendingUp className="w-4 h-4" />}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
            valueColor="text-blue-700"
            titleColor="text-blue-700"
            subtitle={`${statistics.activeBillsCount} Sold ${statistics.activeBillsCount === 1 ? "Bill" : "Bills"} • Confirmed Orders`}
          />

          <KPICard
            title="Net Margin"
            value={`₹${statistics.netMargin.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={<IndianRupee className="w-4 h-4" />}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            valueColor={statistics.netMargin >= 0 ? "text-emerald-700" : "text-rose-600"}
            titleColor="text-emerald-700"
            subtitle={
              <span>
                <span className={statistics.marginPercentage >= 0 ? "text-emerald-700 font-semibold" : "text-rose-600 font-semibold"}>
                  {statistics.marginPercentage >= 0 ? "+" : ""}{statistics.marginPercentage.toFixed(1)}% margin
                </span>{" "}
                • Sale - Purchase
              </span>
            }
          />

          <KPICard
            title="Refund / Dropped Values"
            value={`₹${statistics.refundValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={<RotateCcw className="w-4 h-4" />}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
            valueColor="text-amber-700"
            titleColor="text-amber-700"
            subtitle={`${statistics.refundCount} Dropped / Cancelled ${statistics.refundCount === 1 ? "Bill" : "Bills"}`}
          />
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
              <DateFilter
                preset={monthFilter}
                onPresetChange={(val) => {
                  setMonthFilter(val);
                  if (val !== "custom") {
                    setStartDate("");
                    setEndDate("");
                  }
                }}
                startDate={startDate}
                onStartDateChange={setStartDate}
                endDate={endDate}
                onEndDateChange={setEndDate}
                monthlyOptions={availableMonths}
                showIcon={false}
              />
            </div>
          </div>
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
                const isRowMatch = isHighlighted(
                  bill.id,
                  bill.billId,
                  bill.invoiceNumber,
                  bill.customerName,
                  bill.billedTo?.name,
                  bill.enquiryEnqId
                );
                return (
                  <tr
                    key={bill.id}
                    id={`bill-row-${bill.id}`}
                    data-id={bill.id}
                    data-bill-id={bill.billId}
                    data-invoice-number={bill.invoiceNumber}
                    data-customer-name={bill.customerName}
                    data-enq-id={bill.enquiryEnqId}
                    data-highlight-id={`${bill.id || ""} ${bill.billId || ""} ${bill.invoiceNumber || ""} ${bill.customerName || ""} ${bill.billedTo?.name || ""} ${bill.enquiryEnqId || ""}`.trim()}
                    data-highlight-match={isRowMatch ? "true" : undefined}
                    className={`cursor-pointer transition-all duration-300 ${
                      isRowMatch
                        ? "active-find-match ring-4 ring-blue-600 bg-amber-100/90 font-semibold"
                        : "hover:bg-gray-50/80 transition-colors"
                    }`}
                  >
                    <td className="px-2 py-2.5 whitespace-nowrap text-center text-xs font-bold text-gray-600">
                      {serialNumber}
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap text-center">
                      <span className="text-xs font-mono font-semibold text-blue-600">
                        {bill.enquiryEnqId || "N/A"}
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-gray-900">{bill.invoiceNumber}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono">ID: {bill.billId?.slice(-6) || bill.id?.slice(-6)}</div>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-xs text-gray-600 text-center font-medium">
                      {(() => {
                        const d = getBillDate(bill);
                        return d && !isNaN(d.getTime()) && d.getTime() > 0 ? d.toLocaleDateString("en-IN") : "N/A";
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

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={filteredTransactions.length}
        itemsPerPage={itemsPerPage}
        hideOnSinglePage={true}
      />
    </div>
  </div>

      {/* Modern Bill Details Modal */}
      {selectedBill && (
        <div 
          onClick={() => setSelectedBill(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden my-6 animate-fade-in flex flex-col border border-gray-100 overscroll-contain"
          >
            {/* Modal Header */}
            <div className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-xs border-b border-gray-100 px-6 py-4 flex justify-between items-center flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-gray-900">Bill Details</h3>
                    <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2.5 py-0.5 rounded-full border border-gray-200">
                      {selectedBill.invoiceNumber}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                      selectedBill.billType === "B2B"
                        ? "bg-purple-100 text-purple-800 border border-purple-200"
                        : "bg-blue-100 text-blue-800 border border-blue-200"
                    }`}>
                      {selectedBill.billType || "B2C"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Customer: <span className="font-semibold text-gray-800">{selectedBill.customerName}</span>
                    {selectedBill.enquiryEnqId && (
                      <> &nbsp;|&nbsp; Enquiry ID: <span className="font-mono text-blue-600 font-semibold">{selectedBill.enquiryEnqId}</span></>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedBill(null)}
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
              {/* Info Cards Grid */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Invoice Number</p>
                  <p className="text-xs font-bold text-gray-900 font-mono truncate">{selectedBill.invoiceNumber}</p>
                </div>
                <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Enquiry ID</p>
                  <p className="text-xs font-bold font-mono text-blue-600 truncate">{selectedBill.enquiryEnqId || "N/A"}</p>
                </div>
                <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Bill Type</p>
                  <div className="mt-0.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                      selectedBill.billType === "B2B"
                        ? "bg-purple-100 text-purple-800 border border-purple-200"
                        : "bg-blue-100 text-blue-800 border border-blue-200"
                    }`}>
                      {selectedBill.billType || "B2C"}
                    </span>
                  </div>
                </div>
                <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Date</p>
                  <p className="text-xs font-semibold text-gray-800">{getBillDate(selectedBill)?.toLocaleDateString('en-IN') || "N/A"}</p>
                </div>
                <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Total Amount</p>
                  <p className="text-sm font-bold text-emerald-700">₹{selectedBill.totalAmount?.toFixed(2)}</p>
                </div>
              </div>

              {/* Payment Status Card */}
              <div className={`p-4 rounded-2xl border ${
                selectedBill.paymentStatus === "completed"
                  ? "bg-emerald-50/80 border-emerald-200/80"
                  : "bg-amber-50/80 border-amber-200/80"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {selectedBill.paymentStatus === "completed" ? (
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                    )}
                    <span className={`text-xs font-bold uppercase tracking-wider ${
                      selectedBill.paymentStatus === "completed" ? "text-emerald-800" : "text-amber-800"
                    }`}>
                      Payment Status
                    </span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    selectedBill.paymentStatus === "completed"
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      : "bg-amber-100 text-amber-800 border border-amber-200"
                  }`}>
                    {selectedBill.paymentStatus === "completed" ? "PAID" : "NOT PAID"}
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs">
                  <div>
                    <span className="text-gray-500 font-medium">Payment Type: </span>
                    <span className="font-semibold text-gray-800">{selectedBill.paymentType || "N/A"}</span>
                  </div>
                  {selectedBill.paymentSubStatus && (
                    <div>
                      <span className="text-gray-500 font-medium">Payment Sub Status: </span>
                      <span className="font-semibold text-gray-800">{selectedBill.paymentSubStatus}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Items Table Section */}
              <div className="bg-white rounded-2xl border border-gray-200/90 overflow-hidden shadow-xs">
                <div className="bg-slate-50/90 px-4 py-3 border-b border-gray-200/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-600" />
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Items & Products</h4>
                  </div>
                  <span className="text-[11px] font-semibold text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                    {selectedBill.items?.length || 0} {selectedBill.items?.length === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50/50 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-2.5 text-left w-12">#</th>
                        <th className="px-4 py-2.5 text-left">Product Name</th>
                        <th className="px-4 py-2.5 text-center w-24">Quantity</th>
                        <th className="px-4 py-2.5 text-right w-28">Price</th>
                        <th className="px-4 py-2.5 text-right w-28">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedBill.items && selectedBill.items.length > 0 ? (
                        selectedBill.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                            <td className="px-4 py-2.5 text-gray-400 font-mono text-[11px] font-medium">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-2.5 font-semibold text-gray-900">
                              {item.productName}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/80 font-mono">
                                {item.quantity}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-700 font-mono">
                              ₹{item.price?.toFixed(2)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-gray-900 font-mono">
                              ₹{item.total?.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-gray-400">
                            No items found in this bill
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Editable Bank Details */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Bank Details</h4>
                  <div className="flex gap-2">
                    {!editingBankDetails ? (
                      <button
                        onClick={() => setEditingBankDetails(true)}
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs font-semibold cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditingBankDetails(false)}
                          className="text-emerald-600 hover:text-emerald-800 flex items-center gap-1 text-xs font-semibold cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Done
                        </button>
                        <button
                          onClick={resetBankDetails}
                          className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-xs cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reset
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {editingBankDetails ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-0.5">Beneficiary Name</label>
                      <input
                        type="text"
                        value={editBankDetails.beneficiaryName}
                        onChange={(e) => handleBankDetailChange('beneficiaryName', e.target.value)}
                        className="w-full px-2.5 py-1.5 border rounded-xl text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-0.5">Bank Name</label>
                      <input
                        type="text"
                        value={editBankDetails.bankName}
                        onChange={(e) => handleBankDetailChange('bankName', e.target.value)}
                        className="w-full px-2.5 py-1.5 border rounded-xl text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-0.5">Account No</label>
                      <input
                        type="text"
                        value={editBankDetails.accountNo}
                        onChange={(e) => handleBankDetailChange('accountNo', e.target.value)}
                        className="w-full px-2.5 py-1.5 border rounded-xl text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-0.5">IFSC Code</label>
                      <input
                        type="text"
                        value={editBankDetails.ifscCode}
                        onChange={(e) => handleBankDetailChange('ifscCode', e.target.value)}
                        className="w-full px-2.5 py-1.5 border rounded-xl text-xs bg-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-gray-500 mb-0.5">Branch</label>
                      <input
                        type="text"
                        value={editBankDetails.branch}
                        onChange={(e) => handleBankDetailChange('branch', e.target.value)}
                        className="w-full px-2.5 py-1.5 border rounded-xl text-xs bg-white"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-700">
                    <p><strong className="text-gray-500 font-medium">Beneficiary:</strong> <span className="font-semibold text-gray-900">{editBankDetails.beneficiaryName}</span></p>
                    <p><strong className="text-gray-500 font-medium">Bank:</strong> <span className="font-semibold text-gray-900">{editBankDetails.bankName}</span></p>
                    <p><strong className="text-gray-500 font-medium">Account:</strong> <span className="font-semibold font-mono text-gray-900">{editBankDetails.accountNo}</span></p>
                    <p><strong className="text-gray-500 font-medium">IFSC:</strong> <span className="font-semibold font-mono text-gray-900">{editBankDetails.ifscCode}</span></p>
                    <p className="sm:col-span-2"><strong className="text-gray-500 font-medium">Branch:</strong> <span className="font-semibold text-gray-900">{editBankDetails.branch}</span></p>
                  </div>
                )}
              </div>

              {/* Editable Terms & Conditions */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Terms & Conditions</h4>
                  <div className="flex gap-2">
                    {!editingTerms ? (
                      <button
                        onClick={() => setEditingTerms(true)}
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs font-semibold cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditingTerms(false)}
                          className="text-emerald-600 hover:text-emerald-800 flex items-center gap-1 text-xs font-semibold cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Done
                        </button>
                        <button
                          onClick={resetTerms}
                          className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-xs cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
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
                        <span className="text-gray-400 font-mono text-xs">{index + 1}.</span>
                        <input
                          type="text"
                          value={term.text}
                          onChange={(e) => handleTermChange(term.id, e.target.value)}
                          className="flex-1 px-2.5 py-1.5 border rounded-xl text-xs bg-white"
                        />
                        <button
                          onClick={() => handleRemoveTerm(term.id)}
                          className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                          title="Remove term"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-gray-400 font-mono text-xs">{editTerms.length + 1}.</span>
                      <input
                        type="text"
                        value={newTerm}
                        onChange={(e) => setNewTerm(e.target.value)}
                        placeholder="Add new term..."
                        className="flex-1 px-2.5 py-1.5 border rounded-xl text-xs bg-white"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            handleAddTerm();
                          }
                        }}
                      />
                      <button
                        onClick={handleAddTerm}
                        className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                ) : (
                  <ul className="list-none space-y-1 text-xs text-gray-700">
                    {editTerms.map((term, index) => (
                      <li key={term.id} className="flex items-start gap-1.5">
                        <span className="text-gray-400 font-mono">{index + 1}.</span>
                        <span>{term.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Sign & Seal Option Card */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Sign & Seal</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Include authorized signature & seal on the printed document.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIncludeSignature}
                      onChange={(e) => handleToggleSignature(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5.5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-purple-600"></div>
                    <span className="ml-2.5 text-xs font-bold text-gray-700">
                      {editIncludeSignature ? "Included" : "Excluded"}
                    </span>
                  </label>
                </div>
                {editIncludeSignature && (
                  <div className="mt-2.5 pt-2.5 border-t border-gray-200/70 flex items-center gap-3">
                    <img src={SIGNATURE_URL} alt="Sign & Seal" className="h-9 w-auto object-contain bg-white p-1 border rounded-lg" />
                    <span className="text-[11px] text-gray-500">Sign & seal will be included on the printed document.</span>
                  </div>
                )}
              </div>

              {/* Tax Summary Card */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-2.5">Tax Summary</h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Subtotal:</span>
                    <span className="font-semibold text-gray-900 font-mono">₹{selectedBill.subtotal?.toFixed(2) || "0.00"}</span>
                  </div>
                  {selectedBill.discountAmount && selectedBill.discountAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 font-medium">Discount ({selectedBill.discountPercentage || 0}%):</span>
                      <span className="text-emerald-600 font-semibold font-mono">-₹{selectedBill.discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Taxable Amount:</span>
                    <span className="font-semibold text-gray-900 font-mono">₹{((selectedBill.subtotal || 0) - (selectedBill.discountAmount || 0)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Tax Type:</span>
                    <span className="font-semibold text-gray-900 capitalize">
                      {selectedBill.taxType === "cgst_sgst" ? "CGST + SGST" : "IGST"} ({selectedBill.taxRate || 0}%)
                    </span>
                  </div>
                  {selectedBill.taxType === "cgst_sgst" ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">CGST ({(selectedBill.taxRate || 0) / 2}%):</span>
                        <span className="font-semibold text-gray-900 font-mono">₹{selectedBill.cgst?.toFixed(2) || "0.00"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">SGST ({(selectedBill.taxRate || 0) / 2}%):</span>
                        <span className="font-semibold text-gray-900 font-mono">₹{selectedBill.sgst?.toFixed(2) || "0.00"}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-gray-500 font-medium">IGST ({selectedBill.taxRate || 0}%):</span>
                      <span className="font-semibold text-gray-900 font-mono">₹{selectedBill.igst?.toFixed(2) || "0.00"}</span>
                    </div>
                  )}
                  {selectedBill.cessAmount && selectedBill.cessAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 font-medium">Cess Amount:</span>
                      <span className="font-semibold text-gray-900 font-mono">₹{selectedBill.cessAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-200">
                    <span className="text-gray-900">Total Amount:</span>
                    <span className="text-emerald-700 font-mono">₹{selectedBill.totalAmount?.toFixed(2) || "0.00"}</span>
                  </div>
                </div>
              </div>

              {selectedBill.notes && (
                <div className="bg-blue-50/80 p-4 rounded-2xl border border-blue-100">
                  <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-1">Notes</h4>
                  <p className="text-xs text-blue-800 whitespace-pre-line">{selectedBill.notes}</p>
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="sticky bottom-0 z-10 bg-slate-50/95 backdrop-blur-xs border-t border-gray-100 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-md flex-shrink-0">
              {/* Quick Sign & Seal Toggle */}
              <div className="flex items-center gap-2.5 bg-white px-3 py-1.5 rounded-xl border border-gray-200/90 shadow-2xs">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIncludeSignature}
                    onChange={(e) => handleToggleSignature(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4.5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-purple-600"></div>
                  <span className="ml-2 text-xs font-semibold text-gray-700 select-none">
                    Sign & Seal: <span className={editIncludeSignature ? "text-purple-600 font-bold" : "text-gray-400 font-normal"}>{editIncludeSignature ? "Included" : "Excluded"}</span>
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintBill}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs font-semibold flex items-center gap-2 text-xs transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Bill
                </button>
                <button
                  onClick={() => setSelectedBill(null)}
                  className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-xs font-semibold transition cursor-pointer"
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
                  <span className="font-bold text-gray-900">₹{Number(billToDelete.totalAmount || 0).toFixed(2)}</span>
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