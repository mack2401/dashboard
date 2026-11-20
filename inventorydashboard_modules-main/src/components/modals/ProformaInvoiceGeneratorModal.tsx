// components/modals/ProformaInvoiceGeneratorModal.tsx

import React, { useState, useEffect, useRef } from "react";
import { 
  X, Printer, Save, AlertCircle, Edit3, Check, RotateCcw, RefreshCw, Plus, Trash2, Search, Calendar 
} from "lucide-react";
import { Timestamp, doc, updateDoc, addDoc, collection, serverTimestamp, getDoc, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";

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

interface ProformaInvoiceGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  enquiryData: any;
  materials: MaterialItem[];
  currentUserProfile: any;
  employees: any[];
  gstRate: number;
  isProformaInvoice: boolean;
}

const defaultBankDetails: BankDetails = {
  beneficiaryName: "Protowiz Private Limited",
  bankName: "ICICI Bank",
  accountNo: "615205044958",
  ifscCode: "ICIC0006152",
  branch: "Ram Nagar Branch",
};

const defaultTerms: TermsCondition[] = [
  { id: 1, text: "Payment: 100% advance" },
  { id: 2, text: "Delivery: 10-12 days maximum from advance initiation" },
  { id: 3, text: "PI Validity: 2 days" },
];

const ProformaInvoiceGeneratorModal: React.FC<ProformaInvoiceGeneratorModalProps> = ({
  open,
  onClose,
  onSuccess,
  enquiryData,
  materials: initialMaterials,
  currentUserProfile,
  employees,
  gstRate: initialGstRate,
  isProformaInvoice,
}) => {
  const [editableMaterials, setEditableMaterials] = useState<MaterialItem[]>([]);
  const [originalMaterials, setOriginalMaterials] = useState<MaterialItem[]>([]);
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [taxType, setTaxType] = useState<"cgst_sgst" | "igst">("cgst_sgst");
  const [taxRate, setTaxRate] = useState<number>(initialGstRate || 18);
  const [placeOfSupply, setPlaceOfSupply] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [editingBankDetails, setEditingBankDetails] = useState<boolean>(false);
  const [editingMaterials, setEditingMaterials] = useState<boolean>(false);
  const [editingTerms, setEditingTerms] = useState<boolean>(false);
  const [editingDescription, setEditingDescription] = useState<boolean>(false);
  const [descriptionText, setDescriptionText] = useState<string>(enquiryData?.remarks || "");
  const [bankDetails, setBankDetails] = useState<BankDetails>(defaultBankDetails);
  const [terms, setTerms] = useState<TermsCondition[]>(defaultTerms);
  const [newTerm, setNewTerm] = useState<string>("");
  const [fetchingHsn, setFetchingHsn] = useState<boolean>(false);
  const [existingBillId, setExistingBillId] = useState<string | null>(null);
  const [existingBillData, setExistingBillData] = useState<any>(null);
  const [paymentType, setPaymentType] = useState<string>("");
  const [paymentSubStatus, setPaymentSubStatus] = useState<string>("");
  const [cessAmount, setCessAmount] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [shippingCharges, setShippingCharges] = useState<number>(120);
  const [includeSignature, setIncludeSignature] = useState<boolean>(true);
  const printContentRef = useRef<HTMLDivElement>(null);

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

  // Generate bill number with format IBPI-YY1001
  const generateBillNumber = (): string => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2); // Get last 2 digits of year (e.g., "26" for 2026)
    // Get the last 3 digits from the existing bill number or start with 001
    // We'll use a counter approach - start with 001 and increment
    const lastThreeDigits = "001";
    return `IBPI-${year}${lastThreeDigits}`;
  };

  // Function to get next sequential number
  const getNextBillNumber = async (): Promise<string> => {
    try {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2); // Get last 2 digits
      const prefix = `IBPI-${year}`;
      
      // Query all bills with this year's prefix
      const billsRef = collection(db, "bills");
      const q = query(
        billsRef,
        where("invoiceNumber", ">=", prefix),
        where("invoiceNumber", "<=", `${prefix}999`)
      );
      
      const querySnapshot = await getDocs(q);
      let maxNumber = 0;
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const invoiceNumber = data.invoiceNumber || "";
        if (invoiceNumber.startsWith(prefix)) {
          const numberPart = invoiceNumber.replace(prefix, "");
          const num = parseInt(numberPart, 10);
          if (!isNaN(num) && num > maxNumber) {
            maxNumber = num;
          }
        }
      });
      
      // Next number should be max + 1, starting from 1 if no existing bills
      const nextNumber = maxNumber + 1;
      const paddedNumber = nextNumber.toString().padStart(3, '0');
      return `IBPI-${year}${paddedNumber}`;
    } catch (error) {
      console.error("Error fetching next bill number:", error);
      // Fallback to timestamp-based number
      return generateBillNumber();
    }
  };

  const [billNumber, setBillNumber] = useState<string>("");

  // Initialize bill number when modal opens
  useEffect(() => {
    if (open) {
      const initializeBillNumber = async () => {
        const existingBill = await checkExistingBill();
        if (existingBill) {
          // Use existing bill number
          const billData = existingBill.data();
          setBillNumber(billData.invoiceNumber);
        } else {
          // Generate new bill number
          const newNumber = await getNextBillNumber();
          setBillNumber(newNumber);
        }
      };
      initializeBillNumber();
    }
  }, [open]);

  const LOGO_URL = window.location.origin + "/ibots-logo.png";
  const SIGNATURE_URL = window.location.origin + "/sign.jpg";

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
          taxRate: data.taxRate || 18,
        });
      });
      setProducts(productsMap);
    }, (err) => {
      console.error("Error fetching products:", err);
    });

    return () => unsubscribe();
  }, [open, showPreview]);

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

    let updatedMaterials: MaterialItem[];
    if (existingIndex >= 0) {
      updatedMaterials = [...editableMaterials];
      const existing = updatedMaterials[existingIndex];
      updatedMaterials[existingIndex] = {
        ...existing,
        quantity: newQuantity,
        totalAmount: product.price * newQuantity,
      };
    } else {
      updatedMaterials = [...editableMaterials, {
        id: Date.now().toString(),
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity: quantity,
        totalAmount: product.price * quantity,
        hsn: product.hsnCode || "",
        originalPrice: product.price,
        taxRate: product.taxRate || taxRate,
      }];
    }
    
    setEditableMaterials(updatedMaterials);
    setSelectedProduct("");
    setQuantity(1);
    setProductSearch("");
    setShowProductDropdown(false);
  };

  // Sync description when enquiryData changes
  useEffect(() => {
    if (enquiryData?.remarks) {
      setDescriptionText(enquiryData.remarks);
    }
  }, [enquiryData?.remarks]);

  // Check if bill already exists
  const checkExistingBill = async () => {
    if (!enquiryData?.enqId) return null;
    
    try {
      const billsRef = collection(db, "bills");
      const q = query(
        billsRef, 
        where("enquiryEnqId", "==", enquiryData.enqId),
        where("isProformaInvoice", "==", true)
      );
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const existingBill = querySnapshot.docs[0];
        const billData = existingBill.data();
        setExistingBillId(existingBill.id);
        setExistingBillData(billData);
        setBillNumber(billData.invoiceNumber);
        
        if (billData.items && billData.items.length > 0) {
          const originalItems = billData.items.map((item: any, index: number) => ({
            id: `original-${index}`,
            productId: item.productId,
            productName: item.productName,
            price: item.price,
            quantity: item.quantity,
            totalAmount: item.total,
            hsn: item.hsn || "",
            originalPrice: item.price,
            taxRate: item.taxRate || initialGstRate,
          }));
          setOriginalMaterials(originalItems);
        }
        
        if (billData.bankDetails) setBankDetails(billData.bankDetails);
        if (billData.terms) setTerms(billData.terms);
        if (billData.taxRate) setTaxRate(billData.taxRate);
        if (billData.billDate) {
          const d = typeof billData.billDate.toDate === "function" ? billData.billDate.toDate() : new Date(billData.billDate);
          if (!isNaN(d.getTime())) setInvoiceDate(d.toISOString().slice(0, 10));
        }
        if (billData.discountPercentage) setDiscountPercentage(billData.discountPercentage);
        if (billData.shippingCharges !== undefined && billData.shippingCharges !== null) setShippingCharges(Number(billData.shippingCharges));
        if (billData.cessAmount) setCessAmount(billData.cessAmount);
        if (billData.paymentType) setPaymentType(billData.paymentType);
        if (billData.paymentSubStatus) setPaymentSubStatus(billData.paymentSubStatus);
        if (billData.description) setDescriptionText(billData.description);
        if (billData.includeSignature !== undefined) setIncludeSignature(billData.includeSignature);
        
        return existingBill;
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
      if (enquiryData.paymentType) setPaymentType(enquiryData.paymentType);
      if (enquiryData.paymentSubStatus) setPaymentSubStatus(enquiryData.paymentSubStatus);
      if (enquiryData.shippingCharges !== undefined && enquiryData.shippingCharges !== null) {
        setShippingCharges(Number(enquiryData.shippingCharges));
      }
    }
  }, [open, enquiryData?.enqId]);

  // Initialize materials
  useEffect(() => {
    if (open && initialMaterials.length > 0 && !existingBillId) {
      const materialsWithData = initialMaterials.map(m => ({
        ...m,
        hsn: m.hsnCode || m.hsn || "",
        originalPrice: m.originalPrice || m.price,
        id: m.id || `item-${Date.now()}-${Math.random()}`,
        taxRate: m.taxRate || initialGstRate || 18,
      }));
      setEditableMaterials(materialsWithData);
      setOriginalMaterials(JSON.parse(JSON.stringify(materialsWithData)));
    }
  }, [open, initialMaterials, existingBillId]);

  // Fetch HSN code from product
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

  // Fetch HSN codes for all materials
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

  useEffect(() => {
    if (open && editableMaterials.length > 0 && !existingBillId) {
      const hasMissingHsn = editableMaterials.some(m => !m.hsn && m.productId);
      if (hasMissingHsn) {
        fetchAllHsnCodes(editableMaterials);
      }
    }
  }, [open, editableMaterials, existingBillId]);

  const getBilledByDetails = () => {
    return {
      name: "Protowiz Private Limited",
      address: "Protowiz Private Limited,34/17A, First floor, 4th Cross Rd, Ramalingam Nagar, Saibaba Colony, Coimbatore, Tamil Nadu 641011",
      gstin: "33AAKCP9459K1ZO",
      pan: "AAMCP9459K",
    };
  };

  const getBilledToDetails = () => {
    const companyDetails = enquiryData?.companyDetails || {};
    return {
      name: companyDetails.companyName || enquiryData.customerName || "",
      enqId: enquiryData.enqId || "",
      contactNumber: companyDetails.companyMobile || enquiryData.contactNumber || "",
      city: companyDetails.companyCity || enquiryData.city || "",
      state: companyDetails.companyState || enquiryData.state || "Tamil Nadu",
      address: companyDetails.companyAddress || enquiryData.address || "",
      gstin: companyDetails.companyGST || enquiryData.gstin || "",
      pan: companyDetails.companyPAN || enquiryData.pan || "",
    };
  };

  // Calculate totals
  const calculateSubtotal = (): number => {
    return editableMaterials.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const calculateDiscount = (): number => {
    return (calculateSubtotal() * discountPercentage) / 100;
  };

  const calculateTaxableAmount = (): number => {
    return calculateSubtotal() - calculateDiscount();
  };

  const calculateTaxAmount = (): number => {
    return (calculateTaxableAmount() * taxRate) / 100;
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

  const calculateCess = (): number => {
    return cessAmount;
  };

  const calculateTotal = (): number => {
    return calculateTaxableAmount() + calculateTaxAmount() + calculateCess() + (Number(shippingCharges) || 0);
  };

  // Handle material edits
  const handleUpdatePrice = (id: string, newPrice: number) => {
    if (newPrice < 0) return;
    setEditableMaterials(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, price: newPrice, totalAmount: newPrice * item.quantity };
      }
      return item;
    }));
  };

  const handleUpdateQuantity = (id: string, newQuantity: number) => {
    if (newQuantity <= 0) return;
    setEditableMaterials(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, quantity: newQuantity, totalAmount: item.price * newQuantity };
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

  const handleUpdateTaxRate = (id: string, newTaxRate: number) => {
    setEditableMaterials(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, taxRate: newTaxRate };
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

  const handleRemoveMaterial = (id: string) => {
    setEditableMaterials(prev => prev.filter(item => item.id !== id));
  };

  const handleResetMaterials = () => {
    setEditableMaterials(JSON.parse(JSON.stringify(originalMaterials)));
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
    setTerms(defaultTerms);
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

  // Convert number to words
  const numberToWords = (num: number): string => {
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

  const handleGenerateBill = async () => {
    if (!validateBillData()) return;

    setLoading(true);
    setError(null);

    try {
      const selectedBillDate = invoiceDate ? new Date(invoiceDate) : new Date();
      const billTimestamp = Timestamp.fromDate(selectedBillDate);
      const billedBy = getBilledByDetails();
      const billedTo = getBilledToDetails();

      // Prepare bill data
      const billData = {
        invoiceNumber: billNumber,
        billDate: billTimestamp,
        customerName: billedTo.name,
        customerContact: billedTo.contactNumber,
        customerCity: billedTo.city,
        billedBy: billedBy,
        billedTo: billedTo,
        items: editableMaterials.map(item => ({
          productId: item.productId,
          productName: item.productName,
          hsn: item.hsn || "00",
          quantity: item.quantity,
          price: item.price,
          total: item.totalAmount,
          taxRate: item.taxRate || taxRate,
        })),
        subtotal: calculateSubtotal(),
        discountAmount: calculateDiscount(),
        discountPercentage: discountPercentage,
        shippingCharges: Number(shippingCharges) || 0,
        taxAmount: calculateTaxAmount(),
        totalAmount: calculateTotal(),
        taxType: taxType,
        taxRate: taxRate,
        cgst: calculateCGST(),
        sgst: calculateSGST(),
        igst: calculateIGST(),
        cessAmount: calculateCess(),
        placeOfSupply: placeOfSupply,
        enquiryId: enquiryData.id || enquiryData.enqId,
        enquiryEnqId: enquiryData.enqId,
        assignedTo: currentUserProfile?.id,
        assignedToName: currentUserProfile?.employeeName || currentUserProfile?.name || "Unknown",
        createdBy: currentUserProfile?.id,
        createdByRole: currentUserProfile?.role || "staff",
        status: "proforma_invoice",
        paymentStatus: enquiryData.paymentStatus || "Not Paid",
        paymentType: paymentType || enquiryData.paymentType || "",
        paymentSubStatus: paymentSubStatus || enquiryData.paymentSubStatus || "",
        updatedAt: now,
        description: enquiryData?.remarks || descriptionText || "",
        isProformaInvoice: true,
        bankDetails: bankDetails,
        terms: terms,
        includeSignature: includeSignature,
        lastUpdatedBy: currentUserProfile?.id,
        lastUpdatedByName: currentUserProfile?.employeeName || currentUserProfile?.name,
        updateCount: existingBillId ? (existingBillData?.updateCount || 0) + 1 : 1,
      };

      let billId: string;
      if (existingBillId) {
        const billRef = doc(db, "bills", existingBillId);
        await updateDoc(billRef, billData);
        billId = existingBillId;
      } else {
        const newBillData = {
          ...billData,
          billId: `PI-${Date.now()}`,
          createdAt: now,
          createdBy: currentUserProfile?.id,
          createdByName: currentUserProfile?.employeeName || currentUserProfile?.name,
        };
        const docRef = await addDoc(collection(db, "bills"), newBillData);
        billId = docRef.id;
      }

      const materialsData = editableMaterials.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        price: item.price,
        quantity: item.quantity,
        totalAmount: item.totalAmount,
        originalPrice: item.originalPrice || item.price,
        hsn: item.hsn || "",
        taxRate: item.taxRate || taxRate,
        savedAt: new Date().toISOString(),
      }));

      const enquiryPayload: Record<string, any> = {
        enqId: enquiryData.enqId ?? "",
        customerName: enquiryData.customerName ?? "",
        contactPerson: enquiryData.contactPerson ?? "",
        contactNumber: enquiryData.contactNumber ?? "",
        email: enquiryData.email ?? "",
        city: enquiryData.city ?? "",
        mode: enquiryData.mode ?? "",
        type: enquiryData.type ?? "",
        status: "Proforma Invoice",
        paymentStatus: enquiryData.paymentStatus || "Not Paid",
        paymentType: paymentType || enquiryData.paymentType || "",
        paymentSubStatus: paymentSubStatus || enquiryData.paymentSubStatus || "",
        shipmentStatus: enquiryData.shipmentStatus ?? "",
        value: calculateTotal(),
        remarks: enquiryData.remarks ?? descriptionText ?? "",
        updatedAt: serverTimestamp(),
        subStatus: "PI sent to customer",
        reason: enquiryData.reason ?? "",
        state: enquiryData.state ?? "",
        materials: JSON.stringify(materialsData),
        subtotal: calculateSubtotal(),
        gstAmount: calculateTaxAmount(),
        gstRate: taxRate,
        finalTotal: calculateTotal(),
        materialsCount: editableMaterials.length,
        billId: billId,
        billNumber: billNumber,
        billGeneratedAt: serverTimestamp(),
        proformaInvoiceNumber: billNumber,
        proformaInvoiceDate: new Date().toISOString().split('T')[0],
        discountAmount: calculateDiscount(),
        discountPercentage: discountPercentage,
        shippingCharges: Number(shippingCharges) || 0,
        cessAmount: calculateCess(),
        totalInWords: numberToWords(calculateTotal()),
        lastBillUpdate: serverTimestamp(),
        billUpdateCount: existingBillId ? (existingBillData?.updateCount || 0) + 1 : 1,
        companyDetails: enquiryData.companyDetails || null,
        description: enquiryData.remarks ?? descriptionText ?? "",
        terms: terms,
      };

      if (enquiryData.id) {
        const enquiryRef = doc(db, "enquiries", enquiryData.id);
        await updateDoc(enquiryRef, enquiryPayload);
      } else if (enquiryData.enqId) {
        const enquiriesRef = collection(db, "enquiries");
        const q = query(enquiriesRef, where("enqId", "==", enquiryData.enqId));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const docRef = doc(db, "enquiries", querySnapshot.docs[0].id);
          await updateDoc(docRef, enquiryPayload);
        } else {
          enquiryPayload.createdAt = serverTimestamp();
          await addDoc(collection(db, "enquiries"), enquiryPayload);
        }
      }

      setLoading(false);
      onSuccess();
      onClose();

    } catch (err: any) {
      console.error("Error generating proforma invoice:", err);
      setError(err.message || "Failed to generate. Please try again.");
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const billedBy = getBilledByDetails();
    const billedTo = getBilledToDetails();
    const selectedBillDate = invoiceDate ? new Date(invoiceDate) : new Date();
    const billTimestamp = Timestamp.fromDate(selectedBillDate);

    const bill = {
      invoiceNumber: billNumber,
      billDate: billTimestamp,
      billedBy: billedBy,
      billedTo: billedTo,
      placeOfSupply: placeOfSupply,
      taxType: taxType,
      items: editableMaterials.map(item => ({
        productName: item.productName,
        hsn: item.hsn || "00",
        quantity: item.quantity,
        price: item.price,
        total: item.totalAmount,
      })),
      subtotal: calculateSubtotal(),
      discountAmount: calculateDiscount(),
      discountPercentage: discountPercentage,
      shippingCharges: Number(shippingCharges) || 0,
      taxRate: taxRate,
      cgst: calculateCGST(),
      sgst: calculateSGST(),
      igst: calculateIGST(),
      cessAmount: calculateCess(),
      totalAmount: calculateTotal(),
      customerName: billedTo.name,
      customerContact: billedTo.contactNumber,
      customerCity: billedTo.city,
      customerState: billedTo.state,
      customerAddress: billedTo.address,
      enquiryEnqId: enquiryData.enqId,
      logoUrl: LOGO_URL,
      signatureUrl: SIGNATURE_URL,
      includeSignature: includeSignature,
      bankDetails: bankDetails,
      terms: terms,
      isUpdate: existingBillId ? true : false,
      paymentType: paymentType || enquiryData?.paymentType || "",
      paymentSubStatus: paymentSubStatus || enquiryData?.paymentSubStatus || "",
      description: enquiryData?.remarks || descriptionText || "",
    };

    const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Proforma Invoice - ${bill.invoiceNumber}</title>
            <script>
              window.addEventListener('load', function() {
                setTimeout(function() {
                  try {
                    window.focus();
                    window.print();
                  } catch (e) {
                    console.warn("Auto-print error:", e);
                  }
                }, 400);
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
              .bottom-section { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 20px; page-break-inside: avoid; }
              .bank-details { padding: 12px 15px; background: #f8f9fa; border-radius: 4px; font-size: 11px; line-height: 1.8; color: #555; }
              .bank-details .bank-title { font-weight: bold; color: #333; margin-bottom: 5px; font-size: 12px; }
              .totals-box { width: 100%; }
              .total-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; }
              .total-row .label { color: #666; }
              .total-row .value { color: #333; font-weight: 500; }
              .discount-row .label, .discount-row .value { color: #28a745; }
              .grand-total-row { display: flex; justify-content: space-between; padding: 10px 0; margin-top: 6px; border-top: 2px solid #333; font-size: 16px; font-weight: bold; }
              .grand-total-row .value { color: #007bff; }
              .amount-words { margin: 15px 0; padding: 8px 15px; background: #f8f9fa; border-radius: 3px; font-size: 12px; page-break-inside: avoid; }
              .amount-words strong { color: #333; }
              .terms-section { margin: 15px 0; padding: 8px 15px; background: #fff3cd; border-radius: 3px; font-size: 12px; border-left: 3px solid #ffc107; page-break-inside: avoid; }
              .terms-section .terms-title { font-weight: bold; color: #333; margin-bottom: 4px; }
              .terms-section ul { list-style: none; padding: 0; margin: 0; }
              .terms-section ul li { padding: 1px 0; }
              .description-content { margin: 10px 0; padding: 10px 15px; background: #f3e8ff; border-radius: 3px; font-size: 12px; border-left: 3px solid #8b5cf6; color: #4a1a7a; }
              .footer-section { padding-top: 12px; margin-top: 20px; border-top: 1px solid #e9ecef; display: flex; justify-content: flex-end; align-items: flex-end; page-break-inside: avoid; }
              .footer-left { flex: 1; }
              .footer-right { text-align: right; }
              .footer-company { font-weight: bold; color: #1a1a1a; font-size: 13px; margin-bottom: 8px; }
              .signature-container { margin-top: 8px; display: flex; justify-content: flex-end; }
              .signature-image { max-width: 150px; max-height: 60px; object-fit: contain; }
              .footer-signatory { font-size: 11px; color: #666; margin-top: 5px; }
              @media print { body { padding: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none; } }
            </style>
          </head>
          <body>
            <div class="document-container">
              <div class="letterhead">
                <div class="letterhead-logo">
                  <img src="${bill.logoUrl}" alt="iBots" onerror="this.style.display='none'">
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
                  <div>Date: ${bill.billDate?.toDate().toLocaleDateString('en-IN')}</div>
                  <div>PO Date: ${bill.billDate?.toDate().toLocaleDateString('en-IN')}</div>
                </div>
              </div>

              <div class="billing-section">
                <div>
                  <div class="billing-label">Billed by</div>
                  <div class="billing-content">
                    <strong>Protowiz Private Limited</strong><br>
                    ${(() => {
                      const rawAddr = bill.billedBy?.address || '34/17A, First floor, 4th Cross Rd, Ramalingam Nagar, Saibaba Colony, Coimbatore, Tamil Nadu 641011';
                      return rawAddr.replace(/^Protowiz Private Limited[, -]*/i, '').trim();
                    })()}
                    ${bill.billedBy?.gstin ? `<br>GSTIN: ${bill.billedBy.gstin}` : '<br>GSTIN: 33AAKCP9459K1ZO'}
                  </div>
                </div>
                <div>
                  <div class="billing-label">Billed to</div>
                  <div class="billing-content">
                    <strong>${bill.billedTo?.name || bill.customerName}</strong><br>
                    ${bill.billedTo?.address || bill.customerAddress ? `Address: ${bill.billedTo?.address || bill.customerAddress}<br>` : ''}
                    Contact: ${bill.billedTo?.contactNumber || bill.customerContact}<br>
                    State: ${bill.billedTo?.state || bill.customerState || 'Tamil Nadu'}
                    ${bill.billedTo?.gstin ? `<br>GSTIN: ${bill.billedTo.gstin}` : ''}
                  </div>
                </div>
              </div>

              <div class="supply-bar">
                <strong>Place of Supply:</strong> ${bill.placeOfSupply || bill.billedTo?.state || 'Tamil Nadu'} &nbsp;&nbsp;|&nbsp;&nbsp; 
                <strong>Tax Type:</strong> ${bill.taxType === 'cgst_sgst' ? 'CGST + SGST' : 'IGST'}
              </div>

              <div class="mb-4 text-gray-700">
                ${bill.description ? `
                  <div class="description-content">
                    ${bill.description}
                  </div>
                ` : ''}
              </div>

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
                  ${bill.items?.map((item: any, index: number) => `
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
                    <strong>Beneficiary Name:</strong> ${bill.bankDetails.beneficiaryName}<br>
                    <strong>Bank Name:</strong> ${bill.bankDetails.bankName}<br>
                    <strong>Account No:</strong> ${bill.bankDetails.accountNo}<br>
                    <strong>IFSC Code:</strong> ${bill.bankDetails.ifscCode}<br>
                    <strong>Branch:</strong> ${bill.bankDetails.branch}
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
                  ${(bill.shippingCharges && bill.shippingCharges > 0) ? `
                  <div class="total-row">
                    <span class="label">Shipping / Courier Charges</span>
                    <span class="value">₹${bill.shippingCharges.toFixed(2)}</span>
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

              <div class="terms-section">
                <div class="terms-title">Terms & Conditions:</div>
                <ul>
                  ${bill.terms && bill.terms.length > 0 ? 
                    bill.terms.map((term: TermsCondition, index: number) => `<li>${index + 1}. ${term.text}</li>`).join('') 
                    : `
                      <li>1. Payment: 100% advance</li>
                      <li>2. Delivery: 10-12 days maximum from advance initiation</li>
                      <li>3. PI Validity: 2 days</li>
                    `
                  }
                </ul>
              </div>

              <div class="footer-section">
                <div class="footer-left"></div>
                <div class="footer-right">
                  <div class="footer-company">For Protowiz Private Limited</div>
                  ${bill.includeSignature !== false ? `
                    <div class="signature-container">
                      <img src="${bill.signatureUrl}" alt="Authorized Signature" class="signature-image" onerror="this.style.display='none'" />
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

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      try {
        printWindow.opener = null;
      } catch (_) {}
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    }
  };

  if (!open) return null;

  const billedBy = getBilledByDetails();
  const billedTo = getBilledToDetails();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 overflow-y-auto">
      <div className="bg-white w-full max-w-6xl rounded-2xl shadow-xl my-8">
        {/* Modal Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b sticky top-0 bg-white z-10 rounded-t-2xl">
          <h2 className="text-xl font-bold text-gray-800">
            {existingBillId ? 'Update Proforma Invoice' : 'Generate Proforma Invoice'}
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
                ⚠️ Updating existing Proforma Invoice #{billNumber}
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                Changes will be saved and tracked
              </p>
            </div>
          )}
          
          <div id="print-content" ref={printContentRef}>
            <div className="flex items-center justify-between border-b pb-5 mb-5">
              <div className="text-center flex-shrink-0">
                <img 
                  src={LOGO_URL}
                  alt="iBots Logo" 
                  className="h-14 mx-auto mb-1"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                  crossOrigin="anonymous"
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
              <div className="text-2xl font-bold tracking-wider text-gray-900">PROFORMA INVOICE</div>
              <div className="text-right text-sm text-gray-600">
                <div>Proforma No: {billNumber}</div>
                <div>Date: {new Date().toLocaleDateString('en-IN')}</div>
                <div>PO Date: {new Date().toLocaleDateString('en-IN')}</div>
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
                {billedTo.address && (
                  <div className="text-gray-600 text-xs mt-1">Address: {billedTo.address}</div>
                )}
                <div className="text-gray-600 text-xs">Contact: {billedTo.contactNumber}</div>
                <div className="text-gray-600 text-xs">City: {billedTo.city}</div>
                <div className="text-gray-600 text-xs">State: {billedTo.state}</div>
                {billedTo.gstin && <div className="text-gray-600 text-xs">GSTIN: {billedTo.gstin}</div>}
                {billedTo.pan && <div className="text-gray-600 text-xs">PAN: {billedTo.pan}</div>}
              </div>
            </div>

            <div className="mb-5 p-3 bg-blue-50 rounded border-l-4 border-blue-500 text-sm">
              <span className="font-medium text-gray-700">Place of Supply:</span> {placeOfSupply} &nbsp;&nbsp;|&nbsp;&nbsp;
              <span className="font-medium text-gray-700">Tax Type:</span> {taxType === "cgst_sgst" ? "CGST + SGST" : "IGST"}
            </div>

            {/* Description Section with Edit Option */}
            <div className="mb-4 text-gray-700">
              {showPreview ? (
                <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-purple-800">Description / Remarks</span>
                    <button
                      onClick={() => setEditingDescription(!editingDescription)}
                      className="text-purple-600 hover:text-purple-800 flex items-center gap-1 text-xs"
                    >
                      <Edit3 className="w-3 h-3" />
                      {editingDescription ? 'Done' : 'Edit'}
                    </button>
                  </div>
                  {editingDescription ? (
                    <textarea
                      value={descriptionText}
                      onChange={(e) => setDescriptionText(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-400 text-sm"
                      placeholder="Enter description or remarks..."
                    />
                  ) : (
                    <p className="text-sm text-purple-800 whitespace-pre-line">
                      {descriptionText || "No description provided"}
                    </p>
                  )}
                </div>
              ) : (
                enquiryData?.remarks && (
                  <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <p className="text-sm text-purple-800 whitespace-pre-line">{enquiryData.remarks}</p>
                  </div>
                )
              )}
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
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Add Product from Inventory</h4>
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
                        className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2 text-sm"
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
                    <th className="border p-2 text-left">Description of Goods</th>
                    <th className="border p-2 text-left">HSN Code</th>
                    <th className="border p-2 text-center">Qty</th>
                    <th className="border p-2 text-right">Rate</th>
                    <th className="border p-2 text-center">Tax (%)</th>
                    <th className="border p-2 text-right">Amount</th>
                    {showPreview && <th className="border p-2 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {editableMaterials.map((item, index) => {
                    const taxAmount = (item.totalAmount * (item.taxRate || taxRate)) / 100;
                    return (
                      <tr key={item.id}>
                        <td className="border p-2 text-center">{index + 1}</td>
                        <td className="border p-2">
                          {showPreview ? (
                            <input
                              type="text"
                              value={item.productName}
                              onChange={(e) => {
                                const newMaterials = [...editableMaterials];
                                newMaterials[index].productName = e.target.value;
                                setEditableMaterials(newMaterials);
                              }}
                              className="w-full px-1 py-0.5 border rounded text-sm"
                            />
                          ) : (
                            item.productName
                          )}
                        </td>
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
                        <td className="border p-2 text-center">
                          {showPreview ? (
                            <input
                              type="number"
                              value={item.taxRate || taxRate}
                              onChange={(e) => handleUpdateTaxRate(item.id, parseFloat(e.target.value) || 0)}
                              min="0"
                              max="100"
                              className="w-16 px-1 py-0.5 border rounded text-center text-sm"
                            />
                          ) : (
                            `${item.taxRate || taxRate}%`
                          )}
                        </td>
                        <td className="border p-2 text-right font-medium">₹{item.totalAmount.toFixed(2)}</td>
                        {showPreview && (
                          <td className="border p-2 text-center">
                            <button
                              onClick={() => handleRemoveMaterial(item.id)}
                              className="text-red-600 hover:text-red-800"
                              title="Remove item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {showPreview && (
                  <tfoot>
                    <tr>
                      <td colSpan={8} className="border border-gray-300 px-3 py-2 text-center">
                        <button
                          onClick={() => {
                            const newItem: MaterialItem = {
                              id: `new-${Date.now()}`,
                              productId: `new-${Date.now()}`,
                              productName: "New Product",
                              price: 0,
                              quantity: 1,
                              totalAmount: 0,
                              hsn: "",
                              taxRate: taxRate,
                              originalPrice: 0,
                            };
                            setEditableMaterials([...editableMaterials, newItem]);
                          }}
                          className="text-purple-600 hover:text-purple-800 flex items-center gap-1 mx-auto"
                        >
                          <Plus className="w-4 h-4" />
                          Add Custom Product
                        </button>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {showPreview && (
              <div className="mb-5 p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Price & Tax Settings</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
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
                  <div>
                    <label className="block text-xs text-gray-600 mb-1 font-medium">Discount (%)</label>
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
                    <label className="block text-xs text-gray-600 mb-1 font-medium">Shipping (₹)</label>
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
                    <label className="block text-xs text-gray-600 mb-1 font-medium">Tax Rate (%)</label>
                    <input
                      type="number"
                      value={taxRate}
                      onChange={(e) => setTaxRate(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                      min="0"
                      max="100"
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1 font-medium">Cess Amount (₹)</label>
                    <input
                      type="number"
                      value={cessAmount}
                      onChange={(e) => setCessAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6 mb-5">
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

              <div>
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-gray-600">Sub Total</span>
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
                  </>
                ) : (
                  <div className="flex justify-between py-1.5 text-sm">
                    <span className="text-gray-600">IGST ({taxRate}%)</span>
                    <span>₹{calculateIGST().toFixed(2)}</span>
                  </div>
                )}
                {cessAmount > 0 && (
                  <div className="flex justify-between py-1.5 text-sm text-orange-600">
                    <span>Cess Amount</span>
                    <span>₹{calculateCess().toFixed(2)}</span>
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

            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <span className="font-medium">Amount Chargeable (In Words) :</span>
              <span className="ml-2">{numberToWords(calculateTotal())}</span>
            </div>

            {/* Terms & Conditions Section */}
            <div className="mb-4 text-xs text-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-gray-700">Terms & Conditions:</h4>
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
                <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                  <ul className="list-none space-y-0.5">
                    {terms.map((term, index) => (
                      <li key={term.id}>{index + 1}. {term.text}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t pt-4 mt-6 gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="piIncludeSignature"
                  checked={includeSignature}
                  onChange={(e) => setIncludeSignature(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 cursor-pointer"
                />
                <label htmlFor="piIncludeSignature" className="text-sm font-medium text-gray-700 cursor-pointer flex items-center gap-1.5 select-none">
                  Include Sign & Seal
                </label>
              </div>

              <div className="text-right">
                <p className="font-bold text-gray-800">For Protowiz Private Limited</p>
                {includeSignature && (
                  <div className="flex justify-end mt-2">
                    <img 
                      src={SIGNATURE_URL}
                      alt="Authorized Signature" 
                      className="h-12 w-auto object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      crossOrigin="anonymous"
                    />
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">Authorised Signatory</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 border-t flex justify-end gap-3 bg-gray-50 rounded-b-2xl">
          {!showPreview ? (
            <>
              <button onClick={() => setShowPreview(true)} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm">
                Preview Proforma Invoice
              </button>
              <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors text-sm">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={handlePrint} className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-2 transition-colors text-sm">
                <Printer className="w-4 h-4" />
                Print
              </button>
              <button onClick={handleGenerateBill} disabled={loading} className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 transition-colors text-sm">
                <Save className="w-4 h-4" />
                {loading ? (existingBillId ? "Updating..." : "Saving...") : (existingBillId ? `Update Invoice` : `Save Invoice`)}
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

export default ProformaInvoiceGeneratorModal;