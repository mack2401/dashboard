// components/modals/AddEditModal.tsx

import React, { useEffect, useState, useRef, useCallback } from "react";
import { X, Plus, Trash2, RefreshCw, FileText, PackagePlus, Package, ExternalLink, AlertTriangle, Building, MapPin, Phone, Mail, CreditCard } from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
  deleteField,
  query,
  where,
  getDocs,
  Timestamp,
  onSnapshot,
  runTransaction,
  writeBatch,
  increment,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { Enquiry } from "../../types/enquiry";
import ProformaInvoiceGeneratorModal from "./ProformaInvoiceGeneratorModal";
import { useAuth } from "../../App";
import InventoryManagement from "../../pages/InventoryManagement";
import BillGeneratorModal from "./BillGeneratorModal";
// --- Types for props ---
type UserProfile = {
  id: string;
  role: "admin" | "manager" | "staff";
  employeeName?: string;
  name?: string;
};

type Employee = {
  id?: string;
  uid?: string;
  email?: string;
  employeeName?: string;
  name?: string;
};

type Product = {
  id: string;
  name: string;
  price: number;
  unitprice?: number;
  currentPrice?: number;
  totalQuantity?: number;
  category?: string;
  description?: string;
  lowStockThreshold?: number;
  stockEntries?: any[];
  hsnCode?: string;
  taxRate?: number;
};

interface MaterialItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  totalAmount: number;
  availableQuantity?: number;
  originalPrice?: number;
  hsnCode?: string;
  taxRate?: number;
  taxAmount?: number;
  taxableValue?: number;
  manuallyEdited?: boolean;
}

interface AddEditModalProps {
  open: boolean;
  initial?: Partial<Enquiry> | null;
  onClose: () => void;
  onSave: () => void;
  currentUserProfile: UserProfile | null;
  employees: Employee[];
}

// Company-related fields interface for Proforma Invoice
interface CompanyDetails {
  companyName: string;
  companyAddress: string;
  companyMobile: string;
  companyGST: string;
  companyPAN: string;
  companyState: string;
  companyCity: string;
  companyPincode: string;
  companyEmail: string;
}

const indianStates = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
  "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
  "Out of Country"
];

export const sourceOptions = [
  "Website",
  "WhatsApp",
  "Instagram",
  "Phone Call",
  "Walk-in",
  "Referral",
  "IndiaMART",
  "Email",
  "LinkedIn",
  "Google Search",
  "Other"
];

const statusMappings: Record<string, string[]> = {
  Dropped: ["Spec mismatch", "Out of stock items", "Lead time mismatch", "Budget mismatch"],
  Quotation: ["Technical clarification", "Waiting for order confirmation", "PI released waiting for payment"],
  "Proforma Invoice": ["PI sent to customer", "Waiting for PO", "PO received", "PI approved by customer", "PI pending payment"],
  Invoice: ["Tax invoice issued", "Invoice sent to customer", "Payment pending", "Payment received"],
  Approved: ["PI released & initiated payment", "Payment received waiting for materials arrangement"],
  Dispatched: ["Porter / Rapido", "Courier", "Urgent delivery Bus", "Dispatched payment not received", "Hand-to-Hand delivery"],
  Testing: ["Internal Testing", "Bill Format Testing", "Dummy Order Testing", "Tax Calculation Testing"],
};

const statusPaymentMapping: Record<string, string[]> = {
  Paid: ["GPay", "Cash", "Bank Transfer"],
};

// Tax rates configuration
const TAX_RATES = [
  { value: 0, label: "0%" },
  { value: 5, label: "5%" },
  { value: 12, label: "12%" },
  { value: 18, label: "18%" },
  { value: 28, label: "28%" },
];

const checkForDuplicates = async (
  field: "email" | "contactNumber",
  value: string,
  currentDocId: string | null
): Promise<boolean> => {
  if (!value || value.trim() === "") return false;

  const enquiriesRef = collection(db, "enquiries");
  const q = query(enquiriesRef, where(field, "==", value.trim()));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) return false;

  if (!currentDocId) return true;

  for (const doc of querySnapshot.docs) {
    if (doc.id !== currentDocId) return true;
  }

  return false;
};

const AddEditModal: React.FC<AddEditModalProps> = ({
  open,
  initial = null,
  onClose,
  onSave,
  currentUserProfile,
  employees,
}) => {
  const { currentUser } = useAuth();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stockValidationError, setStockValidationError] = useState<string | null>(null);

  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [products, setProducts] = useState<Map<string, Product>>(new Map());
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [productSearch, setProductSearch] = useState<string>("");
  const [showProductDropdown, setShowProductDropdown] = useState<boolean>(false);
  const [gstRate, setGstRate] = useState<number>(18);
  const [priceUpdateNotification, setPriceUpdateNotification] = useState<string | null>(null);
  const [showBillGenerator, setShowBillGenerator] = useState<boolean>(false);
  const [showStockWarningModal, setShowStockWarningModal] = useState<boolean>(false);
  const [stockWarnings, setStockWarnings] = useState<{productName: string, available: number, required: number}[]>([]);
  const [deductFromInventory, setDeductFromInventory] = useState<boolean>(false);

  const [showInventoryManagement, setShowInventoryManagement] = useState<boolean>(false);

  // Company details state for Proforma Invoice
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails>({
    companyName: "",
    companyAddress: "",
    companyMobile: "",
    companyGST: "",
    companyPAN: "",
    companyState: "",
    companyCity: "",
    companyPincode: "",
    companyEmail: "",
  });

  // Real-time products listener
  useEffect(() => {
    if (!open) return;

    const productsRef = collection(db, "products");
    const unsubscribe = onSnapshot(productsRef, (snapshot) => {
      const productsMap = new Map<string, Product>();
      snapshot.forEach((doc) => {
        const data = doc.data();
        const price = data.currentPrice || data.price || data.unitprice || 0;
        productsMap.set(doc.id, {
          id: doc.id,
          name: data.name,
          price: price,
          unitprice: price,
          currentPrice: price,
          totalQuantity: data.totalQuantity || 0,
          category: data.category || "",
          description: data.description || "",
          lowStockThreshold: data.lowStockThreshold || 10,
          stockEntries: data.stockEntries || [],
          hsnCode: data.hsnCode || "",
          taxRate: data.taxRate !== undefined && data.taxRate !== null ? data.taxRate : 18,
        });
      });
      setProducts(productsMap);
    }, (err) => {
      console.error("Error fetching products:", err);
    });

    return () => unsubscribe();
  }, [open]);

  // Update material prices when product prices change in real-time
  useEffect(() => {
    if (materials.length > 0 && products.size > 0) {
      let hasPriceChanges = false;
      const updatedMaterials = materials.map(material => {
        const currentProduct = products.get(material.productId);
        // Only auto-update if not manually edited
        if (currentProduct && currentProduct.price !== material.price && !material.manuallyEdited) {
          hasPriceChanges = true;
          const newPrice = currentProduct.price;
          const newTaxRate = (currentProduct.taxRate !== undefined && currentProduct.taxRate !== null)
            ? currentProduct.taxRate
            : ((material.taxRate !== undefined && material.taxRate !== null) ? material.taxRate : 18);
          const taxableValue = newPrice * material.quantity;
          const taxAmount = (taxableValue * newTaxRate) / 100;
          const newTotalAmount = taxableValue + taxAmount;
          
          return {
            ...material,
            price: newPrice,
            totalAmount: newTotalAmount,
            taxableValue: taxableValue,
            taxRate: newTaxRate,
            taxAmount: taxAmount,
            originalPrice: material.price,
            hsnCode: currentProduct.hsnCode || material.hsnCode,
          };
        }
        return material;
      });

      if (hasPriceChanges) {
        setMaterials(updatedMaterials);
        setPriceUpdateNotification("Product prices have been updated. Please review the changes.");
        setTimeout(() => setPriceUpdateNotification(null), 5000);
        const newFinalTotal = updatedMaterials.reduce((sum, item) => sum + item.totalAmount, 0);
        setFormData(prev => ({
          ...prev,
          value: newFinalTotal
        }));
      }
    }
  }, [products, materials]);

  // Parse existing materials from initial data
  useEffect(() => {
    if (initial && initial.materials) {
      try {
        let parsedMaterials: MaterialItem[] = [];
        if (typeof initial.materials === 'string') {
          parsedMaterials = JSON.parse(initial.materials);
        } else if (Array.isArray(initial.materials)) {
          parsedMaterials = initial.materials;
        }

        const formattedMaterials = parsedMaterials.map((item, index) => {
          const taxableValue = (item.price || 0) * (item.quantity || 1);
          const taxRate = item.taxRate !== undefined && item.taxRate !== null ? item.taxRate : 18;
          const taxAmount = (taxableValue * taxRate) / 100;
          const totalAmount = taxableValue + taxAmount;

          return {
            id: item.id || Date.now().toString() + index,
            productId: item.productId,
            productName: item.productName,
            price: item.price || 0,
            quantity: item.quantity || 1,
            totalAmount: totalAmount,
            taxableValue: taxableValue,
            taxRate: taxRate,
            taxAmount: taxAmount,
            availableQuantity: item.availableQuantity,
            originalPrice: item.originalPrice || item.price,
            hsnCode: item.hsnCode || item.hsn || "",
            manuallyEdited: item.manuallyEdited || false,
          };
        });
        setMaterials(formattedMaterials);
        const finalTotal = formattedMaterials.reduce((sum, item) => sum + item.totalAmount, 0);
        setFormData(prev => ({
          ...prev,
          value: finalTotal
        }));
      } catch (e) {
        console.error("Error parsing materials:", e);
      }
    }
  }, [initial]);

  useEffect(() => {
    if (initial) {
      const initAddress = (initial as any).customerAddress || (initial as any).address || initial.customer?.address || "";
      setFormData({
        ...initial,
        address: initAddress,
        customerAddress: initAddress,
        paymentSubStatus: initial.paymentSubStatus ?? (initial as any).paymentType ?? "",
      });
      if (initial.companyDetails) {
        setCompanyDetails(initial.companyDetails);
      }
      setDeductFromInventory(
        (initial as any).deductFromInventory !== undefined
          ? !!(initial as any).deductFromInventory
          : (initial.status === "Approved" && (initial.paymentStatus === "Paid" || (initial as any).paymentStatus === "PAID"))
      );
    } else {
      setDeductFromInventory(false);
      // Get current date and time for new enquiry
      const now = new Date();
      setFormData({
        enqId: `IB${Date.now().toString().slice(-4)}`,
        mode: "Website",
        type: "",
        status: "",
        subStatus: "",
        paymentStatus: "",
        paymentSubStatus: "",
        value: 0,
        customerName: "",
        address: "",
        customerAddress: "",
        remarks: "",
        assignedTo: currentUserProfile?.id ?? "",
        state: "",
        createdAt: now, // Set current date/time
        companyDetails: {
          companyName: "",
          companyAddress: "",
          companyMobile: "",
          companyGST: "",
          companyPAN: "",
          companyState: "",
          companyCity: "",
          companyPincode: "",
          companyEmail: "",
        }
      });
    }
  }, [initial, currentUserProfile, open]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    if (name === "status" && value === "Approved" && materials.length > 0) {
      const stockIssues = validateStockAvailability();
      if (stockIssues.length > 0) {
        setStockWarnings(stockIssues);
        setShowStockWarningModal(true);
        return;
      }
    }

    if (name === "status") {
      const relevantSubStatuses = statusMappings[value] || [];
      setFormData((prev) => ({
        ...prev,
        status: value,
        subStatus: relevantSubStatuses.includes(prev.subStatus) ? prev.subStatus : (relevantSubStatuses[0] || ""),
      }));
      return;
    }

    if (name === "paymentStatus") {
      const relevantPaymentSubStatuses = statusPaymentMapping[value] || [];
      setFormData((prev) => ({
        ...prev,
        paymentStatus: value,
        paymentSubStatus: relevantPaymentSubStatuses.includes(prev.paymentSubStatus) ? prev.paymentSubStatus : (relevantPaymentSubStatuses[0] || ""),
      }));
      return;
    }
    
    setFormData((p) => ({ ...p, [name]: value }));
  };

  const handleCompanyDetailsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCompanyDetails(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const filteredProducts = Array.from(products.values()).filter(product =>
    product.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const validateStockAvailability = (): {productName: string, available: number, required: number}[] => {
    if (!deductFromInventory) return [];
    const issues: {productName: string, available: number, required: number}[] = [];
    
    materials.forEach(material => {
      const product = products.get(material.productId);
      if (product && product.totalQuantity !== undefined) {
        if (material.quantity > product.totalQuantity) {
          issues.push({
            productName: material.productName,
            available: product.totalQuantity,
            required: material.quantity
          });
        }
      }
    });
    
    return issues;
  };

  const hasStockIssues = (): boolean => {
    return validateStockAvailability().length > 0;
  };

  const getStockStatus = (material: MaterialItem): {status: 'ok' | 'low' | 'out', available: number} => {
    const product = products.get(material.productId);
    if (!product || product.totalQuantity === undefined) {
      return { status: 'ok', available: 0 };
    }
    
    if (material.quantity > product.totalQuantity) {
      return { status: 'out', available: product.totalQuantity };
    }
    
    if (material.quantity > product.totalQuantity * 0.7) {
      return { status: 'low', available: product.totalQuantity };
    }
    
    return { status: 'ok', available: product.totalQuantity };
  };

  const handleStatusChangeWithValidation = (newStatus: string) => {
    setStockValidationError(null);
    
    if (newStatus === "Approved" && deductFromInventory && materials.length > 0) {
      const stockIssues = validateStockAvailability();
      if (stockIssues.length > 0) {
        setStockWarnings(stockIssues);
        setShowStockWarningModal(true);
        return;
      }
    }
    
    setFormData((p) => ({ ...p, status: newStatus }));
  };

  const handleCloseInventoryManagement = () => {
    setShowInventoryManagement(false);
  };

  const updateValueWithFinalTotal = useCallback((updatedMaterials: MaterialItem[]) => {
    const finalTotal = updatedMaterials.reduce((sum, item) => sum + item.totalAmount, 0);
    setFormData(prev => ({
      ...prev,
      value: finalTotal
    }));
  }, []);

  const handleAddProduct = () => {
    if (!selectedProduct) {
      setError("Please select a product");
      return;
    }

    if (quantity <= 0) {
      setError("Please enter a valid quantity");
      return;
    }

    const product = products.get(selectedProduct);
    if (!product) {
      setError("Product not found");
      return;
    }

    const existingIndex = materials.findIndex(m => m.productId === selectedProduct);
    const newQuantity = existingIndex >= 0 ? materials[existingIndex].quantity + quantity : quantity;

    if (deductFromInventory && formData.status === "Approved") {
      if (product.totalQuantity !== undefined && newQuantity > product.totalQuantity) {
        setError(`⚠️ Only ${product.totalQuantity} items available in stock. If this is a quotation or vendor-sourced, please uncheck "Deduct from Inventory Stock".`);
        return;
      }
    }

    const taxableValue = product.price * quantity;
    const taxRate = (product.taxRate !== undefined && product.taxRate !== null)
      ? product.taxRate
      : ((gstRate !== undefined && gstRate !== null) ? gstRate : 18);
    const taxAmount = (taxableValue * taxRate) / 100;
    const totalAmount = taxableValue + taxAmount;

    let updatedMaterials;
    if (existingIndex >= 0) {
      updatedMaterials = [...materials];
      
      if (deductFromInventory && formData.status === "Approved") {
        if (product.totalQuantity !== undefined && newQuantity > product.totalQuantity) {
          setError(`⚠️ Total quantity would exceed available stock (${product.totalQuantity}). If this is a quotation or vendor-sourced, please uncheck "Deduct from Inventory Stock".`);
          return;
        }
      }

      const existing = updatedMaterials[existingIndex];
      const newTaxableValue = product.price * newQuantity;
      const existingTaxRate = existing.taxRate !== undefined && existing.taxRate !== null ? existing.taxRate : taxRate;
      const newTaxAmount = (newTaxableValue * existingTaxRate) / 100;
      
      updatedMaterials[existingIndex] = {
        ...existing,
        quantity: newQuantity,
        totalAmount: newTaxableValue + newTaxAmount,
        taxableValue: newTaxableValue,
        taxAmount: newTaxAmount,
        price: product.price,
        hsnCode: product.hsnCode || "",
        taxRate: existingTaxRate,
      };
    } else {
      updatedMaterials = [...materials, {
        id: Date.now().toString(),
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity: quantity,
        totalAmount: totalAmount,
        taxableValue: taxableValue,
        taxRate: taxRate,
        taxAmount: taxAmount,
        availableQuantity: product.totalQuantity,
        hsnCode: product.hsnCode || "",
        manuallyEdited: false,
      }];
    }
    
    setMaterials(updatedMaterials);
    setSelectedProduct("");
    setQuantity(1);
    setProductSearch("");
    setShowProductDropdown(false);
    updateValueWithFinalTotal(updatedMaterials);
  };

  const handleRemoveProduct = (id: string) => {
    const updatedMaterials = materials.filter(m => m.id !== id);
    setMaterials(updatedMaterials);
    updateValueWithFinalTotal(updatedMaterials);
  };

  const handleUpdateQuantity = (id: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      handleRemoveProduct(id);
      return;
    }

    const material = materials.find(m => m.id === id);
    if (!material) return;

    const product = products.get(material.productId);

    if (deductFromInventory && formData.status === "Approved") {
      if (product && product.totalQuantity !== undefined && newQuantity > product.totalQuantity) {
        setError(`⚠️ Only ${product.totalQuantity} items available in stock. If this is a quotation or vendor-sourced, please uncheck "Deduct from Inventory Stock".`);
        return;
      }
    }

    const updatedMaterials = materials.map(m => {
      if (m.id === id) {
        const taxableValue = m.price * newQuantity;
        const taxAmount = (taxableValue * m.taxRate) / 100;
        const totalAmount = taxableValue + taxAmount;
        
        return {
          ...m,
          quantity: newQuantity,
          totalAmount: totalAmount,
          taxableValue: taxableValue,
          taxAmount: taxAmount,
        };
      }
      return m;
    });
    setMaterials(updatedMaterials);
    setStockValidationError(null);
    updateValueWithFinalTotal(updatedMaterials);
  };

  const handleUpdatePrice = (id: string, newPrice: number) => {
    if (newPrice < 0) return;

    const updatedMaterials = materials.map(m => {
      if (m.id === id) {
        const taxableValue = newPrice * m.quantity;
        const taxAmount = (taxableValue * m.taxRate) / 100;
        const totalAmount = taxableValue + taxAmount;
        
        return {
          ...m,
          price: newPrice,
          totalAmount: totalAmount,
          taxableValue: taxableValue,
          taxAmount: taxAmount,
          originalPrice: m.originalPrice !== undefined ? m.originalPrice : m.price,
          manuallyEdited: true,
        };
      }
      return m;
    });
    setMaterials(updatedMaterials);
    updateValueWithFinalTotal(updatedMaterials);
  };

  const handleUpdateTaxRate = (id: string, newTaxRate: number) => {
    const updatedMaterials = materials.map(m => {
      if (m.id === id) {
        const taxableValue = m.price * m.quantity;
        const taxAmount = (taxableValue * newTaxRate) / 100;
        const totalAmount = taxableValue + taxAmount;
        
        return {
          ...m,
          taxRate: newTaxRate,
          taxAmount: taxAmount,
          totalAmount: totalAmount,
        };
      }
      return m;
    });
    setMaterials(updatedMaterials);
    updateValueWithFinalTotal(updatedMaterials);
  };

  const handleRefreshPrices = () => {
    const updatedMaterials = materials.map(material => {
      const currentProduct = products.get(material.productId);
      if (currentProduct && currentProduct.price !== material.price) {
        const taxableValue = currentProduct.price * material.quantity;
        const taxRate = (currentProduct.taxRate !== undefined && currentProduct.taxRate !== null)
          ? currentProduct.taxRate
          : ((material.taxRate !== undefined && material.taxRate !== null) ? material.taxRate : 18);
        const taxAmount = (taxableValue * taxRate) / 100;
        const totalAmount = taxableValue + taxAmount;
        
        return {
          ...material,
          price: currentProduct.price,
          totalAmount: totalAmount,
          taxableValue: taxableValue,
          taxRate: taxRate,
          taxAmount: taxAmount,
          originalPrice: material.price,
          hsnCode: currentProduct.hsnCode || material.hsnCode,
          manuallyEdited: false,
        };
      }
      return material;
    });

    if (JSON.stringify(updatedMaterials) !== JSON.stringify(materials)) {
      setMaterials(updatedMaterials);
      setPriceUpdateNotification("Prices have been refreshed to current product prices.");
      setTimeout(() => setPriceUpdateNotification(null), 3000);
      updateValueWithFinalTotal(updatedMaterials);
    } else {
      setPriceUpdateNotification("All prices are already up to date.");
      setTimeout(() => setPriceUpdateNotification(null), 2000);
    }
  };

  const calculateSubtotal = (): number => {
    return materials.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const calculateTotalTaxableValue = (): number => {
    return materials.reduce((sum, item) => sum + (item.taxableValue || 0), 0);
  };

  const calculateGST = (): number => {
    return materials.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
  };

  const calculateFinalTotal = (): number => {
    return materials.reduce((sum, item) => sum + item.totalAmount, 0);
  };

  const shouldShowBillGenerator = (): boolean => {
    if (materials.length === 0) return false;
    
    const productStatus = formData.status;
    
    if (productStatus === "Proforma Invoice" || productStatus === "Invoice") {
      return true;
    }
    
    if (productStatus === "Quotation") {
      return true;
    }
    
    if (productStatus === "Approved") {
      return true;
    }
    
    return false;
  };

  const isProformaInvoiceMode = formData.status === "Proforma Invoice";

  const validateCompanyDetails = (): boolean => {
    if (!isProformaInvoiceMode) return true;
    
    const requiredFields = [
      { key: 'companyName', label: 'Company Name' },
      { key: 'companyMobile', label: 'Company Mobile Number' },
    ];

    for (const field of requiredFields) {
      if (!companyDetails[field.key as keyof CompanyDetails]?.trim()) {
        setError(`⚠️ ${field.label} is required for Proforma Invoice`);
        return false;
      }
    }

    const mobileRegex = /^[0-9]{10}$/;
    if (!mobileRegex.test(companyDetails.companyMobile)) {
      setError("⚠️ Please enter a valid 10-digit mobile number");
      return false;
    }

    return true;
  };

  const handleBillGenerate = () => {
    if (materials.length === 0) {
      setError("Please add at least one product to generate bill");
      return;
    }
    
    if (isProformaInvoiceMode) {
      if (!validateCompanyDetails()) {
        return;
      }
    }
    
    if (formData.status === "Approved") {
      const stockIssues = validateStockAvailability();
      if (stockIssues.length > 0) {
        setStockWarnings(stockIssues);
        setShowStockWarningModal(true);
        return;
      }
    }
    
    setShowBillGenerator(true);
  };

  const handleBillSuccess = () => {
    setShowBillGenerator(false);
    onSave?.();
    setTimeout(() => {
      onClose();
    }, 100);
  };

  const handleBillCancel = () => {
    setShowBillGenerator(false);
  };
  
  const handleProceedWithStockIssues = () => {
    setShowStockWarningModal(false);
    setFormData((p) => ({ ...p, status: "Approved" }));
    setStockValidationError("⚠️ Some products have stock issues. Please update inventory or reduce quantities.");
    setTimeout(() => setStockValidationError(null), 10000);
  };

  const handleCancelStockIssues = () => {
    setShowStockWarningModal(false);
    setStockWarnings([]);
  };

  const handleSave = async () => {
    setLoading(true);
    
    if (isProformaInvoiceMode) {
      if (!companyDetails.companyName?.trim()) {
        setError("⚠️ Company Name is required for Proforma Invoice");
        setLoading(false);
        return;
      }
      if (!companyDetails.companyMobile?.trim()) {
        setError("⚠️ Company Mobile Number is required for Proforma Invoice");
        setLoading(false);
        return;
      }
      const mobileRegex = /^[0-9]{10}$/;
      if (!mobileRegex.test(companyDetails.companyMobile)) {
        setError("⚠️ Please enter a valid 10-digit mobile number");
        setLoading(false);
        return;
      }
    } else {
      if (!formData.customerName?.trim() || !formData.contactNumber?.trim()) {
        setError("⚠️ Please enter the Customer Name and the Contact Number");
        setLoading(false);
        return;
      }
    }

    if (formData.status === "Approved") {
      const stockIssues = validateStockAvailability();
      if (stockIssues.length > 0) {
        setStockWarnings(stockIssues);
        setShowStockWarningModal(true);
        setLoading(false);
        return;
      }
    }

    const finalTotal = calculateFinalTotal();
    setFormData(prev => ({
      ...prev,
      value: finalTotal
    }));

    const currentDocId = initial && (initial as any).id ? (initial as any).id : null;
    let createdAtValue;

    // Check if we're editing or creating new
    if (currentDocId) {
      // For editing, use the existing date if available, otherwise current date
      if (formData.createdAt instanceof Date) {
        createdAtValue = Timestamp.fromDate(formData.createdAt);
      } else if (formData.createdAt?.toDate) {
        createdAtValue = formData.createdAt;
      } else if (typeof formData.createdAt === "string" && formData.createdAt !== "") {
        const d = new Date(formData.createdAt);
        if (isNaN(d.getTime())) throw new Error("Invalid createdAt date");
        createdAtValue = Timestamp.fromDate(d);
      } else {
        createdAtValue = Timestamp.fromDate(new Date());
      }
    } else {
      // For new enquiries, ALWAYS use current date/time
      createdAtValue = Timestamp.fromDate(new Date());
    }

    try {
      const materialsData = materials.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        price: item.price,
        quantity: item.quantity,
        totalAmount: item.totalAmount,
        taxableValue: item.taxableValue || (item.price * item.quantity),
        taxRate: item.taxRate !== undefined && item.taxRate !== null ? item.taxRate : gstRate,
        taxAmount: item.taxAmount !== undefined && item.taxAmount !== null
          ? item.taxAmount
          : ((item.price * item.quantity * (item.taxRate !== undefined && item.taxRate !== null ? item.taxRate : gstRate)) / 100),
        originalPrice: item.originalPrice,
        hsnCode: item.hsnCode || "",
        savedAt: new Date().toISOString(),
        manuallyEdited: item.manuallyEdited || false,
      }));

      const payload: Record<string, any> = {
        enqId: formData.enqId ?? `IB${Date.now().toString().slice(-4)}`,
        customerName: isProformaInvoiceMode ? companyDetails.companyName : (formData.customerName ?? ""),
        contactPerson: formData.contactPerson ?? "",
        contactNumber: isProformaInvoiceMode ? companyDetails.companyMobile : (formData.contactNumber ?? ""),
        email: formData.email ?? "",
        city: formData.city ?? "",
        address: isProformaInvoiceMode ? companyDetails.companyAddress : (formData.customerAddress || formData.address || "").trim(),
        customerAddress: isProformaInvoiceMode ? companyDetails.companyAddress : (formData.customerAddress || formData.address || "").trim(),
        customer: {
          ...(formData.customer || {}),
          address: isProformaInvoiceMode ? companyDetails.companyAddress : (formData.customerAddress || formData.address || "").trim(),
        },
        mode: formData.mode ?? "",
        type: formData.type ?? "",
        status: formData.status ?? "",
        paymentStatus: formData.paymentStatus ?? "",
        shipmentStatus: formData.shipmentStatus ?? "",
        paymentSubStatus: formData.paymentSubStatus ?? "",
        value: finalTotal,
        remarks: formData.remarks ?? "",
        assignedTo: formData.assignedTo ?? "",
        updatedAt: serverTimestamp(),
        subStatus: formData.subStatus ?? "",
        reason: formData.reason ?? "",
        createdAt: createdAtValue,
        materials: JSON.stringify(materialsData),
        subtotal: calculateSubtotal(),
        taxableValue: calculateTotalTaxableValue(),
        gstAmount: calculateGST(),
        gstRate: gstRate,
        finalTotal: finalTotal,
        materialsCount: materials.length,
        stockValidated: formData.status === "Approved" ? true : false,
        deductFromInventory: deductFromInventory,
        isProformaInvoice: formData.status === "Proforma Invoice" || false,
        companyDetails: isProformaInvoiceMode ? companyDetails : null,
      };

      if (formData.status === "Proforma Invoice") {
        payload.proformaInvoiceNumber = `PI${Date.now().toString().slice(-6)}`;
      }

      console.log("Saving Enquiry ID:", payload.enqId);
      if (!(formData.status === "Waiting Payment" || formData.status === "Waiting for Materials"))
        payload.reason = "";

      if (!(formData.paymentStatus === "Paid"))
        payload.paymentSubStatus = "";

      // Check if we're editing an existing enquiry (has an ID)
      if (currentDocId) {
        // Update existing enquiry by ID
        payload.droppedReason = deleteField();
        const ref = doc(db, "enquiries", currentDocId);
        await updateDoc(ref, payload);
        console.log("Updated existing enquiry by ID:", currentDocId);
      } else {
        // ALWAYS create a new enquiry for new records
        const docRef = await addDoc(collection(db, "enquiries"), {
          ...payload,
          createdAt: createdAtValue,
        });
        console.log("Created new enquiry with current date:", docRef.id);
      }

      // Auto-sync bill record when enquiry is Approved or Quotation
      try {
        const billsRef = collection(db, "bills");
        const bq = query(billsRef, where("enquiryEnqId", "==", payload.enqId));
        const bSnap = await getDocs(bq);

        const isQuotationDoc = formData.status === "Quotation";
        const isApprovedDoc = formData.status === "Approved";
        const isPaidDoc = formData.paymentStatus === "Paid" || formData.paymentStatus === "PAID";
        const cleanEnqNum = String(payload.enqId || Date.now()).replace(/\D/g, "");
        const autoInvNumber = isQuotationDoc
          ? `IBQ-${cleanEnqNum.slice(-6) || Date.now().toString().slice(-6)}`
          : `IBIN-${cleanEnqNum.slice(-8) || Date.now().toString().slice(-8)}`;

        const billPayload: any = {
          customerName: payload.customerName,
          customerContact: payload.contactNumber,
          customerAddress: payload.customerAddress || payload.address || "",
          customerCity: payload.city || "",
          billedTo: {
            name: payload.customerName,
            enqId: payload.enqId,
            contactNumber: payload.contactNumber,
            city: payload.city || "",
            state: payload.state || "Tamil Nadu",
            address: payload.customerAddress || payload.address || "",
            gstin: payload.companyDetails?.companyGST || payload.gstin || "",
          },
          items: materialsData.map(m => ({
            productId: m.productId,
            productName: m.productName,
            quantity: m.quantity,
            price: m.price,
            total: m.totalAmount,
            taxableValue: m.taxableValue,
            taxRate: m.taxRate,
            taxAmount: m.taxAmount,
            hsn: m.hsnCode || "",
          })),
          subtotal: calculateSubtotal(),
          taxAmount: calculateGST(),
          totalAmount: finalTotal,
          taxRate: gstRate,
          enquiryId: currentDocId || payload.enqId,
          enquiryEnqId: payload.enqId,
          status: isQuotationDoc ? "quotation" : "completed",
          paymentStatus: isPaidDoc ? "paid" : "pending",
          paymentType: payload.paymentType || payload.paymentSubStatus || "",
          paymentSubStatus: payload.paymentSubStatus || "",
          shipmentStatus: payload.shipmentStatus || "",
          isQuotation: isQuotationDoc,
          deductFromInventory: deductFromInventory,
          updatedAt: serverTimestamp(),
        };

        if (!bSnap.empty) {
          const existingDoc = bSnap.docs[0];
          await updateDoc(existingDoc.ref, billPayload);
          console.log("Auto-updated existing bill in bills collection for enquiry:", payload.enqId);
        } else if ((isApprovedDoc || isQuotationDoc) && materialsData.length > 0) {
          await addDoc(billsRef, {
            ...billPayload,
            invoiceNumber: autoInvNumber,
            billDate: createdAtValue,
            dueDate: Timestamp.fromDate(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)),
            billId: `BILL-${Date.now()}`,
            createdAt: serverTimestamp(),
            createdBy: currentUserProfile?.id || "",
            createdByName: currentUserProfile?.employeeName || currentUserProfile?.name || "System",
          });
          console.log("Auto-created new bill in bills collection for enquiry:", payload.enqId);
        }
      } catch (billSyncErr) {
        console.warn("Could not auto-sync bill record for enquiry:", billSyncErr);
      }

      // --- Counter Update Logic for Fast Moving Items ---
      let oldMaterials: any[] = [];
      if (initial && (initial as any).materials) {
        try {
          oldMaterials = typeof (initial as any).materials === "string" 
            ? JSON.parse((initial as any).materials) 
            : (initial as any).materials;
        } catch (e) {
          console.error("Failed to parse old materials", e);
        }
      }

      const enquiryQtyChanges: Record<string, number> = {};
      const approvedBillQtyChanges: Record<string, number> = {};

      const oldStatus = initial ? (initial as any).status : undefined;
      const newStatus = formData.status;
      
      const wasApproved = oldStatus === "Approved";
      const isApproved = newStatus === "Approved";

      // 1. Subtract old quantities
      oldMaterials.forEach(item => {
        if (!item.productId) return;
        enquiryQtyChanges[item.productId] = (enquiryQtyChanges[item.productId] || 0) - (Number(item.quantity) || 0);
        
        if (wasApproved) {
          approvedBillQtyChanges[item.productId] = (approvedBillQtyChanges[item.productId] || 0) - (Number(item.quantity) || 0);
        }
      });

      // 2. Add new quantities
      materialsData.forEach(item => {
        if (!item.productId) return;
        enquiryQtyChanges[item.productId] = (enquiryQtyChanges[item.productId] || 0) + (Number(item.quantity) || 0);
        
        if (isApproved) {
          approvedBillQtyChanges[item.productId] = (approvedBillQtyChanges[item.productId] || 0) + (Number(item.quantity) || 0);
        }
      });

      // 3. Batch write product updates
      const batch = writeBatch(db);
      
      const productsToUpdate = Array.from(new Set([...Object.keys(enquiryQtyChanges), ...Object.keys(approvedBillQtyChanges)]));
      
      productsToUpdate.forEach(productId => {
        const enqChange = enquiryQtyChanges[productId] || 0;
        const appChange = approvedBillQtyChanges[productId] || 0;
        
        if (enqChange === 0 && appChange === 0) return;
        
        const prodRef = doc(db, "products", productId);
        const updates: any = {};
        if (enqChange !== 0) updates.enquiryCount = increment(enqChange);
        if (appChange !== 0) updates.approvedBillCount = increment(appChange);
        
        batch.update(prodRef, updates);
      });

      try {
        await batch.commit();
        console.log("Committed fast moving items counter updates.");
      } catch (err) {
        console.error("Error updating fast moving items counters:", err);
      }
      // ------------------------------------------------

      // Trigger Email notification for Assigned Staff when assigned by Admin
      if (canEditAssignee && formData.assignedTo) {
        const assignedEmp = employees.find((e) => e.id === formData.assignedTo);
        const oldAssignedTo = initial ? (initial as any).assignedTo : null;
        if (assignedEmp?.email && formData.assignedTo !== oldAssignedTo) {
          try {
            const custName = isProformaInvoiceMode ? companyDetails.companyName : (formData.customerName ?? "Customer");
            const subject = encodeURIComponent(`New Customer Enquiry Assigned: ${payload.enqId} - ${custName}`);
            const body = encodeURIComponent(
              `Hello ${assignedEmp.employeeName || assignedEmp.name},\n\n` +
              `You have been assigned a new customer enquiry on the iBots Dashboard.\n\n` +
              `Enquiry ID: ${payload.enqId}\n` +
              `Customer: ${custName}\n` +
              `Contact: ${formData.contactNumber || 'N/A'}\n` +
              `Total Value: ₹${finalTotal}\n` +
              `Product Status: ${formData.status || 'Enquiry'}\n` +
              `Source: ${formData.mode || 'N/A'}\n` +
              `Remarks: ${formData.remarks || 'None'}\n\n` +
              `Please access the dashboard at https://dashboard.ibots.in/enquiries to follow up.\n\n` +
              `Thank you,\niBots Administration`
            );
            window.open(`mailto:${assignedEmp.email}?subject=${subject}&body=${body}`, '_blank');
          } catch (e) {
            console.log('Email notification skipped:', e);
          }
        }
      }

      // Call onSave to refresh parent component data
      onSave?.();
      
      // Close the modal
      onClose();
    } catch (err) {
      console.error("Error saving enquiry:", err);
      setError("Failed to save the enquiry. Please check the console for more details.");
    } finally {
      setLoading(false);
    }
  };

  const toDateTimeLocal = (value: any): string => {
    if (!value) return "";

    let date: Date;

    if (value instanceof Date) {
      date = value;
    } else if (value?.toDate) {
      date = value.toDate();
    } else if (typeof value === "string") {
      const d = new Date(value);
      if (isNaN(d.getTime())) return "";
      date = d;
    } else {
      return "";
    }

    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  if (!open) return null;

  const canEditAssignee = currentUserProfile?.role === "admin" || currentUserProfile?.role === "manager";
  const subStatusOptions = statusMappings[formData.status] || [];
  const paymentSubStatusOptions = statusPaymentMapping[formData.paymentStatus] || [];
  
  const isQuotationMode = formData.status === "Quotation" && formData.paymentStatus === "Not Paid";
  const isApprovedMode = formData.status === "Approved";
  const isProformaInvoice = formData.status === "Proforma Invoice";

  const generateProformaDescription = (): string => {
    const customerName = companyDetails.companyName || "Customer";
    const companyName = companyDetails.companyName || "Our Company";
    const currentDate = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    return `Dear Sir/Madam,

We are pleased to present our Proforma Invoice for your esteemed company ${customerName}. This document serves as a formal quotation and pre-invoice for the products/services listed below.

We look forward to your positive response and assure you of our best services.

For ${companyName},
Authorized Signatory
Date: ${currentDate}`;
  };

  const getDescriptionText = (): string => {
    if (isProformaInvoice) {
      return generateProformaDescription();
    }
    return formData.remarks || "";
  };

  return (
    <>
      {/* Main Add/Edit Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-2">
        <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden animate-fade-in">
          <div className="flex justify-between items-center px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-800">
              {initial ? "Edit Enquiry" : "Add Enquiry"}
              {isProformaInvoice && (
                <span className="ml-2 text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-full">
                  Proforma Invoice
                </span>
              )}
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X className="w-5 h-5" /></button>
          </div>

          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Proforma Invoice Description Section */}
            {isProformaInvoice && (
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <div className="bg-purple-100 rounded-full p-2 mt-1">
                    <FileText className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-purple-800 mb-2">📄 Proforma Invoice Description</h4>
                    <div className="bg-white rounded-lg p-3 border border-purple-100">
                      <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                        {generateProformaDescription()}
                      </p>
                    </div>
                    <p className="text-xs text-purple-600 mt-2">
                      ℹ️ This description will be included in the Proforma Invoice document
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Enquiry ID - Always visible */}
            <div>
              <label className="block text-sm font-medium text-gray-600">Enquiry ID</label>
              <input readOnly type="text" name="enqId" value={formData.enqId ?? ""} className="w-full px-3 py-2 border rounded-lg bg-gray-100" />
            </div>

            {/* Product Status - Always visible */}
            <div>
              <label className="block text-sm font-medium text-gray-600">Product Status</label>
              <select 
                name="status" 
                value={formData.status ?? ""} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="" disabled>-- Select Status --</option>
                {["Enquiries", "Quotation", "Proforma Invoice", "Invoice", "Approved", "Testing", "Waiting for Materials", "Dropped"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {stockValidationError && (
                <div className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  {stockValidationError}
                </div>
              )}
            </div>

            {/* Company Details Section - Only for Proforma Invoice */}
            {isProformaInvoice && (
              <div className="border-2 border-purple-200 rounded-lg p-4 bg-purple-50">
                <div className="flex items-center gap-2 mb-3">
                  <Building className="w-5 h-5 text-purple-600" />
                  <h3 className="text-md font-semibold text-purple-800">Company Details</h3>
                  <span className="text-xs text-red-500 ml-2">*Mandatory fields: Company Name, Mobile</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Company Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="companyName"
                      value={companyDetails.companyName}
                      onChange={handleCompanyDetailsChange}
                      placeholder="Enter company name"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Company Mobile <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      name="companyMobile"
                      value={companyDetails.companyMobile}
                      onChange={handleCompanyDetailsChange}
                      placeholder="Enter 10-digit mobile number"
                      maxLength={10}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-400"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Company Address
                    </label>
                    <input
                      type="text"
                      name="companyAddress"
                      value={companyDetails.companyAddress}
                      onChange={handleCompanyDetailsChange}
                      placeholder="Enter complete company address"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      GST Number
                    </label>
                    <input
                      type="text"
                      name="companyGST"
                      value={companyDetails.companyGST}
                      onChange={handleCompanyDetailsChange}
                      placeholder="e.g., 22AAAAA0000A1Z5"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-400 uppercase"
                    />
                    <p className="text-xs text-gray-500 mt-1">Optional: Format 22AAAAA0000A1Z5</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      PAN Number
                    </label>
                    <input
                      type="text"
                      name="companyPAN"
                      value={companyDetails.companyPAN}
                      onChange={handleCompanyDetailsChange}
                      placeholder="e.g., ABCDE1234F"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-400 uppercase"
                    />
                    <p className="text-xs text-gray-500 mt-1">Optional: Format ABCDE1234F</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      State
                    </label>
                    <select
                      name="companyState"
                      value={companyDetails.companyState}
                      onChange={handleCompanyDetailsChange}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-400"
                    >
                      <option value="">-- Select State (Optional) --</option>
                      {indianStates.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      City
                    </label>
                    <input
                      type="text"
                      name="companyCity"
                      value={companyDetails.companyCity}
                      onChange={handleCompanyDetailsChange}
                      placeholder="Enter city (Optional)"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Pincode
                    </label>
                    <input
                      type="text"
                      name="companyPincode"
                      value={companyDetails.companyPincode}
                      onChange={handleCompanyDetailsChange}
                      placeholder="Enter pincode (Optional)"
                      maxLength={6}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Company Email
                    </label>
                    <input
                      type="email"
                      name="companyEmail"
                      value={companyDetails.companyEmail}
                      onChange={handleCompanyDetailsChange}
                      placeholder="Enter company email (Optional)"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-400"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Non-Proforma Invoice Fields - Hidden for Proforma Invoice */}
            {!isProformaInvoice && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-600">Customer Name *</label>
                  <input type="text" name="customerName" value={formData.customerName ?? ""} onChange={handleChange} placeholder="Enter customer name" className="w-full px-3 py-2 border rounded-lg" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Contact Person</label>
                    <input type="text" name="contactPerson" value={formData.contactPerson ?? ""} onChange={handleChange} placeholder="Enter contact person" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Contact Number *</label>
                    <input type="tel" name="contactNumber" value={formData.contactNumber ?? ""} onChange={handleChange} placeholder="Enter contact number" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-600">State *</label>
                  <select
                    name="state"
                    value={formData.state ?? ""}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">-- Select State --</option>
                    {indianStates.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Email</label>
                    <input type="email" name="email" value={formData.email ?? ""} onChange={handleChange} placeholder="Enter email" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">City</label>
                    <input type="text" name="city" value={formData.city ?? ""} onChange={handleChange} placeholder="Enter city" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Customer Address</label>
                  <textarea
                    name="customerAddress"
                    value={formData.customerAddress ?? formData.address ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData(prev => ({
                        ...prev,
                        customerAddress: val,
                        address: val,
                      }));
                    }}
                    placeholder="Enter complete customer address, street, landmark, pincode..."
                    rows={2}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-400 leading-relaxed text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Source of Enquiry</label>
                    <select name="mode" value={formData.mode ?? ""} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg">
                      <option value="" disabled>-- Select source --</option>
                      {sourceOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Type</label>
                    <select name="type" value={formData.type ?? ""} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg">
                      <option value="" disabled>-- Select Type --</option>
                      <option value="B2B">B2B</option>
                      <option value="B2C">B2C</option>
                      <option value="Academic">Academic / Training</option>
                      <option value="E-commerce">E-commerce</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">Payment Status</label>
                    <select name="paymentStatus" value={formData.paymentStatus ?? ""} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">-- Select Payment Status --</option>
                      {["Paid", "Not Paid", "Credit", "Refund", "Replacement"].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Shipment Status</label>
                    <select name="shipmentStatus" value={formData.shipmentStatus ?? ""} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">-- Select Shipment Status --</option>
                      {["Packed", "Dispatched", "Delivered", "In Shipment"].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {subStatusOptions.length > 0 && (
                  <div className="animate-fade-in">
                    <label className="block text-sm font-medium text-gray-600">
                      {formData.status === "Dropped" ? "Reason for Dropping" : 
                       formData.status === "Proforma Invoice" ? "Proforma Invoice Status" :
                       "Sub-Status Detail"}
                    </label>
                    <select name="subStatus" value={formData.subStatus ?? ""} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">-- Select sub-status --</option>
                      {subStatusOptions.map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>
                )}

                {paymentSubStatusOptions.length > 0 && (
                  <div className="animate-fade-in">
                    <label className="block text-sm font-medium text-gray-600">
                      Mode of Payment
                    </label>
                    <select name="paymentSubStatus" value={formData.paymentSubStatus ?? ""} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">-- Select mode of payment --</option>
                      {paymentSubStatusOptions.map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                      {formData.paymentSubStatus && !paymentSubStatusOptions.includes(formData.paymentSubStatus) && (
                        <option value={formData.paymentSubStatus}>{formData.paymentSubStatus}</option>
                      )}
                    </select>
                  </div>
                )}

                {(formData.status === "Waiting Payment" || formData.status === "Waiting for Materials") && (
                  <div className="animate-fade-in">
                    <input type="text" name="reason" value={formData.reason ?? ""} placeholder="Enter the reason" onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                )}
              </>
            )}

            {/* Proforma Invoice fields - only for PI mode */}
            {isProformaInvoice && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Source of Enquiry</label>
                    <select name="mode" value={formData.mode ?? ""} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg">
                      <option value="" disabled>-- Select source --</option>
                      {sourceOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Type</label>
                    <select name="type" value={formData.type ?? ""} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg">
                      <option value="" disabled>-- Select Type --</option>
                      <option value="B2B">B2B</option>
                      <option value="B2C">B2C</option>
                      <option value="Academic">Academic / Training</option>
                      <option value="E-commerce">E-commerce</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Payment Status</label>
                    <select name="paymentStatus" value={formData.paymentStatus ?? ""} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">-- Select Payment Status --</option>
                      {["Paid", "Not Paid", "Credit", "Refund", "Replacement"].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Shipment Status</label>
                    <select name="shipmentStatus" value={formData.shipmentStatus ?? ""} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">-- Select Shipment Status --</option>
                      {["Packed", "Dispatched", "Delivered", "In Shipment"].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {subStatusOptions.length > 0 && (
                  <div className="animate-fade-in">
                    <label className="block text-sm font-medium text-gray-600">Proforma Invoice Status</label>
                    <select name="subStatus" value={formData.subStatus ?? ""} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">-- Select PI status --</option>
                      {subStatusOptions.map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>
                )}

                {paymentSubStatusOptions.length > 0 && (
                  <div className="animate-fade-in">
                    <label className="block text-sm font-medium text-gray-600">Mode of Payment</label>
                    <select name="paymentSubStatus" value={formData.paymentSubStatus ?? ""} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">-- Select mode of payment --</option>
                      {paymentSubStatusOptions.map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                      {formData.paymentSubStatus && !paymentSubStatusOptions.includes(formData.paymentSubStatus) && (
                        <option value={formData.paymentSubStatus}>{formData.paymentSubStatus}</option>
                      )}
                    </select>
                  </div>
                )}
              </>
            )}

            {/* Enhanced Materials Section - Always visible */}
            <div className="border-t pt-4 mt-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-md font-semibold text-gray-800">Products & Materials</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowInventoryManagement(true)}
                    className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Manage Inventory
                  </button>
                  {materials.length > 0 && (
                    <button
                      onClick={handleRefreshPrices}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Refresh Prices
                    </button>
                  )}
                </div>
              </div>

              {/* Status indicators */}
              {isQuotationMode && (
                <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  <span className="font-medium">📋 Quotation Mode:</span> Products can be added freely without stock validation. Stock will be checked when changing to Approved.
                </div>
              )}

              {isProformaInvoice && (
                <div className="mb-3 p-2 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800">
                  <span className="font-medium">📄 Proforma Invoice Mode:</span> Detailed invoice with tax breakdown. Stock will be checked when changing to Approved.
                </div>
              )}

              {isApprovedMode && (
                <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                  <span className="font-medium">✅ Approved Mode:</span> Stock availability is enforced. Please ensure all products are in stock.
                </div>
              )}

              {materials.length > 0 && isApprovedMode && hasStockIssues() && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>⚠️ Some products have stock issues. Please update inventory or reduce quantities before proceeding.</span>
                </div>
              )}

              {/* Price Update Notification */}
              {priceUpdateNotification && (
                <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                  {priceUpdateNotification}
                </div>
              )}

              {/* Product Selection */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-600">Select Product</label>
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setShowProductDropdown(true);
                    }}
                    onFocus={() => setShowProductDropdown(true)}
                    placeholder="Search product..."
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                  {showProductDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredProducts.length > 0 ? (
                        filteredProducts.map((product) => {
                          const isLowStock = product.totalQuantity !== undefined && product.totalQuantity < 10;
                          const isOutOfStock = product.totalQuantity === 0;
                          
                          return (
                            <div
                              key={product.id}
                              className={`px-3 py-2 hover:bg-gray-100 cursor-pointer border-b last:border-b-0 ${
                                isOutOfStock && isApprovedMode ? 'bg-red-50' : ''
                              }`}
                              onClick={() => {
                                setSelectedProduct(product.id);
                                setProductSearch(product.name);
                                setShowProductDropdown(false);
                              }}
                            >
                              <div className="font-medium">{product.name}</div>
                              <div className="text-sm text-gray-600">
                                ₹{product.price} | Stock: {product.totalQuantity || 0} | Tax: {product.taxRate !== undefined && product.taxRate !== null ? product.taxRate : 18}%
                                {product.hsnCode && ` | HSN: ${product.hsnCode}`}
                              </div>
                              {isOutOfStock && isApprovedMode && (
                                <span className="text-xs text-red-600 font-medium">❌ Out of stock</span>
                              )}
                              {isLowStock && !isOutOfStock && isApprovedMode && (
                                <span className="text-xs text-orange-600 font-medium">⚠️ Low stock</span>
                              )}
                              {isOutOfStock && isQuotationMode && (
                                <span className="text-xs text-blue-600 font-medium">📋 Can be added for quotation</span>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-3 text-center">
                          <p className="text-sm text-gray-500 mb-2">No products found</p>
                          <button
                            onClick={() => {
                              setShowProductDropdown(false);
                              setShowInventoryManagement(true);
                            }}
                            className="text-sm text-purple-600 hover:text-purple-800 font-medium flex items-center justify-center gap-1"
                          >
                            <Plus className="w-4 h-4" />
                            Open Inventory to add products
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">Quantity</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                    min="1"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">Tax Rate</label>
                  <select
                    value={gstRate}
                    onChange={(e) => setGstRate(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {TAX_RATES.map((rate) => (
                      <option key={rate.value} value={rate.value}>
                        {rate.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={handleAddProduct}
                    className={`w-full px-4 py-2 rounded-lg flex items-center justify-center gap-2 ${
                      isQuotationMode 
                        ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                        : isProformaInvoice
                        ? 'bg-purple-600 hover:bg-purple-700 text-white'
                        : isApprovedMode
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    <Plus className="w-4 h-4" /> 
                    {isProformaInvoice ? 'Add to PI' : 
                     isQuotationMode ? 'Add for Quotation' : 
                     'Add Product'}
                  </button>
                </div>
              </div>

              {/* Materials List */}
              {materials.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Added Products</h4>
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">HSN</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price (₹)</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Taxable</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tax %</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tax Amt</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total (₹)</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Stock Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {materials.map((item) => {
                          const product = products.get(item.productId);
                          const stockStatus = getStockStatus(item);
                          
                          return (
                            <tr key={item.id} className={
                              stockStatus.status === 'out' && isApprovedMode ? 'bg-red-50' :
                              stockStatus.status === 'low' && isApprovedMode ? 'bg-yellow-50' :
                              ''
                            }>
                              <td className="px-4 py-2 text-sm font-medium">
                                {item.productName}
                                {stockStatus.status === 'out' && isApprovedMode && (
                                  <span className="ml-2 text-xs text-red-700 font-medium">❌ Out of Stock</span>
                                )}
                                {stockStatus.status === 'low' && isApprovedMode && (
                                  <span className="ml-2 text-xs text-orange-700 font-medium">⚠️ Low Stock</span>
                                )}
                                {stockStatus.status === 'out' && isQuotationMode && (
                                  <span className="ml-2 text-xs text-blue-700 font-medium">📋 Quotation</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-600">{item.hsnCode || "-"}</td>
                              <td className="px-4 py-2 text-sm">
                                <input
                                  type="number"
                                  value={item.price}
                                  onChange={(e) => handleUpdatePrice(item.id, parseFloat(e.target.value) || 0)}
                                  step="0.01"
                                  className="w-24 px-2 py-1 border rounded"
                                />
                                {item.originalPrice && item.originalPrice !== item.price && (
                                  <span className="text-xs text-orange-600 ml-1">
                                    (was ₹{item.originalPrice.toFixed(2)})
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => handleUpdateQuantity(item.id, parseInt(e.target.value) || 0)}
                                  min="1"
                                  className={`w-20 px-2 py-1 border rounded ${
                                    stockStatus.status === 'out' && isApprovedMode ? 'border-red-400' :
                                    stockStatus.status === 'low' && isApprovedMode ? 'border-yellow-400' :
                                    ''
                                  }`}
                                />
                              </td>
                              <td className="px-4 py-2 text-sm">₹{(item.price * item.quantity).toFixed(2)}</td>
                              <td className="px-4 py-2 text-sm">
                                <select
                                  value={item.taxRate !== undefined && item.taxRate !== null ? item.taxRate : gstRate}
                                  onChange={(e) => handleUpdateTaxRate(item.id, parseFloat(e.target.value))}
                                  className="w-16 px-1 py-1 border rounded text-sm"
                                >
                                  {TAX_RATES.map((rate) => (
                                    <option key={rate.value} value={rate.value}>
                                      {rate.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-4 py-2 text-sm">₹{(item.taxAmount || 0).toFixed(2)}</td>
                              <td className="px-4 py-2 text-sm font-medium">₹{item.totalAmount.toFixed(2)}</td>
                              <td className="px-4 py-2 text-sm">
                                {isApprovedMode && (
                                  <div className="text-xs">
                                    {stockStatus.status === 'ok' && (
                                      <span className="text-green-600">✓ Available</span>
                                    )}
                                    {stockStatus.status === 'low' && (
                                      <span className="text-orange-600">⚠️ {stockStatus.available} left</span>
                                    )}
                                    {stockStatus.status === 'out' && (
                                      <span className="text-red-600">❌ {stockStatus.available} available</span>
                                    )}
                                  </div>
                                )}
                                {isQuotationMode && (
                                  <div className="text-xs text-gray-500">
                                    Stock: {stockStatus.available}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                <button
                                  onClick={() => handleRemoveProduct(item.id)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* GST and Totals */}
              {materials.length > 0 && (
                <div className="mt-4 bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">Subtotal:</span>
                        <span className="text-lg font-semibold">₹{calculateSubtotal().toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">Taxable Value:</span>
                        <span className="text-lg font-semibold">₹{calculateTotalTaxableValue().toFixed(2)}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-600">Total GST:</span>
                        </div>
                        <span className="text-lg font-semibold text-blue-600">₹{calculateGST().toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">Total Products:</span>
                        <span className="text-lg font-semibold">{materials.length}</span>
                      </div>
                    </div>
                    
                    <div className="border-l pl-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-base font-bold text-gray-800">Final Total:</span>
                        <span className="text-2xl font-bold text-green-600">₹{calculateFinalTotal().toFixed(2)}</span>
                      </div>
                      {isProformaInvoice && (
                        <div className="text-xs text-purple-600 mt-1">
                          📄 Proforma Invoice - Tax inclusive
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Deduct from Inventory Toggle Card */}
              {materials.length > 0 && (
                <div className="mt-3 bg-white p-3.5 border border-gray-200 rounded-lg shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-3">
                    <input
                      type="checkbox"
                      id="enquiryDeductInventory"
                      checked={deductFromInventory}
                      onChange={(e) => setDeductFromInventory(e.target.checked)}
                      className="w-4 h-4 mt-0.5 sm:mt-0 text-purple-600 rounded border-gray-300 focus:ring-purple-500 cursor-pointer"
                    />
                    <label htmlFor="enquiryDeductInventory" className="cursor-pointer select-none">
                      <div className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-purple-600" />
                        Deduct from Inventory Stock
                      </div>
                      <div className="text-xs text-gray-500 font-normal mt-0.5">
                        {deductFromInventory
                          ? "Enabled — Warehouse inventory stock will reduce when approved & billed."
                          : "Disabled — Quotation / Vendor-sourced items. Warehouse inventory stock will NOT be reduced."}
                      </div>
                    </label>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap self-start sm:self-auto ${
                    deductFromInventory ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {deductFromInventory ? "Stock Active" : "Quotation/Vendor Mode"}
                  </span>
                </div>
              )}
            </div>

            {/* Value and Date - Always visible */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600">Value (₹)</label>
                <input
                  type="number"
                  name="value"
                  value={(formData.value ?? 0).toFixed(2)}
                  onChange={handleChange}
                  placeholder="Auto-calculated from products"
                  className="w-full px-3 py-2 border rounded-lg bg-gray-100"
                  readOnly
                />
                {materials.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Auto-calculated from products: ₹{calculateFinalTotal().toFixed(2)}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600">Date</label>
                <input 
                  type="datetime-local" 
                  name="createdAt" 
                  value={toDateTimeLocal(formData.createdAt)} 
                  onChange={handleChange} 
                  placeholder="Enter the date" 
                  className="w-full px-3 py-2 border rounded-lg" 
                />
              </div>
            </div>

            {/* Additional Notes / Description - Editable for Proforma Invoice */}
            <div>
              <label className="block text-sm font-medium text-gray-600">
                {isProformaInvoice ? "Additional Notes / Description" : "Remarks"}
              </label>
              <textarea 
                name="remarks" 
                value={isProformaInvoice ? (formData.remarks || getDescriptionText()) : (formData.remarks ?? "")} 
                onChange={handleChange} 
                rows={isProformaInvoice ? 6 : 3} 
                placeholder={isProformaInvoice ? "Add additional notes or special instructions (optional)" : "Additional remarks"} 
                className="w-full px-3 py-2 border rounded-lg"
              />
              {isProformaInvoice && (
                <p className="text-xs text-purple-600 mt-1">
                  ℹ️ You can edit this description or add additional notes. Default proforma description is pre-filled.
                </p>
              )}
            </div>

            {/* Assigned To - Always visible */}
            <div>
              <label className="block text-sm font-medium text-gray-600">Assigned To</label>
              <div className="mt-1">
                {canEditAssignee ? (
                  <select 
                    name="assignedTo" 
                    value={formData.assignedTo ?? ""} 
                    onChange={handleChange} 
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-400 outline-none"
                  >
                    <option value="">-- Select an Employee --</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.employeeName ?? emp.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full px-3 py-2 border rounded-lg bg-gray-100 text-gray-700 font-medium flex items-center justify-between">
                    <span>
                      {(() => {
                        const assignedEmp = employees.find((e) => e.id === formData.assignedTo);
                        return assignedEmp?.employeeName || assignedEmp?.name || (formData.assignedTo ? "Assigned" : "Unassigned");
                      })()}
                    </span>
                    <span className="text-xs text-gray-400 font-normal">Assigned by Admin (View Only)</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="px-6 py-4 border-t flex flex-wrap justify-end gap-3 bg-gray-50">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300">
              Cancel
            </button>
            {shouldShowBillGenerator() && (
              <button
                onClick={handleBillGenerate}
                className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                {isProformaInvoice ? "Generate Proforma Invoice" : (formData.status === "Quotation" ? "Generate Quotation" : "Generate Bill / Invoice")}
              </button>
            )}
            <button onClick={handleSave} disabled={loading} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {/* Error Dialog */}
        {error && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 animate-fade-in">
            <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-sm mx-4">
              <div className="flex items-start">
                <div className="flex-shrink-0 bg-red-100 rounded-full p-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="ml-4 flex-1">
                  <h3 className="text-lg font-semibold text-gray-800">Error</h3>
                  <p className="mt-2 text-sm text-gray-600">{error}</p>
                </div>
              </div>
              <div className="mt-5 sm:mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:text-sm"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stock Warning Modal */}
      {showStockWarningModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 bg-yellow-100 rounded-full p-2">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4 flex-1">
                <h3 className="text-lg font-semibold text-gray-800">⚠️ Stock Issues Detected</h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-600">The following products have stock issues:</p>
                  <ul className="mt-2 space-y-1">
                    {stockWarnings.map((warning, index) => (
                      <li key={index} className="text-sm text-red-600">
                        • {warning.productName}: Required {warning.required}, Available {warning.available}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-gray-700 font-medium">
                    You can proceed anyway or update inventory.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-5 sm:mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelStockIssues}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProceedWithStockIssues}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium"
              >
                Proceed Anyway
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowStockWarningModal(false);
                  setShowInventoryManagement(true);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Update Inventory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Management Modal */}
      {showInventoryManagement && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-7xl rounded-2xl shadow-xl overflow-hidden h-[90vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b bg-white sticky top-0 z-10">
              <h2 className="text-xl font-bold text-gray-800">Inventory Management</h2>
              <button onClick={handleCloseInventoryManagement} className="text-gray-500 hover:text-gray-700 p-2">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <InventoryManagement />
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
              <button
                onClick={handleCloseInventoryManagement}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Done - Return to Enquiry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bill/Proforma Invoice Generator Modal */}
      {showBillGenerator && (
        isProformaInvoice ? (
          <ProformaInvoiceGeneratorModal
            open={showBillGenerator}
            onClose={handleBillCancel}
            onSuccess={handleBillSuccess}
            enquiryData={{
              ...formData,
              id: initial?.id,
              companyDetails: companyDetails,
              deductFromInventory: deductFromInventory,
            }}
            materials={materials}
            currentUserProfile={currentUserProfile}
            employees={employees}
            gstRate={gstRate}
            isProformaInvoice={true}
          />
        ) : (
          <BillGeneratorModal
            open={showBillGenerator}
            onClose={handleBillCancel}
            onSuccess={handleBillSuccess}
            enquiryData={{
              ...formData,
              id: initial?.id,
              deductFromInventory: deductFromInventory,
            }}
            materials={materials}
            currentUserProfile={currentUserProfile}
            employees={employees}
            gstRate={gstRate}
            isQuotation={formData.status === "Quotation" || formData.type === "Quotation"}
            onDataUpdated={(updatedData) => {
              console.log('Received updated data from BillGeneratorModal:', updatedData);
              
              if (updatedData && updatedData.materials) {
                let parsedMaterials = updatedData.materials;
                if (typeof parsedMaterials === 'string') {
                  try {
                    parsedMaterials = JSON.parse(parsedMaterials);
                  } catch (e) {
                    console.error('Error parsing materials:', e);
                    return;
                  }
                }
                
                const formattedMaterials = parsedMaterials.map((item: any) => {
                  const priceFromBill = item.price || 0;
                  const quantity = item.quantity || 1;
                  const taxRate = item.taxRate !== undefined && item.taxRate !== null ? item.taxRate : 18;
                  const taxableValue = priceFromBill * quantity;
                  const taxAmount = (taxableValue * taxRate) / 100;
                  const totalAmount = taxableValue + taxAmount;
                  
                  return {
                    id: item.id || Date.now().toString(),
                    productId: item.productId,
                    productName: item.productName,
                    price: priceFromBill,
                    quantity: quantity,
                    totalAmount: totalAmount,
                    taxableValue: taxableValue,
                    taxRate: taxRate,
                    taxAmount: taxAmount,
                    hsnCode: item.hsnCode || item.hsn || "",
                    originalPrice: item.originalPrice || priceFromBill,
                    manuallyEdited: true,
                    availableQuantity: item.availableQuantity || 0,
                  };
                });
                
                setMaterials(formattedMaterials);
                
                const subtotal = formattedMaterials.reduce((sum: number, item: MaterialItem) => sum + (item.price * item.quantity), 0);
                const gstAmount = formattedMaterials.reduce((sum: number, item: MaterialItem) => sum + (item.taxAmount || 0), 0);
                const finalTotal = formattedMaterials.reduce((sum: number, item: MaterialItem) => sum + item.totalAmount, 0);
                
                setFormData(prev => ({
                  ...prev,
                  value: finalTotal,
                  subtotal: subtotal,
                  gstAmount: gstAmount,
                  finalTotal: finalTotal,
                  materialsCount: formattedMaterials.length,
                }));
                
                setPriceUpdateNotification(`✅ Prices updated from bill! New total: ₹${finalTotal.toFixed(2)}`);
                setTimeout(() => setPriceUpdateNotification(null), 4000);
              }
            }}
          />
        )
      )}
    </>
  );
};

export default AddEditModal;