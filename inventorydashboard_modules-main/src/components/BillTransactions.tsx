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
import {
  isSoldBill,
  isSoldBillRecord,
  isDroppedBill,
  isQuotationBill,
  deduplicateBills,
  buildEnquiriesMap,
  resolveBillWithEnquiry,
  getBillTotal,
  getBillDate,
  calculateBillPurchaseCost,
  createBillFromApprovedEnquiry,
} from "../utils/billUtils";
import { generateBillPrintHTML, numberToWords as formatNumberToWords } from "../utils/billPrintTemplate";
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

  // Logo & Signature URL constants
  const LOGO_URL = typeof window !== 'undefined' && window.location?.origin ? `${window.location.origin}/ibots-logo.png` : "https://ibots.in/wp-content/uploads/2024/07/ibots-logo.png";
  const SIGNATURE_URL = typeof window !== 'undefined' && window.location?.origin ? `${window.location.origin}/sign.jpg` : "/sign.jpg";

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
      const deduplicatedBills = deduplicateBills(fetchedBills);
      console.log("After deduplication:", deduplicatedBills.length, "bills (from", fetchedBills.length, "total)");

      // Batch load enquiries map to avoid slow N+1 individual queries
      let enquiriesMap = new Map<string, any>();
      const allEnquiriesList: any[] = [];
      try {
        const enquiriesSnap = await getDocs(collection(db, "enquiries"));
        enquiriesSnap.forEach((docSnap) => {
          allEnquiriesList.push({ id: docSnap.id, ...docSnap.data() });
        });
        enquiriesMap = buildEnquiriesMap(allEnquiriesList);
      } catch (err) {
        console.warn("Could not batch load enquiries in BillTransactions:", err);
      }

      // Check for approved enquiries without a bill and add them to the bill processing list
      const billedKeys = new Set<string>();
      deduplicatedBills.forEach((b: any) => {
        if (b.enquiryEnqId) billedKeys.add(String(b.enquiryEnqId).trim().toLowerCase());
        if (b.enquiryId) billedKeys.add(String(b.enquiryId).trim().toLowerCase());
        if (b.billedTo?.enqId) billedKeys.add(String(b.billedTo.enqId).trim().toLowerCase());
        if (b.enqId) billedKeys.add(String(b.enqId).trim().toLowerCase());
        if (b.id) billedKeys.add(String(b.id).trim().toLowerCase());
        if (b.invoiceNumber) billedKeys.add(String(b.invoiceNumber).trim().toLowerCase());
      });

      const missingApprovedBills: any[] = [];
      allEnquiriesList.forEach((e: any) => {
        if (e.status === "Approved") {
          const enqIdStr = String(e.enqId || "").trim().toLowerCase();
          const docIdStr = String(e.id || "").trim().toLowerCase();
          const billIdStr = String(e.billId || "").trim().toLowerCase();
          const invNumStr = String(e.invoiceNumber || `INV-${e.enqId}`).trim().toLowerCase();

          const alreadyInBills =
            (enqIdStr && billedKeys.has(enqIdStr)) ||
            (docIdStr && billedKeys.has(docIdStr)) ||
            (billIdStr && billedKeys.has(billIdStr)) ||
            (invNumStr && billedKeys.has(invNumStr));

          if (!alreadyInBills) {
            const synthBill = createBillFromApprovedEnquiry(e);
            if (synthBill) missingApprovedBills.push(synthBill);
          }
        }
      });

      const allBillsToProcess = [...deduplicatedBills, ...missingApprovedBills];

      // Process each bill with enquiry data
      const processedTransactions = allBillsToProcess.map((bill) => {
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
      const statusFiltered = filtered.filter((b) => isSoldBillRecord(b));
      filtered = hasActiveSearch && statusFiltered.length === 0 ? filtered : statusFiltered;
    } else if (orderStatusFilter === "quotation") {
      const statusFiltered = filtered.filter((b) => isQuotationBill(b) && !isDroppedBill(b));
      filtered = hasActiveSearch && statusFiltered.length === 0 ? filtered : statusFiltered;
    } else if (orderStatusFilter === "dropped") {
      const statusFiltered = filtered.filter((b) => isDroppedBill(b));
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

    // Evaluate summary KPIs across the active date & search window (identical to PNL date window)
    const statsSourceBills = (monthFilter !== "all" || startDate || endDate || searchTerm.trim())
      ? transactions.filter((b) => {
          if (searchTerm.trim()) {
            const term = searchTerm.trim().toLowerCase();
            const custName = (b.customerName || b.billedTo?.name || "").toLowerCase();
            const compName = ((b as any).companyName || "").toLowerCase();
            const gst = (b.billedTo?.gstin || (b as any).gstin || "").toLowerCase();
            const inv = (b.invoiceNumber || "").toLowerCase();
            const contact = (b.customerContact || b.billedTo?.contactNumber || "").toLowerCase();
            const bId = (b.billId || "").toLowerCase();
            const enq = (b.enquiryEnqId || b.enquiryId || (b.billedTo as any)?.enqId || "").toLowerCase();
            const matches =
              custName.includes(term) ||
              compName.includes(term) ||
              gst.includes(term) ||
              inv.includes(term) ||
              contact.includes(term) ||
              bId.includes(term) ||
              enq.includes(term);
            if (!matches) return false;
          }
          if (monthFilter !== "all" || startDate || endDate) {
            const d = getBillDate(b);
            return isDateInFilterRange(d, monthFilter, startDate, endDate);
          }
          return true;
        })
      : transactions;

    statsSourceBills.forEach((bill) => {
      const isDropped = isDroppedBill(bill);
      const isQuotation = !isDropped && isQuotationBill(bill);
      const isSold = isSoldBillRecord(bill);

      if (bill.isGST) gstCount++;

      const subtotal = Number(bill.subtotal || bill.taxableValue || 0);
      const cgst = Number(bill.cgst || 0);
      const sgst = Number(bill.sgst || 0);
      const igst = Number(bill.igst || 0);
      const shipping = Number(bill.shippingCharges || 0);
      const billTotal = getBillTotal(bill);

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

        // Calculate Purchase Value for this sold bill record (100% parity with PNL.tsx)
        const { billPurchase, billItemsQty } = calculateBillPurchaseCost(
          bill,
          productsMap,
          productsByName,
          productsList
        );

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

  // Number to words conversion (delegated to universal helper)
  const numberToWords = (num: number) => formatNumberToWords(num);

  const printHtmlDocument = (htmlContent: string) => {
    // Open via isolated Blob URL with rel="noopener noreferrer"
    // This detaches the document window from parent thread so the main dashboard tab never freezes
    try {
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch (_) {}
      }, 120000);
      return;
    } catch (err) {
      console.warn("Blob print open failed, falling back to window.open:", err);
    }

    // Fallback using window.open with opener severed
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      try {
        printWindow.opener = null;
      } catch (_) {}
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    }
  };

  // Print Proforma Invoice
  const handlePrintProformaInvoice = (bill: BillTransaction) => {
    const bankDetailsToPrint = (bill as any).bankDetails || defaultBankDetails;
    const termsToPrint = (bill as any).terms || defaultTerms;
    const shouldIncludeSignature = editIncludeSignature !== undefined ? editIncludeSignature : ((bill as any).includeSignature !== false);
    
    const htmlContent = generateBillPrintHTML({
      documentType: "PROFORMA INVOICE",
      documentLabel: "Proforma Invoice #",
      invoiceNumber: bill.invoiceNumber,
      billDate: bill.billDate,
      dueDate: bill.dueDate,
      status: "proforma",
      paymentStatus: bill.paymentStatus,
      paymentType: bill.paymentType,
      paymentSubStatus: bill.paymentSubStatus,
      isPaid: bill.paymentStatus === "completed",
      isQuotation: false,
      billedTo: bill.billedTo,
      customerName: bill.customerName,
      customerContact: bill.customerContact,
      customerAddress: bill.customerAddress || bill.billedTo?.address || (bill as any).address || "",
      customerEmail: (bill as any).email || (bill.billedTo as any)?.email || "",
      customerCity: bill.customerCity,
      customerState: bill.customerState,
      placeOfSupply: bill.placeOfSupply,
      taxType: bill.taxType,
      taxRate: bill.taxRate,
      subtotal: bill.subtotal,
      discountPercentage: bill.discountPercentage,
      discountAmount: bill.discountAmount,
      cgst: bill.cgst,
      sgst: bill.sgst,
      igst: bill.igst,
      taxAmount: bill.taxAmount,
      cessAmount: bill.cessAmount,
      shippingCharges: bill.shippingCharges,
      totalAmount: bill.totalAmount,
      items: bill.items,
      bankDetails: bankDetailsToPrint,
      terms: termsToPrint,
      notes: bill.notes,
      logoUrl: LOGO_URL,
      signatureUrl: SIGNATURE_URL,
      includeSignature: shouldIncludeSignature,
    });

    printHtmlDocument(htmlContent);
  };

  // Print bill format (Tax Invoice or Quotation)
  const handlePrintBill = () => {
    if (!selectedBill) return;
    
    const isQuotation = selectedBill.status === "quotation" || isQuotationBill(selectedBill);
    const isPaid = selectedBill.paymentStatus === "completed";
    const isApprovedAndPaid = !isQuotation && isPaid;
    
    const bankDetailsToPrint = editingBankDetails ? editBankDetails : ((selectedBill as any).bankDetails || defaultBankDetails);
    const termsToPrint = editingTerms ? editTerms : ((selectedBill as any).terms || defaultTerms);
    const shouldIncludeSignature = editIncludeSignature !== undefined ? editIncludeSignature : ((selectedBill as any).includeSignature !== false);

    const documentType = isQuotation ? "QUOTATION" : (isApprovedAndPaid ? "TAX INVOICE" : "INVOICE");
    const documentLabel = isQuotation ? "Quote No" : "Invoice #";

    const htmlContent = generateBillPrintHTML({
      documentType,
      documentLabel,
      invoiceNumber: selectedBill.invoiceNumber,
      billDate: selectedBill.billDate,
      dueDate: selectedBill.dueDate,
      status: selectedBill.status,
      paymentStatus: selectedBill.paymentStatus,
      paymentType: selectedBill.paymentType,
      paymentSubStatus: selectedBill.paymentSubStatus,
      isPaid,
      isQuotation,
      isApprovedAndPaid,
      billedTo: selectedBill.billedTo,
      customerName: selectedBill.customerName,
      customerContact: selectedBill.customerContact,
      customerAddress: selectedBill.customerAddress || selectedBill.billedTo?.address || (selectedBill as any).address || "",
      customerEmail: (selectedBill as any).email || (selectedBill.billedTo as any)?.email || "",
      customerCity: selectedBill.customerCity,
      customerState: selectedBill.customerState,
      placeOfSupply: selectedBill.placeOfSupply,
      taxType: selectedBill.taxType,
      taxRate: selectedBill.taxRate,
      subtotal: selectedBill.subtotal,
      discountPercentage: selectedBill.discountPercentage,
      discountAmount: selectedBill.discountAmount,
      cgst: selectedBill.cgst,
      sgst: selectedBill.sgst,
      igst: selectedBill.igst,
      taxAmount: selectedBill.taxAmount,
      cessAmount: selectedBill.cessAmount,
      shippingCharges: selectedBill.shippingCharges,
      totalAmount: selectedBill.totalAmount,
      items: selectedBill.items,
      bankDetails: bankDetailsToPrint,
      terms: termsToPrint,
      notes: selectedBill.notes,
      logoUrl: LOGO_URL,
      signatureUrl: SIGNATURE_URL,
      includeSignature: shouldIncludeSignature,
    });

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
          />

          <KPICard
            title="Sale Values"
            value={`₹${statistics.sellValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={<TrendingUp className="w-4 h-4" />}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
            valueColor="text-blue-700"
            titleColor="text-blue-700"
          />

          <KPICard
            title="Net Margin"
            value={`₹${statistics.netMargin.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={<IndianRupee className="w-4 h-4" />}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            valueColor={statistics.netMargin >= 0 ? "text-emerald-700" : "text-rose-600"}
            titleColor="text-emerald-700"
          />

          <KPICard
            title="Refund / Dropped Values"
            value={`₹${statistics.refundValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={<RotateCcw className="w-4 h-4" />}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
            valueColor="text-amber-700"
            titleColor="text-amber-700"
          />
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
                <option value="all">All Statuses ({allCount})</option>
                <option value="approved">Approved / Invoices ({invoiceCount})</option>
                <option value="quotation">Quotations ({quotationCount})</option>
                {droppedCount > 0 && <option value="dropped">Dropped ({droppedCount})</option>}
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
        <div className="bg-slate-50/50 rounded-2xl border border-slate-200/80 p-3 sm:p-4 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate border-spacing-y-2">
              <thead>
                <tr className="text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="px-3 py-2 text-center whitespace-nowrap w-12">
                    S.No.
                  </th>
                  <th className="px-3 py-2 text-center whitespace-nowrap">
                    Enquiry ID
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    Invoice #
                  </th>
                  <th className="px-3 py-2 text-center whitespace-nowrap">
                    Date
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    Customer
                  </th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    Contact
                  </th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">
                    Amount
                  </th>
                  <th className="px-3 py-2 text-center whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-3 py-2 text-center whitespace-nowrap">
                    Payment
                  </th>
                  <th className="px-3 py-2 text-center whitespace-nowrap">
                    Payment Type
                  </th>
                  <th className="px-3 py-2 text-center whitespace-nowrap">
                    Generated By
                  </th>
                  <th className="px-3 py-2 text-center whitespace-nowrap w-16">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
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
                const cellBase = isRowMatch
                  ? "bg-amber-50/90 group-hover:bg-amber-100/90 border-y border-amber-300 py-3 px-3 transition-colors shadow-2xs"
                  : "bg-white group-hover:bg-slate-50/90 border-y border-slate-200/80 py-3 px-3 transition-colors shadow-2xs group-hover:shadow-xs";
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
                    className={`group cursor-pointer transition-all duration-200 ${
                      isRowMatch
                        ? "active-find-match ring-2 ring-blue-500 rounded-xl font-semibold"
                        : ""
                    }`}
                  >
                    <td className={`${cellBase} whitespace-nowrap text-center text-xs font-bold text-slate-700 border-l rounded-l-xl ${isRowMatch ? "border-l-amber-400" : "border-l-slate-200/80"}`}>
                      <div className="w-7 h-7 mx-auto rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-[11px] border border-slate-200/70">
                        {serialNumber}
                      </div>
                    </td>
                    <td className={`${cellBase} whitespace-nowrap text-center`}>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-semibold bg-blue-50/80 text-blue-700 border border-blue-200/70">
                        {bill.enquiryEnqId || "N/A"}
                      </span>
                    </td>
                    <td className={`${cellBase} whitespace-nowrap`}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900">{bill.invoiceNumber}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">ID: {bill.billId?.slice(-6) || bill.id?.slice(-6)}</div>
                    </td>
                    <td className={`${cellBase} whitespace-nowrap text-xs text-slate-600 text-center font-medium`}>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-700 bg-slate-100/70 border border-slate-200/60">
                        {(() => {
                          const d = getBillDate(bill);
                          return d && !isNaN(d.getTime()) && d.getTime() > 0 ? d.toLocaleDateString("en-IN") : "N/A";
                        })()}
                      </span>
                    </td>
                    <td className={`${cellBase} max-w-[150px]`}>
                      <div className="text-xs font-bold text-slate-900 truncate" title={bill.customerName}>
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
                          <div className="text-[10px] text-slate-400 truncate max-w-[90px]" title={bill.customerCity}>
                            {bill.customerCity}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className={`${cellBase} whitespace-nowrap text-xs text-slate-600 font-mono`}>
                      {formatContactNumber(bill.customerContact)}
                    </td>
                    <td className={`${cellBase} whitespace-nowrap text-xs text-slate-900 text-right font-bold tabular-nums`}>
                      <span className="text-xs font-extrabold text-slate-900 tabular-nums">
                        ₹{(bill.totalAmount || 0).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </td>
                    <td className={`${cellBase} whitespace-nowrap text-center`}>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
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
                    <td className={`${cellBase} whitespace-nowrap text-center`}>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
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
                    <td className={`${cellBase} whitespace-nowrap text-center text-xs text-slate-700 font-medium`}>
                      <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100/80 text-slate-700 text-xs font-medium border border-slate-200/50">
                        {bill.paymentType || "-"}
                      </span>
                    </td>
                    <td className={`${cellBase} whitespace-nowrap text-center`}>
                      <div className="text-xs text-slate-800 font-semibold">{bill.assignedToName || "-"}</div>
                      <div className="text-[10px] text-slate-400 capitalize">{bill.createdByRole}</div>
                    </td>
                    <td className={`${cellBase} whitespace-nowrap text-center w-16 border-r rounded-r-xl ${isRowMatch ? "border-r-amber-400" : "border-r-slate-200/80"}`}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleViewBill(bill)}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg cursor-pointer transition border border-transparent hover:border-blue-200/70"
                          title="View Bill"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {hasDeleteAccess && (
                          <button
                            onClick={() => handleDeleteClick(bill)}
                            className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg cursor-pointer transition border border-transparent hover:border-rose-200/70"
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
                <td colSpan={12} className="text-center py-12 px-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
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
      {selectedBill && (() => {
        const isSelectedQuotation = selectedBill.status === "quotation" || isQuotationBill(selectedBill);
        const isSelectedPaid = selectedBill.paymentStatus === "completed" || selectedBill.status === "paid";
        const isApprovedBill = !isSelectedQuotation && (
          isSelectedPaid ||
          selectedBill.status?.toLowerCase() === "approved" ||
          selectedBill.status?.toLowerCase() === "paid" ||
          selectedBill.paymentStatus?.toLowerCase() === "completed" ||
          selectedBill.paymentStatus?.toLowerCase() === "paid" ||
          (selectedBill as any).isApproved === true
        );
        const docTitle = isSelectedQuotation ? "Quotation Details" : (isApprovedBill ? "Tax Invoice Details" : "Invoice Details");
        const docBadge = isSelectedQuotation ? "QUOTATION" : (isApprovedBill ? "TAX INVOICE" : "INVOICE");
        const docDate = getBillDate(selectedBill)?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) || "N/A";
        const taxableVal = Math.max(0, (selectedBill.subtotal || 0) - (selectedBill.discountAmount || 0));
        const clientAddress = (selectedBill.customerAddress || selectedBill.billedTo?.address || (selectedBill as any).address || "").trim();

        return (
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
            <div className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur-xs border-b border-gray-100 px-6 py-4 flex justify-between items-center flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs text-white ${
                  isSelectedQuotation
                    ? "bg-gradient-to-tr from-sky-600 to-blue-600"
                    : (isSelectedPaid ? "bg-gradient-to-tr from-emerald-600 to-teal-700" : "bg-gradient-to-tr from-amber-600 to-orange-600")
                }`}>
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-gray-900">{docTitle}</h3>
                    <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2.5 py-0.5 rounded-full border border-gray-200">
                      {selectedBill.invoiceNumber}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                      isSelectedQuotation
                        ? "bg-sky-100 text-sky-800 border border-sky-200"
                        : (isSelectedPaid ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-amber-100 text-amber-800 border border-amber-200")
                    }`}>
                      {docBadge}
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
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    {isSelectedQuotation ? "Quote Number" : "Invoice Number"}
                  </p>
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
                  <p className="text-xs font-semibold text-gray-800">{docDate}</p>
                </div>
                <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Total Amount</p>
                  <p className="text-sm font-bold text-emerald-700">₹{selectedBill.totalAmount?.toFixed(2)}</p>
                </div>
              </div>

              {/* Party Information (Supplier & Recipient in Modern Light Cards) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Supplier / Issued By</p>
                  <p className="text-sm font-bold text-gray-900">Protowiz Private Limited</p>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    34/17A, Ramalingam Nagar, Saibaba Colony, Coimbatore - 641011, Tamil Nadu
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2 text-[11px] font-mono">
                    <span className="bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-slate-700">
                      GSTIN: <strong className="text-slate-900">33AAKCP9459K1ZO</strong>
                    </span>
                    <span className="bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-slate-700">
                      PAN: <strong className="text-slate-900">AAMCP9459K</strong>
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    {isSelectedQuotation ? "Quotation Prepared For" : "Billed To / Buyer"}
                  </p>
                  {clientAddress ? (
                    <>
                      <p className="text-sm font-bold text-gray-900">
                        {selectedBill.companyName ? `${selectedBill.customerName || "Customer"} • ${selectedBill.companyName}` : (selectedBill.customerName || "Customer")}
                      </p>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        {clientAddress}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2 text-[11px] font-mono">
                        <span className="bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-slate-700">
                          GSTIN: <strong className="text-slate-900">{selectedBill.billedTo?.gstin || selectedBill.gstin || "Consumer / Unregistered"}</strong>
                        </span>
                        <span className="bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-slate-700">
                          State: <strong className="text-slate-900">{selectedBill.customerState || selectedBill.placeOfSupply || "Tamil Nadu (33)"}</strong>
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1.5">
                        Contact: <span className="font-semibold text-gray-800">{selectedBill.customerContact || "-"}</span>
                        {(selectedBill as any).email && (
                          <span> &nbsp;|&nbsp; Email: <span className="font-semibold text-gray-800">{(selectedBill as any).email}</span></span>
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-gray-900">{selectedBill.customerName || "Customer"}</p>
                      {selectedBill.companyName && (
                        <p className="text-xs text-gray-600 mt-0.5 font-medium">{selectedBill.companyName}</p>
                      )}
                      <p className="text-xs text-gray-600 mt-1">
                        Contact: <span className="font-semibold text-gray-800">{selectedBill.customerContact || "-"}</span>
                        &nbsp;|&nbsp; Location: <span className="font-semibold text-gray-800">{[selectedBill.customerCity, selectedBill.customerState].filter(Boolean).join(", ") || "-"}</span>
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2 text-[11px] font-mono">
                        {selectedBill.billedTo?.gstin ? (
                          <span className="bg-white px-2 py-0.5 rounded-lg border border-purple-200 text-purple-700 font-semibold">
                            GSTIN: {selectedBill.billedTo.gstin}
                          </span>
                        ) : (
                          <span className="bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-slate-500">
                            Consumer / Unregistered
                          </span>
                        )}
                        <span className="bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-slate-700">
                          Place of Supply: <strong className="text-slate-900">{selectedBill.placeOfSupply || "Tamil Nadu (33)"}</strong>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Payment or Quotation Status Card */}
              {isSelectedQuotation ? (
                <div className="p-4 rounded-2xl border bg-blue-50/80 border-blue-200/80">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-800">
                        Quotation Estimate Status
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                      COMMERCIAL ESTIMATE
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-blue-900/80">
                    This document is a formal price quote. Upon client acceptance and payment confirmation, it converts directly into a Tax Invoice.
                  </p>
                </div>
              ) : (
                <div className={`p-4 rounded-2xl border ${
                  isSelectedPaid
                    ? "bg-emerald-50/80 border-emerald-200/80"
                    : "bg-amber-50/80 border-amber-200/80"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isSelectedPaid ? (
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                      )}
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        isSelectedPaid ? "text-emerald-800" : "text-amber-800"
                      }`}>
                        Payment Status
                      </span>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      isSelectedPaid
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        : "bg-amber-100 text-amber-800 border border-amber-200"
                    }`}>
                      {isSelectedPaid ? "PAID" : "NOT PAID"}
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
              )}

              {/* Items Table Section */}
              <div className="bg-white rounded-2xl border border-gray-200/90 overflow-hidden shadow-xs">
                <div className="bg-slate-50/90 px-4 py-3 border-b border-gray-200/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-600" />
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                      {isSelectedQuotation ? "Quoted Items & Services" : "Billed Items & Products"}
                    </h4>
                  </div>
                  <span className="text-[11px] font-semibold text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                    {selectedBill.items?.length || 0} {selectedBill.items?.length === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50/70 text-[11px] font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2.5 text-center w-12">#</th>
                        <th className="px-4 py-2.5 text-left">Item Description</th>
                        <th className="px-4 py-2.5 text-center w-24">HSN/SAC</th>
                        <th className="px-4 py-2.5 text-center w-20">Qty</th>
                        <th className="px-4 py-2.5 text-right w-24">Unit Rate</th>
                        <th className="px-4 py-2.5 text-center w-20">GST %</th>
                        <th className="px-4 py-2.5 text-right w-24">GST Amt</th>
                        <th className="px-4 py-2.5 text-right w-28">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedBill.items && selectedBill.items.length > 0 ? (
                        selectedBill.items.map((item, idx) => {
                          const itemQty = Number(item.quantity) || 1;
                          const itemPrice = Number(item.price) || 0;
                          const itemTaxRate = (item as any).taxRate !== undefined && (item as any).taxRate !== null ? Number((item as any).taxRate) : (selectedBill.taxRate || 18);
                          const itemTotal = Number(item.total) || (itemPrice * itemQty);
                          const itemTaxAmt = (item as any).taxAmount !== undefined && (item as any).taxAmount !== null
                            ? Number((item as any).taxAmount)
                            : (itemTotal * itemTaxRate) / 100;
                          const lineTotal = itemTotal + itemTaxAmt;

                          return (
                            <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                              <td className="px-4 py-2.5 text-gray-400 font-mono text-[11px] font-medium text-center">
                                {idx + 1}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="font-semibold text-gray-900">{item.productName}</div>
                                {(item as any).sku && (item as any).sku !== '-' && (
                                  <div className="text-[10px] text-gray-500 font-mono">SKU: {(item as any).sku}</div>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-center font-mono text-[11px] text-gray-600">
                                {(item as any).hsn || "0000"}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/80 font-mono">
                                  {itemQty}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-700 font-mono">
                                ₹{itemPrice.toFixed(2)}
                              </td>
                              <td className="px-4 py-2.5 text-center text-gray-600 font-mono">
                                {itemTaxRate}%
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-700 font-mono">
                                ₹{itemTaxAmt.toFixed(2)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-bold text-gray-900 font-mono">
                                ₹{lineTotal.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={8} className="py-6 text-center text-gray-400">
                            No items found in this {isSelectedQuotation ? "quotation" : "bill"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bank Details & Terms & Conditions Side-by-Side (Single Screen Efficiency) */}
              <div className={`grid ${isApprovedBill ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'} gap-3.5`}>
                {/* Editable Bank Details - Hidden if Bill is Approved */}
                {!isApprovedBill && (
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
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
                            <label className="block text-[10px] text-gray-500 mb-0.5">Beneficiary</label>
                            <input
                              type="text"
                              value={editBankDetails.beneficiaryName}
                              onChange={(e) => handleBankDetailChange('beneficiaryName', e.target.value)}
                              className="w-full px-2 py-1 border rounded-lg text-xs bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-0.5">Bank Name</label>
                            <input
                              type="text"
                              value={editBankDetails.bankName}
                              onChange={(e) => handleBankDetailChange('bankName', e.target.value)}
                              className="w-full px-2 py-1 border rounded-lg text-xs bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-0.5">Account No</label>
                            <input
                              type="text"
                              value={editBankDetails.accountNo}
                              onChange={(e) => handleBankDetailChange('accountNo', e.target.value)}
                              className="w-full px-2 py-1 border rounded-lg text-xs bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-0.5">IFSC Code</label>
                            <input
                              type="text"
                              value={editBankDetails.ifscCode}
                              onChange={(e) => handleBankDetailChange('ifscCode', e.target.value)}
                              className="w-full px-2 py-1 border rounded-lg text-xs bg-white"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] text-gray-500 mb-0.5">Branch</label>
                            <input
                              type="text"
                              value={editBankDetails.branch}
                              onChange={(e) => handleBankDetailChange('branch', e.target.value)}
                              className="w-full px-2 py-1 border rounded-lg text-xs bg-white"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1 text-xs text-gray-700">
                          <p><strong className="text-gray-500 font-medium">Beneficiary:</strong> <span className="font-semibold text-gray-900">{editBankDetails.beneficiaryName}</span></p>
                          <p><strong className="text-gray-500 font-medium">Bank:</strong> <span className="font-semibold text-gray-900">{editBankDetails.bankName}</span></p>
                          <p><strong className="text-gray-500 font-medium">Account:</strong> <span className="font-semibold font-mono text-gray-900">{editBankDetails.accountNo}</span></p>
                          <p><strong className="text-gray-500 font-medium">IFSC:</strong> <span className="font-semibold font-mono text-gray-900">{editBankDetails.ifscCode}</span></p>
                          <p><strong className="text-gray-500 font-medium">Branch:</strong> <span className="font-semibold text-gray-900">{editBankDetails.branch}</span></p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Editable Terms & Conditions */}
                <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
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
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {editTerms.map((term, index) => (
                          <div key={term.id} className="flex items-center gap-2">
                            <span className="text-gray-400 font-mono text-xs">{index + 1}.</span>
                            <input
                              type="text"
                              value={term.text}
                              onChange={(e) => handleTermChange(term.id, e.target.value)}
                              className="flex-1 px-2 py-1 border rounded-lg text-xs bg-white"
                            />
                            <button
                              onClick={() => handleRemoveTerm(term.id)}
                              className="text-red-500 hover:text-red-700 p-0.5 cursor-pointer"
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
                            className="flex-1 px-2 py-1 border rounded-lg text-xs bg-white"
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                handleAddTerm();
                              }
                            }}
                          />
                          <button
                            onClick={handleAddTerm}
                            className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition"
                          >
                            + Add
                          </button>
                        </div>
                      </div>
                    ) : (
                      <ul className="list-none space-y-1 text-xs text-gray-700">
                        {editTerms.map((term, index) => (
                          <li key={term.id} className="flex items-start gap-1.5">
                            <span className="text-gray-400 font-mono text-[11px]">{index + 1}.</span>
                            <span className="leading-tight">{term.text}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
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

              {/* Tax Summary & Amount in Words Card */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Amount Chargeable in Words</h4>
                    <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 leading-relaxed">
                      {formatNumberToWords(selectedBill.totalAmount || 0)}
                    </div>
                    <div className="text-[11px] text-gray-500 space-y-0.5 pt-1">
                      <p>• Place of Supply: <strong className="text-gray-700">{selectedBill.placeOfSupply || "Tamil Nadu (33)"}</strong></p>
                      <p>• GST Classification: <strong className="text-gray-700">{selectedBill.taxType === "cgst_sgst" ? "Intrastate (CGST + SGST)" : "Interstate (IGST)"}</strong></p>
                      <p>• Reverse Charge: <strong className="text-gray-700">No</strong></p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">Calculation Breakdown</h4>
                    <div className="space-y-1.5 text-xs bg-white p-3 rounded-xl border border-slate-200">
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
                        <span className="font-semibold text-gray-900 font-mono">₹{taxableVal.toFixed(2)}</span>
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
                      {selectedBill.shippingCharges && selectedBill.shippingCharges > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-medium">Shipping / Courier:</span>
                          <span className="font-semibold text-gray-900 font-mono">₹{selectedBill.shippingCharges.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-200">
                        <span className="text-gray-900">Total Amount:</span>
                        <span className="text-emerald-700 font-mono">₹{selectedBill.totalAmount?.toFixed(2) || "0.00"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Signatory & Authorization Block */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-slate-200/80 pt-4 mt-2 gap-4">
                <div className="text-xs text-gray-500 max-w-sm">
                  Official commercial {isSelectedQuotation ? 'quotation' : 'tax invoice'} issued by <strong className="text-gray-800">Protowiz Private Limited</strong>.<br />
                  This is a computer-generated document &bull; Coimbatore - 641011 &bull; info@ibots.in &bull; +91 80152 98233
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-gray-900">For Protowiz Private Limited</p>
                  {editIncludeSignature && (
                    <div className="flex justify-end my-1.5">
                      <img src={SIGNATURE_URL} alt="Sign & Seal" className="h-11 w-auto object-contain bg-white p-1 border border-slate-200 rounded-lg shadow-2xs" />
                    </div>
                  )}
                  <p className="text-[11px] font-semibold text-gray-600 border-t border-slate-200 pt-1 inline-block min-w-[120px]">Authorised Signatory</p>
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
                  className={`px-4 py-2 text-white rounded-xl shadow-xs font-semibold flex items-center gap-2 text-xs transition cursor-pointer ${
                    isSelectedQuotation ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  <Printer className="w-3.5 h-3.5" />
                  {isSelectedQuotation ? "Print / Download Quotation" : "Print / Download Tax Invoice"}
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
        );
      })()}

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