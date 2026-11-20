// components/modals/BillGeneratorModal.tsx

import React, { useState, useEffect } from "react";
import { X, Printer, Save, AlertCircle, Edit3, Check, RotateCcw, RefreshCw, Plus, Search, Package, Calendar } from "lucide-react";
import { Timestamp, doc, updateDoc, addDoc, collection, serverTimestamp, getDoc, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { billService } from "../../services/billService";
import { generateBillPrintHTML, getContextualTerms, isLegacyDefaultTerms } from "../../utils/billPrintTemplate";

interface MaterialItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  totalAmount: number;
  availableQuantity?: number;
  hsn?: string;
  originalPrice?: number;
  taxRate?: number;
  taxableValue?: number;
  taxAmount?: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
  totalQuantity?: number;
  hsnCode?: string;
  taxRate?: number;
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

interface BillGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  enquiryData: any;
  materials: MaterialItem[];
  currentUserProfile: any;
  employees: any[];
  gstRate: number;
  isQuotation?: boolean;
  onDataUpdated?: (updatedData: any) => void;
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
  { id: 3, text: "PI Validity: 2 days" },
];

// Tax rates configuration
const TAX_RATES = [
  { value: 0, label: "0%" },
  { value: 5, label: "5%" },
  { value: 12, label: "12%" },
  { value: 18, label: "18%" },
  { value: 28, label: "28%" },
];

const BillGeneratorModal: React.FC<BillGeneratorModalProps> = ({
  open,
  onClose,
  onSuccess,
  enquiryData,
  materials: initialMaterials,
  currentUserProfile,
  employees,
  gstRate: initialGstRate,
  isQuotation = false,
  onDataUpdated,
}) => {
  const [editableMaterials, setEditableMaterials] = useState<MaterialItem[]>([]);
  const [originalMaterials, setOriginalMaterials] = useState<MaterialItem[]>([]);
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [taxType, setTaxType] = useState<"cgst_sgst" | "igst">("cgst_sgst");
  const [taxRate, setTaxRate] = useState<number>(initialGstRate || 18);
  const [placeOfSupply, setPlaceOfSupply] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [editingBankDetails, setEditingBankDetails] = useState<boolean>(false);
  const [editingTerms, setEditingTerms] = useState<boolean>(false);
  const [bankDetails, setBankDetails] = useState<BankDetails>(defaultBankDetails);
  const [terms, setTerms] = useState<TermsCondition[]>(() => {
    return getContextualTerms({
      isQuotation,
      paymentStatus: enquiryData?.paymentStatus,
      status: enquiryData?.status,
      shipmentStatus: enquiryData?.shipmentStatus || (enquiryData as any)?.shippingStatus,
    });
  });
  const [newTerm, setNewTerm] = useState<string>("");
  const [fetchingHsn, setFetchingHsn] = useState<boolean>(false);
  const [existingBillId, setExistingBillId] = useState<string | null>(null);
  const [existingBillData, setExistingBillData] = useState<any>(null);
  const [paymentType, setPaymentType] = useState<string>("");
  const [paymentSubStatus, setPaymentSubStatus] = useState<string>("");
  const [includeSignature, setIncludeSignature] = useState<boolean>(true);
  const [deductFromInventory, setDeductFromInventory] = useState<boolean>(false);
  const [shippingCharges, setShippingCharges] = useState<number>(120);
  const [customerAddress, setCustomerAddress] = useState<string>(() => {
    return (enquiryData as any)?.customerAddress || (enquiryData as any)?.address || "";
  });

  const getInitialInvoiceDate = (enq: any, existingBill: any): string => {
    if (existingBill?.billDate) {
      const d = typeof existingBill.billDate.toDate === "function" ? existingBill.billDate.toDate() : new Date(existingBill.billDate);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    if (enq?.createdAt) {
      const d = typeof enq.createdAt.toDate === "function" ? enq.createdAt.toDate() : new Date(enq.createdAt);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    if (enq?.paidDate) {
      const d = typeof enq.paidDate.toDate === "function" ? enq.paidDate.toDate() : new Date(enq.paidDate);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
  };

  const [invoiceDate, setInvoiceDate] = useState<string>(() => {
    return getInitialInvoiceDate(enquiryData, null);
  });
  
  // Product search states
  const [products, setProducts] = useState<Map<string, Product>>(new Map());
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [productSearch, setProductSearch] = useState<string>("");
  const [showProductDropdown, setShowProductDropdown] = useState<boolean>(false);
  
  // Function to generate bill number based on type
  const generateBillNumber = (isQuote: boolean) => {
    if (isQuote) {
      return `IBQ-${Date.now().toString().slice(-6)}`;
    }
    return `IBIN-${Date.now().toString().slice(-8)}`;
  };

  const [billNumber, setBillNumber] = useState<string>(() => {
    const isQuote = isQuotation || enquiryData?.status === "Quotation" || enquiryData?.status?.toLowerCase() === "quotation";
    return generateBillNumber(isQuote);
  });

  const LOGO_URL = typeof window !== 'undefined' && window.location?.origin ? `${window.location.origin}/ibots-logo.png` : "https://ibots.in/wp-content/uploads/2024/07/ibots-logo.png";
  const SIGNATURE_URL = typeof window !== 'undefined' && window.location?.origin ? `${window.location.origin}/sign.jpg` : "/sign.jpg";

  // Real-time products listener
  useEffect(() => {
    if (!open || !showPreview) return;

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
          totalQuantity: data.totalQuantity || 0,
          hsnCode: data.hsnCode || "",
          taxRate: data.taxRate !== undefined && data.taxRate !== null ? data.taxRate : 18,
        });
      });
      setProducts(productsMap);
    }, (err) => {
      console.error("Error fetching products:", err);
    });

    return () => unsubscribe();
  }, [open, showPreview]);

  // Check if a bill already exists for this enquiry
  const checkExistingBill = async () => {
    if (!enquiryData?.enqId) return null;
    
    try {
      const isQuoteMode = isQuotation || enquiryData?.status === "Quotation" || enquiryData?.status?.toLowerCase() === "quotation";
      const billsRef = collection(db, "bills");
      const q = query(
        billsRef, 
        where("enquiryEnqId", "==", enquiryData.enqId)
      );
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const matchingDoc = querySnapshot.docs.find(d => !!d.data().isQuotation === isQuoteMode) || querySnapshot.docs[0];
        const existingBill = matchingDoc;
        const billData = existingBill.data();
        setExistingBillId(existingBill.id);
        setExistingBillData(billData);
        if (billData.invoiceNumber) {
          if (isQuoteMode && billData.invoiceNumber.startsWith("IBIN-")) {
            setBillNumber(`IBQ-${billData.invoiceNumber.replace("IBIN-", "")}`);
          } else {
            setBillNumber(billData.invoiceNumber);
          }
        }
        if (billData.includeSignature !== undefined) {
          setIncludeSignature(billData.includeSignature);
        }
        if (billData.deductFromInventory !== undefined) {
          setDeductFromInventory(!!billData.deductFromInventory);
        }
        if (billData.shippingCharges !== undefined && billData.shippingCharges !== null) {
          setShippingCharges(Number(billData.shippingCharges));
        }
        if (billData.discountPercentage !== undefined && billData.discountPercentage !== null) {
          setDiscountPercentage(Number(billData.discountPercentage));
        }
        if (billData.discountAmount !== undefined && billData.discountAmount !== null) {
          setDiscountAmount(Number(billData.discountAmount));
        }
        if (billData.taxRate !== undefined && billData.taxRate !== null) {
          setTaxRate(Number(billData.taxRate));
        }
        if (billData.taxType) {
          setTaxType(billData.taxType);
        }
        if (billData.placeOfSupply) {
          setPlaceOfSupply(billData.placeOfSupply);
        }
        if (billData.customerAddress || billData.billedTo?.address || billData.address) {
          setCustomerAddress(billData.customerAddress || billData.billedTo?.address || billData.address);
        }
        if (billData.bankDetails) {
          setBankDetails(billData.bankDetails);
        }
        if (billData.terms && Array.isArray(billData.terms) && billData.terms.length > 0) {
          const stringTerms = billData.terms.map((t: any) => (typeof t === "string" ? t : t?.text || ""));
          if (isLegacyDefaultTerms(stringTerms)) {
            const contextual = getContextualTerms({
              isQuotation: billData.isQuotation !== undefined ? billData.isQuotation : isQuotation,
              paymentStatus: billData.paymentStatus || enquiryData?.paymentStatus,
              status: billData.status || enquiryData?.status,
              shipmentStatus: billData.shipmentStatus || enquiryData?.shipmentStatus || (enquiryData as any)?.shippingStatus,
            });
            setTerms(contextual);
          } else {
            setTerms(
              billData.terms.map((t: any, idx: number) =>
                typeof t === "string" ? { id: idx + 1, text: t } : { id: t.id || idx + 1, text: t.text || "" }
              )
            );
          }
        } else {
          const contextual = getContextualTerms({
            isQuotation: billData.isQuotation !== undefined ? billData.isQuotation : isQuotation,
            paymentStatus: billData.paymentStatus || enquiryData?.paymentStatus,
            status: billData.status || enquiryData?.status,
            shipmentStatus: billData.shipmentStatus || enquiryData?.shipmentStatus || (enquiryData as any)?.shippingStatus,
          });
          setTerms(contextual);
        }
        if (billData.billDate) {
          const d = typeof billData.billDate.toDate === "function" ? billData.billDate.toDate() : new Date(billData.billDate);
          if (!isNaN(d.getTime())) setInvoiceDate(d.toISOString().slice(0, 10));
        }
        if (billData.paymentType) {
          setPaymentType(billData.paymentType);
        }
        if (billData.paymentSubStatus) {
          setPaymentSubStatus(billData.paymentSubStatus);
        }
        
        // Load original materials from existing bill
        if (billData.items && billData.items.length > 0) {
          const originalItems = billData.items.map((item: any, index: number) => ({
            id: `original-${index}`,
            productId: item.productId,
            productName: item.productName,
            price: item.price,
            quantity: item.quantity,
            totalAmount: item.total || (item.price * item.quantity),
            hsn: item.hsn,
            originalPrice: item.originalPrice || item.price,
            taxRate: item.taxRate !== undefined && item.taxRate !== null ? item.taxRate : 18,
            taxableValue: item.taxableValue || (item.price * item.quantity),
            taxAmount: item.taxAmount || 0,
          }));
          setOriginalMaterials(originalItems);
          if (!initialMaterials || initialMaterials.length === 0) {
            setEditableMaterials(originalItems);
          }
        }
        return existingBill;
      } else {
        const contextual = getContextualTerms({
          isQuotation,
          paymentStatus: enquiryData?.paymentStatus,
          status: enquiryData?.status,
          shipmentStatus: enquiryData?.shipmentStatus || (enquiryData as any)?.shippingStatus,
        });
        setTerms(contextual);
      }
      return null;
    } catch (error) {
      console.error("Error checking existing bill:", error);
      return null;
    }
  };

  // Check for existing bill when modal opens
  useEffect(() => {
    if (open && enquiryData?.enqId) {
      checkExistingBill();
      setInvoiceDate(getInitialInvoiceDate(enquiryData, null));
      const initialAddr = enquiryData.customerAddress || enquiryData.address || "";
      if (initialAddr) {
        setCustomerAddress(initialAddr);
      }
      // Fetch payment type and payment sub status from enquiry data
      if (enquiryData.paymentType) {
        setPaymentType(enquiryData.paymentType);
      }
      if (enquiryData.paymentSubStatus) {
        setPaymentSubStatus(enquiryData.paymentSubStatus);
      }
      if (enquiryData.shippingCharges !== undefined && enquiryData.shippingCharges !== null) {
        setShippingCharges(Number(enquiryData.shippingCharges));
      }
      if (enquiryData.deductFromInventory !== undefined) {
        setDeductFromInventory(!!enquiryData.deductFromInventory);
      } else {
        const isApprovedAndPaid = enquiryData?.status === "Approved" && (enquiryData?.paymentStatus === "Paid" || enquiryData?.paymentStatus === "PAID");
        setDeductFromInventory(isApprovedAndPaid);
      }
    }
  }, [open, enquiryData?.enqId, isQuotation]);

  // Function to calculate inventory adjustments
  const calculateInventoryAdjustments = (currentMaterials: MaterialItem[], originalMaterialsParam: MaterialItem[]) => {
    const adjustments: { productId: string; productName: string; quantityDifference: number; price: number }[] = [];
    
    // Create a map of original quantities
    const originalMap = new Map();
    originalMaterialsParam.forEach(item => {
      originalMap.set(item.productId, {
        quantity: item.quantity,
        productName: item.productName,
        price: item.price
      });
    });
    
    // Calculate differences for current materials
    currentMaterials.forEach(currentItem => {
      const original = originalMap.get(currentItem.productId);
      const originalQuantity = original ? original.quantity : 0;
      const quantityDifference = currentItem.quantity - originalQuantity;
      
      if (quantityDifference !== 0) {
        adjustments.push({
          productId: currentItem.productId,
          productName: currentItem.productName,
          quantityDifference: quantityDifference,
          price: currentItem.price
        });
      }
      originalMap.delete(currentItem.productId);
    });
    
    // Handle removed products
    originalMap.forEach((original, productId) => {
      adjustments.push({
        productId: productId,
        productName: original.productName,
        quantityDifference: -original.quantity,
        price: original.price
      });
    });
    
    return adjustments;
  };

  // Function to update inventory quantities based on adjustments
  const updateInventoryWithAdjustments = async (adjustments: { productId: string; productName: string; quantityDifference: number; price: number }[]) => {
    console.log("Updating inventory with adjustments...");
    
    const updatePromises = adjustments.map(async (adjustment) => {
      if (!adjustment.productId || adjustment.quantityDifference === 0) {
        return { skipped: true };
      }

      try {
        const productRef = doc(db, "products", adjustment.productId);
        const productDoc = await getDoc(productRef);
        
        if (!productDoc.exists()) {
          console.warn(`Product ${adjustment.productName} not found in inventory`);
          return { skipped: true };
        }
        
        const productData = productDoc.data();
        const currentQuantity = productData.totalQuantity || 0;
        
        let newQuantity;
        let transactionType;
        let actualAdjustedQty = Math.abs(adjustment.quantityDifference);
        
        if (adjustment.quantityDifference > 0) {
          actualAdjustedQty = Math.min(currentQuantity, adjustment.quantityDifference);
          newQuantity = Math.max(0, currentQuantity - adjustment.quantityDifference);
          transactionType = 'deliver';
        } else {
          newQuantity = currentQuantity + Math.abs(adjustment.quantityDifference);
          transactionType = 'add_back';
        }

        if (actualAdjustedQty === 0 && adjustment.quantityDifference > 0) {
          // No physical stock on shelf to deduct
          return { skipped: true, productName: adjustment.productName };
        }
        
        const currentTotalValue = productData.totalValue || 0;
        const valueChange = actualAdjustedQty * adjustment.price;
        const newTotalValue = transactionType === 'deliver'
          ? Math.max(0, currentTotalValue - valueChange)
          : (currentTotalValue + valueChange);
        
        const newStockEntry = {
          type: transactionType,
          date: new Date(),
          quantity: actualAdjustedQty,
          unitPrice: adjustment.price,
          totalPrice: actualAdjustedQty * adjustment.price,
          addedBy: currentUserProfile?.id || 'system',
          addedByName: currentUserProfile?.employeeName || currentUserProfile?.name || 'System',
        };

        const updatedStockEntries = [...(productData.stockEntries || []), newStockEntry];
        
        await updateDoc(productRef, {
          totalQuantity: newQuantity,
          totalValue: newTotalValue,
          stockEntries: updatedStockEntries,
          updatedAt: serverTimestamp(),
        });
        
        await addDoc(collection(db, 'transactions'), {
          productId: adjustment.productId,
          productName: adjustment.productName,
          type: transactionType,
          quantity: actualAdjustedQty,
          previousQuantity: currentQuantity,
          newQuantity: newQuantity,
          price: adjustment.price,
          totalAmount: actualAdjustedQty * adjustment.price,
          performedBy: currentUserProfile?.id || 'system',
          performedByName: currentUserProfile?.employeeName || currentUserProfile?.name || 'System',
          notes: `Bill update adjustment for enquiry ${enquiryData.enqId}`,
          createdAt: serverTimestamp(),
        });
        
        return { success: true, productName: adjustment.productName };
      } catch (error) {
        console.error(`Error updating ${adjustment.productName}:`, error);
        throw error;
      }
    });
    
    await Promise.all(updatePromises);
  };

  // Function to fetch HSN code from product
  const fetchHsnFromProduct = async (productId: string): Promise<string> => {
    try {
      const productRef = doc(db, "products", productId);
      const productDoc = await getDoc(productRef);
      if (productDoc.exists()) {
        const productData = productDoc.data();
        return productData.hsnCode || productData.hsn || "";
      }
      return "";
    } catch (error) {
      console.error("Error fetching HSN from product:", error);
      return "";
    }
  };

  // Function to fetch HSN codes for all materials
  const fetchAllHsnCodes = async (materials: MaterialItem[]) => {
    setFetchingHsn(true);
    try {
      const updatedMaterials = await Promise.all(
        materials.map(async (material) => {
          if (material.productId && !material.hsn) {
            const hsn = await fetchHsnFromProduct(material.productId);
            return { ...material, hsn };
          }
          return material;
        })
      );
      setEditableMaterials(updatedMaterials);
    } catch (error) {
      console.error("Error fetching HSN codes:", error);
    } finally {
      setFetchingHsn(false);
    }
  };

  // Filter products based on search
  const filteredProducts = Array.from(products.values()).filter(product =>
    product.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  // Add product to materials
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

    // Check if product already exists in materials
    const existingIndex = editableMaterials.findIndex(m => m.productId === selectedProduct);
    const newQuantity = existingIndex >= 0 ? editableMaterials[existingIndex].quantity + quantity : quantity;

    // Use the product's tax rate or default to the current tax rate
    const itemTaxRate = (product.taxRate !== undefined && product.taxRate !== null) ? product.taxRate : 18;
    const taxableValue = product.price * quantity;
    const taxAmount = (taxableValue * itemTaxRate) / 100;
    const totalAmount = taxableValue + taxAmount;

    let updatedMaterials;
    if (existingIndex >= 0) {
      updatedMaterials = [...editableMaterials];
      const existing = updatedMaterials[existingIndex];
      const existingTaxRate = (existing.taxRate !== undefined && existing.taxRate !== null) ? existing.taxRate : itemTaxRate;
      const newTaxableValue = product.price * newQuantity;
      const newTaxAmount = (newTaxableValue * existingTaxRate) / 100;
      
      updatedMaterials[existingIndex] = {
        ...existing,
        quantity: newQuantity,
        price: product.price,
        totalAmount: newTaxableValue + newTaxAmount,
        taxableValue: newTaxableValue,
        taxAmount: newTaxAmount,
        taxRate: existingTaxRate,
        hsn: product.hsnCode || existing.hsn || "",
        originalPrice: existing.originalPrice || product.price,
      };
    } else {
      updatedMaterials = [...editableMaterials, {
        id: Date.now().toString(),
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity: quantity,
        totalAmount: totalAmount,
        taxableValue: taxableValue,
        taxRate: itemTaxRate,
        taxAmount: taxAmount,
        availableQuantity: product.totalQuantity,
        hsn: product.hsnCode || "",
        originalPrice: product.price,
      }];
    }
    
    setEditableMaterials(updatedMaterials);
    setSelectedProduct("");
    setQuantity(1);
    setProductSearch("");
    setShowProductDropdown(false);
  };

  useEffect(() => {
    if (open && initialMaterials.length > 0) {
      const materialsWithDetails = initialMaterials.map(m => {
        // Use the tax rate from the material, or fallback to the passed gstRate
        const itemTaxRate = (m.taxRate !== undefined && m.taxRate !== null) ? m.taxRate : (initialGstRate || 18);
        const taxableValue = m.taxableValue || (m.price * m.quantity);
        const taxAmount = m.taxAmount || ((taxableValue * itemTaxRate) / 100);
        const totalAmount = m.totalAmount || (taxableValue + taxAmount);
        
        return {
          ...m,
          originalPrice: m.originalPrice || m.price,
          hsn: m.hsn || "",
          taxRate: itemTaxRate,
          taxableValue: taxableValue,
          taxAmount: taxAmount,
          totalAmount: totalAmount,
        };
      });
      setEditableMaterials(materialsWithDetails);
      
      const hasMissingHsn = materialsWithDetails.some(m => !m.hsn && m.productId);
      if (hasMissingHsn) {
        fetchAllHsnCodes(materialsWithDetails);
      }
    }
  }, [open, initialMaterials, initialGstRate]);

  const getBilledByDetails = () => {
    return {
      name: "Protowiz Private Limited",
      address: "Protowiz Private Limited,34/17A, First floor, 4th Cross Rd, Ramalingam Nagar, Saibaba Colony, Coimbatore, Tamil Nadu 641011",
      gstin: "33AAKCP9459K1ZO",
      pan: "AAMCP9459K",
    };
  };

  const getBilledToDetails = () => {
    return {
      name: enquiryData.customerName || "",
      enqId: enquiryData.enqId || "",
      contactNumber: enquiryData.contactNumber || "",
      city: enquiryData.city || "",
      state: enquiryData.state || "Tamil Nadu",
      address: customerAddress || enquiryData.customerAddress || enquiryData.address || "",
      gstin: enquiryData.gstin || "",
      pan: enquiryData.pan || "",
    };
  };

  // Determine if this should be shown as Quotation or Invoice based on enquiry status
  const getDocumentType = () => {
    const isQuote =
      isQuotation ||
      existingBillData?.isQuotation === true ||
      enquiryData?.status === "Quotation" ||
      enquiryData?.status?.toLowerCase() === "quotation" ||
      enquiryData?.type?.toLowerCase() === "quotation";
    const rawPaymentStatus = enquiryData?.paymentStatus || existingBillData?.paymentStatus || "";
    const isPaid = rawPaymentStatus.toLowerCase() === "paid" || rawPaymentStatus.toLowerCase() === "completed";
    const isApprovedAndPaid = !isQuote && enquiryData?.status === "Approved" && isPaid;

    if (isQuote) {
      return {
        isQuotation: true,
        isInvoice: false,
        documentType: "QUOTATION",
        documentLabel: "Quote No",
        isPaid: false,
        displayStatus: "",
        statusClass: "",
        isApprovedAndPaid: false,
      };
    }

    if (isPaid) {
      return {
        isQuotation: false,
        isInvoice: true,
        documentType: "TAX INVOICE",
        documentLabel: "Invoice #",
        isPaid: true,
        displayStatus: "PAID",
        statusClass: "status-paid",
        isApprovedAndPaid: isApprovedAndPaid,
      };
    }

    // Invoice that is NOT Paid (Pending / Partial / Not Paid / etc)
    const displayStatusText = rawPaymentStatus ? rawPaymentStatus.toUpperCase() : "NOT PAID";
    return {
      isQuotation: false,
      isInvoice: true,
      documentType: "INVOICE",
      documentLabel: "Invoice #",
      isPaid: false,
      displayStatus: displayStatusText,
      statusClass: "status-not-paid",
      isApprovedAndPaid: false,
    };
  };

  // Update bill number when document type changes
  useEffect(() => {
    const docType = getDocumentType();
    if (!existingBillId) {
      const newBillNumber = generateBillNumber(docType.isQuotation);
      setBillNumber(newBillNumber);
    }
  }, [enquiryData?.status, enquiryData?.paymentStatus, isQuotation, existingBillId]);

  const handleUpdatePrice = (id: string, newPrice: number) => {
    if (newPrice < 0) return;
    setEditableMaterials(prev => prev.map(item => {
      if (item.id === id) {
        const itemTaxRate = (item.taxRate !== undefined && item.taxRate !== null) ? item.taxRate : 18;
        const taxableValue = newPrice * item.quantity;
        const taxAmount = (taxableValue * itemTaxRate) / 100;
        const totalAmount = taxableValue + taxAmount;
        return { 
          ...item, 
          price: newPrice, 
          totalAmount: totalAmount,
          taxableValue: taxableValue,
          taxAmount: taxAmount,
          originalPrice: item.price, // Store the old price as original
        };
      }
      return item;
    }));
  };

  const handleUpdateQuantity = (id: string, newQuantity: number) => {
    if (newQuantity <= 0) return;
    setEditableMaterials(prev => prev.map(item => {
      if (item.id === id) {
        const itemTaxRate = (item.taxRate !== undefined && item.taxRate !== null) ? item.taxRate : 18;
        const taxableValue = item.price * newQuantity;
        const taxAmount = (taxableValue * itemTaxRate) / 100;
        const totalAmount = taxableValue + taxAmount;
        return { 
          ...item, 
          quantity: newQuantity, 
          totalAmount: totalAmount,
          taxableValue: taxableValue,
          taxAmount: taxAmount,
        };
      }
      return item;
    }));
  };

  const handleUpdateHsn = (id: string, newHsn: string) => {
    setEditableMaterials(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, hsn: newHsn };
      }
      return item;
    }));
  };

  // Handle tax rate updates
  const handleUpdateTaxRate = (id: string, newTaxRate: number) => {
    if (newTaxRate < 0) return;
    setEditableMaterials(prev => prev.map(item => {
      if (item.id === id) {
        const taxableValue = item.price * item.quantity;
        const taxAmount = (taxableValue * newTaxRate) / 100;
        const totalAmount = taxableValue + taxAmount;
        
        return { 
          ...item, 
          taxRate: newTaxRate,
          taxAmount: taxAmount,
          totalAmount: totalAmount,
        };
      }
      return item;
    }));
  };

  const handleRefreshHsn = async (productId: string, materialId: string) => {
    setFetchingHsn(true);
    try {
      const hsn = await fetchHsnFromProduct(productId);
      setEditableMaterials(prev => prev.map(item => {
        if (item.id === materialId) {
          return { ...item, hsn };
        }
        return item;
      }));
    } catch (error) {
      console.error("Error refreshing HSN:", error);
    } finally {
      setFetchingHsn(false);
    }
  };

  const calculateSubtotal = (): number => {
    return editableMaterials.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const calculateDiscount = (): number => {
    return (calculateSubtotal() * discountPercentage) / 100;
  };

  const calculateTaxableAmount = (): number => {
    return Math.max(0, calculateSubtotal() - calculateDiscount());
  };

  const calculateTaxAmount = (): number => {
    const factor = (100 - discountPercentage) / 100;
    return editableMaterials.reduce((sum, item) => {
      const lineTaxable = (item.price * item.quantity) * factor;
      const rate = (item.taxRate !== undefined && item.taxRate !== null) ? item.taxRate : 18;
      return sum + (lineTaxable * rate) / 100;
    }, 0);
  };

  const calculateCGST = (): number => {
    if (taxType === "cgst_sgst") return calculateTaxAmount() / 2;
    return 0;
  };

  const calculateSGST = (): number => {
    if (taxType === "cgst_sgst") return calculateTaxAmount() / 2;
    return 0;
  };

  const calculateIGST = (): number => {
    if (taxType === "igst") return calculateTaxAmount();
    return 0;
  };

  const calculateTotal = (): number => {
    return calculateTaxableAmount() + calculateTaxAmount() + (Number(shippingCharges) || 0);
  };

  const handleDiscountChange = (value: string) => {
    const percentage = parseFloat(value) || 0;
    setDiscountPercentage(Math.min(100, Math.max(0, percentage)));
  };

  useEffect(() => {
    const customerState = (getBilledToDetails().state || "").trim().toLowerCase();
    const isOutOfCountry = customerState.includes("country") || customerState.includes("outside") || customerState.includes("foreign") || customerState.includes("international") || customerState.includes("other") || customerState.includes("export");
    const isTamilNadu = customerState === "tamil nadu";
    setTaxType(isOutOfCountry || !isTamilNadu ? "igst" : "cgst_sgst");
    setPlaceOfSupply(getBilledToDetails().state || "Tamil Nadu");

    if (existingBillData?.shippingCharges !== undefined && existingBillData?.shippingCharges !== null) {
      setShippingCharges(Number(existingBillData.shippingCharges));
    } else if (enquiryData?.shippingCharges !== undefined && enquiryData?.shippingCharges !== null) {
      setShippingCharges(Number(enquiryData.shippingCharges));
    } else {
      setShippingCharges(isTamilNadu ? 120 : 250);
    }
  }, [enquiryData, existingBillData]);

  const validateBillData = (): boolean => {
    if (!editableMaterials || editableMaterials.length === 0) {
      setError("No items to bill. Please add materials first.");
      return false;
    }
    const billedTo = getBilledToDetails();
    if (!billedTo.name) {
      setError("Customer name is required.");
      return false;
    }
    if (!billedTo.contactNumber) {
      setError("Customer contact number is required.");
      return false;
    }
    if (!currentUserProfile?.id) {
      setError("User not authenticated. Please login again.");
      return false;
    }
    return true;
  };

  // Bank Details Handlers
  const handleBankDetailChange = (field: keyof BankDetails, value: string) => {
    setBankDetails(prev => ({ ...prev, [field]: value }));
  };

  const resetBankDetails = () => {
    setBankDetails(defaultBankDetails);
  };

  // Terms Handlers
  const handleTermChange = (id: number, value: string) => {
    setTerms(prev => prev.map(term => 
      term.id === id ? { ...term, text: value } : term
    ));
  };

  const handleAddTerm = () => {
    if (newTerm.trim()) {
      const newId = Math.max(...terms.map(t => t.id), 0) + 1;
      setTerms(prev => [...prev, { id: newId, text: newTerm.trim() }]);
      setNewTerm("");
    }
  };

  const handleRemoveTerm = (id: number) => {
    setTerms(prev => prev.filter(term => term.id !== id));
  };

  const resetTerms = () => {
    const contextual = getContextualTerms({
      isQuotation,
      paymentStatus: existingBillData?.paymentStatus || enquiryData?.paymentStatus,
      status: existingBillData?.status || enquiryData?.status,
      shipmentStatus: existingBillData?.shipmentStatus || enquiryData?.shipmentStatus || (enquiryData as any)?.shippingStatus,
    });
    setTerms(contextual);
  };

  const handleGenerateBill = async () => {
    if (!validateBillData()) return;

    setLoading(true);
    setError(null);

    try {
      const now = Timestamp.now();
      const billedBy = getBilledByDetails();
      const billedTo = getBilledToDetails();
      const docType = getDocumentType();
      
      // Handle inventory updates - strictly only when deductFromInventory is enabled AND Approved & Paid
      if (deductFromInventory && docType.isApprovedAndPaid) {
        const wasPreviouslyApprovedAndDeducted = 
          existingBillData?.inventoryUpdated === true || 
          existingBillData?.status === "paid" || 
          existingBillData?.isApprovedAndPaid === true ||
          enquiryData?.stockDeducted === true;

        if (wasPreviouslyApprovedAndDeducted && originalMaterials.length > 0) {
          const adjustments = calculateInventoryAdjustments(editableMaterials, originalMaterials);
          if (adjustments.length > 0) {
            await updateInventoryWithAdjustments(adjustments);
          }
        } else {
          // First time approval: deduct actual approved quantities and record delivery
          const adjustments = editableMaterials.map(m => ({
            productId: m.productId,
            productName: m.productName,
            quantityDifference: m.quantity,
            price: m.price
          }));
          await updateInventoryWithAdjustments(adjustments);
        }
      }
      
      // Prepare bill data
      const factor = (100 - discountPercentage) / 100;
      const subtotalVal = calculateSubtotal();
      const discountVal = calculateDiscount();
      const taxableVal = calculateTaxableAmount();
      const taxAmountVal = calculateTaxAmount();
      const totalAmountVal = calculateTotal();
      const selectedBillDate = invoiceDate ? new Date(invoiceDate) : new Date();
      const billTimestamp = Timestamp.fromDate(selectedBillDate);

      const billData = {
        invoiceNumber: billNumber,
        billDate: billTimestamp,
        dueDate: Timestamp.fromDate(new Date(selectedBillDate.getTime() + 15 * 24 * 60 * 60 * 1000)),
        customerName: billedTo.name,
        customerContact: billedTo.contactNumber,
        customerAddress: billedTo.address,
        customerCity: billedTo.city,
        billedBy: billedBy,
        billedTo: billedTo,
        items: editableMaterials.map(item => {
          const lineTaxable = (item.price * item.quantity) * factor;
          const rate = (item.taxRate !== undefined && item.taxRate !== null) ? item.taxRate : 18;
          const lineTax = (lineTaxable * rate) / 100;
          return {
            productId: item.productId,
            productName: item.productName,
            hsn: item.hsn || "00",
            quantity: item.quantity,
            price: item.price,
            total: lineTaxable + lineTax,
            taxableValue: lineTaxable,
            taxAmount: lineTax,
            taxRate: rate,
            originalPrice: item.originalPrice || item.price,
          };
        }),
        subtotal: subtotalVal,
        discountAmount: discountVal,
        discountPercentage: discountPercentage,
        shippingCharges: Number(shippingCharges) || 0,
        taxAmount: taxAmountVal,
        totalAmount: totalAmountVal,
        taxType: taxType,
        taxRate: taxRate,
        cgst: calculateCGST(),
        sgst: calculateSGST(),
        igst: calculateIGST(),
        placeOfSupply: placeOfSupply,
        enquiryId: enquiryData.id || enquiryData.enqId,
        enquiryEnqId: enquiryData.enqId,
        assignedTo: currentUserProfile?.id,
        assignedToName: currentUserProfile?.employeeName || currentUserProfile?.name || "Unknown",
        createdBy: currentUserProfile?.id,
        createdByRole: currentUserProfile?.role || "staff",
        status: docType.isQuotation ? "quotation" : "completed",
        paymentStatus: docType.isApprovedAndPaid ? "paid" : "pending",
        shipmentStatus: enquiryData?.shipmentStatus || existingBillData?.shipmentStatus || (enquiryData as any)?.shippingStatus || "",
        paymentType: paymentType || enquiryData.paymentType || "",
        paymentSubStatus: paymentSubStatus || enquiryData.paymentSubStatus || "",
        updatedAt: now,
        notes: docType.isQuotation ? `Quotation generated from enquiry ${enquiryData.enqId}` : `Invoice generated from enquiry ${enquiryData.enqId}`,
        isQuotation: docType.isQuotation,
        bankDetails: bankDetails,
        terms: terms,
        includeSignature: includeSignature,
        deductFromInventory: deductFromInventory,
        inventoryUpdated: deductFromInventory && docType.isApprovedAndPaid,
        lastUpdatedBy: currentUserProfile?.id,
        lastUpdatedByName: currentUserProfile?.employeeName || currentUserProfile?.name,
        updateCount: existingBillId ? (existingBillData?.updateCount || 0) + 1 : 1,
      };
      
      let billId;
      if (existingBillId) {
        const billRef = doc(db, "bills", existingBillId);
        await updateDoc(billRef, billData);
        billId = existingBillId;
      } else {
        const newBillData = {
          ...billData,
          billId: `BILL-${Date.now()}`,
          createdAt: now,
          createdBy: currentUserProfile?.id,
          createdByName: currentUserProfile?.employeeName || currentUserProfile?.name,
        };
        billId = await billService.createBill(newBillData);
      }
      
      const materialsData = editableMaterials.map(item => {
        const lineTaxable = (item.price * item.quantity) * factor;
        const rate = (item.taxRate !== undefined && item.taxRate !== null) ? item.taxRate : 18;
        const lineTax = (lineTaxable * rate) / 100;
        return {
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          price: item.price,
          quantity: item.quantity,
          totalAmount: lineTaxable + lineTax,
          taxableValue: lineTaxable,
          taxRate: rate,
          taxAmount: lineTax,
          originalPrice: item.originalPrice || item.price,
          hsn: item.hsn || "",
          savedAt: new Date().toISOString(),
          manuallyEdited: true, // Mark as manually edited in bill
        };
      });

      const enquiryPayload: Record<string, any> = {
        enqId: enquiryData.enqId ?? "",
        customerName: enquiryData.customerName ?? "",
        contactPerson: enquiryData.contactPerson ?? "",
        contactNumber: enquiryData.contactNumber ?? "",
        email: enquiryData.email ?? "",
        city: enquiryData.city ?? "",
        mode: enquiryData.mode ?? "",
        type: enquiryData.type ?? "",
        status: enquiryData.status ?? "",
        paymentStatus: docType.isApprovedAndPaid ? "Paid" : enquiryData.paymentStatus,
        paymentType: paymentType || enquiryData.paymentType || "",
        paymentSubStatus: paymentSubStatus || enquiryData.paymentSubStatus || "",
        shipmentStatus: enquiryData.shipmentStatus ?? "",
        value: totalAmountVal,
        remarks: enquiryData.remarks ?? "",
        assignedTo: enquiryData.assignedTo ?? "",
        updatedAt: serverTimestamp(),
        subStatus: enquiryData.subStatus ?? "",
        reason: enquiryData.reason ?? "",
        state: enquiryData.state ?? "",
        materials: JSON.stringify(materialsData),
        subtotal: subtotalVal,
        gstAmount: taxAmountVal,
        gstRate: taxRate,
        shippingCharges: Number(shippingCharges) || 0,
        finalTotal: totalAmountVal,
        materialsCount: editableMaterials.length,
        billGenerated: !docType.isQuotation,
        quotationGenerated: docType.isQuotation,
        billId: !docType.isQuotation ? billId : null,
        quotationId: docType.isQuotation ? billId : null,
        invoiceNumber: billNumber,
        deductFromInventory: deductFromInventory,
        inventoryUpdated: deductFromInventory && docType.isApprovedAndPaid,
        lastBillUpdate: serverTimestamp(),
        billUpdateCount: existingBillId ? (existingBillData?.updateCount || 0) + 1 : 1
      };

      if (!(enquiryData.status === "Waiting Payment" || enquiryData.status === "Waiting for Materials")) {
        enquiryPayload.reason = "";
      }

      let enquiryDocId;
      if (enquiryData.id) {
        const enquiryRef = doc(db, "enquiries", enquiryData.id);
        await updateDoc(enquiryRef, enquiryPayload);
        enquiryDocId = enquiryData.id;
      } else if (enquiryData.enqId) {
        const enquiriesRef = collection(db, "enquiries");
        const q = query(enquiriesRef, where("enqId", "==", enquiryData.enqId));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const docRef = doc(db, "enquiries", querySnapshot.docs[0].id);
          await updateDoc(docRef, enquiryPayload);
          enquiryDocId = querySnapshot.docs[0].id;
        } else {
          enquiryPayload.createdAt = serverTimestamp();
          const docRef = await addDoc(collection(db, "enquiries"), enquiryPayload);
          enquiryDocId = docRef.id;
        }
      }

      // Call onDataUpdated with the updated materials
      if (onDataUpdated) {
        const updatedEnquiryData = {
          ...enquiryData,
          id: enquiryDocId,
          ...enquiryPayload,
          materials: materialsData, // Pass the updated materials with new prices
          value: calculateTotal(),
          subtotal: calculateSubtotal(),
          gstAmount: calculateTaxAmount(),
          finalTotal: calculateTotal(),
        };
        onDataUpdated(updatedEnquiryData);
      }
      
      setLoading(false);
      onSuccess();
      onClose();
      
    } catch (err: any) {
      console.error("Error in handleGenerateBill:", err);
      
      if (err.message?.includes("permission")) {
        setError("You don't have permission. Please contact administrator.");
      } else if (err.message?.includes("Insufficient stock")) {
        setError(err.message);
      } else {
        setError(err.message || "Failed to generate. Please try again.");
      }
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const billedBy = getBilledByDetails();
    const billedTo = getBilledToDetails();
    const docType = getDocumentType();
    const displayPaymentType = paymentType || enquiryData?.paymentType || "";
    const displayPaymentSubStatus = paymentSubStatus || enquiryData?.paymentSubStatus || "";

    const subtotal = calculateSubtotal();
    const discountAmount = calculateDiscount();
    const taxAmount = calculateTaxAmount();
    const cgst = calculateCGST();
    const sgst = calculateSGST();
    const igst = calculateIGST();
    const selectedBillDate = invoiceDate ? new Date(invoiceDate) : new Date();

    const htmlContent = generateBillPrintHTML({
      documentType: docType.documentType,
      documentLabel: docType.documentLabel,
      invoiceNumber: billNumber,
      billDate: selectedBillDate,
      billedBy: billedBy,
      billedTo: billedTo,
      placeOfSupply: placeOfSupply,
      taxType: taxType,
      items: editableMaterials.map(item => ({
        productName: item.productName,
        sku: (item as any).sku,
        hsn: item.hsn || "0000",
        quantity: item.quantity,
        price: item.price,
        total: item.totalAmount || (item.price * item.quantity),
        taxableValue: item.taxableValue || (item.price * item.quantity),
        taxAmount: item.taxAmount || 0,
        taxRate: (item.taxRate !== undefined && item.taxRate !== null) ? item.taxRate : 18,
        uom: (item as any).uom || "Nos",
      })),
      subtotal: subtotal,
      discountAmount: discountAmount,
      discountPercentage: discountPercentage,
      shippingCharges: Number(shippingCharges) || 0,
      taxRate: taxRate,
      taxAmount: taxAmount,
      cgst: cgst,
      sgst: sgst,
      igst: igst,
      totalAmount: calculateTotal(),
      customerName: billedTo.name,
      customerContact: billedTo.contactNumber,
      customerAddress: billedTo.address,
      customerCity: billedTo.city,
      customerState: billedTo.state,
      enquiryEnqId: enquiryData?.enqId,
      status: docType.isQuotation ? "quotation" : (docType.isPaid ? "paid" : "unpaid"),
      paymentStatus: docType.isPaid ? "completed" : "pending",
      paymentType: displayPaymentType,
      paymentSubStatus: displayPaymentSubStatus,
      isPaid: docType.isPaid,
      isQuotation: docType.isQuotation,
      isApprovedAndPaid: docType.isApprovedAndPaid,
      shipmentStatus: enquiryData?.shipmentStatus || existingBillData?.shipmentStatus || (enquiryData as any)?.shippingStatus || "",
      logoUrl: LOGO_URL,
      signatureUrl: SIGNATURE_URL,
      includeSignature: includeSignature,
      bankDetails: bankDetails,
      terms: terms,
    });

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();
      iframe.contentWindow?.focus();
      setTimeout(() => {
        try {
          iframe.contentWindow?.print();
        } catch (_) {}
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1500);
      }, 500);
    } else {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        try {
          printWindow.opener = null;
        } catch (_) {}
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();
      }
    }
  };

    if (!open) return null;

  const billedBy = getBilledByDetails();
  const billedTo = getBilledToDetails();
  const docType = getDocumentType();
  const displayPaymentType = paymentType || enquiryData?.paymentType || "";
  const displayPaymentSubStatus = paymentSubStatus || enquiryData?.paymentSubStatus || "";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 overflow-y-auto">
      <div className="bg-white w-full max-w-6xl rounded-2xl shadow-xl my-8">
        {/* Modal Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b sticky top-0 bg-white z-10 rounded-t-2xl">
          <h2 className="text-xl font-bold text-gray-800">
            {existingBillId ? (docType.isQuotation ? 'Update Quotation' : 'Update Invoice') : (docType.isQuotation ? 'Generate Quotation' : 'Generate Invoice')}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div id="bill-content" className="p-8 max-h-[70vh] overflow-y-auto">
          
          {existingBillId && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠️ Updating existing {docType.isQuotation ? 'quotation' : 'invoice'} #{billNumber}
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                Inventory will be adjusted based on quantity changes
              </p>
            </div>
          )}
          
          <div className="flex items-center justify-between border-b pb-5 mb-5">
            <div className="text-center flex-shrink-0">
              <img 
                src={LOGO_URL}
                alt="iBots Logo" 
                className="h-14 mx-auto mb-1"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <p className="text-xs text-gray-500">Unleash the power of Electronics</p>
            </div>

            <div className="text-right">
              <h3 className="text-lg font-bold text-gray-900">Protowiz Private Limited</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Office : 34/17A, First floor, Ramalingam nagar,<br />
                4th cross street, Saibaba colony, Coimbatore - 641011, Tamil Nadu<br />
                E-mail : info@ibots.in  PH No : 80152 98233<br />
                Visit us : www.ibots.in<br />
                GST No : 33AAKCP9459K1ZO / PAN : AAMCP9459K
              </p>
            </div>
          </div>

          <div className="flex justify-between items-start mb-5">
            <div className="text-2xl font-bold tracking-wider text-gray-900">
              {docType.documentType}
            </div>
            <div className="text-right text-sm text-gray-600">
              <div>{docType.documentLabel}: {billNumber}</div>
              <div>Date: {invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')}</div>
              {!docType.isQuotation && docType.displayStatus && (
                <div className={`mt-1 px-3 py-0.5 rounded text-xs font-bold inline-block ${
                  docType.isPaid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {docType.displayStatus}
                </div>
              )}
              {displayPaymentType && !docType.isQuotation && (
                <div className="mt-1 text-xs text-gray-500">
                  Payment Type: {displayPaymentType}
                </div>
              )}
              {displayPaymentSubStatus && !docType.isQuotation && (
                <div className="mt-0.5 text-xs text-gray-600 font-medium bg-gray-100 px-2 py-0.5 rounded">
                  Payment Status: {displayPaymentSubStatus}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-5">
            <div>
              <div className="font-bold text-gray-700 mb-2 text-xs uppercase tracking-wide">Billed by</div>
              <div className="text-gray-800 font-semibold text-sm">Protowiz Private Limited</div>
              <div className="text-gray-600 text-xs mt-1 leading-relaxed">{billedBy.address.replace(/^Protowiz Private Limited[, -]*/i, '').trim()}</div>
              <div className="text-gray-600 text-xs mt-1">GSTIN: {billedBy.gstin}</div>
              <div className="text-gray-600 text-xs">PAN: {billedBy.pan}</div>
            </div>
            <div>
              <div className="font-bold text-gray-700 mb-2 text-xs uppercase tracking-wide">Billed to</div>
              <div className="text-gray-800 font-semibold text-sm">{billedTo.name}</div>
              <div className="text-gray-600 text-xs mt-1">Enquiry ID: {billedTo.enqId}</div>
              <div className="text-gray-600 text-xs">Contact: {billedTo.contactNumber}</div>
              
              <div className="mt-2.5 mb-2">
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wide mb-1">
                  Customer Address
                </label>
                <textarea
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="Enter complete customer address, street, landmark, pincode..."
                  rows={2}
                  className="w-full text-xs p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-500 bg-white leading-relaxed"
                />
              </div>

              <div className="text-gray-600 text-xs mt-1">City: {billedTo.city}</div>
              <div className="text-gray-600 text-xs">State: {billedTo.state}</div>
              {billedTo.gstin && <div className="text-gray-600 text-xs">GSTIN: {billedTo.gstin}</div>}
              {displayPaymentType && (
                <div className="text-gray-600 text-xs mt-1">Payment Type: {displayPaymentType}</div>
              )}
              {displayPaymentSubStatus && (
                <div className="text-gray-600 text-xs">Payment Status: {displayPaymentSubStatus}</div>
              )}
            </div>
          </div>

          <div className="mb-5 p-3 bg-blue-50 rounded border-l-4 border-blue-500 text-sm">
            <span className="font-medium text-gray-700">Place of Supply:</span> {placeOfSupply} &nbsp;&nbsp;|&nbsp;&nbsp;
            <span className="font-medium text-gray-700">Tax Type:</span> {taxType === "cgst_sgst" ? "CGST + SGST" : "IGST"}
          </div>

          <div className="mb-5">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-md font-semibold text-gray-800">Products & Materials</h3>
              {fetchingHsn && (
                <div className="flex items-center text-xs text-blue-600">
                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                  Fetching HSN codes...
                </div>
              )}
            </div>

            {/* Add Product Section - Only in Preview Mode */}
            {showPreview && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Add Product</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="relative col-span-2">
                    <label className="block text-xs text-gray-600 mb-1">Search Product</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => {
                          setProductSearch(e.target.value);
                          setShowProductDropdown(true);
                        }}
                        onFocus={() => setShowProductDropdown(true)}
                        placeholder="Search product..."
                        className="w-full px-3 py-2 border rounded-lg text-sm pr-8"
                      />
                      <Search className="w-4 h-4 absolute right-3 top-3 text-gray-400" />
                    </div>
                    {showProductDropdown && (
                      <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredProducts.length > 0 ? (
                          filteredProducts.map((product) => (
                            <div
                              key={product.id}
                              className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                              onClick={() => {
                                setSelectedProduct(product.id);
                                setProductSearch(product.name);
                                setShowProductDropdown(false);
                              }}
                            >
                              <div className="font-medium text-sm">{product.name}</div>
                              <div className="text-xs text-gray-600">
                                ₹{product.price} | Stock: {product.totalQuantity || 0}
                                {product.hsnCode && ` | HSN: ${product.hsnCode}`}
                                {product.taxRate !== undefined && product.taxRate !== null && ` | Tax: ${product.taxRate}%`}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-3 text-center text-sm text-gray-500">
                            No products found
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Quantity</label>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                      min="1"
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={handleAddProduct}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Add Product
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            <table className="w-full border-collapse mb-5 text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">SI No</th>
                  <th className="border p-2 text-left">Description</th>
                  {docType.isQuotation ? (
                    <>
                      <th className="border p-2 text-left">HSN Code</th>
                      <th className="border p-2 text-center">Qty</th>
                      <th className="border p-2 text-center">UOM</th>
                      <th className="border p-2 text-right">Unit Price (₹)</th>
                      <th className="border p-2 text-center">Tax (%)</th>
                      <th className="border p-2 text-right">Amount (₹)</th>
                      <th className="border p-2 text-right">Tax Amt (₹)</th>
                    </>
                  ) : (
                    <>
                      <th className="border p-2 text-left">HSN Code</th>
                      <th className="border p-2 text-center">Qty</th>
                      <th className="border p-2 text-right">Price (₹)</th>
                      <th className="border p-2 text-right">Amount (₹)</th>
                    </>
                  )}
                  {showPreview && <th className="border p-2 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {editableMaterials.map((item, index) => {
                  const taxAmount = item.taxAmount || ((item.price * item.quantity * (item.taxRate !== undefined && item.taxRate !== null ? item.taxRate : 18)) / 100);
                  const displayTaxRate = (item.taxRate !== undefined && item.taxRate !== null) ? item.taxRate : taxRate;
                  return (
                    <tr key={item.id}>
                      <td className="border p-2">{index + 1}</td>
                      <td className="border p-2">{item.productName}</td>
                      {docType.isQuotation ? (
                        <>
                          <td className="border p-2">
                            {showPreview ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={item.hsn || ""}
                                  onChange={(e) => handleUpdateHsn(item.id, e.target.value)}
                                  className="w-24 px-1 py-0.5 border rounded text-left text-sm"
                                  placeholder="HSN Code"
                                />
                                {item.productId && (
                                  <button
                                    onClick={() => handleRefreshHsn(item.productId, item.id)}
                                    className="p-1 text-blue-600 hover:text-blue-800"
                                    title="Fetch HSN from product"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm">{item.hsn || "-"}</span>
                            )}
                          </td>
                          <td className="border p-2 text-center">
                            {showPreview ? (
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => handleUpdateQuantity(item.id, parseInt(e.target.value) || 0)}
                                min="1"
                                className="w-16 px-1 py-0.5 border rounded text-center text-sm"
                              />
                            ) : (
                              item.quantity
                            )}
                          </td>
                          <td className="border p-2 text-center">Nos</td>
                          <td className="border p-2 text-right">
                            {showPreview ? (
                              <input
                                type="number"
                                value={item.price}
                                onChange={(e) => handleUpdatePrice(item.id, parseFloat(e.target.value) || 0)}
                                step="0.01"
                                min="0"
                                className="w-20 px-1 py-0.5 border rounded text-right text-sm"
                              />
                            ) : (
                              `₹${item.price.toFixed(2)}`
                            )}
                          </td>
                          <td className="border p-2 text-center">
                            {showPreview ? (
                              <select
                                value={item.taxRate !== undefined && item.taxRate !== null ? item.taxRate : taxRate}
                                onChange={(e) => handleUpdateTaxRate(item.id, parseFloat(e.target.value))}
                                className="w-16 px-1 py-0.5 border rounded text-center text-sm"
                              >
                                {TAX_RATES.map((rate) => (
                                  <option key={rate.value} value={rate.value}>
                                    {rate.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              `${displayTaxRate}%`
                            )}
                          </td>
                          <td className="border p-2 text-right font-medium">₹{item.totalAmount.toFixed(2)}</td>
                          <td className="border p-2 text-right">₹{taxAmount.toFixed(2)}</td>
                        </>
                      ) : (
                        <>
                          <td className="border p-2">
                            {showPreview ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={item.hsn || ""}
                                  onChange={(e) => handleUpdateHsn(item.id, e.target.value)}
                                  className="w-24 px-1 py-0.5 border rounded text-left text-sm"
                                  placeholder="HSN Code"
                                />
                                {item.productId && (
                                  <button
                                    onClick={() => handleRefreshHsn(item.productId, item.id)}
                                    className="p-1 text-blue-600 hover:text-blue-800"
                                    title="Fetch HSN from product"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm">{item.hsn || "-"}</span>
                            )}
                          </td>
                          <td className="border p-2 text-center">
                            {showPreview ? (
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => handleUpdateQuantity(item.id, parseInt(e.target.value) || 0)}
                                min="1"
                                className="w-16 px-1 py-0.5 border rounded text-center text-sm"
                              />
                            ) : (
                              item.quantity
                            )}
                          </td>
                          <td className="border p-2 text-right">
                            {showPreview ? (
                              <input
                                type="number"
                                value={item.price}
                                onChange={(e) => handleUpdatePrice(item.id, parseFloat(e.target.value) || 0)}
                                step="0.01"
                                min="0"
                                className="w-20 px-1 py-0.5 border rounded text-right text-sm"
                              />
                            ) : (
                              `₹${item.price.toFixed(2)}`
                            )}
                          </td>
                          <td className="border p-2 text-right font-medium">₹{item.totalAmount.toFixed(2)}</td>
                        </>
                      )}
                      {showPreview && (
                        <td className="border p-2 text-center">
                          <button
                            onClick={() => {
                              setEditableMaterials(prev => prev.filter(m => m.id !== item.id));
                            }}
                            className="text-red-600 hover:text-red-800"
                            title="Remove item"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {showPreview && (
            <div className="mb-5 p-4 bg-gray-50 rounded-lg">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Price & Tax Settings</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1 font-medium flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-purple-600 inline" />
                    Invoice Date
                  </label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm bg-white font-medium text-gray-800 focus:ring-2 focus:ring-purple-400 outline-none"
                    title="Original purchase/enquiry date"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Original purchase date</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1 font-medium">Discount Percentage (%)</label>
                  <input
                    type="number"
                    value={discountPercentage}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    min="0"
                    max="100"
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1 font-medium">Shipping Charges (₹)</label>
                  <input
                    type="number"
                    value={shippingCharges}
                    onChange={(e) => setShippingCharges(Math.max(0, parseFloat(e.target.value) || 0))}
                    min="0"
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white font-medium text-gray-800"
                    placeholder="e.g. 120 or 250"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1 font-medium">Tax Type</label>
                  <select
                    value={taxType}
                    onChange={(e) => setTaxType(e.target.value as "cgst_sgst" | "igst")}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white font-medium text-gray-800"
                  >
                    <option value="cgst_sgst">CGST + SGST (Tamil Nadu)</option>
                    <option value="igst">IGST (Outside TN)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6 mb-5">
            {!(!docType.isQuotation && (docType.isApprovedAndPaid || enquiryData?.status === "Approved" || existingBillData?.status === "approved" || existingBillData?.status === "paid")) ? (
              <div className="bg-gray-50 rounded p-4 text-xs text-gray-700 leading-relaxed relative">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-gray-800 text-sm">Bank Details</p>
                  {showPreview && (
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
                  )}
                </div>
                {editingBankDetails && showPreview ? (
                  <div className="space-y-2">
                    <input type="text" value={bankDetails.beneficiaryName} onChange={(e) => handleBankDetailChange('beneficiaryName', e.target.value)} className="w-full px-2 py-1 border rounded text-xs" placeholder="Beneficiary Name" />
                    <input type="text" value={bankDetails.bankName} onChange={(e) => handleBankDetailChange('bankName', e.target.value)} className="w-full px-2 py-1 border rounded text-xs" placeholder="Bank Name" />
                    <input type="text" value={bankDetails.accountNo} onChange={(e) => handleBankDetailChange('accountNo', e.target.value)} className="w-full px-2 py-1 border rounded text-xs" placeholder="Account No" />
                    <input type="text" value={bankDetails.ifscCode} onChange={(e) => handleBankDetailChange('ifscCode', e.target.value)} className="w-full px-2 py-1 border rounded text-xs" placeholder="IFSC Code" />
                    <input type="text" value={bankDetails.branch} onChange={(e) => handleBankDetailChange('branch', e.target.value)} className="w-full px-2 py-1 border rounded text-xs" placeholder="Branch" />
                  </div>
                ) : (
                  <div>
                    <p><strong>Beneficiary Name:</strong> {bankDetails.beneficiaryName}</p>
                    <p><strong>Bank Name:</strong> {bankDetails.bankName}</p>
                    <p><strong>Account No:</strong> {bankDetails.accountNo}</p>
                    <p><strong>IFSC Code:</strong> {bankDetails.ifscCode}</p>
                    <p><strong>Branch:</strong> {bankDetails.branch}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded p-4 text-xs text-emerald-900 leading-relaxed flex flex-col justify-center">
                <p className="font-bold text-emerald-800 text-sm">Invoice Approved & Paid</p>
                <p className="text-[11px] text-emerald-700 mt-1">
                  Bank details are removed from the bill since payment is approved.
                </p>
              </div>
            )}

            <div>
              <div className="flex justify-between py-1.5 text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">₹{calculateSubtotal().toFixed(2)}</span>
              </div>
              {discountPercentage > 0 && (
                <div className="flex justify-between py-1.5 text-sm text-green-600">
                  <span>Discount ({discountPercentage}%)</span>
                  <span>-₹{calculateDiscount().toFixed(2)}</span>
                </div>
              )}
              {taxType === "cgst_sgst" ? (
                <>
                  <div className="flex justify-between py-1.5 text-sm">
                    <span className="text-gray-600">CGST ({taxRate/2}%)</span>
                    <span>₹{calculateCGST().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 text-sm">
                    <span className="text-gray-600">SGST ({taxRate/2}%)</span>
                    <span>₹{calculateSGST().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 text-sm font-medium text-gray-700 border-t border-dashed border-gray-200">
                    <span>Total GST</span>
                    <span>₹{calculateTaxAmount().toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-gray-600">IGST ({taxRate}%)</span>
                  <span>₹{calculateIGST().toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-1.5 text-sm">
                <span className="text-gray-600">Shipping / Courier Charges</span>
                <span className="font-medium">₹{(Number(shippingCharges) || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 text-lg font-bold border-t mt-2">
                <span>Grand Total</span>
                <span className="text-blue-600">₹{calculateTotal().toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="mb-4 text-xs text-gray-700">
            <div className="flex items-center justify-between mb-1">
              <p className="font-bold text-gray-800 text-sm">Terms & Conditions:</p>
              {showPreview && (
                <div className="flex gap-2">
                  {!editingTerms ? (
                    <button onClick={() => setEditingTerms(true)} className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs">
                      <Edit3 className="w-3 h-3" /> Edit
                    </button>
                  ) : (
                    <>
                      <button onClick={() => setEditingTerms(false)} className="text-green-600 hover:text-green-800 flex items-center gap-1 text-xs">
                        <Check className="w-3 h-3" /> Done
                      </button>
                      <button onClick={resetTerms} className="text-gray-600 hover:text-gray-800 flex items-center gap-1 text-xs">
                        <RotateCcw className="w-3 h-3" /> Reset
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            {editingTerms && showPreview ? (
              <div className="space-y-2">
                {terms.map((term, index) => (
                  <div key={term.id} className="flex items-center gap-2">
                    <span className="text-gray-600">{index + 1}.</span>
                    <input type="text" value={term.text} onChange={(e) => handleTermChange(term.id, e.target.value)} className="flex-1 px-2 py-1 border rounded text-xs" />
                    <button onClick={() => handleRemoveTerm(term.id)} className="text-red-500 hover:text-red-700 text-xs">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">{terms.length + 1}.</span>
                  <input type="text" value={newTerm} onChange={(e) => setNewTerm(e.target.value)} placeholder="Add new term..." className="flex-1 px-2 py-1 border rounded text-xs" onKeyPress={(e) => e.key === 'Enter' && handleAddTerm()} />
                  <button onClick={handleAddTerm} className="text-green-600 hover:text-green-800 text-xs font-semibold">+ Add</button>
                </div>
              </div>
            ) : (
              <ul className="list-none space-y-0.5">
                {terms.map((term, index) => (
                  <li key={term.id}>{index + 1}. {term.text}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t pt-4 mt-6 gap-3">
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="billIncludeSignature"
                  checked={includeSignature}
                  onChange={(e) => setIncludeSignature(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 cursor-pointer"
                />
                <label htmlFor="billIncludeSignature" className="text-sm font-medium text-gray-700 cursor-pointer flex items-center gap-1.5 select-none">
                  Include Sign & Seal
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="billDeductInventory"
                  checked={deductFromInventory}
                  onChange={(e) => setDeductFromInventory(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 cursor-pointer"
                />
                <label htmlFor="billDeductInventory" className="text-sm font-medium text-gray-700 cursor-pointer flex items-center gap-1.5 select-none" title="When unchecked, stock is not deducted from inventory (ideal for quotations and vendor items)">
                  <Package className="w-4 h-4 text-purple-600" />
                  Deduct from Inventory Stock
                </label>
              </div>
            </div>

            <div className="text-right">
              <p className="font-bold text-gray-800">For Protowiz Private Limited</p>
              {includeSignature && (
                <div className="flex justify-end mt-1">
                  <img src={SIGNATURE_URL} alt="Authorized Signature" className="h-10 w-auto object-contain" />
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">Authorised Signatory</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 border-t flex justify-end gap-3 bg-gray-50 rounded-b-2xl">
          {!showPreview ? (
            <>
              <button onClick={() => setShowPreview(true)} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm">
                Preview {docType.isQuotation ? 'Quotation' : 'Invoice'}
              </button>
              <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors text-sm">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={handlePrint} className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-2 transition-colors text-sm">
                <Printer className="w-4 h-4" />
                Print {docType.documentType}
              </button>
              <button onClick={handleGenerateBill} disabled={loading} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors text-sm">
                <Save className="w-4 h-4" />
                {loading ? (existingBillId ? "Updating..." : "Saving...") : (existingBillId ? `Update ${docType.documentType}` : `Save ${docType.documentType}`)}
              </button>
              <button onClick={() => setShowPreview(false)} className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors text-sm">
                Edit
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error Dialog */}
      {error && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 max-w-md shadow-xl">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-lg font-semibold">Error</h3>
            </div>
            <p className="text-gray-600 mb-6">{error}</p>
            <button onClick={() => setError(null)} className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillGeneratorModal;