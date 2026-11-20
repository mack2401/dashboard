import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Pagination from '../components/Pagination';
import KPICard from '../components/KPICard';
import { useItemHighlighter } from '../hooks/useItemHighlighter';
import { 
  Search, 
  Filter, 
  Package, 
  Plus, 
  Edit2, 
  Trash2, 
  Download, 
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Tag,
  IndianRupee,
  Truck,
  Save,
  X,
  ShoppingCart,
  Box,
  ShoppingBag,
  Percent,
  MapPin,
  Users,
  Globe,
  Shield,
  FileSpreadsheet,
  FileText,
  Printer,
  Upload,
  Layers,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  Calendar,
  Image as ImageIcon,
  Bell,
  ClipboardList,
  Check,
  MessageSquare,
  MoreVertical,
  History
} from 'lucide-react';
import { db } from "../firebase";
import { useAuth } from "../App";
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch,
  increment,
  getDocs
} from 'firebase/firestore';
import * as XLSX from 'xlsx-js-style';

// ============ TYPES AND INTERFACES ============
interface StockEntry {
  id?: string;
  type?: 'add' | 'deliver' | 'quote_add' | 'quote_deliver' | string;
  date: Timestamp | Date;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  addedBy: string;
  addedByName: string;
  isDummy?: boolean;
}

interface Product {
  id: string;
  name: string;
  totalQuantity: number;
  totalValue: number;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  createdBy: string;
  createdByName: string;
  category: string;
  sku?: string;
  hsnCode?: string;
  description?: string;
  lowStockThreshold: number;
  stockEntries: StockEntry[];
  currentPrice?: number;
  purchasePrice?: number;
  image?: string; // Base64 image data
  productType?: 'inventory' | 'quote_purpose' | string;
  isQuoteOnly?: boolean;
  deleteRequested?: boolean;
  deleteRequestedBy?: string;
  deleteRequestedByName?: string;
  deleteRequestedAt?: Timestamp;
  enquiryCount?: number;
  approvedBillCount?: number;
  isOldStock?: boolean;
  lastImportedAt?: Timestamp | Date;
}

interface Transaction {
  id: string;
  productId: string;
  productName: string;
  type: 'add' | 'deliver' | 'adjust' | 'delete';
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  price: number;
  totalAmount: number;
  performedBy: string;
  performedByName: string;
  notes?: string;
  createdAt: Timestamp;
}

type SortField = 'name' | 'totalQuantity' | 'currentPrice' | 'purchasePrice' | 'totalValue' | 'category' | 'updatedAt' | 'createdAt' | 'hsnCode';
type SortDirection = 'asc' | 'desc';
type StockFilter = 'all' | 'low' | 'out' | 'normal' | 'old';
type TransactionTypeFilter = 'all' | 'add' | 'deliver' | 'delete';

// ============ HELPER FUNCTIONS ============
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (date: Timestamp | Date | string): string => {
  let d: Date;
  
  if (date instanceof Timestamp) {
    d = date.toDate();
  } else if (date instanceof Date) {
    d = date;
  } else {
    d = new Date(date);
  }
  
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatDateTime = (date: Timestamp | Date | string): string => {
  let d: Date;
  
  if (date instanceof Timestamp) {
    d = date.toDate();
  } else if (date instanceof Date) {
    d = date;
  } else {
    d = new Date(date);
  }
  
  return d.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const validateSKU = (sku: string): boolean => {
  return sku.length >= 3;
};

const getStockStatus = (quantity: number, threshold: number): string => {
  if (quantity === 0) return 'out-of-stock';
  if (quantity <= threshold) return 'low-stock';
  return 'in-stock';
};

const getStockColor = (quantity: number, threshold: number): string => {
  if (quantity === 0) return 'bg-red-100 text-red-800 border-red-200';
  if (quantity <= threshold) return 'bg-orange-100 text-orange-800 border-orange-200';
  return 'bg-green-100 text-green-800 border-green-200';
};

// Image compression helper
const compressImage = (file: File, maxWidth: number = 200, maxHeight: number = 200, quality: number = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

// ============ CALCULATION HELPERS ============
export const calculateCurrentPurchaseValue = (product: Product): number => {
  const stockEntries = product.stockEntries || [];
  if (stockEntries.length === 0) return product.totalQuantity * (product.currentPrice || 0);
  
  const totalAddedQty = stockEntries.reduce((q, e) => q + (e.quantity || 0), 0);
  const totalAddedCost = stockEntries.reduce((c, e) => c + (e.totalPrice || 0), 0);
  
  if (totalAddedQty === 0) return 0;
  
  const avgUnitCost = totalAddedCost / totalAddedQty;
  return product.totalQuantity * avgUnitCost;
};

export const calculateOriginalPurchaseValue = (product: Product): number => {
  const stockEntries = product.stockEntries || [];
  if (stockEntries.length === 0) {
    const unitCost = product.currentPrice || getProductPurchasePrice(product) || 0;
    return product.totalQuantity * unitCost;
  }
  
  const totalAddedCost = stockEntries
    .filter(e => e.type !== 'deliver')
    .reduce((c, e) => c + (e.totalPrice || ((e.quantity || 0) * (e.unitPrice || 0))), 0);
    
  if (totalAddedCost === 0) {
    const unitCost = product.currentPrice || getProductPurchasePrice(product) || 0;
    return product.totalQuantity * unitCost;
  }
  return totalAddedCost;
};

export const calculateOriginalQuantity = (product: Product): number => {
  const stockEntries = product.stockEntries || [];
  if (stockEntries.length === 0) return product.totalQuantity;
  const totalAdded = stockEntries.filter(e => e.type !== 'deliver').reduce((q, e) => q + (e.quantity || 0), 0);
  return totalAdded > 0 ? totalAdded : product.totalQuantity;
};

export const calculateDispatchedQuantity = (product: Product): number => {
  const stockEntries = product.stockEntries || [];
  return stockEntries.filter(e => e.type === 'deliver').reduce((q, e) => q + (e.quantity || 0), 0);
};

export const getProductPurchasePrice = (product: Product): number => {
  if (product.purchasePrice !== undefined && product.purchasePrice !== null && !isNaN(product.purchasePrice)) {
    return product.purchasePrice;
  }
  const stockEntries = product.stockEntries || [];
  const addEntries = stockEntries.filter(e => e.type !== 'deliver');
  if (addEntries.length > 0) {
    const totalCost = addEntries.reduce((sum, e) => sum + (e.totalPrice || ((e.quantity || 0) * (e.unitPrice || 0))), 0);
    const totalQty = addEntries.reduce((sum, e) => sum + (e.quantity || 0), 0);
    if (totalQty > 0) return totalCost / totalQty;
    if (addEntries[0].unitPrice !== undefined) return addEntries[0].unitPrice;
  }
  return product.currentPrice || 0;
};

// ============ MAIN COMPONENT ============
const InventoryManagement: React.FC = () => {
  const { user } = useAuth();
  
  // ============ STATES ============
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStock, setFilterStock] = useState<StockFilter>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddStockModalOpen, setIsAddStockModalOpen] = useState(false);
  const [stockFormData, setStockFormData] = useState({
    productId: '',
    quantity: 1,
    unitPrice: 0,
    vendorNotes: '',
    date: new Date().toISOString().slice(0, 10),
  });
  const [stockProductSearch, setStockProductSearch] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [activeDropdownProductId, setActiveDropdownProductId] = useState<string | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedDetailsProduct, setSelectedDetailsProduct] = useState<Product | null>(null);
  const [showStockHistoryInModal, setShowStockHistoryInModal] = useState(false);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [categories, setCategories] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importExcelInputRef = useRef<HTMLInputElement>(null);
  const [importSummary, setImportSummary] = useState<{
    fileName: string;
    totalRows: number;
    availableSheets?: { name: string; count: number }[];
    selectedSheet?: string;
    sheetDataMap?: Record<string, {
      totalRows: number;
      matchedProducts: { product: Product; newSOH: number; newPurchasePrice?: number; newSellingPrice?: number; rowData: any }[];
      newProducts: any[];
      missedProducts: Product[];
    }>;
    matchedProducts: { product: Product; newSOH: number; newPurchasePrice?: number; newSellingPrice?: number; rowData: any }[];
    newProducts: any[];
    missedProducts: Product[];
  } | null>(null);

  const handleSelectImportSheet = (sheetName: string) => {
    if (!importSummary || !importSummary.sheetDataMap) return;
    const target = importSummary.sheetDataMap[sheetName];
    if (!target) return;
    setImportSummary({
      ...importSummary,
      selectedSheet: sheetName,
      totalRows: target.totalRows,
      matchedProducts: target.matchedProducts,
      newProducts: target.newProducts,
      missedProducts: target.missedProducts,
    });
  };
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [isDeletingTransactions, setIsDeletingTransactions] = useState(false);
  const [transactionFilter, setTransactionFilter] = useState<TransactionTypeFilter>('all');
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  // Delete Request States
  const [isDeleteRequestsModalOpen, setIsDeleteRequestsModalOpen] = useState(false);
  const [isDeleteRequestConfirmOpen, setIsDeleteRequestConfirmOpen] = useState(false);
  const [productToRequestDelete, setProductToRequestDelete] = useState<Product | null>(null);

  const [activeTab, setActiveTab] = useState<'all' | 'fast-moving'>('all');

  // Fast Moving Components States
  const [bills, setBills] = useState<any[]>([]);
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [fastMovingPeriod, setFastMovingPeriod] = useState<'today' | 'yesterday' | 'past7' | 'past30' | 'all'>('today');
  const [fastMovingCustomDate, setFastMovingCustomDate] = useState<string>('');
  const [fastMovingSearch, setFastMovingSearch] = useState<string>('');
  const [fastMovingFilterLowStock, setFastMovingFilterLowStock] = useState<boolean>(false);

  const [employees, setEmployees] = useState<any[]>([]);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

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

  // Handle deep-linking navigation: reset conflicting filters and ensure page switches to targeted product
  useEffect(() => {
    if (!highlightId && !targetSearch) return;

    setActiveTab('all');

    if (products.length > 0) {
      const targetProduct = highlightId
        ? products.find((p) => p.id === highlightId)
        : targetSearch
        ? products.find((p) =>
            p.name.toLowerCase().includes(targetSearch.toLowerCase()) ||
            (p.sku && p.sku.toLowerCase().includes(targetSearch.toLowerCase()))
          )
        : null;

      if (targetProduct) {
        setFilterStock('all');
        setFilterCategory('all');
        if (
          searchTerm &&
          !targetProduct.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
          (!targetProduct.sku || !targetProduct.sku.toLowerCase().includes(searchTerm.toLowerCase()))
        ) {
          setSearchTerm('');
        }
      }
    }
  }, [highlightId, targetSearch, products]);

  // Transactions Pagination State
  const [transactionPage, setTransactionPage] = useState(1);
  const transactionItemsPerPage = 10;

  // Fast Moving Pagination States
  const [approvedFastMovingPage, setApprovedFastMovingPage] = useState(1);
  const [enquiryFastMovingPage, setEnquiryFastMovingPage] = useState(1);
  const fastMovingItemsPerPage = 6;

  useEffect(() => {
    setApprovedFastMovingPage(1);
    setEnquiryFastMovingPage(1);
  }, [fastMovingPeriod, fastMovingCustomDate, fastMovingSearch, fastMovingFilterLowStock]);

  useEffect(() => {
    setTransactionPage(1);
  }, [transactionFilter]);

  // Form states
  const [newProduct, setNewProduct] = useState({
    name: '',
    quantity: 0,
    price: 0,
    category: '',
    sku: '',
    hsnCode: '',
    description: '',
    lowStockThreshold: 10,
    image: '',
  });

  const [editForm, setEditForm] = useState<Partial<Product> & { newQuantity?: number }>({});
  const [transactionForm, setTransactionForm] = useState({
    type: 'add' as 'add' | 'deliver' | 'adjust',
    quantity: 0,
    price: 0,
    notes: '',
    deductFromInventory: true,
  });

  // File input refs
  const addImageInputRef = useRef<HTMLInputElement>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);

  // ============ FIREBASE SUBSCRIPTIONS ============
  useEffect(() => {
    if (!user) return;

    setLoading(true);

    // Subscribe to products collection
    const productsQuery = query(
      collection(db, 'products'),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribeProducts = onSnapshot(productsQuery, 
      (snapshot) => {
        const productsData: Product[] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            stockEntries: data.stockEntries || [],
            currentPrice: data.currentPrice !== undefined ? data.currentPrice : (data.stockEntries && data.stockEntries.length > 0 
              ? data.stockEntries[data.stockEntries.length - 1].unitPrice 
              : data.price || 0),
            purchasePrice: data.purchasePrice !== undefined ? data.purchasePrice : undefined,
            isOldStock: data.isOldStock === true,
            lastImportedAt: data.lastImportedAt || undefined,
          } as Product;
        });
        
        setProducts(productsData);
        
        // Extract unique categories
        const uniqueCategories = Array.from(
          new Set(productsData.map(p => p.category).filter(Boolean))
        );
        setCategories(uniqueCategories);
        
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching products:', error);
        setLoading(false);
      }
    );

    // Subscribe to all transactions (not filtered by user)
    const transactionsQuery = query(
      collection(db, 'transactions'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeTransactions = onSnapshot(transactionsQuery,
      (snapshot) => {
        const transactionsData: Transaction[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Transaction));
        setTransactions(transactionsData);
      }
    );

    // Subscribe to employees collection for resolving staff names
    const unsubscribeEmployees = onSnapshot(
      collection(db, 'employees'),
      (snapshot) => {
        const employeesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setEmployees(employeesData);
      },
      (error) => {
        console.error('Error fetching employees:', error);
      }
    );

    // Subscribe to bills collection for fast moving components
    const billsQuery = query(
      collection(db, 'bills'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeBills = onSnapshot(
      billsQuery,
      (snapshot) => {
        const billsData: any[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setBills(billsData);
      },
      (error) => {
        console.error('Error fetching bills for inventory:', error);
      }
    );

    // Subscribe to enquiries collection for fast moving components
    const enquiriesQuery = query(
      collection(db, 'enquiries'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeEnquiries = onSnapshot(
      enquiriesQuery,
      (snapshot) => {
        const enquiriesData: any[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setEnquiries(enquiriesData);
      },
      (error) => {
        console.error('Error fetching enquiries for inventory:', error);
      }
    );

    return () => {
      unsubscribeProducts();
      unsubscribeTransactions();
      unsubscribeEmployees();
      unsubscribeBills();
      unsubscribeEnquiries();
    };
  }, [user]);

  // ============ USER / EMPLOYEE NAME RESOLVER ============
  const employeeMap = useMemo(() => {
    const map: Record<string, string> = {};
    employees.forEach((emp: any) => {
      const name = emp.employeeName || emp.name || emp.displayName;
      if (name) {
        if (emp.id) map[emp.id.toLowerCase()] = name;
        if (emp.uid) map[emp.uid.toLowerCase()] = name;
        if (emp.email) map[emp.email.toLowerCase()] = name;
        if (emp.employeeId) map[emp.employeeId.toLowerCase()] = name;
      }
    });
    return map;
  }, [employees]);

  const formatFallbackName = (emailOrUsername: string): string => {
    const part = emailOrUsername.split('@')[0];
    const cleaned = part.replace(/[0-9]/g, '').replace(/[._-]+/g, ' ').trim();
    if (!cleaned) return part;
    return cleaned
      .split(' ')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const resolveUserName = (nameOrEmail?: string, userId?: string): string => {
    if (!nameOrEmail && !userId) return '-';

    if (nameOrEmail) {
      const key = nameOrEmail.trim().toLowerCase();
      if (employeeMap[key]) return employeeMap[key];
    }
    if (userId) {
      const key = userId.trim().toLowerCase();
      if (employeeMap[key]) return employeeMap[key];
    }

    if (nameOrEmail && !nameOrEmail.includes('@') && nameOrEmail.trim() !== '') {
      return nameOrEmail;
    }

    const emailToParse = (nameOrEmail && nameOrEmail.includes('@')) 
      ? nameOrEmail 
      : (userId && userId.includes('@') ? userId : null);

    if (emailToParse) {
      return formatFallbackName(emailToParse);
    }

    return nameOrEmail || userId || '-';
  };

  // ============ FAST MOVING COMPONENTS LOGIC ============
  interface FastMovingComponentItem {
    name: string;
    sku: string;
    category: string;
    quantity: number;
    totalValue: number;
    count: number;
    currentSOH: number | null;
    lowStockThreshold: number;
    isLowStock: boolean;
  }

  const parseFastMovingDate = (val: any): Date | null => {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    if (val.seconds) return new Date(val.seconds * 1000);
    if (val instanceof Date) return val;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const matchesFastMovingPeriod = (
    dateVal: any,
    period: 'today' | 'yesterday' | 'past7' | 'past30' | 'all',
    customDate?: string
  ): boolean => {
    const d = parseFastMovingDate(dateVal);
    if (!d) return period === 'all';
    const now = new Date();

    if (customDate) {
      const target = new Date(customDate);
      return (
        d.getDate() === target.getDate() &&
        d.getMonth() === target.getMonth() &&
        d.getFullYear() === target.getFullYear()
      );
    }

    if (period === 'today') {
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    }

    if (period === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      return (
        d.getDate() === y.getDate() &&
        d.getMonth() === y.getMonth() &&
        d.getFullYear() === y.getFullYear()
      );
    }

    if (period === 'past7') {
      const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      return d >= cutoff && d <= now;
    }

    if (period === 'past30') {
      const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
      return d >= cutoff && d <= now;
    }

    return true; // 'all'
  };

  const extractFastMovingBillItems = (bill: any) => {
    let raw = bill.items || bill.materials;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = [];
      }
    }
    if (!Array.isArray(raw)) return [];
    return raw.map((item: any) => {
      const name = (item.productName || item.name || item.componentName || 'Component').trim();
      let qty = 1;
      if (typeof item.quantity === 'number') qty = item.quantity;
      else if (item.quantity) {
        const match = String(item.quantity).match(/\d+/);
        qty = match ? parseInt(match[0], 10) : 1;
      } else if (typeof item.qty === 'number') qty = item.qty;
      const price = Number(item.price) || 0;
      const total = Number(item.total || item.totalAmount) || (price * qty);
      return { name, quantity: qty > 0 ? qty : 1, total: total > 0 ? total : 0, sku: item.sku || '' };
    });
  };

  const extractFastMovingEnquiryMaterials = (enquiry: any) => {
    let raw = enquiry.materials || enquiry.items || enquiry.products;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = [];
      }
    }
    if (!Array.isArray(raw)) return [];
    return raw.map((item: any) => {
      const name = (item.productName || item.name || item.materialName || 'Component').trim();
      let qty = 1;
      if (typeof item.quantity === 'number') qty = item.quantity;
      else if (item.quantity) {
        const match = String(item.quantity).match(/\d+/);
        qty = match ? parseInt(match[0], 10) : 1;
      } else if (typeof item.qty === 'number') qty = item.qty;
      const price = Number(item.price || item.unitPrice) || 0;
      const total = Number(item.totalAmount || item.total) || (price * qty);
      return { name, quantity: qty > 0 ? qty : 1, total: total > 0 ? total : 0, sku: item.sku || '' };
    });
  };

  const productLookup = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => {
      if (p.name) map.set(p.name.trim().toLowerCase(), p);
      if (p.sku) map.set(p.sku.trim().toLowerCase(), p);
    });
    return map;
  }, [products]);

  const approvedFastMovingItems = useMemo(() => {
    const map: Record<string, FastMovingComponentItem> = {};

    bills.forEach((bill) => {
      const dateVal = bill.billDate || bill.createdAt;
      if (!matchesFastMovingPeriod(dateVal, fastMovingPeriod, fastMovingCustomDate)) return;

      const items = extractFastMovingBillItems(bill);
      items.forEach((item) => {
        const key = item.name.toLowerCase();
        if (!map[key]) {
          const matched = productLookup.get(key) || (item.sku ? productLookup.get(item.sku.toLowerCase()) : undefined);
          map[key] = {
            name: matched ? matched.name : item.name,
            sku: matched?.sku || item.sku || '-',
            category: matched?.category || 'General',
            quantity: 0,
            totalValue: 0,
            count: 0,
            currentSOH: matched ? matched.totalQuantity : null,
            lowStockThreshold: matched?.lowStockThreshold || 10,
            isLowStock: matched ? matched.totalQuantity <= (matched.lowStockThreshold || 10) : false,
          };
        }
        map[key].quantity += item.quantity;
        map[key].totalValue += item.total;
        map[key].count += 1;
      });
    });

    transactions.forEach((tx) => {
      if (tx.type !== 'deliver') return;
      if (!matchesFastMovingPeriod(tx.createdAt, fastMovingPeriod, fastMovingCustomDate)) return;

      const key = (tx.productName || '').trim().toLowerCase();
      if (!key) return;

      if (!map[key]) {
        const matched = productLookup.get(key) || (tx.productId ? products.find(p => p.id === tx.productId) : undefined);
        map[key] = {
          name: matched ? matched.name : tx.productName,
          sku: matched?.sku || '-',
          category: matched?.category || 'General',
          quantity: 0,
          totalValue: 0,
          count: 0,
          currentSOH: matched ? matched.totalQuantity : null,
          lowStockThreshold: matched?.lowStockThreshold || 10,
          isLowStock: matched ? matched.totalQuantity <= (matched.lowStockThreshold || 10) : false,
        };
      }
      if (map[key].count === 0) {
        map[key].quantity += Number(tx.quantity) || 0;
        map[key].totalValue += Number(tx.totalAmount) || 0;
        map[key].count += 1;
      }
    });

    return Object.values(map).sort((a, b) => b.quantity - a.quantity);
  }, [bills, transactions, fastMovingPeriod, fastMovingCustomDate, productLookup, products]);

  const enquiryFastMovingItems = useMemo(() => {
    const map: Record<string, FastMovingComponentItem> = {};

    enquiries.forEach((enq) => {
      const dateVal = enq.createdAt || enq.date;
      if (!matchesFastMovingPeriod(dateVal, fastMovingPeriod, fastMovingCustomDate)) return;

      const items = extractFastMovingEnquiryMaterials(enq);
      items.forEach((item) => {
        const key = item.name.toLowerCase();
        if (!map[key]) {
          const matched = productLookup.get(key) || (item.sku ? productLookup.get(item.sku.toLowerCase()) : undefined);
          map[key] = {
            name: matched ? matched.name : item.name,
            sku: matched?.sku || item.sku || '-',
            category: matched?.category || 'General',
            quantity: 0,
            totalValue: 0,
            count: 0,
            currentSOH: matched ? matched.totalQuantity : null,
            lowStockThreshold: matched?.lowStockThreshold || 10,
            isLowStock: matched ? matched.totalQuantity <= (matched.lowStockThreshold || 10) : false,
          };
        }
        map[key].quantity += item.quantity;
        map[key].totalValue += item.total;
        map[key].count += 1;
      });
    });

    return Object.values(map).sort((a, b) => b.quantity - a.quantity);
  }, [enquiries, fastMovingPeriod, fastMovingCustomDate, productLookup]);

  const filteredApprovedFastMoving = useMemo(() => {
    let list = approvedFastMovingItems;
    if (fastMovingFilterLowStock) {
      list = list.filter((item) => item.isLowStock);
    }
    if (!fastMovingSearch.trim()) return list;
    const q = fastMovingSearch.toLowerCase();
    return list.filter(
      (item) => item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q)
    );
  }, [approvedFastMovingItems, fastMovingSearch, fastMovingFilterLowStock]);

  const filteredEnquiryFastMoving = useMemo(() => {
    let list = enquiryFastMovingItems;
    if (fastMovingFilterLowStock) {
      list = list.filter((item) => item.isLowStock);
    }
    if (!fastMovingSearch.trim()) return list;
    const q = fastMovingSearch.toLowerCase();
    return list.filter(
      (item) => item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q)
    );
  }, [enquiryFastMovingItems, fastMovingSearch, fastMovingFilterLowStock]);

  const lowStockFastMovingCount = useMemo(() => {
    const set = new Set<string>();
    approvedFastMovingItems.forEach((i) => {
      if (i.isLowStock) set.add(i.name.toLowerCase());
    });
    enquiryFastMovingItems.forEach((i) => {
      if (i.isLowStock) set.add(i.name.toLowerCase());
    });
    return set.size;
  }, [approvedFastMovingItems, enquiryFastMovingItems]);

  // ============ FILTERED TRANSACTIONS ============
  const filteredTransactions = useMemo(() => {
    let filtered = transactions;
    
    if (transactionFilter !== 'all') {
      filtered = filtered.filter(t => t.type === transactionFilter);
    }
    
    return filtered;
  }, [transactions, transactionFilter]);

  // Transactions Pagination Calculations
  const totalTxPages = Math.max(1, Math.ceil(filteredTransactions.length / transactionItemsPerPage));
  const txStartIndex = (transactionPage - 1) * transactionItemsPerPage;
  const txEndIndex = Math.min(txStartIndex + transactionItemsPerPage, filteredTransactions.length);
  const currentTransactions = useMemo(() => {
    return filteredTransactions.slice(txStartIndex, txEndIndex);
  }, [filteredTransactions, txStartIndex, txEndIndex]);

  // Fast Moving Pagination Calculations
  const totalApprovedFmPages = Math.max(1, Math.ceil(filteredApprovedFastMoving.length / fastMovingItemsPerPage));
  const approvedFmStartIndex = (approvedFastMovingPage - 1) * fastMovingItemsPerPage;
  const approvedFmEndIndex = Math.min(approvedFmStartIndex + fastMovingItemsPerPage, filteredApprovedFastMoving.length);
  const currentApprovedFastMoving = useMemo(() => {
    return filteredApprovedFastMoving.slice(approvedFmStartIndex, approvedFmEndIndex);
  }, [filteredApprovedFastMoving, approvedFmStartIndex, approvedFmEndIndex]);

  const totalEnquiryFmPages = Math.max(1, Math.ceil(filteredEnquiryFastMoving.length / fastMovingItemsPerPage));
  const enquiryFmStartIndex = (enquiryFastMovingPage - 1) * fastMovingItemsPerPage;
  const enquiryFmEndIndex = Math.min(enquiryFmStartIndex + fastMovingItemsPerPage, filteredEnquiryFastMoving.length);
  const currentEnquiryFastMoving = useMemo(() => {
    return filteredEnquiryFastMoving.slice(enquiryFmStartIndex, enquiryFmEndIndex);
  }, [filteredEnquiryFastMoving, enquiryFmStartIndex, enquiryFmEndIndex]);

  // ============ IMAGE HANDLERS ============
  const handleAddImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Image size should be less than 2MB');
      return;
    }

    setImageUploading(true);
    try {
      const compressedImage = await compressImage(file, 200, 200, 0.7);
      setNewProduct({...newProduct, image: compressedImage});
    } catch (error) {
      console.error('Error compressing image:', error);
      alert('Failed to process image');
    } finally {
      setImageUploading(false);
      if (addImageInputRef.current) {
        addImageInputRef.current.value = '';
      }
    }
  };

  const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Image size should be less than 2MB');
      return;
    }

    setImageUploading(true);
    try {
      const compressedImage = await compressImage(file, 200, 200, 0.7);
      setEditForm({...editForm, image: compressedImage});
    } catch (error) {
      console.error('Error compressing image:', error);
      alert('Failed to process image');
    } finally {
      setImageUploading(false);
      if (editImageInputRef.current) {
        editImageInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAddImage = () => {
    setNewProduct({...newProduct, image: ''});
    if (addImageInputRef.current) {
      addImageInputRef.current.value = '';
    }
  };

  const handleRemoveEditImage = () => {
    setEditForm({...editForm, image: ''});
    if (editImageInputRef.current) {
      editImageInputRef.current.value = '';
    }
  };

  // ============ HANDLERS ============
  const handleAddProduct = async (mode: 'inventory' | 'quote_purpose' = 'inventory') => {
    if (!newProduct.name || !newProduct.category || newProduct.price === undefined || newProduct.price === null) {
      alert('Please fill all required fields (Name, Category, Price)');
      return;
    }

    if (!newProduct.sku) {
      alert('Please enter a SKU for the product');
      return;
    }

    const existingProductWithSKU = products.find(
      p => p.sku && p.sku.toLowerCase() === newProduct.sku.toLowerCase()
    );

    if (existingProductWithSKU) {
      alert(`A product with SKU "${newProduct.sku}" already exists. Please use a unique SKU.`);
      return;
    }

    const isQuoteOnly = mode === 'quote_purpose';
    const productType = isQuoteOnly ? 'quote_purpose' : 'inventory';
    const initialQty = isQuoteOnly ? 0 : (newProduct.quantity || 0);
    const initialTotalValue = isQuoteOnly ? 0 : (initialQty * newProduct.price);

    try {
      const existingProduct = products.find(
        p => p.name.toLowerCase() === newProduct.name.toLowerCase() && 
             p.category.toLowerCase() === newProduct.category.toLowerCase()
      );

      if (existingProduct) {
        const productRef = doc(db, 'products', existingProduct.id);
        const newQuantity = existingProduct.totalQuantity + initialQty;
        const newStockEntry: StockEntry = {
          date: Timestamp.now(),
          quantity: initialQty,
          unitPrice: newProduct.price,
          totalPrice: initialTotalValue,
          addedBy: user.uid,
          addedByName: user.name || user.email,
          type: isQuoteOnly ? 'quote_add' : 'add',
          isDummy: isQuoteOnly,
        };

        const updatedStockEntries = [...(existingProduct.stockEntries || []), newStockEntry];
        const newTotalValue = isQuoteOnly 
          ? existingProduct.totalValue 
          : updatedStockEntries.filter(e => !e.isDummy).reduce((sum, entry) => sum + (entry.totalPrice || 0), 0);

        await updateDoc(productRef, {
          totalQuantity: newQuantity,
          totalValue: newTotalValue,
          stockEntries: updatedStockEntries,
          currentPrice: newProduct.price,
          updatedAt: serverTimestamp(),
          ...(newProduct.image && { image: newProduct.image }),
        });

        if (initialQty > 0) {
          await addDoc(collection(db, 'transactions'), {
            productId: existingProduct.id,
            productName: existingProduct.name,
            type: isQuoteOnly ? 'adjust' : 'add',
            quantity: initialQty,
            previousQuantity: existingProduct.totalQuantity,
            newQuantity: newQuantity,
            price: newProduct.price,
            totalAmount: initialTotalValue,
            performedBy: user.uid,
            performedByName: user.name || user.email,
            notes: isQuoteOnly ? '[Quote Purpose] Added quote stock' : (newProduct.description || `Added ${initialQty} units`),
            createdAt: serverTimestamp(),
          });
        }

        alert(isQuoteOnly ? `Recorded quote item: ${existingProduct.name}` : `Added stock to existing product: ${existingProduct.name}`);
      } else {
        const initialStockEntry: StockEntry = {
          date: Timestamp.now(),
          quantity: initialQty,
          unitPrice: newProduct.price,
          totalPrice: initialTotalValue,
          addedBy: user.uid,
          addedByName: user.name || user.email,
          type: isQuoteOnly ? 'quote_add' : 'add',
          isDummy: isQuoteOnly,
        };

        const productData = {
          name: newProduct.name,
          totalQuantity: initialQty,
          totalValue: initialTotalValue,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user.uid,
          createdByName: user.name || user.email,
          category: newProduct.category,
          sku: newProduct.sku.trim(),
          hsnCode: newProduct.hsnCode || '',
          description: newProduct.description || '',
          lowStockThreshold: newProduct.lowStockThreshold,
          stockEntries: [initialStockEntry],
          currentPrice: newProduct.price,
          image: newProduct.image || '',
          productType: productType,
          isQuoteOnly: isQuoteOnly,
        };

        const docRef = await addDoc(collection(db, 'products'), productData);

        if (initialQty > 0) {
          await addDoc(collection(db, 'transactions'), {
            productId: docRef.id,
            productName: newProduct.name,
            type: isQuoteOnly ? 'adjust' : 'add',
            quantity: initialQty,
            previousQuantity: 0,
            newQuantity: initialQty,
            price: newProduct.price,
            totalAmount: initialTotalValue,
            performedBy: user.uid,
            performedByName: user.name || user.email,
            notes: isQuoteOnly ? '[Quote Item] Created for quote purpose' : (newProduct.description || 'Initial stock'),
            createdAt: serverTimestamp(),
          });
        }

        alert(isQuoteOnly ? `Successfully created Quote Purpose Product: ${newProduct.name}` : `Successfully created New Product: ${newProduct.name}`);
      }

      setNewProduct({
        name: '',
        quantity: 0,
        price: 0,
        category: '',
        sku: '',
        hsnCode: '',
        description: '',
        lowStockThreshold: 10,
        image: '',
      });
      setIsAddModalOpen(false);
      
    } catch (error) {
      console.error('Error adding product:', error);
      alert('Failed to add product');
    }
  };

  const handleSaveAddStock = async (mode: 'standard' | 'quote_purpose' = 'standard') => {
    if (!stockFormData.productId) {
      alert('Please select a product.');
      return;
    }
    if (!stockFormData.quantity || stockFormData.quantity <= 0) {
      alert('Please enter a valid quantity greater than 0.');
      return;
    }

    const targetProduct = products.find(p => p.id === stockFormData.productId);
    if (!targetProduct) {
      alert('Product not found.');
      return;
    }

    const isQuotePurpose = mode === 'quote_purpose';

    try {
      const productRef = doc(db, 'products', targetProduct.id);
      const addedQty = Number(stockFormData.quantity);
      const unitPrice = Number(stockFormData.unitPrice) || targetProduct.currentPrice || 0;
      
      // For quote purpose, do NOT change on-shelf physical quantity
      const newQuantity = isQuotePurpose ? targetProduct.totalQuantity : (targetProduct.totalQuantity + addedQty);

      const newStockEntry: StockEntry = {
        date: Timestamp.fromDate(stockFormData.date ? new Date(stockFormData.date) : new Date()),
        quantity: addedQty,
        unitPrice: unitPrice,
        totalPrice: addedQty * unitPrice,
        addedBy: user.uid,
        addedByName: user.name || user.email,
        type: isQuotePurpose ? 'quote_add' : 'add',
        isDummy: isQuotePurpose,
      };

      const updatedStockEntries = [...(targetProduct.stockEntries || []), newStockEntry];
      const newTotalValue = isQuotePurpose 
        ? targetProduct.totalValue 
        : updatedStockEntries.filter(e => !e.isDummy).reduce((sum, entry) => sum + (entry.totalPrice || 0), 0);

      await updateDoc(productRef, {
        totalQuantity: newQuantity,
        totalValue: newTotalValue,
        stockEntries: updatedStockEntries,
        currentPrice: unitPrice > 0 ? unitPrice : targetProduct.currentPrice,
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'transactions'), {
        productId: targetProduct.id,
        productName: targetProduct.name,
        type: isQuotePurpose ? 'adjust' : 'add',
        quantity: addedQty,
        previousQuantity: targetProduct.totalQuantity,
        newQuantity: newQuantity,
        price: unitPrice,
        totalAmount: addedQty * unitPrice,
        performedBy: user.uid,
        performedByName: user.name || user.email,
        notes: isQuotePurpose
          ? (stockFormData.vendorNotes ? `[Quote Purpose] ${stockFormData.vendorNotes}` : `Quote purpose stock allocation: ${addedQty} units`)
          : (stockFormData.vendorNotes || `Restocked ${addedQty} units`),
        createdAt: serverTimestamp(),
      });

      alert(isQuotePurpose 
        ? `Successfully logged ${addedQty} units for Quote Purpose!` 
        : `Successfully added ${addedQty} units to ${targetProduct.name}!`
      );

      setIsAddStockModalOpen(false);
      setStockFormData({
        productId: '',
        quantity: 1,
        unitPrice: 0,
        vendorNotes: '',
        date: new Date().toISOString().slice(0, 10),
      });
      setStockProductSearch('');

    } catch (error) {
      console.error('Error saving stock:', error);
      alert('Failed to save stock update.');
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    try {
      const productRef = doc(db, 'products', selectedProduct.id);
      
      const updateData: any = {
        name: editForm.name || selectedProduct.name,
        category: editForm.category || selectedProduct.category,
        sku: editForm.sku !== undefined ? editForm.sku : selectedProduct.sku,
        hsnCode: editForm.hsnCode !== undefined ? editForm.hsnCode : selectedProduct.hsnCode,
        description: editForm.description !== undefined ? editForm.description : selectedProduct.description,
        lowStockThreshold: editForm.lowStockThreshold || selectedProduct.lowStockThreshold,
        updatedAt: serverTimestamp(),
      };

      // Handle image update
      if (editForm.image !== undefined) {
        updateData.image = editForm.image;
      }

      if (editForm.sku && editForm.sku !== selectedProduct.sku) {
        const checkSku = editForm.sku.toLowerCase();
        const existingProductWithSku = products.find(
          p => p.id !== selectedProduct.id && p.sku && p.sku.toLowerCase() === checkSku
        );
        if (existingProductWithSku) {
          alert(`Another product with SKU "${editForm.sku}" already exists. Please use a unique SKU.`);
          return;
        }
      }

      if (editForm.newQuantity !== undefined && editForm.newQuantity !== selectedProduct.totalQuantity) {
        const quantityDifference = editForm.newQuantity - selectedProduct.totalQuantity;
        
        if (editForm.newQuantity < 0) {
          alert('Quantity cannot be negative');
          return;
        }

        updateData.totalQuantity = editForm.newQuantity;
        
        await addDoc(collection(db, 'transactions'), {
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          type: 'adjust',
          quantity: Math.abs(quantityDifference),
          previousQuantity: selectedProduct.totalQuantity,
          newQuantity: editForm.newQuantity,
          price: selectedProduct.currentPrice || 0,
          totalAmount: Math.abs(quantityDifference) * (selectedProduct.currentPrice || 0),
          performedBy: user.uid,
          performedByName: user.name || user.email,
          notes: editForm.description || `Quantity adjusted from ${selectedProduct.totalQuantity} to ${editForm.newQuantity}`,
          createdAt: serverTimestamp(),
        });
      }

      await updateDoc(productRef, updateData);
      setIsEditModalOpen(false);
      setSelectedProduct(null);
      setEditForm({});
      
    } catch (error) {
      console.error('Error updating product:', error);
      alert('Failed to update product');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      const productRef = doc(db, 'products', productId);
      const product = products.find(p => p.id === productId);
      
      if (product) {
        await addDoc(collection(db, 'transactions'), {
          productId: productId,
          productName: product.name,
          type: 'delete',
          quantity: product.totalQuantity,
          previousQuantity: product.totalQuantity,
          newQuantity: 0,
          price: product.currentPrice || 0,
          totalAmount: product.totalValue,
          performedBy: user.uid,
          performedByName: user.name || user.email,
          notes: 'Product deleted from inventory',
          createdAt: serverTimestamp(),
        });
      }
      
      await deleteDoc(productRef);
      setIsDeleteConfirmOpen(false);
      setProductToDelete(null);
      
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product');
    }
  };

  const handleRequestDelete = async (productId: string) => {
    try {
      const productRef = doc(db, 'products', productId);
      
      await updateDoc(productRef, {
        deleteRequested: true,
        deleteRequestedBy: user.uid,
        deleteRequestedByName: user.name || user.email,
        deleteRequestedAt: serverTimestamp()
      });
      
      setIsDeleteRequestConfirmOpen(false);
      setProductToRequestDelete(null);
      alert('Delete request submitted to administrator.');
    } catch (error) {
      console.error('Error submitting delete request:', error);
      alert('Failed to submit delete request');
    }
  };

  const handleApproveDelete = async (product: Product) => {
    try {
      // 1. Delete the product
      const productRef = doc(db, 'products', product.id);
      
      // Record deletion transaction
      await addDoc(collection(db, 'transactions'), {
        productId: product.id,
        productName: product.name,
        type: 'delete',
        quantity: product.totalQuantity,
        previousQuantity: product.totalQuantity,
        newQuantity: 0,
        price: product.currentPrice || 0,
        totalAmount: product.totalValue,
        performedBy: user.uid,
        performedByName: user.name || user.email,
        notes: `Product deleted from inventory (Requested by ${product.deleteRequestedByName})`,
        createdAt: serverTimestamp(),
      });
      
      await deleteDoc(productRef);
      
    } catch (error) {
      console.error('Error approving delete request:', error);
      alert('Failed to approve delete request');
    }
  };

  const handleRejectDelete = async (productId: string) => {
    try {
      const productRef = doc(db, 'products', productId);
      await updateDoc(productRef, { 
        deleteRequested: false
      });
    } catch (error) {
      console.error('Error rejecting delete request:', error);
      alert('Failed to reject delete request');
    }
  };

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    try {
      const productRef = doc(db, 'products', selectedProduct.id);
      let newQuantity = selectedProduct.totalQuantity;
      let newStockEntry: StockEntry | null = null;
      let transactionNotes = transactionForm.notes || "";
      
      if (transactionForm.type === 'add') {
        newQuantity = selectedProduct.totalQuantity + transactionForm.quantity;
        newStockEntry = {
          type: 'add',
          date: Timestamp.now(),
          quantity: transactionForm.quantity,
          unitPrice: transactionForm.price || selectedProduct.currentPrice || 0,
          totalPrice: transactionForm.quantity * (transactionForm.price || selectedProduct.currentPrice || 0),
          addedBy: user.uid,
          addedByName: user.name || user.email || 'User',
        };
      } else if (transactionForm.type === 'deliver') {
        if (transactionForm.deductFromInventory) {
          if (selectedProduct.totalQuantity < transactionForm.quantity) {
            alert('Cannot deliver more than available quantity');
            return;
          }
          newQuantity = selectedProduct.totalQuantity - transactionForm.quantity;
          newStockEntry = {
            type: 'deliver',
            date: Timestamp.now(),
            quantity: transactionForm.quantity,
            unitPrice: selectedProduct.currentPrice || 0,
            totalPrice: transactionForm.quantity * (selectedProduct.currentPrice || 0),
            addedBy: user.uid,
            addedByName: user.name || user.email || 'User',
          };
        } else {
          // Quotation / Testing / Sample dispatch - DO NOT REDUCE INVENTORY
          newQuantity = selectedProduct.totalQuantity;
          transactionNotes = transactionNotes 
            ? `${transactionNotes} (Quotation/Testing - Stock Unaffected)` 
            : 'Quotation/Testing Dispatch (Stock Unaffected)';
          newStockEntry = {
            type: 'quote_deliver',
            date: Timestamp.now(),
            quantity: transactionForm.quantity,
            unitPrice: selectedProduct.currentPrice || 0,
            totalPrice: 0,
            addedBy: user.uid,
            addedByName: user.name || user.email || 'User',
            isDummy: true,
          };
        }
      }

      const updatedStockEntries = newStockEntry 
        ? [...(selectedProduct.stockEntries || []), newStockEntry]
        : selectedProduct.stockEntries || [];

      const newTotalValue = updatedStockEntries.reduce((sum, entry) => sum + (entry.totalPrice || 0), 0);
      
      await updateDoc(productRef, {
        totalQuantity: newQuantity,
        totalValue: newTotalValue,
        stockEntries: updatedStockEntries,
        currentPrice: transactionForm.price || selectedProduct.currentPrice || 0,
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'transactions'), {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        type: transactionForm.type,
        quantity: transactionForm.quantity,
        previousQuantity: selectedProduct.totalQuantity,
        newQuantity: newQuantity,
        price: transactionForm.price || selectedProduct.currentPrice || 0,
        totalAmount: transactionForm.deductFromInventory ? transactionForm.quantity * (transactionForm.price || selectedProduct.currentPrice || 0) : 0,
        performedBy: user.uid,
        performedByName: user.name || user.email || 'User',
        notes: transactionNotes,
        createdAt: serverTimestamp(),
      });

      setTransactionForm({
        type: 'add',
        quantity: 0,
        price: 0,
        notes: '',
        deductFromInventory: true,
      });
      setIsTransactionModalOpen(false);
      setSelectedProduct(null);
      alert(
        transactionForm.type === 'deliver' && !transactionForm.deductFromInventory
          ? `Quotation/Testing dispatch logged for ${transactionForm.quantity} unit(s). Stock remains at ${newQuantity}.`
          : `Stock ${transactionForm.type === 'add' ? 'added' : 'delivered'} successfully!`
      );
    } catch (error) {
      console.error('Error processing transaction:', error);
      alert('Failed to process transaction: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleDeleteSingleTransaction = async (transactionId: string) => {
    if (!window.confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) {
      return;
    }

    try {
      const transactionRef = doc(db, 'transactions', transactionId);
      await deleteDoc(transactionRef);
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Failed to delete transaction');
    }
  };

  const handleExportCSV = () => {
    setIsExporting(true);
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

      // ==========================================
      // SHEET 1: Inventory Summary (Navy Blue #1E3A8A)
      // ==========================================
      const uniqueCategoriesCount = new Set(products.map((p) => p.category || "General")).size;
      const inStockCount = products.filter((p) => (p.totalQuantity || 0) > (p.lowStockThreshold || 10)).length;

      const summaryRows = [
        ["INVENTORY ASSET & VALUATION STATEMENT", "", ""],
        ["Comprehensive audit of Catalog Items, Stock on Hand (SOH), Total Purchase Value, and Inventory Health", "", ""],
        [],
        ["Report Parameter", "Selected Value", ""],
        ["Report Generated On", new Date().toLocaleString("en-IN"), ""],
        ["Category Filter Applied", filterCategory === "all" ? "All Categories" : filterCategory, ""],
        ["Stock Filter Applied", filterStock.toUpperCase(), ""],
        ["Generated By", resolveUserName(user?.displayName || user?.email, user?.uid), ""],
        [],
        ["INVENTORY ASSET METRIC", "AMOUNT / COUNT", "ANALYSIS & HEALTH NOTES"],
        ["Total Catalog SKUs", stats.totalProducts, "Total unique products tracked in inventory catalog"],
        ["Total Stock on Hand (SOH)", stats.totalSOH, "Total physical units currently held across inventory"],
        ["Total Purchase Value (All-time Purchases)", stats.totalPurchasedValue, "Total historical valuation of all goods purchased into stock"],
        ["Current Stock Purchase Value (SOH Valuation)", stats.currentStockPurchaseValue, "Current asset valuation of unsold stock on hand at purchase cost"],
        ["Average Unit Purchase Cost (SOH)", stats.totalSOH > 0 ? stats.currentStockPurchaseValue / stats.totalSOH : 0, "Average unit purchase price across current physical stock"],
        ["Total Delivery / Dispatched Value", stats.totalDeliveryValue, "Total valuation of delivered stock to clients/enquiries"],
        ["Healthy / In-Stock SKUs", inStockCount, "SKUs maintaining stock above reorder threshold"],
        ["Low Stock Alert SKUs", stats.lowStock, "SKUs at or below reorder threshold requiring replenishment"],
        ["Out of Stock SKUs", stats.outOfStock, "SKUs with zero physical stock requiring immediate restock"],
        ["Active Product Categories", uniqueCategoriesCount, "Distinct product classification categories"],
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      wsSummary["!cols"] = [{ wch: 44 }, { wch: 24 }, { wch: 60 }];
      wsSummary["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
        { s: { r: 3, c: 1 }, e: { r: 3, c: 2 } },
      ];

      // Title & Subtitle styling
      wsSummary["A1"].s = {
        fill: { fgColor: { rgb: "1E3A8A" } },
        font: { name: "Calibri", sz: 14, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
      wsSummary["A2"].s = {
        fill: { fgColor: { rgb: "F1F5F9" } },
        font: { name: "Calibri", sz: 10, italic: true, color: { rgb: "475569" } },
        alignment: { horizontal: "center", vertical: "center" },
      };

      // Metadata section header (Row 4, index 3)
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

      // Metadata rows (rows 5-8, indices 4-7)
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

      // Summary Table Header (Row 10, index 9)
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

      // Metric styling
      const summaryMetricStyles: Record<number, { bg: string; bold?: boolean; numFmt?: string; textColor?: string }> = {
        10: { bg: "EFF6FF", bold: true, numFmt: "#,##0", textColor: "1E3A8A" }, // Total SKUs
        11: { bg: "EFF6FF", bold: true, numFmt: "#,##0", textColor: "1E3A8A" }, // Total SOH
        12: { bg: "FEF3C7", bold: true, numFmt: "₹#,##0.00", textColor: "92400E" }, // Total Purchase Value
        13: { bg: "ECFDF5", bold: true, numFmt: "₹#,##0.00", textColor: "065F46" }, // Current Stock Purchase Value
        14: { bg: "FFFFFF", bold: false, numFmt: "₹#,##0.00", textColor: "475569" }, // Avg unit cost
        15: { bg: "FFFFFF", bold: false, numFmt: "₹#,##0.00", textColor: "475569" }, // Delivery Value
        16: { bg: "F8FAFC", bold: false, numFmt: "#,##0", textColor: "15803D" }, // In stock
        17: { bg: "FFFBEB", bold: true, numFmt: "#,##0", textColor: "D97706" }, // Low stock
        18: { bg: "FEF2F2", bold: true, numFmt: "#,##0", textColor: "DC2626" }, // Out of stock
        19: { bg: "F8FAFC", bold: false, numFmt: "#,##0", textColor: "334155" }, // Categories
      };

      for (let r = 10; r <= 19; r++) {
        const conf = summaryMetricStyles[r] || { bg: "FFFFFF" };
        const isDoubleBottom = r === 13;
        const cellBorder = isDoubleBottom ? doubleBottomBorder : thinBorder;

        for (let c = 0; c <= 2; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          if (!wsSummary[cellRef]) continue;

          let align: "left" | "center" | "right" = "left";
          if (c === 1) align = conf.numFmt?.includes("₹") ? "right" : "center";
          if (c === 2) align = "left";

          wsSummary[cellRef].s = {
            fill: { fgColor: { rgb: conf.bg } },
            font: {
              name: "Calibri",
              sz: r === 12 || r === 13 ? 12 : 11,
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
        ...Array(10).fill({ hpt: 22 }),
      ];

      XLSX.utils.book_append_sheet(workbook, wsSummary, "Inventory Summary");

      // ==========================================
      // SHEET 2: Product Inventory Master (Royal Indigo #312E81)
      // ==========================================
      const masterCols = [
        { header: "HSN Code", key: "hsn", width: 14, align: "center" as const },
        { header: "Product Name", key: "name", width: 36, align: "left" as const, isBold: true },
        { header: "SKU", key: "sku", width: 16, align: "center" as const },
        { header: "Category", key: "category", width: 22, align: "left" as const },
        { header: "Stock (SOH)", key: "soh", width: 14, align: "center" as const, numFmt: "#,##0" },
        { header: "Purchase Price (₹)", key: "purchasePrice", width: 18, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Selling Price (₹)", key: "sellingPrice", width: 18, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Total Purchase Value (₹)", key: "totalValue", width: 22, align: "right" as const, numFmt: "₹#,##0.00", isBold: true },
        { header: "Stock Status", key: "status", width: 16, align: "center" as const, isBold: true, colorFn: (v: string) => v === "Out of Stock" ? "DC2626" : v === "Low Stock" ? "D97706" : "15803D" },
        { header: "Reorder Level", key: "threshold", width: 14, align: "center" as const, numFmt: "#,##0" },
        { header: "Description", key: "description", width: 30, align: "left" as const },
        { header: "Created By", key: "createdBy", width: 20, align: "left" as const },
        { header: "Last Updated", key: "lastUpdated", width: 18, align: "center" as const },
      ];

      const masterSheetData: any[][] = [
        ["PRODUCT INVENTORY MASTER CATALOG"],
        ["Complete SKU inventory ledger: Quantities, Purchase Cost, Selling Price, and Valuation"],
        [],
        masterCols.map((c) => c.header),
      ];

      let totalMasterSOH = 0;
      let totalMasterPurchaseVal = 0;

      filteredProducts.forEach((product) => {
        const purchasePrice = product.currentPrice || getProductPurchasePrice(product) || 0;
        const sellingPrice = getProductPurchasePrice(product);
        const soh = product.totalQuantity || 0;
        const totalValue = calculateOriginalPurchaseValue(product);

        totalMasterSOH += soh;
        totalMasterPurchaseVal += totalValue;

        let status = "In Stock";
        if (soh === 0) {
          status = "Out of Stock";
        } else if (soh <= (product.lowStockThreshold || 10)) {
          status = "Low Stock";
        }

        const rowObj = {
          hsn: product.hsnCode || "-",
          name: product.name || "Unnamed Product",
          sku: product.sku || "-",
          category: product.category || "General",
          soh: soh,
          purchasePrice: purchasePrice,
          sellingPrice: sellingPrice,
          totalValue: totalValue,
          status: status,
          threshold: product.lowStockThreshold || 10,
          description: product.description || "-",
          createdBy: resolveUserName(product.createdByName, product.createdBy),
          lastUpdated: formatDate(product.updatedAt),
        };

        masterSheetData.push(masterCols.map((c) => (rowObj as any)[c.key]));
      });

      // Master Totals Row
      const masterTotalRow = {
        hsn: "",
        name: "TOTALS",
        sku: "",
        category: "",
        soh: totalMasterSOH,
        purchasePrice: null,
        sellingPrice: null,
        totalValue: totalMasterPurchaseVal,
        status: "",
        threshold: null,
        description: "",
        createdBy: "",
        lastUpdated: "",
      };
      masterSheetData.push(masterCols.map((c) => (masterTotalRow as any)[c.key]));

      const wsMaster = XLSX.utils.aoa_to_sheet(masterSheetData);
      wsMaster["!cols"] = masterCols.map((c) => ({ wch: c.width }));
      wsMaster["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: masterCols.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: masterCols.length - 1 } },
      ];

      // Title & Subtitle styling
      wsMaster["A1"].s = {
        fill: { fgColor: { rgb: "312E81" } },
        font: { name: "Calibri", sz: 13, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
      wsMaster["A2"].s = {
        fill: { fgColor: { rgb: "EEF2FF" } },
        font: { name: "Calibri", sz: 10, italic: true, color: { rgb: "3730A3" } },
        alignment: { horizontal: "center", vertical: "center" },
      };

      // Header row styling (row index 3)
      for (let c = 0; c < masterCols.length; c++) {
        const ref = XLSX.utils.encode_cell({ r: 3, c });
        if (wsMaster[ref]) {
          wsMaster[ref].s = {
            fill: { fgColor: { rgb: "312E81" } },
            font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: {
              top: { style: "thin", color: { rgb: "312E81" } },
              bottom: { style: "medium", color: { rgb: "0F172A" } },
              left: { style: "thin", color: { rgb: "E2E8F0" } },
              right: { style: "thin", color: { rgb: "E2E8F0" } },
            },
          };
        }
      }

      // Master Data rows
      filteredProducts.forEach((_, idx) => {
        const rIdx = 4 + idx;
        const bg = idx % 2 === 1 ? "F8FAFC" : "FFFFFF";

        masterCols.forEach((col, cIdx) => {
          const ref = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
          if (!wsMaster[ref]) return;
          const val = masterSheetData[rIdx][cIdx];
          const textColor = col.colorFn && typeof val === "string" ? col.colorFn(val) : col.isBold ? "0F172A" : "334155";

          wsMaster[ref].s = {
            fill: { fgColor: { rgb: bg } },
            font: { name: "Calibri", sz: 11, bold: !!col.isBold, color: { rgb: textColor } },
            alignment: { horizontal: col.align, vertical: "center" },
            numFmt: typeof val === "number" ? col.numFmt : undefined,
            border: thinBorder,
          };
        });
      });

      // Master Totals row styling
      const masterTotalIdx = 4 + filteredProducts.length;
      masterCols.forEach((col, cIdx) => {
        const ref = XLSX.utils.encode_cell({ r: masterTotalIdx, c: cIdx });
        if (!wsMaster[ref]) return;
        const val = masterSheetData[masterTotalIdx][cIdx];

        wsMaster[ref].s = {
          fill: { fgColor: { rgb: "FEF3C7" } },
          font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "0F172A" } },
          alignment: { horizontal: col.align, vertical: "center" },
          numFmt: typeof val === "number" ? col.numFmt : undefined,
          border: doubleBottomBorder,
        };
      });

      wsMaster["!rows"] = [
        { hpt: 28 },
        { hpt: 20 },
        { hpt: 10 },
        { hpt: 26 },
        ...filteredProducts.map(() => ({ hpt: 22 })),
        { hpt: 24 },
      ];

      XLSX.utils.book_append_sheet(workbook, wsMaster, "Inventory Catalog");

      // ==========================================
      // SHEET 3: Category Valuation (Royal Blue #1D4ED8)
      // ==========================================
      const categoryMap = new Map<string, {
        category: string;
        skus: number;
        soh: number;
        purchaseValue: number;
        lowStock: number;
        outOfStock: number;
      }>();

      filteredProducts.forEach((p) => {
        const cat = (p.category || "General").trim() || "General";
        if (!categoryMap.has(cat)) {
          categoryMap.set(cat, {
            category: cat,
            skus: 0,
            soh: 0,
            purchaseValue: 0,
            lowStock: 0,
            outOfStock: 0,
          });
        }
        const obj = categoryMap.get(cat)!;
        obj.skus += 1;
        const pQty = p.totalQuantity || 0;
        obj.soh += pQty;
        obj.purchaseValue += calculateOriginalPurchaseValue(p);
        if (pQty === 0) obj.outOfStock += 1;
        else if (pQty <= (p.lowStockThreshold || 10)) obj.lowStock += 1;
      });

      const categoryList = Array.from(categoryMap.values()).sort((a, b) => b.purchaseValue - a.purchaseValue);
      const totalCatValue = categoryList.reduce((sum, c) => sum + c.purchaseValue, 0);

      const categoryCols = [
        { header: "Category", key: "category", width: 28, align: "left" as const, isBold: true },
        { header: "Total SKUs", key: "skus", width: 14, align: "center" as const, numFmt: "#,##0" },
        { header: "Total SOH Units", key: "soh", width: 16, align: "center" as const, numFmt: "#,##0" },
        { header: "Total Purchase Value (₹)", key: "purchaseValue", width: 22, align: "right" as const, numFmt: "₹#,##0.00", isBold: true },
        { header: "Avg Unit Cost (₹)", key: "avgCost", width: 18, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Low Stock SKUs", key: "lowStock", width: 16, align: "center" as const, numFmt: "#,##0" },
        { header: "Out of Stock SKUs", key: "outOfStock", width: 16, align: "center" as const, numFmt: "#,##0" },
        { header: "% Share of Value", key: "share", width: 16, align: "center" as const, numFmt: "0.0%" },
      ];

      const categorySheetData: any[][] = [
        ["CATEGORY-WISE INVENTORY VALUATION"],
        ["Aggregated Stock on Hand, Purchase Valuation, and SKU Counts by product category"],
        [],
        categoryCols.map((c) => c.header),
      ];

      categoryList.forEach((c) => {
        const rowObj = {
          ...c,
          avgCost: c.soh > 0 ? c.purchaseValue / c.soh : 0,
          share: totalCatValue > 0 ? c.purchaseValue / totalCatValue : 0,
        };
        categorySheetData.push(categoryCols.map((col) => (rowObj as any)[col.key]));
      });

      const catTotalRow = {
        category: "TOTALS",
        skus: categoryList.reduce((s, c) => s + c.skus, 0),
        soh: categoryList.reduce((s, c) => s + c.soh, 0),
        purchaseValue: totalCatValue,
        avgCost: totalMasterSOH > 0 ? totalCatValue / totalMasterSOH : 0,
        lowStock: categoryList.reduce((s, c) => s + c.lowStock, 0),
        outOfStock: categoryList.reduce((s, c) => s + c.outOfStock, 0),
        share: 1.0,
      };
      categorySheetData.push(categoryCols.map((col) => (catTotalRow as any)[col.key]));

      const wsCategory = XLSX.utils.aoa_to_sheet(categorySheetData);
      wsCategory["!cols"] = categoryCols.map((c) => ({ wch: c.width }));
      wsCategory["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: categoryCols.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: categoryCols.length - 1 } },
      ];

      wsCategory["A1"].s = {
        fill: { fgColor: { rgb: "1D4ED8" } },
        font: { name: "Calibri", sz: 13, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
      wsCategory["A2"].s = {
        fill: { fgColor: { rgb: "DBEAFE" } },
        font: { name: "Calibri", sz: 10, italic: true, color: { rgb: "1E40AF" } },
        alignment: { horizontal: "center", vertical: "center" },
      };

      for (let c = 0; c < categoryCols.length; c++) {
        const ref = XLSX.utils.encode_cell({ r: 3, c });
        if (wsCategory[ref]) {
          wsCategory[ref].s = {
            fill: { fgColor: { rgb: "1D4ED8" } },
            font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: {
              top: { style: "thin", color: { rgb: "1D4ED8" } },
              bottom: { style: "medium", color: { rgb: "0F172A" } },
              left: { style: "thin", color: { rgb: "E2E8F0" } },
              right: { style: "thin", color: { rgb: "E2E8F0" } },
            },
          };
        }
      }

      categoryList.forEach((_, idx) => {
        const rIdx = 4 + idx;
        const bg = idx % 2 === 1 ? "F8FAFC" : "FFFFFF";

        categoryCols.forEach((col, cIdx) => {
          const ref = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
          if (!wsCategory[ref]) return;
          const val = categorySheetData[rIdx][cIdx];

          wsCategory[ref].s = {
            fill: { fgColor: { rgb: bg } },
            font: { name: "Calibri", sz: 11, bold: !!col.isBold, color: { rgb: "334155" } },
            alignment: { horizontal: col.align, vertical: "center" },
            numFmt: typeof val === "number" ? col.numFmt : undefined,
            border: thinBorder,
          };
        });
      });

      const catTotalIdx = 4 + categoryList.length;
      categoryCols.forEach((col, cIdx) => {
        const ref = XLSX.utils.encode_cell({ r: catTotalIdx, c: cIdx });
        if (!wsCategory[ref]) return;
        const val = categorySheetData[catTotalIdx][cIdx];

        wsCategory[ref].s = {
          fill: { fgColor: { rgb: "FEF3C7" } },
          font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "0F172A" } },
          alignment: { horizontal: col.align, vertical: "center" },
          numFmt: typeof val === "number" ? col.numFmt : undefined,
          border: doubleBottomBorder,
        };
      });

      wsCategory["!rows"] = [
        { hpt: 28 },
        { hpt: 20 },
        { hpt: 10 },
        { hpt: 26 },
        ...categoryList.map(() => ({ hpt: 22 })),
        { hpt: 24 },
      ];

      XLSX.utils.book_append_sheet(workbook, wsCategory, "Category Breakdown");

      // ==========================================
      // SHEET 4: Stock Alerts & Reorder (Crimson Rose #9F1239)
      // ==========================================
      const alertProducts = filteredProducts.filter((p) => (p.totalQuantity || 0) <= (p.lowStockThreshold || 10));

      const alertCols = [
        { header: "Product Name", key: "name", width: 36, align: "left" as const, isBold: true },
        { header: "SKU", key: "sku", width: 16, align: "center" as const },
        { header: "Category", key: "category", width: 22, align: "left" as const },
        { header: "Current SOH", key: "soh", width: 14, align: "center" as const, numFmt: "#,##0" },
        { header: "Reorder Threshold", key: "threshold", width: 16, align: "center" as const, numFmt: "#,##0" },
        { header: "Shortfall Units", key: "shortfall", width: 16, align: "center" as const, numFmt: "#,##0", isBold: true, colorFn: () => "DC2626" },
        { header: "Unit Cost (₹)", key: "cost", width: 18, align: "right" as const, numFmt: "₹#,##0.00" },
        { header: "Est. Restock Cost (₹)", key: "restockCost", width: 20, align: "right" as const, numFmt: "₹#,##0.00", isBold: true },
        { header: "Urgency Status", key: "status", width: 18, align: "center" as const, isBold: true, colorFn: (v: string) => v === "OUT OF STOCK" ? "DC2626" : "D97706" },
      ];

      const alertSheetData: any[][] = [
        ["CRITICAL STOCK REORDER & DEFICIT ALERTS"],
        ["Prioritized procurement report for items at or below safety stock threshold"],
        [],
        alertCols.map((c) => c.header),
      ];

      let totalShortfallUnits = 0;
      let totalRestockCostVal = 0;

      alertProducts.forEach((p) => {
        const soh = p.totalQuantity || 0;
        const threshold = p.lowStockThreshold || 10;
        const shortfall = Math.max(0, threshold - soh + 5);
        const unitCost = p.currentPrice || getProductPurchasePrice(p) || 0;
        const restockCost = shortfall * unitCost;

        totalShortfallUnits += shortfall;
        totalRestockCostVal += restockCost;

        const rowObj = {
          name: p.name || "Unnamed Product",
          sku: p.sku || "-",
          category: p.category || "General",
          soh: soh,
          threshold: threshold,
          shortfall: shortfall,
          cost: unitCost,
          restockCost: restockCost,
          status: soh === 0 ? "OUT OF STOCK" : "LOW STOCK",
        };

        alertSheetData.push(alertCols.map((col) => (rowObj as any)[col.key]));
      });

      const alertTotalRow = {
        name: "TOTALS",
        sku: "",
        category: "",
        soh: alertProducts.reduce((s, p) => s + (p.totalQuantity || 0), 0),
        threshold: null,
        shortfall: totalShortfallUnits,
        cost: null,
        restockCost: totalRestockCostVal,
        status: `${alertProducts.length} Items Alert`,
      };
      alertSheetData.push(alertCols.map((col) => (alertTotalRow as any)[col.key]));

      const wsAlerts = XLSX.utils.aoa_to_sheet(alertSheetData);
      wsAlerts["!cols"] = alertCols.map((c) => ({ wch: c.width }));
      wsAlerts["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: alertCols.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: alertCols.length - 1 } },
      ];

      wsAlerts["A1"].s = {
        fill: { fgColor: { rgb: "9F1239" } },
        font: { name: "Calibri", sz: 13, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
      wsAlerts["A2"].s = {
        fill: { fgColor: { rgb: "FFE4E6" } },
        font: { name: "Calibri", sz: 10, italic: true, color: { rgb: "881337" } },
        alignment: { horizontal: "center", vertical: "center" },
      };

      for (let c = 0; c < alertCols.length; c++) {
        const ref = XLSX.utils.encode_cell({ r: 3, c });
        if (wsAlerts[ref]) {
          wsAlerts[ref].s = {
            fill: { fgColor: { rgb: "9F1239" } },
            font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: {
              top: { style: "thin", color: { rgb: "9F1239" } },
              bottom: { style: "medium", color: { rgb: "0F172A" } },
              left: { style: "thin", color: { rgb: "E2E8F0" } },
              right: { style: "thin", color: { rgb: "E2E8F0" } },
            },
          };
        }
      }

      alertProducts.forEach((_, idx) => {
        const rIdx = 4 + idx;
        const bg = idx % 2 === 1 ? "FFF1F2" : "FFFFFF";

        alertCols.forEach((col, cIdx) => {
          const ref = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
          if (!wsAlerts[ref]) return;
          const val = alertSheetData[rIdx][cIdx];
          const textColor = col.colorFn && typeof val === "string" ? col.colorFn(val) : col.isBold ? "0F172A" : "334155";

          wsAlerts[ref].s = {
            fill: { fgColor: { rgb: bg } },
            font: { name: "Calibri", sz: 11, bold: !!col.isBold, color: { rgb: textColor } },
            alignment: { horizontal: col.align, vertical: "center" },
            numFmt: typeof val === "number" ? col.numFmt : undefined,
            border: thinBorder,
          };
        });
      });

      const alertTotalIdx = 4 + alertProducts.length;
      alertCols.forEach((col, cIdx) => {
        const ref = XLSX.utils.encode_cell({ r: alertTotalIdx, c: cIdx });
        if (!wsAlerts[ref]) return;
        const val = alertSheetData[alertTotalIdx][cIdx];

        wsAlerts[ref].s = {
          fill: { fgColor: { rgb: "FEF3C7" } },
          font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "0F172A" } },
          alignment: { horizontal: col.align, vertical: "center" },
          numFmt: typeof val === "number" ? col.numFmt : undefined,
          border: doubleBottomBorder,
        };
      });

      wsAlerts["!rows"] = [
        { hpt: 28 },
        { hpt: 20 },
        { hpt: 10 },
        { hpt: 26 },
        ...alertProducts.map(() => ({ hpt: 22 })),
        { hpt: 24 },
      ];

      XLSX.utils.book_append_sheet(workbook, wsAlerts, "Stock Alerts");

      // Write and download workbook
      const fileName = `inventory-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('Error generating styled Excel report:', error);
      alert('Failed to generate Excel report');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        alert('The uploaded Excel file has no sheets.');
        setIsImporting(false);
        return;
      }

      const cleanText = (raw: any): string => {
        if (raw === undefined || raw === null) return '';
        return String(raw).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
      };

      const parseQuantity = (raw: any): number => {
        if (raw === undefined || raw === null || raw === '') return 0;
        if (typeof raw === 'number') return isNaN(raw) ? 0 : Math.max(0, raw);
        const s = String(raw).trim();
        if (!s || s === '-') return 0;
        
        // Handle Excel date auto-conversions like 2026-01-02 (often from typing "1-2" in quantity)
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
          const parts = s.split('-');
          const lastNum = parseInt(parts[2], 10);
          return isNaN(lastNum) ? 1 : lastNum;
        }

        // Handle hyphen/slash ranges like "1-2" or "1/2"
        if (/^(\d+)\s*[-/]\s*(\d+)$/.test(s)) {
          const m = s.match(/^(\d+)\s*[-/]\s*(\d+)$/);
          return m ? Math.max(parseInt(m[1], 10), parseInt(m[2], 10)) : 1;
        }

        // Extract first numeric group (e.g. "12 in box" -> 12, "2ir re" -> 2)
        const m = s.match(/\d+(\.\d+)?/);
        if (m) {
          const n = parseFloat(m[0]);
          return isNaN(n) ? 0 : Math.max(0, n);
        }
        return 0;
      };

      const parsePrice = (raw: any): number | undefined => {
        if (raw === undefined || raw === null || raw === '') return undefined;
        if (typeof raw === 'number') return isNaN(raw) ? undefined : raw;
        const cleaned = String(raw).replace(/[^0-9.-]/g, '');
        if (!cleaned) return undefined;
        const n = parseFloat(cleaned);
        return isNaN(n) ? undefined : n;
      };

      const detectHeaderRow = (row: any[]) => {
        if (!Array.isArray(row)) return null;
        const strRow = row.map(cell => cleanText(cell).toLowerCase());

        const hasComp = strRow.some(c => 
          c.includes('component name') || 
          c.includes('product name') || 
          c === 'product' || 
          c === 'item name' || 
          c === 'items'
        );
        const hasQty = strRow.some(c => c.includes('quantity') || c === 'qty' || c === 'soh' || c.includes('stock'));
        const hasPrice = strRow.some(c => c.includes('price') || c.includes('cost') || c === 'cost' || c.includes('standard'));
        const hasCategory = strRow.some(c => c.includes('category'));

        if (hasComp && (hasQty || hasPrice || hasCategory)) {
          let colName = -1, colSku = -1, colSpec = -1, colCategory = -1, colHsn = -1;
          let colQty = -1, colCostPrice = -1, colSellingPrice = -1, colStandardPrice = -1, colStatus = -1;
          let colThreshold = -1, colDesc = -1;

          strRow.forEach((c, idx) => {
            const isTotalOrValue = c.includes('value') || c.includes('total') || c.includes('amount');

            if (c.includes('component name') || c.includes('product name') || c === 'item name' || c === 'product') colName = idx;
            else if (c.includes('sku') || c === 'code') colSku = idx;
            else if (c.includes('spec')) colSpec = idx;
            else if (c.includes('category') || c === 'group') colCategory = idx;
            else if (c.includes('hsn')) colHsn = idx;
            else if (!isTotalOrValue && (c.includes('quantity') || c === 'qty' || c === 'soh' || c.includes('stock'))) colQty = idx;
            else if (!isTotalOrValue && (c === 'cost price' || c.includes('purchase price') || c === 'cost' || c.includes('buying price'))) colCostPrice = idx;
            else if (!isTotalOrValue && (c === 'standard price' || c === 'standard')) colStandardPrice = idx;
            else if (!isTotalOrValue && (c.includes('sell') || c.includes('sale') || (c === 'price' && colCostPrice !== idx && colStandardPrice !== idx))) {
              colSellingPrice = idx;
            }
            else if (c.includes('moving status') || c === 'status') colStatus = idx;
            else if (c.includes('threshold') || c.includes('low stock')) colThreshold = idx;
            else if (c.includes('desc') || c.includes('notes')) colDesc = idx;
          });

          return { colName, colSku, colSpec, colCategory, colHsn, colQty, colCostPrice, colSellingPrice, colStandardPrice, colStatus, colThreshold, colDesc };
        }
        return null;
      };

      interface ParsedRowItem {
        name: string;
        baseName: string;
        sku?: string;
        specification?: string;
        category?: string;
        hsnCode?: string;
        quantity: number;
        purchasePrice?: number;
        sellingPrice?: number;
        lowStockThreshold?: number;
        description?: string;
        sheetName?: string;
        sourceRow: number;
      }

      const parseSheetMatrix = (matrix: any[][], sheetName: string): ParsedRowItem[] => {
        const extractedItems: ParsedRowItem[] = [];
        let currentHeader: any = null;
        let inNonListedSection = false;

        for (let r = 0; r < matrix.length; r++) {
          const row = matrix[r];
          if (!Array.isArray(row) || row.every(cell => cleanText(cell) === '')) continue;

          // Check if row is a header
          const headerCheck = detectHeaderRow(row);
          if (headerCheck) {
            currentHeader = headerCheck;
            inNonListedSection = false;
            continue;
          }

          // Check for "non listed items" section
          const rowText = row.map(c => cleanText(c).toLowerCase()).join(' ');
          if (rowText.includes('non listed items')) {
            inNonListedSection = true;
            currentHeader = null;
            const pName = cleanText(row[3]);
            if (pName && pName.toLowerCase() !== 'non listed items') {
              extractedItems.push({
                name: pName,
                baseName: pName,
                quantity: parseQuantity(row[4]),
                category: 'Non Listed Items',
                sheetName,
                sourceRow: r + 1,
              });
            }
            continue;
          }

          if (inNonListedSection) {
            const pName = cleanText(row[3]);
            if (pName) {
              if (pName.startsWith('·') || pName.startsWith('Â·') || /^\d+\./.test(pName)) {
                inNonListedSection = false;
                continue;
              }
              extractedItems.push({
                name: pName,
                baseName: pName,
                quantity: parseQuantity(row[4]),
                category: 'Non Listed Items',
                sheetName,
                sourceRow: r + 1,
              });
              continue;
            }
          }

          // Skip category reference taxonomy (bullet items at bottom)
          const firstCol = cleanText(row[0]);
          if (firstCol.startsWith('·') || firstCol.startsWith('Â·') || /^\d+\.\s+[A-Za-z]/.test(firstCol)) {
            continue;
          }

          // If we have an active header, parse this data row
          if (currentHeader && currentHeader.colName >= 0) {
            const rawName = cleanText(row[currentHeader.colName]);
            const rawSku = currentHeader.colSku >= 0 ? cleanText(row[currentHeader.colSku]) : '';
            const rawSpec = currentHeader.colSpec >= 0 ? cleanText(row[currentHeader.colSpec]) : '';
            const rawCategory = currentHeader.colCategory >= 0 ? cleanText(row[currentHeader.colCategory]) : '';
            const rawHsn = currentHeader.colHsn >= 0 ? cleanText(row[currentHeader.colHsn]) : '';
            const rawQty = currentHeader.colQty >= 0 ? row[currentHeader.colQty] : '';
            const rawCost = currentHeader.colCostPrice >= 0 ? row[currentHeader.colCostPrice] : '';
            const rawStandard = currentHeader.colStandardPrice >= 0 ? row[currentHeader.colStandardPrice] : '';
            const rawSelling = currentHeader.colSellingPrice >= 0 ? row[currentHeader.colSellingPrice] : '';
            const rawThreshold = currentHeader.colThreshold >= 0 ? row[currentHeader.colThreshold] : '';
            const rawDesc = currentHeader.colDesc >= 0 ? cleanText(row[currentHeader.colDesc]) : '';

            if (!rawName && !rawSku) continue;

            // Disambiguate name if specification exists and not in name
            let finalName = rawName;
            if (rawSpec && !finalName.toLowerCase().includes(rawSpec.toLowerCase())) {
              finalName = `${rawName} (${rawSpec})`;
            }

            const purchasePrice = parsePrice(rawCost) !== undefined ? parsePrice(rawCost) : parsePrice(rawStandard);
            const sellingPrice = parsePrice(rawSelling);
            const quantity = parseQuantity(rawQty);
            const threshold = parsePrice(rawThreshold);

            extractedItems.push({
              name: finalName,
              baseName: rawName,
              sku: rawSku,
              specification: rawSpec,
              category: rawCategory || 'General',
              hsnCode: rawHsn,
              quantity,
              purchasePrice,
              sellingPrice,
              lowStockThreshold: threshold,
              description: rawDesc,
              sheetName,
              sourceRow: r + 1,
            });
          }
        }
        return extractedItems;
      };

      const buildMatchingSummary = (itemsList: ParsedRowItem[]) => {
        const matchedProducts: { product: Product; newSOH: number; newPurchasePrice?: number; newSellingPrice?: number; rowData: any }[] = [];
        const newProducts: any[] = [];
        const matchedProductIds = new Set<string>();

        itemsList.forEach((item) => {
          let matched: Product | undefined;

          // 1. Match by SKU
          if (item.sku) {
            matched = products.find(p => p.sku && p.sku.trim().toLowerCase() === item.sku!.toLowerCase() && !matchedProductIds.has(p.id));
          }

          // 2. Match by exact full name
          if (!matched && item.name) {
            matched = products.find(p => p.name.trim().toLowerCase() === item.name.toLowerCase() && !matchedProductIds.has(p.id));
          }

          // 3. Match by base name if no spec conflict
          if (!matched && item.baseName) {
            matched = products.find(p => p.name.trim().toLowerCase() === item.baseName.toLowerCase() && !matchedProductIds.has(p.id));
          }

          // 4. Match by alphanumeric similarity
          if (!matched && item.name) {
            const rowAlpha = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (rowAlpha.length >= 4) {
              matched = products.find(p => {
                const pAlpha = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                return pAlpha === rowAlpha && !matchedProductIds.has(p.id);
              });
            }
          }

          if (matched) {
            matchedProductIds.add(matched.id);
            matchedProducts.push({
              product: matched,
              newSOH: item.quantity,
              newPurchasePrice: item.purchasePrice !== undefined ? item.purchasePrice : matched.currentPrice,
              newSellingPrice: item.sellingPrice !== undefined ? item.sellingPrice : matched.purchasePrice,
              rowData: {
                name: item.name || matched.name,
                sku: item.sku || matched.sku,
                hsnCode: item.hsnCode || matched.hsnCode,
                category: item.category || matched.category,
                lowStockThreshold: item.lowStockThreshold !== undefined ? item.lowStockThreshold : matched.lowStockThreshold,
                description: item.description || matched.description,
              }
            });
          } else {
            const newProdItem: any = {
              name: item.name || 'Unnamed Product',
              sku: item.sku || `SKU-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 900 + 100)}`,
              hsnCode: item.hsnCode || '',
              category: item.category || 'General',
              totalQuantity: item.quantity || 0,
              currentPrice: item.purchasePrice || 0,
              lowStockThreshold: item.lowStockThreshold || 10,
              description: item.description || (item.specification ? `Spec: ${item.specification}` : ''),
            };
            if (item.sellingPrice !== undefined && item.sellingPrice !== null && !isNaN(item.sellingPrice)) {
              newProdItem.purchasePrice = item.sellingPrice;
            }
            newProducts.push(newProdItem);
          }
        });

        const missedProducts = products.filter(p => !matchedProductIds.has(p.id));

        return {
          totalRows: itemsList.length,
          matchedProducts,
          newProducts,
          missedProducts,
        };
      };

      const sheetDataMap: Record<string, ReturnType<typeof buildMatchingSummary>> = {};
      const sheetItemsMap: Record<string, ParsedRowItem[]> = {};
      const availableSheets: { name: string; count: number }[] = [];

      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) return;
        const matrix: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (matrix.length === 0) return;

        const sheetItems = parseSheetMatrix(matrix, sheetName);
        if (sheetItems.length > 0) {
          sheetItemsMap[sheetName] = sheetItems;
          availableSheets.push({ name: sheetName, count: sheetItems.length });
          sheetDataMap[sheetName] = buildMatchingSummary(sheetItems);
        }
      });

      if (availableSheets.length === 0) {
        alert('The uploaded Excel sheet contains no recognizable inventory items.');
        setIsImporting(false);
        return;
      }

      if (availableSheets.length > 1) {
        const primarySheetName = availableSheets.slice().sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          const aPriority = aName.includes('materials') || aName.includes('inventory') || aName.includes('stock') ? 1000 : a.count;
          const bPriority = bName.includes('materials') || bName.includes('inventory') || bName.includes('stock') ? 1000 : b.count;
          return bPriority - aPriority;
        })[0]?.name;

        const primaryItems = sheetItemsMap[primarySheetName] || [];
        const combinedItems: ParsedRowItem[] = primaryItems.map(item => ({ ...item }));

        availableSheets.forEach(sh => {
          if (sh.name === primarySheetName) return;
          const otherItems = sheetItemsMap[sh.name] || [];
          otherItems.forEach(other => {
            const match = combinedItems.find(c => 
              (other.sku && c.sku && other.sku.toLowerCase() === c.sku.toLowerCase()) ||
              c.name.toLowerCase() === other.name.toLowerCase() ||
              c.baseName.toLowerCase() === other.baseName.toLowerCase() ||
              c.name.toLowerCase().includes(other.name.toLowerCase()) ||
              other.name.toLowerCase().includes(c.name.toLowerCase())
            );

            if (match) {
              if (other.purchasePrice !== undefined) match.purchasePrice = other.purchasePrice;
              if (other.sellingPrice !== undefined) match.sellingPrice = other.sellingPrice;
              if (match.quantity === 0 && other.quantity > 0) match.quantity = other.quantity;
            } else {
              combinedItems.push({ ...other });
            }
          });
        });

        const combinedSummary = buildMatchingSummary(combinedItems);
        sheetDataMap['all'] = combinedSummary;
        availableSheets.unshift({ name: 'all', count: combinedItems.length });
      }

      const initialSheet = availableSheets.length > 1 ? 'all' : availableSheets[0].name;
      const initialData = sheetDataMap[initialSheet];

      setImportSummary({
        fileName: file.name,
        totalRows: initialData.totalRows,
        availableSheets,
        selectedSheet: initialSheet,
        sheetDataMap,
        matchedProducts: initialData.matchedProducts,
        newProducts: initialData.newProducts,
        missedProducts: initialData.missedProducts,
      });
      setIsImportModalOpen(true);
    } catch (err) {
      console.error('Error reading excel file:', err);
      alert('Failed to parse Excel file. Please ensure it is a valid .xlsx, .xls, or .csv file.');
    } finally {
      setIsImporting(false);
      if (importExcelInputRef.current) {
        importExcelInputRef.current.value = '';
      }
    }
  };

  const handleConfirmImport = async () => {
    if (!importSummary || !user) return;

    try {
      setIsImporting(true);
      const CHUNK_SIZE = 100;
      const operations: { ref: any; data: any; isNew?: boolean }[] = [];

      // Helper to strip any undefined values from objects before sending to Firestore
      const cleanFirestoreObject = (data: any): any => {
        const cleaned: any = {};
        Object.keys(data).forEach(key => {
          const val = data[key];
          if (val !== undefined) {
            if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date) && typeof (val as any).toMillis !== 'function') {
              cleaned[key] = cleanFirestoreObject(val);
            } else {
              cleaned[key] = val;
            }
          }
        });
        return cleaned;
      };

      // 1. Overwrite existing matched products & clear oldStock flag
      importSummary.matchedProducts.forEach(item => {
        const prodRef = doc(db, 'products', item.product.id);
        const updateData: any = {
          totalQuantity: item.newSOH,
          isOldStock: false,
          updatedAt: serverTimestamp(),
          lastImportedAt: serverTimestamp(),
        };

        if (item.newPurchasePrice !== undefined && item.newPurchasePrice !== null && !isNaN(item.newPurchasePrice)) {
          updateData.currentPrice = item.newPurchasePrice;
        }
        if (item.newSellingPrice !== undefined && item.newSellingPrice !== null && !isNaN(item.newSellingPrice)) {
          updateData.purchasePrice = item.newSellingPrice;
        }
        if (item.rowData.hsnCode !== undefined && item.rowData.hsnCode !== null) {
          updateData.hsnCode = String(item.rowData.hsnCode).trim();
        }
        if (item.rowData.category) {
          updateData.category = String(item.rowData.category).trim();
        }
        if (item.rowData.lowStockThreshold !== undefined && item.rowData.lowStockThreshold !== null && !isNaN(Number(item.rowData.lowStockThreshold))) {
          updateData.lowStockThreshold = Number(item.rowData.lowStockThreshold);
        }
        if (item.rowData.description !== undefined && item.rowData.description !== null) {
          updateData.description = String(item.rowData.description).trim();
        }

        operations.push({ ref: prodRef, data: cleanFirestoreObject(updateData) });
      });

      // 2. Insert new products
      importSummary.newProducts.forEach(item => {
        const newRef = doc(collection(db, 'products'));
        const newProdData: any = {
          name: item.name || 'Unnamed Product',
          sku: item.sku || `SKU-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 900 + 100)}`,
          hsnCode: item.hsnCode || '',
          category: item.category || 'General',
          totalQuantity: item.totalQuantity || item.quantity || 0,
          currentPrice: item.currentPrice || item.purchasePrice || 0,
          lowStockThreshold: item.lowStockThreshold || 10,
          description: item.description || '',
          totalValue: (item.totalQuantity || item.quantity || 0) * (item.currentPrice || item.purchasePrice || 0),
          stockEntries: [],
          isOldStock: false,
          isQuoteOnly: false,
          productType: 'inventory',
          createdBy: user.uid,
          createdByName: user.name || user.email || 'Admin',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastImportedAt: serverTimestamp(),
        };

        if (item.purchasePrice !== undefined && item.purchasePrice !== null && !isNaN(item.purchasePrice)) {
          newProdData.purchasePrice = item.purchasePrice;
        }

        operations.push({ ref: newRef, data: cleanFirestoreObject(newProdData), isNew: true });
      });

      // 3. Mark missed products as isOldStock: true
      importSummary.missedProducts.forEach(prod => {
        const prodRef = doc(db, 'products', prod.id);
        operations.push({
          ref: prodRef,
          data: cleanFirestoreObject({
            isOldStock: true,
            updatedAt: serverTimestamp(),
          })
        });
      });

      // 4. Batch write execution in safe chunks using set with merge to avoid not-found errors
      for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
        const chunk = operations.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const op of chunk) {
          batch.set(op.ref, op.data, { merge: true });
        }
        await batch.commit();
      }

      alert(
        `Import Completed Successfully!\n\n` +
        `• ${importSummary.matchedProducts.length} existing products updated & overwritten\n` +
        `• ${importSummary.newProducts.length} new products added\n` +
        `• ${importSummary.missedProducts.length} missed products identified & tagged as "Old Stock"`
      );

      setIsImportModalOpen(false);
      setImportSummary(null);
    } catch (err: any) {
      console.error('Error applying import:', err);
      alert(`Failed to save imported changes to database: ${err?.message || err}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteAllTransactions = async () => {
    const transactionsToDelete = transactionFilter === 'all' 
      ? transactions 
      : filteredTransactions;

    if (transactionsToDelete.length === 0) {
      alert('No transactions found to delete.');
      return;
    }

    const filterTypeText = transactionFilter === 'all' 
      ? 'ALL' 
      : transactionFilter === 'add' 
      ? 'all ADDED' 
      : transactionFilter === 'deliver' 
      ? 'all DELIVERED' 
      : 'all DELETED';

    if (!window.confirm(`Are you sure you want to delete ${filterTypeText} transactions (${transactionsToDelete.length} transactions)? This action cannot be undone and will permanently remove the selected transaction history.`)) {
      return;
    }

    setIsDeletingTransactions(true);
    try {
      const batchSize = 450;
      const batches = [];
      
      for (let i = 0; i < transactionsToDelete.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = transactionsToDelete.slice(i, i + batchSize);
        
        chunk.forEach((transaction) => {
          const transactionRef = doc(db, 'transactions', transaction.id);
          batch.delete(transactionRef);
        });
        
        batches.push(batch.commit());
      }
      
      await Promise.all(batches);
      alert(`Successfully deleted ${transactionsToDelete.length} ${filterTypeText} transactions.`);
      
    } catch (error) {
      console.error('Error deleting transactions:', error);
      alert('Failed to delete transactions. Please try again.');
    } finally {
      setIsDeletingTransactions(false);
    }
  };

  // ============ PERMISSION CHECKS ============
  const canEditProduct = (product: Product): boolean => {
    if (user?.role === 'admin') return true;
    if (user?.role === 'manager') return true;
    if (user?.role === 'staff') return true;
    return false;
  };

  const canDeleteProduct = (product: Product): boolean => {
    return user?.role === 'admin';
  };

  const canRequestDeleteProduct = (): boolean => {
    return user?.role === 'staff' || user?.role === 'manager';
  };

  const canAddProduct = (): boolean => {
    return user?.role === 'admin' || user?.role === 'manager' || user?.role === 'staff';
  };

  const canViewTransactions = (): boolean => {
    return user?.role === 'admin' || user?.role === 'manager';
  };

  const canDeleteTransactions = (): boolean => {
    return user?.role === 'admin';
  };

  const canDeleteSingleTransaction = (): boolean => {
    return user?.role === 'admin';
  };

  const canEditQuantity = (): boolean => {
    return user?.role === 'admin' || user?.role === 'manager';
  };

  // ============ FILTERED AND SORTED DATA WITH PAGINATION ============
  const filteredProducts = useMemo(() => {
    let filtered = products;
    
    if (searchTerm) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (product.hsnCode && product.hsnCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (product.description && product.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (product.category && product.category.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    if (filterCategory !== 'all') {
      filtered = filtered.filter(product => product.category === filterCategory);
    }
    
    if (filterStock !== 'all') {
      filtered = filtered.filter(product => {
        if (filterStock === 'low') return product.totalQuantity <= product.lowStockThreshold && product.totalQuantity > 0;
        if (filterStock === 'out') return product.totalQuantity === 0;
        if (filterStock === 'normal') return product.totalQuantity > product.lowStockThreshold;
        if (filterStock === 'old') return product.isOldStock === true;
        return true;
      });
    }
    
    filtered = [...filtered].sort((a, b) => {
      let aValue: any, bValue: any;
      
      if (sortField === 'purchasePrice') {
        aValue = getProductPurchasePrice(a);
        bValue = getProductPurchasePrice(b);
      } else if (sortField === 'updatedAt' || sortField === 'createdAt') {
        const aVal = a[sortField];
        const bVal = b[sortField];
        aValue = aVal instanceof Timestamp ? aVal.toDate() : (aVal instanceof Date ? aVal : new Date(aVal as any));
        bValue = bVal instanceof Timestamp ? bVal.toDate() : (bVal instanceof Date ? bVal : new Date(bVal as any));
      } else {
        aValue = a[sortField];
        bValue = b[sortField];
      }
      
      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    return filtered;
  }, [products, searchTerm, filterCategory, filterStock, sortField, sortDirection]);

  // Automatically navigate to page containing matched product and scroll into view
  useEffect(() => {
    if (highlightId && filteredProducts.length > 0) {
      const foundIdx = filteredProducts.findIndex((p) => p.id === highlightId);
      if (foundIdx >= 0) {
        const targetPage = Math.floor(foundIdx / itemsPerPage) + 1;
        if (currentPage !== targetPage) {
          setCurrentPage(targetPage);
        }
        scrollToAndHighlight(`product-row-${highlightId}`, highlightId);
      }
    }
  }, [highlightId, filteredProducts, itemsPerPage, currentPage, scrollToAndHighlight]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredProducts.slice(indexOfFirstItem, indexOfLastItem);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCategory, filterStock, sortField, sortDirection]);

  // Pagination handlers
  const goToPage = (pageNumber: number) => {
    setCurrentPage(Math.max(1, Math.min(pageNumber, totalPages)));
  };

  // ============ STATISTICS ============
  const stats = useMemo(() => {
    const totalProducts = products.length;
    const totalSOH = products.reduce((sum, p) => sum + (p.totalQuantity || 0), 0);
    // Total values purchased of the products (all stock ever purchased/added)
    const totalPurchasedValue = products.reduce((sum, p) => sum + calculateOriginalPurchaseValue(p), 0);
    const currentStockPurchaseValue = products.reduce((sum, p) => sum + ((p.totalQuantity || 0) * (p.currentPrice || getProductPurchasePrice(p) || 0)), 0);
    const totalPurchasePrice = totalPurchasedValue;
    const totalValue = totalPurchasedValue;
    const lowStock = products.filter(p => 
      p.totalQuantity <= p.lowStockThreshold && p.totalQuantity > 0
    ).length;
    const outOfStock = products.filter(p => p.totalQuantity === 0).length;
    const oldStock = products.filter(p => p.isOldStock === true).length;
    
    const totalCurrentValue = currentStockPurchaseValue;
    
    const totalDeliveryValue = transactions
      .filter(t => t.type === 'deliver')
      .reduce((sum, t) => sum + t.totalAmount, 0);
    
    return {
      totalProducts,
      totalSOH,
      totalPurchasedValue,
      currentStockPurchaseValue,
      totalPurchasePrice,
      totalValue,
      lowStock,
      outOfStock,
      totalCurrentValue,
      totalDeliveryValue,
      oldStock,
    };
  }, [products, transactions]);

  const transactionStats = useMemo(() => {
    const addCount = transactions.filter(t => t.type === 'add').length;
    const deliverCount = transactions.filter(t => t.type === 'deliver').length;
    const deleteCount = transactions.filter(t => t.type === 'delete').length;
    const totalCount = transactions.length;
    
    return { addCount, deliverCount, deleteCount, totalCount };
  }, [transactions]);

  // ============ RENDER FUNCTIONS ============
  const renderStockBadge = (product: Product) => {
    const status = getStockStatus(product.totalQuantity, product.lowStockThreshold);
    const color = getStockColor(product.totalQuantity, product.lowStockThreshold);
    
    return (
      <div className="flex flex-col items-center gap-1">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${color}`}>
          {status === 'out-of-stock' ? <XCircle className="w-3 h-3 mr-1" /> :
           status === 'low-stock' ? <AlertCircle className="w-3 h-3 mr-1" /> :
           <CheckCircle className="w-3 h-3 mr-1" />}
          <span>
            {status === 'out-of-stock' ? 'Out of Stock' : 
             status === 'low-stock' ? 'Low Stock' : 
             'In Stock'}
          </span>
        </span>
        {product.isOldStock && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200" title="Missed in latest imported Excel">
            <Clock className="w-2.5 h-2.5 text-amber-600" />
            Old Stock
          </span>
        )}
      </div>
    );
  };

  const renderProductImage = (image: string | undefined, name: string, size: 'small' | 'medium' = 'small') => {
    const sizeClasses = size === 'small' 
      ? 'w-12 h-12' 
      : 'w-20 h-20';
    
    if (image) {
      return (
        <img 
          src={image} 
          alt={name}
          className={`${sizeClasses} object-cover rounded-lg border border-gray-200`}
          loading="lazy"
        />
      );
    }
    
    return (
      <div className={`${sizeClasses} bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200`}>
        <ImageIcon className="w-6 h-6 text-gray-400" />
      </div>
    );
  };

  // ============ MODALS ============
  const renderAddStockModal = () => {
    const selectedProd = products.find(p => p.id === stockFormData.productId);
    const filteredProdList = products.filter(p => 
      (p.name || '').toLowerCase().includes(stockProductSearch.toLowerCase()) ||
      (p.category || '').toLowerCase().includes(stockProductSearch.toLowerCase())
    );

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100">
          <div className="flex justify-between items-center pb-4 border-b border-gray-100 mb-5">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center font-bold">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Add Stock to Existing Product</h3>
                <p className="text-xs text-gray-500">Restock already registered inventory items</p>
              </div>
            </div>
            <button
              onClick={() => setIsAddStockModalOpen(false)}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Search and Select Product */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1.5">
                Select Existing Product *
              </label>
              <div className="relative mb-2">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={stockProductSearch}
                  onChange={(e) => setStockProductSearch(e.target.value)}
                  placeholder="Filter product by name or category..."
                  className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-emerald-400 outline-none"
                />
              </div>

              <select
                value={stockFormData.productId}
                onChange={(e) => {
                  const prodId = e.target.value;
                  const found = products.find(p => p.id === prodId);
                  setStockFormData(prev => ({
                    ...prev,
                    productId: prodId,
                    unitPrice: found ? found.currentPrice || 0 : 0
                  }));
                }}
                className="w-full px-3 py-2.5 border rounded-lg text-sm bg-white font-medium text-gray-800 focus:ring-2 focus:ring-emerald-400 outline-none"
              >
                <option value="">-- Choose Product ({filteredProdList.length} items) --</option>
                {filteredProdList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.category}) — Current Stock: {p.totalQuantity} (₹{p.currentPrice || 0})
                  </option>
                ))}
              </select>
            </div>

            {selectedProd && (
              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 flex items-center justify-between text-xs text-emerald-900">
                <div>
                  <span className="font-semibold">Current On-Shelf Stock:</span> {selectedProd.totalQuantity} units
                </div>
                <div>
                  <span className="font-semibold">Current Price:</span> ₹{selectedProd.currentPrice || 0}
                </div>
              </div>
            )}

            {/* Quantity and Price */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Quantity to Add *
                </label>
                <input
                  type="number"
                  min="1"
                  value={stockFormData.quantity}
                  onChange={(e) => setStockFormData(prev => ({ ...prev, quantity: Math.max(1, parseInt(e.target.value) || 0) }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-semibold focus:ring-2 focus:ring-emerald-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Purchase Unit Price (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={stockFormData.unitPrice}
                  onChange={(e) => setStockFormData(prev => ({ ...prev, unitPrice: Math.max(0, parseFloat(e.target.value) || 0) }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-semibold focus:ring-2 focus:ring-emerald-400 outline-none"
                />
              </div>
            </div>

            {/* Date & Vendor Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Stock Arrival Date
              </label>
              <input
                type="date"
                value={stockFormData.date}
                onChange={(e) => setStockFormData(prev => ({ ...prev, date: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Vendor / Supplier / Batch Remarks
              </label>
              <input
                type="text"
                value={stockFormData.vendorNotes}
                onChange={(e) => setStockFormData(prev => ({ ...prev, vendorNotes: e.target.value }))}
                placeholder="e.g. Batch #402, Supplier XYZ Corp"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
              />
            </div>

            {selectedProd && stockFormData.quantity > 0 && (
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-700">
                <div className="flex justify-between font-bold text-gray-900">
                  <span>New Total Stock:</span>
                  <span>{selectedProd.totalQuantity + stockFormData.quantity} units</span>
                </div>
                <div className="flex justify-between mt-1 text-gray-600">
                  <span>Batch Added Value:</span>
                  <span>₹{(stockFormData.quantity * (stockFormData.unitPrice || 0)).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsAddStockModalOpen(false)}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium rounded-xl hover:bg-gray-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSaveAddStock('quote_purpose')}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl shadow-sm transition flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4" />
              Quote Purpose Stock
            </button>
            <button
              type="button"
              onClick={() => handleSaveAddStock('standard')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              New Stock
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderAddProductModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">Add New Product</h2>
          <button
            onClick={() => setIsAddModalOpen(false)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleAddProduct} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Name *
              </label>
              <input
                type="text"
                value={newProduct.name}
                onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter product name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                SKU *
              </label>
              <input
                type="text"
                value={newProduct.sku}
                onChange={(e) => setNewProduct({...newProduct, sku: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., CEL-4-7619"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Enter a unique SKU for this product</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category *
              </label>
              <input
                type="text"
                value={newProduct.category}
                onChange={(e) => setNewProduct({...newProduct, category: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Electronics, Clothing, Food"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                HSN Code
              </label>
              <input
                type="text"
                value={newProduct.hsnCode}
                onChange={(e) => setNewProduct({...newProduct, hsnCode: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 84713000, 61091000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price (per unit) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newProduct.price}
                onChange={(e) => setNewProduct({...newProduct, price: parseFloat(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Initial Quantity
              </label>
              <input
                type="number"
                min="0"
                value={newProduct.quantity}
                onChange={(e) => setNewProduct({...newProduct, quantity: parseInt(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Low Stock Threshold
              </label>
              <input
                type="number"
                min="0"
                value={newProduct.lowStockThreshold}
                onChange={(e) => setNewProduct({...newProduct, lowStockThreshold: parseInt(e.target.value) || 10})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Image Upload Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product Image
            </label>
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                {newProduct.image ? (
                  <div className="relative">
                    <img 
                      src={newProduct.image} 
                      alt="Product preview" 
                      className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveAddImage}
                      className="absolute -top-2 -right-2 p-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200">
                    <ImageIcon className="w-8 h-8 text-gray-400" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <input
                  ref={addImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAddImageUpload}
                  className="hidden"
                  id="add-image-upload"
                />
                <label
                  htmlFor="add-image-upload"
                  className={`px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer inline-flex items-center ${
                    imageUploading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {imageUploading ? 'Uploading...' : 'Upload Image'}
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Max size: 2MB. Supported: JPG, PNG, GIF
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={newProduct.description}
              onChange={(e) => setNewProduct({...newProduct, description: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="Product description..."
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 text-sm font-medium transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleAddProduct('quote_purpose')}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl shadow-sm transition flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4" />
              For Quote Purpose
            </button>
            <button
              type="button"
              onClick={() => handleAddProduct('inventory')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition flex items-center gap-1.5"
            >
              <Package className="w-4 h-4" />
              New Inventory Product
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderEditProductModal = () => {
    if (!selectedProduct) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Edit Product</h2>
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <form onSubmit={handleUpdateProduct} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  value={editForm.name || selectedProduct.name}
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SKU *
                </label>
                <input
                  type="text"
                  value={editForm.sku !== undefined ? editForm.sku : selectedProduct.sku || ''}
                  onChange={(e) => setEditForm({...editForm, sku: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  placeholder="Enter unique SKU"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category *
                </label>
                <input
                  type="text"
                  value={editForm.category || selectedProduct.category}
                  onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  HSN Code
                </label>
                <input
                  type="text"
                  value={editForm.hsnCode !== undefined ? editForm.hsnCode : selectedProduct.hsnCode || ''}
                  onChange={(e) => setEditForm({...editForm, hsnCode: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 84713000, 61091000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Price (per unit)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={selectedProduct.currentPrice || 0}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
                <p className="text-xs text-gray-500 mt-1">Price can only be changed when adding new stock</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Low Stock Threshold
                </label>
                <input
                  type="number"
                  min="0"
                  value={editForm.lowStockThreshold || selectedProduct.lowStockThreshold}
                  onChange={(e) => setEditForm({...editForm, lowStockThreshold: parseInt(e.target.value) || 10})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Image Upload Section in Edit Modal */}
              <div className="md:col-span-2">
                <div className="border-t border-gray-200 pt-4 mt-2">
                  <h3 className="text-md font-semibold text-gray-900 mb-3">Product Image</h3>
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      {editForm.image !== undefined ? (
                        editForm.image ? (
                          <div className="relative">
                            <img 
                              src={editForm.image} 
                              alt="Product preview" 
                              className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                            />
                            <button
                              type="button"
                              onClick={handleRemoveEditImage}
                              className="absolute -top-2 -right-2 p-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200">
                            <ImageIcon className="w-8 h-8 text-gray-400" />
                          </div>
                        )
                      ) : (
                        selectedProduct.image ? (
                          <div className="relative">
                            <img 
                              src={selectedProduct.image} 
                              alt={selectedProduct.name} 
                              className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                            />
                          </div>
                        ) : (
                          <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200">
                            <ImageIcon className="w-8 h-8 text-gray-400" />
                          </div>
                        )
                      )}
                    </div>
                    <div className="flex-1">
                      <input
                        ref={editImageInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleEditImageUpload}
                        className="hidden"
                        id="edit-image-upload"
                      />
                      <label
                        htmlFor="edit-image-upload"
                        className={`px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer inline-flex items-center ${
                          imageUploading ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {imageUploading ? 'Uploading...' : editForm.image !== undefined ? 'Change Image' : 'Upload Image'}
                      </label>
                      {editForm.image !== undefined && editForm.image === '' && (
                        <span className="ml-2 text-sm text-red-600">Image removed</span>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Max size: 2MB. Supported: JPG, PNG, GIF
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quantity Edit Section */}
              <div className="md:col-span-2">
                <div className="border-t border-gray-200 pt-4 mt-2">
                  <h3 className="text-md font-semibold text-gray-900 mb-3">Quantity Management</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Quantity
                      </label>
                      <input
                        type="number"
                        value={selectedProduct.totalQuantity}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        New Quantity
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.newQuantity !== undefined ? editForm.newQuantity : selectedProduct.totalQuantity}
                        onChange={(e) => setEditForm({...editForm, newQuantity: parseInt(e.target.value) || 0})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter new quantity"
                      />
                      {editForm.newQuantity !== undefined && editForm.newQuantity !== selectedProduct.totalQuantity && (
                        <p className={`text-xs mt-1 ${
                          editForm.newQuantity > selectedProduct.totalQuantity 
                            ? 'text-green-600' 
                            : 'text-red-600'
                        }`}>
                          {editForm.newQuantity > selectedProduct.totalQuantity 
                            ? `This will add ${editForm.newQuantity - selectedProduct.totalQuantity} units` 
                            : `This will remove ${selectedProduct.totalQuantity - editForm.newQuantity} units`}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Changing quantity will create a transaction record</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={editForm.description !== undefined ? editForm.description : selectedProduct.description || ''}
                onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Update Product
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderTransactionModal = () => {
    if (!selectedProduct) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl w-full max-w-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              {transactionForm.type === 'add' ? 'Add Stock' : 'Deliver Stock'}
            </h2>
            <button
              onClick={() => setIsTransactionModalOpen(false)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-3">
              {selectedProduct.image && (
                <img 
                  src={selectedProduct.image} 
                  alt={selectedProduct.name} 
                  className="w-12 h-12 object-cover rounded-lg border border-gray-200"
                />
              )}
              <div>
                <h3 className="font-medium text-gray-900">{selectedProduct.name}</h3>
                <p className="text-sm text-gray-600">SKU: {selectedProduct.sku || 'N/A'}</p>
                <p className="text-sm text-gray-600">Current Stock: {selectedProduct.totalQuantity}</p>
                <p className="text-sm text-gray-600">Current Price: {formatCurrency(selectedProduct.currentPrice || 0)}</p>
                {selectedProduct.hsnCode && (
                  <p className="text-sm text-gray-600">HSN Code: {selectedProduct.hsnCode}</p>
                )}
              </div>
            </div>
          </div>
          
          <form onSubmit={handleTransaction} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transaction Type
              </label>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setTransactionForm({...transactionForm, type: 'add'})}
                  className={`flex-1 py-2 rounded-lg border ${
                    transactionForm.type === 'add' 
                      ? 'bg-green-100 text-green-700 border-green-300' 
                      : 'bg-gray-100 text-gray-700 border-gray-300'
                  }`}
                >
                  <Plus className="w-4 h-4 inline mr-2" />
                  Add Stock
                </button>
                <button
                  type="button"
                  onClick={() => setTransactionForm({...transactionForm, type: 'deliver'})}
                  className={`flex-1 py-2 rounded-lg border ${
                    transactionForm.type === 'deliver' 
                      ? 'bg-red-100 text-red-700 border-red-300' 
                      : 'bg-gray-100 text-gray-700 border-gray-300'
                  }`}
                >
                  <Truck className="w-4 h-4 inline mr-2" />
                  Deliver Stock
                </button>
              </div>
            </div>

            {transactionForm.type === 'add' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price (per unit) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={transactionForm.price}
                  onChange={(e) => setTransactionForm({...transactionForm, price: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={selectedProduct.currentPrice?.toString() || "0.00"}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Current price: {formatCurrency(selectedProduct.currentPrice || 0)}
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity *
              </label>
              <input
                type="number"
                min="1"
                value={transactionForm.quantity}
                onChange={(e) => setTransactionForm({...transactionForm, quantity: parseInt(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-semibold"
                required
              />
            </div>

            {transactionForm.type === 'deliver' && (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
                <label className="flex items-start space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={transactionForm.deductFromInventory}
                    onChange={(e) => setTransactionForm({ ...transactionForm, deductFromInventory: e.target.checked })}
                    className="w-4 h-4 mt-0.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-gray-900 block">
                      Deduct from physical inventory stock
                    </span>
                    <span className="text-gray-500 block mt-0.5">
                      Uncheck for Quotation, Testing, or Sample dispatches (stock remains unchanged).
                    </span>
                  </div>
                </label>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={transactionForm.notes}
                onChange={(e) => setTransactionForm({...transactionForm, notes: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={2}
                placeholder="Add notes about this transaction..."
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setIsTransactionModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Confirm {transactionForm.type === 'add' ? 'Add' : 'Deliver'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderDeleteConfirmModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl w-full max-w-md p-6">
        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Product</h3>
          <p className="text-gray-600">
            Are you sure you want to delete this product? This action cannot be undone.
          </p>
        </div>
        
        <div className="flex justify-center space-x-3">
          <button
            onClick={() => setIsDeleteConfirmOpen(false)}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => productToDelete && handleDeleteProduct(productToDelete)}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Delete Product
          </button>
        </div>
      </div>
    </div>
  );

  const renderDeleteRequestConfirmModal = () => {
    if (!productToRequestDelete) return null;
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl w-full max-w-md p-6">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-yellow-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Request Delete Product</h3>
            <p className="text-gray-600">
              Are you sure you want to request the deletion of "{productToRequestDelete.name}"?
              This request will be sent to the administrator for approval.
            </p>
          </div>
          
          <div className="flex justify-center space-x-3">
            <button
              onClick={() => setIsDeleteRequestConfirmOpen(false)}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => handleRequestDelete(productToRequestDelete.id)}
              className="px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
            >
              Submit Request
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderDeleteRequestsModal = () => {
    if (!isDeleteRequestsModalOpen) return null;
    const pendingRequests = products.filter(p => p.deleteRequested);
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Inventory Deletion Requests</h2>
            <button
              onClick={() => setIsDeleteRequestsModalOpen(false)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {pendingRequests.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-gray-600">No pending delete requests.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-700 uppercase">
                  <tr>
                    <th className="px-4 py-3">Item name</th>
                    <th className="px-4 py-3">Details</th>
                    <th className="px-4 py-3">Stock & Price</th>
                    <th className="px-4 py-3">Requested By</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRequests.map(product => (
                    <tr key={product.id} className="border-b">
                      <td className="px-4 py-3 font-medium text-gray-900">{product.name}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {product.sku && <div className="text-xs">SKU: {product.sku}</div>}
                        {product.category && <div className="text-xs">Cat: {product.category}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <div className="text-xs">Qty: {product.totalQuantity}</div>
                        <div className="text-xs">Price: {formatCurrency(product.currentPrice || 0)}</div>
                      </td>
                      <td className="px-4 py-3">{product.deleteRequestedByName}</td>
                      <td className="px-4 py-3">
                        {product.deleteRequestedAt ? formatDateTime(product.deleteRequestedAt) : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleApproveDelete(product)}
                          className="text-green-600 hover:bg-green-50 px-3 py-1 rounded mr-2 border border-green-200"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectDelete(product.id)}
                          className="text-red-600 hover:bg-red-50 px-3 py-1 rounded border border-red-200"
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDetailsModal = () => {
    if (!selectedDetailsProduct) return null;

    // Fetch latest product data in case of updates
    const product = products.find(p => p.id === selectedDetailsProduct.id) || selectedDetailsProduct;
    const canEdit = canEditProduct(product);
    const currentTotalValue = (product.currentPrice || 0) * product.totalQuantity;
    const deliveryTotalValue = transactions
      .filter(t => t.productId === product.id && t.type === 'deliver')
      .reduce((sum, t) => sum + t.totalAmount, 0);

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl w-full max-w-4xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100">
          {/* Header */}
          <div className="flex items-start justify-between pb-3.5 border-b border-gray-100 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{product.name}</h2>
                  {(product.isQuoteOnly || product.productType === 'quote_purpose') && (
                    <span className="px-2.5 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700 rounded-full border border-purple-200">
                      Quote Purpose
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                  Category: <span className="font-medium text-gray-700">{product.category}</span>
                  {product.sku && <> • SKU: <span className="font-mono text-gray-700">{product.sku}</span></>}
                  {product.hsnCode && <> • HSN: <span className="font-mono text-gray-700">{product.hsnCode}</span></>}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0 ml-3">
              <button
                onClick={() => {
                  setIsDetailsModalOpen(false);
                  setSelectedDetailsProduct(null);
                  setShowStockHistoryInModal(false);
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setShowStockHistoryInModal(!showStockHistoryInModal)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border ${
                  showStockHistoryInModal
                    ? 'bg-gray-200 text-black border-gray-400'
                    : 'bg-gray-100 hover:bg-gray-200 text-black border-gray-300'
                }`}
              >
                <span>View stock entries and history</span>
                <ChevronDown className={`w-3.5 h-3.5 text-black transition-transform duration-200 ${showStockHistoryInModal ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {/* Product Overview Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* Left: Product Image & Meta */}
            <div className="bg-gray-50/70 rounded-xl p-3 border border-gray-200/80 flex flex-col items-center justify-between">
              <div className="w-full flex items-center justify-center py-1">
                {product.image ? (
                  <img 
                    src={product.image} 
                    alt={product.name} 
                    className="w-28 h-28 object-contain rounded-lg border border-gray-200 bg-white"
                  />
                ) : (
                  <div className="w-28 h-28 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                    <ImageIcon className="w-10 h-10" />
                  </div>
                )}
              </div>
              <div className="w-full space-y-1.5 text-xs text-gray-600 pt-2 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Status:</span>
                  <span>{renderStockBadge(product)}</span>
                </div>
                {product.createdByName && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Created By:</span>
                    <span className="font-medium text-gray-800 truncate max-w-[140px]" title={resolveUserName(product.createdByName, product.createdBy)}>
                      {resolveUserName(product.createdByName, product.createdBy)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Last Updated:</span>
                  <span className="font-medium text-gray-800">{formatDate(product.updatedAt)}</span>
                </div>
              </div>
            </div>

            {/* Middle & Right: Key Metrics Grid */}
            <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100/80 flex flex-col justify-center">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Current Stock</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{product.totalQuantity}</p>
              </div>

              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200/80 flex flex-col justify-center">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Original Qty</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{calculateOriginalQuantity(product)}</p>
              </div>

              <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-100/80 flex flex-col justify-center">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Sale Price</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(product.currentPrice || 0)}</p>
              </div>

              <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100/80 flex flex-col justify-center">
                <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Current Value</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(currentTotalValue)}</p>
              </div>

              <div className="p-3.5 bg-purple-50/60 rounded-xl border border-purple-100/80 flex flex-col justify-center">
                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Purchase Value</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(calculateOriginalPurchaseValue(product))}</p>
              </div>

              <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-100/80 flex flex-col justify-center">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Delivered Value</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(deliveryTotalValue)}</p>
              </div>

              {product.description && (
                <div className="col-span-2 sm:col-span-3 p-2.5 bg-gray-50 rounded-xl border border-gray-200/80 text-xs">
                  <span className="font-semibold text-gray-600 uppercase tracking-wider block mb-0.5">Description</span>
                  <span className="text-gray-700">{product.description}</span>
                </div>
              )}
            </div>
          </div>

          {/* Expandable Stock Entries and History Section */}
          {showStockHistoryInModal && (
            <div className="pt-3 pb-2 border-t border-gray-100 mb-2">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <ClipboardList className="w-4 h-4 text-gray-700" />
                  Stock Entries & History
                </h3>
                <span className="text-xs text-gray-500 font-medium">
                  {product.stockEntries?.length || 0} total records
                </span>
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-xs">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Added Qty</th>
                      <th className="py-3 px-4">Dispatched Qty</th>
                      <th className="py-3 px-4">Unit Price</th>
                      <th className="py-3 px-4">Total Price</th>
                      <th className="py-3 px-4">Added By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(product.stockEntries || []).map((entry, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 text-gray-600">
                          <div className="flex items-center text-xs">
                            <Calendar className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                            {entry.date instanceof Timestamp 
                              ? formatDateTime(entry.date)
                              : formatDateTime(new Date(entry.date))}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            entry.type === 'quote_deliver'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : entry.type === 'deliver'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {entry.type === 'quote_deliver' ? '📝 Quotation Dispatch' : entry.type === 'deliver' ? 'Dispatched' : 'Added'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-green-700">
                          {entry.type === 'add' || entry.type === 'quote_add' ? Math.abs(entry.quantity) : '-'}
                        </td>
                        <td className="py-3 px-4 font-semibold text-orange-700">
                          {entry.type === 'deliver' ? Math.abs(entry.quantity) : entry.type === 'quote_deliver' ? <span className="text-purple-600 font-medium">0 ({Math.abs(entry.quantity)} test)</span> : '-'}
                        </td>
                        <td className="py-3 px-4">{formatCurrency(entry.unitPrice)}</td>
                        <td className="py-3 px-4 font-medium">{formatCurrency(entry.totalPrice)}</td>
                        <td className="py-3 px-4 font-medium text-gray-800">{resolveUserName(entry.addedByName, entry.addedBy)}</td>
                      </tr>
                    ))}
                    {(!product.stockEntries || product.stockEntries.length === 0) && (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-gray-500">
                          No stock entries recorded for this product yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setIsDetailsModalOpen(false);
                setSelectedDetailsProduct(null);
                setShowStockHistoryInModal(false);
              }}
              className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderImportModal = () => {
    if (!importSummary) return null;

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-100 max-h-[90vh] flex flex-col">
          <div className="flex justify-between items-center pb-4 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Import Excel & Overwrite Inventory</h3>
                <p className="text-xs text-gray-500 font-mono">{importSummary.fileName} • {importSummary.totalRows} rows processed</p>
              </div>
            </div>
            <button
              onClick={() => {
                setIsImportModalOpen(false);
                setImportSummary(null);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto py-4 space-y-4 flex-1">
            {/* Sheet Selector (when workbook has multiple sheets) */}
            {importSummary.availableSheets && importSummary.availableSheets.length > 1 && (
              <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    Select Sheet to Import:
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {importSummary.availableSheets.length - 1} sheets found in workbook
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {importSummary.availableSheets.map(sh => (
                    <button
                      key={sh.name}
                      type="button"
                      onClick={() => handleSelectImportSheet(sh.name)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-1.5 ${
                        importSummary.selectedSheet === sh.name
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200"
                      }`}
                    >
                      <span>{sh.name === 'all' ? 'All Sheets Combined' : sh.name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                        importSummary.selectedSheet === sh.name ? "bg-white/25 text-white" : "bg-slate-100 text-slate-600"
                      }`}>
                        {sh.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl">
                <div className="flex items-center justify-between text-blue-700 text-xs font-semibold uppercase">
                  <span>Overwrite & Update</span>
                  <RefreshCw className="w-3.5 h-3.5" />
                </div>
                <p className="text-2xl font-bold text-blue-900 mt-1">{importSummary.matchedProducts.length}</p>
                <p className="text-[11px] text-blue-600 mt-0.5">Existing products to update</p>
              </div>

              <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl">
                <div className="flex items-center justify-between text-amber-700 text-xs font-semibold uppercase">
                  <span>Mark as Old Stock</span>
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <p className="text-2xl font-bold text-amber-900 mt-1">{importSummary.missedProducts.length}</p>
                <p className="text-[11px] text-amber-700 mt-0.5">Missed in new sheet</p>
              </div>

              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl">
                <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold uppercase">
                  <span>New Products</span>
                  <Plus className="w-3.5 h-3.5" />
                </div>
                <p className="text-2xl font-bold text-emerald-900 mt-1">{importSummary.newProducts.length}</p>
                <p className="text-[11px] text-emerald-600 mt-0.5">New items found in sheet</p>
              </div>
            </div>

            {/* Explanation notice */}
            <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700 space-y-1.5">
              <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-blue-600" />
                <span>How the import will be applied:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 pl-1 text-gray-600">
                <li>Existing matching products will have their <strong>SOH (Quantity)</strong> and prices updated directly with the values in your spreadsheet.</li>
                <li>Any product currently in your inventory that was <strong>not in the new file</strong> will be tagged as <span className="px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800 border border-amber-300">Old Stock</span>.</li>
                <li>You can easily filter or find all Old Stock products at any time using the <em>Old Stock</em> filter.</li>
              </ul>
            </div>

            {/* Preview of Missed (Old Stock) Products */}
            {importSummary.missedProducts.length > 0 && (
              <div className="border border-amber-200 bg-amber-50/40 rounded-xl p-3">
                <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  Sample products to be marked as "Old Stock" ({importSummary.missedProducts.length} total):
                </h4>
                <div className="max-h-28 overflow-y-auto space-y-1 text-xs">
                  {importSummary.missedProducts.slice(0, 5).map(p => (
                    <div key={p.id} className="flex justify-between items-center py-1 px-2 bg-white/80 rounded border border-amber-200/60">
                      <span className="font-medium text-gray-900 truncate max-w-[280px]">{p.name}</span>
                      <span className="text-gray-500 font-mono text-[11px]">Current SOH: {p.totalQuantity}</span>
                    </div>
                  ))}
                  {importSummary.missedProducts.length > 5 && (
                    <p className="text-[11px] text-amber-700 text-center italic pt-1">
                      + {importSummary.missedProducts.length - 5} more products will be identified as Old Stock
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setIsImportModalOpen(false);
                setImportSummary(null);
              }}
              disabled={isImporting}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isImporting}
              className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Applying Changes...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Confirm & Overwrite Inventory
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ============ PAGINATION RENDER ============
  const renderPagination = () => {
    if (totalPages <= 1) return null;

    return (
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={goToPage}
        totalItems={filteredProducts.length}
        itemsPerPage={itemsPerPage}
        pageSizeOptions={[10, 20, 50, 100]}
        onPageSizeChange={(newSize) => {
          setItemsPerPage(newSize);
          setCurrentPage(1);
        }}
        itemLabel="products"
        className="mt-6 border border-[#E1E5F0] rounded-2xl"
      />
    );
  };

  // ============ MAIN RENDER ============
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading user data...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>
          </div>
          
          <div className="flex space-x-3 mt-4 md:mt-0">
            {canAddProduct() && (
              <>
                <button
                  onClick={() => setIsAddStockModalOpen(true)}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center font-medium shadow-sm transition cursor-pointer"
                >
                  <Plus className="w-5 h-5 mr-1.5" />
                  Add Stock
                </button>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center font-medium shadow-sm transition cursor-pointer"
                >
                  <Package className="w-5 h-5 mr-1.5" />
                  Add New Product
                </button>
              </>
            )}
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4 mb-6">
          {/* Total SKUs */}
          <KPICard
            title="Total SKUs"
            value={stats.totalProducts.toLocaleString('en-IN')}
            icon={<Box className="w-4 h-4" />}
            iconBg="bg-indigo-50"
            iconColor="text-indigo-600"
            isActive={filterStock === 'all' && activeTab === 'all'}
            activeRingColor="border-indigo-400 ring-2 ring-indigo-500/20 bg-indigo-50/20"
            onClick={() => {
              setActiveTab('all');
              setFilterStock('all');
            }}
            tooltip="Total unique items in catalog (Stock Keeping Units - Item-wise count)"
          />

          {/* Total SOH */}
          <KPICard
            title="Total SOH"
            value={stats.totalSOH.toLocaleString('en-IN')}
            icon={<Layers className="w-4 h-4" />}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
            subtitle="units"
            isActive={filterStock === 'all'}
            activeRingColor="border-blue-400 ring-2 ring-blue-500/20 bg-blue-50/20"
            onClick={() => {
              setActiveTab('all');
              setFilterStock('all');
            }}
            tooltip="Click to view all stock"
          />

          {/* Total Purchase Value */}
          <KPICard
            title="Total Purchase Value"
            value={formatCurrency(stats.totalPurchasedValue)}
            icon={<IndianRupee className="w-4 h-4" />}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            subtitle={stats.currentStockPurchaseValue > 0 ? `Stock SOH: ${formatCurrency(stats.currentStockPurchaseValue)}` : undefined}
            onClick={() => {
              setActiveTab('all');
              setFilterStock('all');
            }}
            tooltip="Total purchase value of all products purchased in inventory"
          />

          {/* Low Stock */}
          <KPICard
            title="Low Stock"
            value={stats.lowStock}
            icon={<AlertCircle className="w-4 h-4" />}
            iconBg={filterStock === 'low' ? 'bg-orange-500' : 'bg-orange-50'}
            iconColor={filterStock === 'low' ? 'text-white' : 'text-orange-600'}
            valueColor="text-orange-600"
            badge={filterStock === 'low' ? { text: "Filtered", variant: "warning" } : undefined}
            subtitle={filterStock !== 'low' ? <span className="group-hover:text-orange-600 transition-colors">Filter &rarr;</span> : undefined}
            isActive={filterStock === 'low'}
            activeRingColor="bg-orange-50/70 border-orange-400 ring-2 ring-orange-500 shadow-sm"
            onClick={() => {
              setActiveTab('all');
              setFilterStock(filterStock === 'low' ? 'all' : 'low');
            }}
            tooltip={filterStock === 'low' ? 'Click to show all products' : 'Click to filter low stock items only'}
          />

          {/* Out of Stock */}
          <KPICard
            title="Out of Stock"
            value={stats.outOfStock}
            icon={<XCircle className="w-4 h-4" />}
            iconBg={filterStock === 'out' ? 'bg-rose-500' : 'bg-rose-50'}
            iconColor={filterStock === 'out' ? 'text-white' : 'text-rose-600'}
            valueColor="text-rose-600"
            badge={filterStock === 'out' ? { text: "Filtered", variant: "danger" } : undefined}
            subtitle={filterStock !== 'out' ? <span className="group-hover:text-rose-600 transition-colors">Filter &rarr;</span> : undefined}
            isActive={filterStock === 'out'}
            activeRingColor="bg-rose-50/70 border-rose-400 ring-2 ring-rose-500 shadow-sm"
            onClick={() => {
              setActiveTab('all');
              setFilterStock(filterStock === 'out' ? 'all' : 'out');
            }}
            tooltip={filterStock === 'out' ? 'Click to show all products' : 'Click to filter out-of-stock items only'}
          />
        </div>

        {/* Tabs and Actions Row below statistics */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-gray-200">
          <div className="flex space-x-2 sm:space-x-4">
            <button
              onClick={() => setActiveTab('all')}
              className={`py-2.5 px-4 sm:px-5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'all'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              All Inventory
            </button>
            <button
              onClick={() => setActiveTab('fast-moving')}
              className={`py-2.5 px-4 sm:px-5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'fast-moving'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Fast Moving Items
            </button>
          </div>

          <div className="flex items-center space-x-2.5 pb-2.5 sm:pb-2">
            <input
              type="file"
              ref={importExcelInputRef}
              onChange={handleImportExcelFile}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />
            {canAddProduct() && (
              <button
                onClick={() => importExcelInputRef.current?.click()}
                disabled={isImporting}
                className="px-3.5 py-1.5 text-xs sm:text-sm border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg flex items-center font-medium cursor-pointer transition shadow-2xs"
                title="Import Excel sheet to overwrite existing products and flag missed ones as Old Stock"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                {isImporting ? 'Importing...' : 'Import Excel'}
              </button>
            )}
            <button
              onClick={handleExportCSV}
              disabled={isExporting}
              className="px-3.5 py-1.5 text-xs sm:text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center bg-white shadow-2xs font-medium cursor-pointer transition"
            >
              <Download className="w-4 h-4 mr-1.5" />
              {isExporting ? 'Exporting...' : 'Export Excel'}
            </button>
            {canViewTransactions() && (
              <button
                onClick={() => setShowTransactions(!showTransactions)}
                className="px-3.5 py-1.5 text-xs sm:text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center bg-white shadow-2xs font-medium cursor-pointer transition"
              >
                {showTransactions ? <EyeOff className="w-4 h-4 mr-1.5" /> : <Eye className="w-4 h-4 mr-1.5" />}
                {showTransactions ? 'Hide History' : 'Show History'}
              </button>
            )}
            {user.role === 'admin' && (
              <button
                onClick={() => setIsDeleteRequestsModalOpen(true)}
                className="px-3.5 py-1.5 text-xs sm:text-sm bg-yellow-100 text-yellow-800 border border-yellow-300 rounded-lg hover:bg-yellow-200 flex items-center relative font-medium cursor-pointer transition"
              >
                <ClipboardList className="w-4 h-4 mr-1.5" />
                Delete Requests
                {products.filter(p => p.deleteRequested).length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {products.filter(p => p.deleteRequested).length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {activeTab === 'fast-moving' && (
          <div className="space-y-6 mb-6">
            {/* Header controls: Periods (Yesterday, Today, Past Dates) and Specific Date Picker on the right */}
            <div className="bg-white rounded-2xl shadow-xs border border-gray-200/80 p-4 sm:p-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                    <span className="w-2.5 h-6 bg-blue-600 rounded-full inline-block"></span>
                    Fast Moving Components
                  </h2>

                  {/* Period Pills: Yesterday, Today, Past Dates */}
                  <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-xl border border-gray-200/80 shrink-0">
                    <button
                      onClick={() => {
                        setFastMovingPeriod('yesterday');
                        setFastMovingCustomDate('');
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                        fastMovingPeriod === 'yesterday' && !fastMovingCustomDate
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      Yesterday
                    </button>
                    <button
                      onClick={() => {
                        setFastMovingPeriod('today');
                        setFastMovingCustomDate('');
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                        fastMovingPeriod === 'today' && !fastMovingCustomDate
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      Today
                    </button>
                    <button
                      onClick={() => {
                        if (fastMovingPeriod !== 'all' && fastMovingPeriod !== 'past7' && fastMovingPeriod !== 'past30') {
                          setFastMovingPeriod('all');
                        }
                        setFastMovingCustomDate('');
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        (fastMovingPeriod === 'all' || fastMovingPeriod === 'past7' || fastMovingPeriod === 'past30') && !fastMovingCustomDate
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Past Dates</span>
                    </button>
                  </div>
                </div>

                {/* Specific Date Option on Right Side */}
                <div className="flex items-center gap-2 self-start lg:self-auto shrink-0">
                  <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    Specific Date:
                  </span>
                  <input
                    type="date"
                    value={fastMovingCustomDate}
                    onChange={(e) => setFastMovingCustomDate(e.target.value)}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition-all ${
                      fastMovingCustomDate
                        ? 'border-blue-500 ring-2 ring-blue-500/20 bg-white font-semibold text-blue-900'
                        : 'border-gray-300 bg-white text-gray-700'
                    }`}
                  />
                  {fastMovingCustomDate && (
                    <button
                      onClick={() => setFastMovingCustomDate('')}
                      className="text-xs text-gray-400 hover:text-gray-600 underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Sub-range for Past Dates */}
              {(fastMovingPeriod === 'all' || fastMovingPeriod === 'past7' || fastMovingPeriod === 'past30') && !fastMovingCustomDate && (
                <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-gray-100 text-xs animate-in fade-in duration-200">
                  <span className="font-semibold text-gray-500">Past Range:</span>
                  <button
                    onClick={() => setFastMovingPeriod('past7')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      fastMovingPeriod === 'past7'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-white text-blue-800 hover:bg-blue-50 border border-blue-200/60'
                    }`}
                  >
                    Past 7 Days
                  </button>
                  <button
                    onClick={() => setFastMovingPeriod('past30')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      fastMovingPeriod === 'past30'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-white text-blue-800 hover:bg-blue-50 border border-blue-200/60'
                    }`}
                  >
                    Past 30 Days
                  </button>
                  <button
                    onClick={() => setFastMovingPeriod('all')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      fastMovingPeriod === 'all'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-white text-blue-800 hover:bg-blue-50 border border-blue-200/60'
                    }`}
                  >
                    All Previous Dates
                  </button>
                </div>
              )}
            </div>

            {/* Search Bar (Left) + Compact Low Stock Toggle (Right) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
              {/* Search Bar */}
              <div className="relative w-full sm:w-80">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={fastMovingSearch}
                  onChange={(e) => setFastMovingSearch(e.target.value)}
                  placeholder="Search fast-moving item..."
                  className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-xs transition-all"
                />
                {fastMovingSearch && (
                  <button
                    onClick={() => setFastMovingSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Small Low Stock Button on Right Side */}
              <button
                onClick={() => setFastMovingFilterLowStock(prev => !prev)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-xs self-start sm:self-auto shrink-0 ${
                  fastMovingFilterLowStock
                    ? 'bg-amber-500 text-white border-amber-600 ring-2 ring-amber-500/30'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-amber-400 hover:bg-amber-50/50'
                }`}
                title={fastMovingFilterLowStock ? 'Showing low stock items only — click to show all' : 'Click to filter low stock fast-moving items'}
              >
                <AlertCircle className={`w-3.5 h-3.5 ${fastMovingFilterLowStock ? 'text-white' : 'text-amber-500'}`} />
                <span>Low Stock Items:</span>
                <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold tabular-nums ${
                  fastMovingFilterLowStock ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-800'
                }`}>
                  {lowStockFastMovingCount}
                </span>
                {fastMovingFilterLowStock && (
                  <X className="w-3.5 h-3.5 ml-0.5 text-white/80 hover:text-white" />
                )}
              </button>
            </div>

            {/* Side-by-Side Tables: Approved Fast Moving vs Enquiry Fast Moving */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Approved Fast Moving Items Table */}
              <div className="bg-white rounded-2xl shadow-xs border border-gray-200/80 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                      Approved / Sold Fast Moving Components
                    </h3>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    fastMovingFilterLowStock 
                      ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {filteredApprovedFastMoving.length} {fastMovingFilterLowStock ? 'low stock' : 'items'}
                  </span>
                </div>

                <div className="overflow-x-auto flex-1 max-h-[420px] overflow-y-auto p-3 bg-slate-50/50">
                  <table className="w-full text-sm text-left border-separate border-spacing-y-1.5">
                    <thead className="bg-slate-50/90 backdrop-blur-xs text-slate-500 uppercase text-[10px] font-bold tracking-wider sticky top-0 z-10 border-b border-slate-200/80">
                      <tr>
                        <th className="px-3 py-2 text-center w-12">#</th>
                        <th className="px-3 py-2">Item name</th>
                        <th className="px-3 py-2 text-center">Stock (SOH)</th>
                        <th className="px-3 py-2 text-center">Qty Sold</th>
                        <th className="px-3 py-2 text-right">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs">
                      {currentApprovedFastMoving.map((p, i) => {
                        const rank = approvedFmStartIndex + i;
                        return (
                        <tr key={`${p.name}-${i}`} className="group transition-all duration-150">
                          <td className="px-3 py-2.5 text-center font-bold text-slate-500 bg-white group-hover:bg-slate-50/90 border-y border-l border-slate-200/80 rounded-l-xl shadow-2xs group-hover:shadow-xs transition-colors">
                            {rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : rank + 1}
                          </td>
                          <td className="px-3 py-2.5 bg-white group-hover:bg-slate-50/90 border-y border-slate-200/80 shadow-2xs group-hover:shadow-xs transition-colors">
                            <div className="font-bold text-slate-900">{p.name}</div>
                            <div className="text-[11px] text-slate-400">
                              {p.category} {p.sku && p.sku !== '-' ? `• SKU: ${p.sku}` : ''}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center bg-white group-hover:bg-slate-50/90 border-y border-slate-200/80 shadow-2xs group-hover:shadow-xs transition-colors">
                            {p.currentSOH !== null ? (
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                  p.isLowStock
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                {p.currentSOH}
                                {p.isLowStock && " (Low)"}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center bg-white group-hover:bg-slate-50/90 border-y border-slate-200/80 shadow-2xs group-hover:shadow-xs transition-colors">
                            <span className="inline-block px-2.5 py-0.5 rounded-md font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                              {p.quantity}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-extrabold text-slate-900 tabular-nums bg-white group-hover:bg-slate-50/90 border-y border-r border-slate-200/80 rounded-r-xl shadow-2xs group-hover:shadow-xs transition-colors">
                            {formatCurrency(p.totalValue)}
                          </td>
                        </tr>
                        );
                      })}

                      {filteredApprovedFastMoving.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 px-4 text-center bg-white rounded-xl border border-slate-200/80 shadow-2xs">
                            <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm font-medium text-gray-700">
                              {fastMovingFilterLowStock
                                ? "No low stock items found among fast-moving sales for this period"
                                : `No fast moving sales found for ${
                                    fastMovingCustomDate
                                      ? `date ${fastMovingCustomDate}`
                                      : fastMovingPeriod === 'today'
                                      ? "today"
                                      : fastMovingPeriod === 'yesterday'
                                      ? "yesterday"
                                      : "this period"
                                  }`}
                            </p>
                            {fastMovingFilterLowStock ? (
                              <button
                                onClick={() => setFastMovingFilterLowStock(false)}
                                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 underline cursor-pointer"
                              >
                                View all fast moving sales
                              </button>
                            ) : (
                              <>
                                <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                                  Sold items in bills will automatically rank here.
                                </p>
                                {fastMovingPeriod === 'today' && (
                                  <button
                                    onClick={() => {
                                      setFastMovingPeriod('all');
                                      setFastMovingCustomDate('');
                                    }}
                                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                                  >
                                    <span>View all previous dates</span>
                                    <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                                  </button>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {filteredApprovedFastMoving.length > fastMovingItemsPerPage && (
                  <div className="p-2.5 px-3 border-t border-gray-150 bg-gray-50/70 flex items-center justify-between text-xs text-gray-500">
                    <span>Showing {approvedFmStartIndex + 1}-{approvedFmEndIndex} of {filteredApprovedFastMoving.length}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setApprovedFastMovingPage((p) => Math.max(p - 1, 1))}
                        disabled={approvedFastMovingPage === 1}
                        className="px-2 py-1 bg-white border border-gray-200 rounded-md text-[11px] font-semibold hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                      >
                        Prev
                      </button>
                      <span className="text-[11px] font-bold px-1.5">{approvedFastMovingPage}/{totalApprovedFmPages}</span>
                      <button
                        onClick={() => setApprovedFastMovingPage((p) => Math.min(p + 1, totalApprovedFmPages))}
                        disabled={approvedFastMovingPage === totalApprovedFmPages}
                        className="px-2 py-1 bg-white border border-gray-200 rounded-md text-[11px] font-semibold hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Enquiry Fast Moving Items Table */}
              <div className="bg-white rounded-2xl shadow-xs border border-gray-200/80 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                    <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                      Enquiry Fast Moving Components
                    </h3>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    fastMovingFilterLowStock 
                      ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {filteredEnquiryFastMoving.length} {fastMovingFilterLowStock ? 'low stock' : 'items'}
                  </span>
                </div>

                <div className="overflow-x-auto flex-1 max-h-[420px] overflow-y-auto p-3 bg-slate-50/50">
                  <table className="w-full text-sm text-left border-separate border-spacing-y-1.5">
                    <thead className="bg-slate-50/90 backdrop-blur-xs text-slate-500 uppercase text-[10px] font-bold tracking-wider sticky top-0 z-10 border-b border-slate-200/80">
                      <tr>
                        <th className="px-3 py-2 text-center w-12">#</th>
                        <th className="px-3 py-2">Item name</th>
                        <th className="px-3 py-2 text-center">Stock (SOH)</th>
                        <th className="px-3 py-2 text-center">Requested Qty</th>
                        <th className="px-3 py-2 text-right">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs">
                      {currentEnquiryFastMoving.map((p, i) => {
                        const rank = enquiryFmStartIndex + i;
                        return (
                        <tr key={`${p.name}-${i}`} className="group transition-all duration-150">
                          <td className="px-3 py-2.5 text-center font-bold text-slate-500 bg-white group-hover:bg-slate-50/90 border-y border-l border-slate-200/80 rounded-l-xl shadow-2xs group-hover:shadow-xs transition-colors">
                            {rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : rank + 1}
                          </td>
                          <td className="px-3 py-2.5 bg-white group-hover:bg-slate-50/90 border-y border-slate-200/80 shadow-2xs group-hover:shadow-xs transition-colors">
                            <div className="font-bold text-slate-900">{p.name}</div>
                            <div className="text-[11px] text-slate-400">
                              {p.category} {p.sku && p.sku !== '-' ? `• SKU: ${p.sku}` : ''}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center bg-white group-hover:bg-slate-50/90 border-y border-slate-200/80 shadow-2xs group-hover:shadow-xs transition-colors">
                            {p.currentSOH !== null ? (
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                  p.isLowStock
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}
                              >
                                {p.currentSOH}
                                {p.isLowStock && " (Low)"}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center bg-white group-hover:bg-slate-50/90 border-y border-slate-200/80 shadow-2xs group-hover:shadow-xs transition-colors">
                            <span className="inline-block px-2.5 py-0.5 rounded-md font-extrabold bg-blue-50 text-blue-700 border border-blue-200/70">
                              {p.quantity}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-extrabold text-slate-900 tabular-nums bg-white group-hover:bg-slate-50/90 border-y border-r border-slate-200/80 rounded-r-xl shadow-2xs group-hover:shadow-xs transition-colors">
                            {formatCurrency(p.totalValue)}
                          </td>
                        </tr>
                        );
                      })}

                      {filteredEnquiryFastMoving.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 px-4 text-center bg-white rounded-xl border border-slate-200/80 shadow-2xs">
                            <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm font-medium text-gray-700">
                              {fastMovingFilterLowStock
                                ? "No low stock items found among enquiry fast-movers for this period"
                                : `No enquiry demands found for ${
                                    fastMovingCustomDate
                                      ? `date ${fastMovingCustomDate}`
                                      : fastMovingPeriod === 'today'
                                      ? "today"
                                      : fastMovingPeriod === 'yesterday'
                                      ? "yesterday"
                                      : "this period"
                                  }`}
                            </p>
                            {fastMovingFilterLowStock ? (
                              <button
                                onClick={() => setFastMovingFilterLowStock(false)}
                                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 underline cursor-pointer"
                              >
                                View all enquiry fast-movers
                              </button>
                            ) : (
                              <>
                                <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                                  Enquiry materials will automatically rank here.
                                </p>
                                {fastMovingPeriod === 'today' && (
                                  <button
                                    onClick={() => {
                                      setFastMovingPeriod('all');
                                      setFastMovingCustomDate('');
                                    }}
                                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                                  >
                                    <span>View all previous dates</span>
                                    <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                                  </button>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {filteredEnquiryFastMoving.length > fastMovingItemsPerPage && (
                  <div className="p-2.5 px-3 border-t border-gray-150 bg-gray-50/70 flex items-center justify-between text-xs text-gray-500">
                    <span>Showing {enquiryFmStartIndex + 1}-{enquiryFmEndIndex} of {filteredEnquiryFastMoving.length}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEnquiryFastMovingPage((p) => Math.max(p - 1, 1))}
                        disabled={enquiryFastMovingPage === 1}
                        className="px-2 py-1 bg-white border border-gray-200 rounded-md text-[11px] font-semibold hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                      >
                        Prev
                      </button>
                      <span className="text-[11px] font-bold px-1.5">{enquiryFastMovingPage}/{totalEnquiryFmPages}</span>
                      <button
                        onClick={() => setEnquiryFastMovingPage((p) => Math.min(p + 1, totalEnquiryFmPages))}
                        disabled={enquiryFastMovingPage === totalEnquiryFmPages}
                        className="px-2 py-1 bg-white border border-gray-200 rounded-md text-[11px] font-semibold hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'all' && (
          <>
            {/* Controls */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 mb-5 shadow-xs border border-gray-200/80">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search products by name, SKU, HSN code, category, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>
            
            <div className="flex space-x-2.5">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white"
              >
                <option value="all">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              
              <select
                value={filterStock}
                onChange={(e) => setFilterStock(e.target.value as StockFilter)}
                className="px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white"
              >
                <option value="all">All Stock</option>
                <option value="low">Low Stock</option>
                <option value="out">Out of Stock</option>
                <option value="normal">Normal Stock</option>
                <option value="old">⚠️ Old Stock ({stats.oldStock || 0})</option>
              </select>
            </div>
          </div>
        </div>

        {/* Transactions History */}
        {showTransactions && canViewTransactions() && (
          <div className="bg-white rounded-xl p-6 mb-6 shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Transaction History</h2>
              <div className="flex space-x-3">
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setTransactionFilter('all')}
                    className={`px-3 py-1 rounded-md text-sm font-medium ${
                      transactionFilter === 'all' 
                        ? 'bg-white shadow text-gray-900' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    All ({transactionStats.totalCount})
                  </button>
                  <button
                    onClick={() => setTransactionFilter('add')}
                    className={`px-3 py-1 rounded-md text-sm font-medium ${
                      transactionFilter === 'add' 
                        ? 'bg-white shadow text-green-600' 
                        : 'text-green-600 hover:text-green-700'
                    }`}
                  >
                    <Plus className="w-3 h-3 inline mr-1" />
                    Added ({transactionStats.addCount})
                  </button>
                  <button
                    onClick={() => setTransactionFilter('deliver')}
                    className={`px-3 py-1 rounded-md text-sm font-medium ${
                      transactionFilter === 'deliver' 
                        ? 'bg-white shadow text-blue-600' 
                        : 'text-blue-600 hover:text-blue-700'
                    }`}
                  >
                    <Truck className="w-3 h-3 inline mr-1" />
                    Delivered ({transactionStats.deliverCount})
                  </button>
                  <button
                    onClick={() => setTransactionFilter('delete')}
                    className={`px-3 py-1 rounded-md text-sm font-medium ${
                      transactionFilter === 'delete' 
                        ? 'bg-white shadow text-red-600' 
                        : 'text-red-600 hover:text-red-700'
                    }`}
                  >
                    <Trash2 className="w-3 h-3 inline mr-1" />
                    Deleted ({transactionStats.deleteCount})
                  </button>
                </div>
                
                {canDeleteTransactions() && (
                  <button
                    onClick={handleDeleteAllTransactions}
                    disabled={isDeletingTransactions}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    title={transactionFilter === 'all' ? 'Delete all transactions' : `Delete all ${transactionFilter} transactions`}
                  >
                    {isDeletingTransactions ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete {transactionFilter === 'all' ? 'All' : transactionFilter === 'add' ? 'Added' : transactionFilter === 'deliver' ? 'Delivered' : 'Deleted'}
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={() => setShowTransactions(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center text-sm"
                >
                  <X className="w-4 h-4 mr-2" />
                  Close
                </button>
              </div>
            </div>
            
            {filteredTransactions.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No transactions found.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Item name</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Type</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Quantity</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Amount</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Date</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Performed By</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Notes</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentTransactions.map((transaction) => (
                        <tr key={transaction.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">{transaction.productName}</td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              transaction.type === 'add' 
                                ? 'bg-green-100 text-green-800' 
                                : transaction.type === 'deliver'
                                ? 'bg-blue-100 text-blue-800'
                                : transaction.type === 'delete'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {transaction.type === 'add' && <Plus className="w-3 h-3 mr-1" />}
                              {transaction.type === 'deliver' && <Truck className="w-3 h-3 mr-1" />}
                              {transaction.type === 'delete' && <Trash2 className="w-3 h-3 mr-1" />}
                              {transaction.type === 'add' ? 'Add' : 
                               transaction.type === 'deliver' ? 'Deliver' : 
                               transaction.type === 'delete' ? 'Delete' : 'Adjust'}
                            </span>
                          </td>
                          <td className="py-3 px-4">{transaction.quantity}</td>
                          <td className="py-3 px-4">{formatCurrency(transaction.totalAmount)}</td>
                          <td className="py-3 px-4">{formatDate(transaction.createdAt)}</td>
                          <td className="py-3 px-4">{transaction.performedByName}</td>
                          <td className="py-3 px-4 text-sm text-gray-600">{transaction.notes || '-'}</td>
                          <td className="py-3 px-4">
                            {canDeleteSingleTransaction() && (
                              <button
                                onClick={() => handleDeleteSingleTransaction(transaction.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                                title="Delete transaction"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {filteredTransactions.length > 0 && (
                  <Pagination
                    currentPage={transactionPage}
                    totalPages={totalTxPages}
                    onPageChange={setTransactionPage}
                    totalItems={filteredTransactions.length}
                    itemsPerPage={transactionItemsPerPage}
                    itemLabel="transactions"
                    className="mt-4 border border-[#E1E5F0] rounded-xl"
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* Old Stock Alert Banner if any missed products exist */}
        {stats.oldStock > 0 && (
          <div className="mb-4 p-3.5 bg-amber-50/90 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm text-amber-900 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-300">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-amber-900 text-sm">
                  {stats.oldStock} product{stats.oldStock === 1 ? '' : 's'} identified as Old Stock
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  These items were missing from your latest imported Excel sheet and have been tagged with the <span className="font-semibold underline">Old Stock</span> badge.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {filterStock === 'old' ? (
                <button
                  onClick={() => setFilterStock('all')}
                  className="px-3.5 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-semibold rounded-xl transition cursor-pointer text-xs"
                >
                  Show All Products
                </button>
              ) : (
                <button
                  onClick={() => setFilterStock('old')}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl shadow-2xs transition cursor-pointer text-xs flex items-center gap-1.5"
                >
                  Filter Old Stock ({stats.oldStock})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Products Table with Image Column */}
        <div className="bg-slate-50/50 rounded-2xl border border-slate-200/80 p-3 sm:p-4 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-center border-separate border-spacing-y-2">
              <thead>
                <tr className="text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-2 text-center w-14 font-bold text-slate-500 uppercase tracking-wider text-[11px]">
                    Image
                  </th>
                  <th className="py-2.5 px-2 text-center font-bold text-slate-500 uppercase tracking-wider text-[11px]">
                    <button
                      onClick={() => {
                        setSortField('hsnCode');
                        setSortDirection(sortField === 'hsnCode' && sortDirection === 'asc' ? 'desc' : 'asc');
                      }}
                      className="inline-flex items-center justify-center font-bold text-slate-600 hover:text-blue-600 cursor-pointer"
                    >
                      HSN Code
                      {sortField === 'hsnCode' && (
                        sortDirection === 'asc' ? 
                          <ChevronUp className="w-3.5 h-3.5 ml-1" /> : 
                          <ChevronDown className="w-3.5 h-3.5 ml-1" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 text-center font-bold text-slate-500 uppercase tracking-wider text-[11px]">
                    <button
                      onClick={() => {
                        setSortField('name');
                        setSortDirection(sortField === 'name' && sortDirection === 'asc' ? 'desc' : 'asc');
                      }}
                      className="inline-flex items-center justify-center font-bold text-slate-600 hover:text-blue-600 cursor-pointer"
                    >
                      Item name
                      {sortField === 'name' && (
                        sortDirection === 'asc' ? 
                          <ChevronUp className="w-3.5 h-3.5 ml-1" /> : 
                          <ChevronDown className="w-3.5 h-3.5 ml-1" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-2 text-center font-bold text-slate-500 uppercase tracking-wider text-[11px]">
                    <button
                      onClick={() => {
                        setSortField('category');
                        setSortDirection(sortField === 'category' && sortDirection === 'asc' ? 'desc' : 'asc');
                      }}
                      className="inline-flex items-center justify-center font-bold text-slate-600 hover:text-blue-600 cursor-pointer"
                    >
                      Category
                      {sortField === 'category' && (
                        sortDirection === 'asc' ? 
                          <ChevronUp className="w-3.5 h-3.5 ml-1" /> : 
                          <ChevronDown className="w-3.5 h-3.5 ml-1" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-2 text-center font-bold text-slate-500 uppercase tracking-wider text-[11px] whitespace-nowrap">
                    <button
                      onClick={() => {
                        setSortField('totalQuantity');
                        setSortDirection(sortField === 'totalQuantity' && sortDirection === 'asc' ? 'desc' : 'asc');
                      }}
                      className="inline-flex items-center justify-center font-bold text-slate-600 hover:text-blue-600 cursor-pointer"
                    >
                      SOH
                      {sortField === 'totalQuantity' && (
                        sortDirection === 'asc' ? 
                          <ChevronUp className="w-3.5 h-3.5 ml-1" /> : 
                          <ChevronDown className="w-3.5 h-3.5 ml-1" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-2 text-center font-bold text-slate-500 uppercase tracking-wider text-[11px] whitespace-nowrap">
                    <button
                      onClick={() => {
                        setSortField('currentPrice');
                        setSortDirection(sortField === 'currentPrice' && sortDirection === 'asc' ? 'desc' : 'asc');
                      }}
                      className="inline-flex items-center justify-center font-bold text-slate-600 hover:text-blue-600 cursor-pointer"
                    >
                      Purchase Price
                      {sortField === 'currentPrice' && (
                        sortDirection === 'asc' ? 
                          <ChevronUp className="w-3.5 h-3.5 ml-1" /> : 
                          <ChevronDown className="w-3.5 h-3.5 ml-1" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-2 text-center font-bold text-slate-500 uppercase tracking-wider text-[11px] whitespace-nowrap">
                    <button
                      onClick={() => {
                        setSortField('purchasePrice');
                        setSortDirection(sortField === 'purchasePrice' && sortDirection === 'asc' ? 'desc' : 'asc');
                      }}
                      className="inline-flex items-center justify-center font-bold text-slate-600 hover:text-blue-600 cursor-pointer"
                    >
                      Selling Price
                      {sortField === 'purchasePrice' && (
                        sortDirection === 'asc' ? 
                          <ChevronUp className="w-3.5 h-3.5 ml-1" /> : 
                          <ChevronDown className="w-3.5 h-3.5 ml-1" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-2 text-center font-bold text-slate-500 uppercase tracking-wider text-[11px]">Status</th>
                  <th className="py-2.5 px-2 text-center font-bold text-slate-500 uppercase tracking-wider text-[11px] w-14">Actions</th>
                </tr>
              </thead>
              <tbody className="text-xs sm:text-sm">
                {currentItems.length > 0 ? (
                  currentItems.map((product, index) => {
                    const canEdit = canEditProduct(product);
                    const canDelete = canDeleteProduct(product);
                    const isRowMatch = isHighlighted(product.id, product.name);
                    const cellBase = isRowMatch
                      ? "bg-amber-50/90 group-hover:bg-amber-100/90 border-y border-amber-300 py-3 px-2 transition-colors shadow-2xs"
                      : "bg-white group-hover:bg-slate-50/90 border-y border-slate-200/80 py-3 px-2 transition-colors shadow-2xs group-hover:shadow-xs";
                    
                    return (
                      <React.Fragment key={product.id}>
                        <tr 
                          id={`product-row-${product.id}`}
                          data-id={product.id}
                          data-product-id={product.id}
                          data-highlight-id={product.id}
                          data-highlight-match={isRowMatch ? "true" : undefined}
                          className={`group cursor-pointer transition-all duration-200 ${
                            isRowMatch
                              ? "active-find-match ring-2 ring-blue-500 rounded-xl font-semibold"
                              : ""
                          }`}
                          onClick={() => {
                            setSelectedDetailsProduct(product);
                            setShowStockHistoryInModal(false);
                            setIsDetailsModalOpen(true);
                          }}
                        >
                          <td className={`${cellBase} w-14 text-center border-l rounded-l-xl ${isRowMatch ? "border-l-amber-400" : "border-l-slate-200/80"}`}>
                            <div className="flex justify-center">
                              {renderProductImage(product.image, product.name, 'small')}
                            </div>
                          </td>
                          <td className={`${cellBase} text-xs font-mono text-slate-700 whitespace-nowrap text-center font-medium`}>
                            <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100/80 text-slate-700 text-xs font-mono font-medium border border-slate-200/60">
                              {product.hsnCode || '-'}
                            </span>
                          </td>
                          <td className={`${cellBase} px-2.5 max-w-[220px] text-center`}>
                            <div className="font-bold text-slate-900 text-xs sm:text-sm truncate text-center flex items-center justify-center gap-1.5" title={product.name}>
                              <span>{product.name}</span>
                            </div>
                            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 mt-0.5 flex-wrap">
                              {product.sku && <span className="font-mono text-slate-500">SKU: {product.sku}</span>}
                              {product.isOldStock && (
                                <span 
                                  className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-800 rounded-md border border-amber-300/80 inline-flex items-center gap-1 shadow-2xs" 
                                  title="Old Stock: Missed in the latest imported Excel sheet"
                                >
                                  <Clock className="w-2.5 h-2.5 text-amber-700" />
                                  Old Stock
                                </span>
                              )}
                              {(product.isQuoteOnly || product.productType === 'quote_purpose') && (
                                <span className="px-1.5 py-0.2 text-[10px] font-semibold bg-purple-50 text-purple-700 rounded-full border border-purple-200/80">
                                  Quote Item
                                </span>
                              )}
                            </div>
                          </td>
                          <td className={`${cellBase} text-center`}>
                            <span className="inline-block px-2.5 py-0.5 rounded-md text-xs bg-slate-100 text-slate-700 font-medium border border-slate-200/60 truncate max-w-[120px]" title={product.category}>
                              {product.category}
                            </span>
                          </td>
                          <td className={`${cellBase} text-center text-xs tabular-nums whitespace-nowrap`}>
                            <span className="inline-block px-2.5 py-0.5 rounded-md font-extrabold text-blue-600 bg-blue-50/60 border border-blue-100 text-sm">
                              {product.totalQuantity}
                            </span>
                          </td>
                          <td className={`${cellBase} text-center text-xs sm:text-sm font-semibold text-slate-900 tabular-nums whitespace-nowrap`}>
                            {formatCurrency(product.currentPrice || 0)}
                          </td>
                          <td className={`${cellBase} text-center text-xs sm:text-sm font-bold text-emerald-600 tabular-nums whitespace-nowrap`}>
                            {formatCurrency(getProductPurchasePrice(product))}
                          </td>
                          <td className={`${cellBase} text-center whitespace-nowrap`}>
                            {renderStockBadge(product)}
                          </td>
                          <td className={`${cellBase} text-center w-14 relative border-r rounded-r-xl ${isRowMatch ? "border-r-amber-400" : "border-r-slate-200/80"}`} onClick={(e) => e.stopPropagation()}>
                            <div className="relative inline-block text-left">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveDropdownProductId(activeDropdownProductId === product.id ? null : product.id);
                                }}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  activeDropdownProductId === product.id 
                                    ? 'bg-blue-100 text-blue-600' 
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                }`}
                                title="Actions"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>

                              {activeDropdownProductId === product.id && (
                                <>
                                  <div 
                                    className="fixed inset-0 z-20" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveDropdownProductId(null);
                                    }} 
                                  />
                                  <div 
                                    className={`absolute right-0 ${
                                      index >= currentItems.length - 2 && currentItems.length > 3
                                        ? 'bottom-full mb-1' 
                                        : 'top-full mt-1'
                                    } z-30 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 focus:outline-none`}
                                  >
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveDropdownProductId(null);
                                        setSelectedProduct(product);
                                        setTransactionForm({
                                          type: 'add',
                                          quantity: 0,
                                          price: product.currentPrice || 0,
                                          notes: '',
                                          deductFromInventory: true,
                                        });
                                        setIsTransactionModalOpen(true);
                                      }}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2.5 transition-colors"
                                    >
                                      <Truck className="w-4 h-4 text-blue-600" />
                                      <span>Add / Deliver Stock</span>
                                    </button>

                                    {canEdit && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveDropdownProductId(null);
                                          setSelectedProduct(product);
                                          setEditForm({
                                            name: product.name,
                                            category: product.category,
                                            sku: product.sku,
                                            hsnCode: product.hsnCode,
                                            description: product.description,
                                            lowStockThreshold: product.lowStockThreshold,
                                            newQuantity: product.totalQuantity,
                                            image: product.image,
                                          });
                                          setIsEditModalOpen(true);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2.5 transition-colors"
                                      >
                                        <Edit2 className="w-4 h-4 text-gray-500" />
                                        <span>Edit Product</span>
                                      </button>
                                    )}

                                    {canDelete && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveDropdownProductId(null);
                                          setProductToDelete(product.id);
                                          setIsDeleteConfirmOpen(true);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4 text-red-600" />
                                        <span>Delete Product</span>
                                      </button>
                                    )}

                                    {canRequestDeleteProduct() && !canDelete && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveDropdownProductId(null);
                                          setProductToRequestDelete(product);
                                          setIsDeleteRequestConfirmOpen(true);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-yellow-700 hover:bg-yellow-50 flex items-center gap-2.5 transition-colors"
                                      >
                                        <MessageSquare className="w-4 h-4 text-yellow-600" />
                                        <span>Request Delete</span>
                                      </button>
                                    )}

                                    <div className="border-t border-gray-100 my-1" />

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveDropdownProductId(null);
                                        setSelectedDetailsProduct(product);
                                        setShowStockHistoryInModal(false);
                                        setIsDetailsModalOpen(true);
                                      }}
                                      className="w-full text-left px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-50 flex items-center gap-2.5 transition-colors font-medium"
                                    >
                                      <Eye className="w-4 h-4 text-indigo-600" />
                                      <span>View Details</span>
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="py-12 text-center bg-white rounded-xl border border-slate-200/80 shadow-2xs">
                      <div className="text-center">
                        <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-slate-900 mb-2">No products found</h3>
                        <p className="text-slate-500 mb-4 text-xs">
                          {searchTerm || filterCategory !== 'all' || filterStock !== 'all'
                            ? 'Try changing your search or filter criteria'
                            : canAddProduct()
                            ? 'Start by adding your first product'
                            : 'No products in inventory yet'}
                        </p>
                        {canAddProduct() && !searchTerm && filterCategory === 'all' && filterStock === 'all' && (
                          <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-xs font-semibold shadow-2xs cursor-pointer"
                          >
                            Add Your First Product
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {filteredProducts.length > 0 && renderPagination()}
        </div>
        </>
        )}
      </div>

      {/* Modals */}
      {isAddStockModalOpen && renderAddStockModal()}
      {isAddModalOpen && renderAddProductModal()}
      {isEditModalOpen && renderEditProductModal()}
      {isTransactionModalOpen && renderTransactionModal()}
      {isDeleteConfirmOpen && renderDeleteConfirmModal()}
      {isDeleteRequestConfirmOpen && renderDeleteRequestConfirmModal()}
      {isDeleteRequestsModalOpen && renderDeleteRequestsModal()}
      {isDetailsModalOpen && renderDetailsModal()}
      {isImportModalOpen && renderImportModal()}
    </div>
  );
};

export default InventoryManagement;