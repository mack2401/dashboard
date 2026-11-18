import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc,
  query, 
  where, 
  orderBy, 
  Timestamp,
  QueryConstraint,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase";

export interface Bill {
  id?: string;
  billId: string;
  invoiceNumber: string;
  billDate: Timestamp;
  dueDate: Timestamp;
  customerName: string;
  customerContact: string;
  customerCity: string;
  totalAmount: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  assignedTo: string;
  assignedToName: string;
  createdBy: string;
  createdByRole: string;
  status: 'pending' | 'paid' | 'cancelled';
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    total: number;
    hsn?: string;
  }>;
  billedBy: {
    name: string;
    address: string;
    gstin: string;
    pan: string;
  };
  billedTo: {
    name: string;
    enqId: string;
    contactNumber: string;
    city: string;
    state: string;
    gstin?: string;
    address?: string;
    pan?: string;
  };
  taxType: string;
  taxRate: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  paymentStatus?: 'pending' | 'partial' | 'completed';
  paymentDate?: Timestamp;
  paymentMethod?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  placeOfSupply?: string;
  enquiryId?: string;
  enquiryEnqId?: string;
  taxableAmount?: number;
  discountPercentage?: number;
}

interface CreateBillOptions {
  markAsPaid?: boolean;
  paymentDate?: Date;
  paymentMethod?: string;
}

interface GetBillsOptions {
  userId?: string;
  status?: string;
  paymentStatus?: string;
  startDate?: Date;
  endDate?: Date;
  role?: string;
  createdBy?: string;
  assignedTo?: string;
}

class BillService {
  private billsCollection = collection(db, "bills");
  private transactionsCollection = collection(db, "billTransactions");

  // Create a new bill with optional immediate payment
  async createBill(
    billData: Omit<Bill, 'id' | 'createdAt' | 'updatedAt'>, 
    options?: CreateBillOptions
  ): Promise<string> {
    try {
      const now = Timestamp.now();
      
      let paymentStatus: 'pending' | 'partial' | 'completed' = billData.paymentStatus || 'pending';
      let paymentDate: Timestamp | undefined;
      let billStatus: 'pending' | 'paid' | 'cancelled' = billData.status || 'pending';
      
      if (options?.markAsPaid) {
        paymentStatus = 'completed';
        billStatus = 'paid';
        paymentDate = options.paymentDate ? Timestamp.fromDate(options.paymentDate) : now;
      }
      
      const newBill = {
        ...billData,
        createdAt: now,
        updatedAt: now,
        status: billStatus,
        paymentStatus,
        ...(paymentDate && { paymentDate }),
        ...(options?.paymentMethod && { paymentMethod: options.paymentMethod })
      };
      
      const docRef = await addDoc(this.billsCollection, newBill);
      
      await addDoc(this.transactionsCollection, {
        ...newBill,
        originalBillId: docRef.id,
        transactionDate: now,
        transactionType: options?.markAsPaid ? 'immediate_payment' : 'bill_creation',
        ...(options?.markAsPaid && {
          paymentAmount: billData.totalAmount,
          paymentMethod: options.paymentMethod || 'cash'
        })
      });
      
      return docRef.id;
    } catch (error) {
      console.error("Error creating bill:", error);
      throw error;
    }
  }

  async createPaidBill(
    billData: Omit<Bill, 'id' | 'createdAt' | 'updatedAt' | 'paymentStatus' | 'paymentDate'>,
    options?: {
      paymentDate?: Date;
      paymentMethod?: string;
    }
  ): Promise<string> {
    return await this.createBill(billData as Omit<Bill, 'id' | 'createdAt' | 'updatedAt'>, {
      markAsPaid: true,
      paymentDate: options?.paymentDate,
      paymentMethod: options?.paymentMethod
    });
  }

  // ✅ FIXED: Get all bills without composite indexes
  async getBills(options?: GetBillsOptions): Promise<Bill[]> {
    try {
      let bills: Bill[] = [];
      
      // For staff or specific user filter without admin/manager role
      const needsUserFilter = options?.userId && options?.role && 
                              options.role !== 'admin' && 
                              options.role !== 'manager';
      
      if (needsUserFilter) {
        // Staff user - fetch by createdBy and assignedTo separately (no orderBy to avoid index)
        const [createdBySnap, assignedToSnap] = await Promise.all([
          getDocs(query(this.billsCollection, where("createdBy", "==", options.userId))),
          getDocs(query(this.billsCollection, where("assignedTo", "==", options.userId)))
        ]);
        
        const billsMap = new Map<string, Bill>();
        
        createdBySnap.forEach((doc) => {
          billsMap.set(doc.id, { ...doc.data(), id: doc.id } as Bill);
        });
        
        assignedToSnap.forEach((doc) => {
          if (!billsMap.has(doc.id)) {
            billsMap.set(doc.id, { ...doc.data(), id: doc.id } as Bill);
          }
        });
        
        bills = Array.from(billsMap.values());
        
        // Sort by billDate descending (client-side)
        bills.sort((a, b) => {
          const dateA = a.billDate?.toDate?.() || new Date(0);
          const dateB = b.billDate?.toDate?.() || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
        
        // Apply additional filters
        if (options?.status) {
          bills = bills.filter(bill => bill.status === options.status);
        }
        if (options?.paymentStatus) {
          bills = bills.filter(bill => bill.paymentStatus === options.paymentStatus);
        }
        if (options?.startDate) {
          bills = bills.filter(bill => bill.billDate.toDate() >= options.startDate!);
        }
        if (options?.endDate) {
          bills = bills.filter(bill => bill.billDate.toDate() <= options.endDate!);
        }
        
        return bills;
      }
      
      // Admin/Manager or no filter - simple query without orderBy
      if (options?.userId && (options?.role === 'admin' || options?.role === 'manager')) {
        const q = query(this.billsCollection, where("createdBy", "==", options.userId));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
          bills.push({ ...doc.data(), id: doc.id } as Bill);
        });
      } else if (options?.status) {
        const q = query(this.billsCollection, where("status", "==", options.status));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
          bills.push({ ...doc.data(), id: doc.id } as Bill);
        });
      } else if (options?.paymentStatus) {
        const q = query(this.billsCollection, where("paymentStatus", "==", options.paymentStatus));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
          bills.push({ ...doc.data(), id: doc.id } as Bill);
        });
      } else {
        // No filters - get all documents
        const querySnapshot = await getDocs(this.billsCollection);
        querySnapshot.forEach((doc) => {
          bills.push({ ...doc.data(), id: doc.id } as Bill);
        });
      }
      
      // Sort by billDate descending (client-side)
      bills.sort((a, b) => {
        const dateA = a.billDate?.toDate?.() || new Date(0);
        const dateB = b.billDate?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      
      // Apply date filters if provided
      if (options?.startDate) {
        bills = bills.filter(bill => bill.billDate.toDate() >= options.startDate!);
      }
      if (options?.endDate) {
        bills = bills.filter(bill => bill.billDate.toDate() <= options.endDate!);
      }
      
      return bills;
    } catch (error) {
      console.error("Error fetching bills:", error);
      if (error instanceof Error && (
        error.message.includes("permission") || 
        error.message.includes("Missing or insufficient permissions")
      )) {
        console.warn("Permission denied - returning empty array");
        return [];
      }
      throw error;
    }
  }

  // ✅ FIXED: Get staff bills without composite indexes
  async getStaffBills(userId: string): Promise<Bill[]> {
    try {
      // Two separate simple queries (no orderBy to avoid composite index)
      const [createdBySnap, assignedToSnap] = await Promise.all([
        getDocs(query(this.billsCollection, where("createdBy", "==", userId))),
        getDocs(query(this.billsCollection, where("assignedTo", "==", userId)))
      ]);
      
      // Combine and deduplicate
      const billsMap = new Map<string, Bill>();
      
      createdBySnap.forEach((doc) => {
        billsMap.set(doc.id, { ...doc.data(), id: doc.id } as Bill);
      });
      
      assignedToSnap.forEach((doc) => {
        if (!billsMap.has(doc.id)) {
          billsMap.set(doc.id, { ...doc.data(), id: doc.id } as Bill);
        }
      });
      
      const bills = Array.from(billsMap.values());
      
      // Sort by billDate descending (client-side)
      bills.sort((a, b) => {
        const dateA = a.billDate?.toDate?.() || new Date(0);
        const dateB = b.billDate?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      
      return bills;
    } catch (error) {
      console.error("Error fetching staff bills:", error);
      if (error instanceof Error && (
        error.message.includes("permission") || 
        error.message.includes("Missing or insufficient permissions")
      )) {
        return [];
      }
      throw error;
    }
  }

  async getBillById(billId: string): Promise<Bill | null> {
    try {
      const docRef = doc(db, "bills", billId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Bill;
      }
      return null;
    } catch (error) {
      console.error("Error fetching bill:", error);
      if (error instanceof Error && (
        error.message.includes("permission") || 
        error.message.includes("Missing or insufficient permissions")
      )) {
        return null;
      }
      throw error;
    }
  }

  async updateBill(billId: string, updates: Partial<Bill>): Promise<void> {
    try {
      const docRef = doc(db, "bills", billId);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: Timestamp.now()
      });
      
      try {
        const transactionsQuery = query(
          this.transactionsCollection,
          where("originalBillId", "==", billId)
        );
        const transactionsSnapshot = await getDocs(transactionsQuery);
        
        const batch = writeBatch(db);
        transactionsSnapshot.forEach((transactionDoc) => {
          batch.update(transactionDoc.ref, {
            ...updates,
            updatedAt: Timestamp.now()
          });
        });
        await batch.commit();
      } catch (transactionError) {
        console.warn("Could not update related transactions:", transactionError);
      }
    } catch (error) {
      console.error("Error updating bill:", error);
      throw error;
    }
  }

  async deleteBill(billId: string): Promise<void> {
    try {
      const batch = writeBatch(db);
      
      const billRef = doc(db, "bills", billId);
      batch.delete(billRef);
      
      try {
        const transactionsByOriginalIdQuery = query(
          this.transactionsCollection,
          where("originalBillId", "==", billId)
        );
        const transactionsByOriginalIdSnapshot = await getDocs(transactionsByOriginalIdQuery);
        transactionsByOriginalIdSnapshot.forEach((transactionDoc) => {
          batch.delete(transactionDoc.ref);
        });
        
        const transactionByDocIdRef = doc(db, "billTransactions", billId);
        const transactionDocSnap = await getDoc(transactionByDocIdRef);
        if (transactionDocSnap.exists()) {
          batch.delete(transactionByDocIdRef);
        }
      } catch (transactionError) {
        console.warn("Error cleaning up transactions:", transactionError);
      }
      
      await batch.commit();
    } catch (error) {
      console.error("Error deleting bill:", error);
      throw error;
    }
  }

  async softDeleteBill(billId: string): Promise<void> {
    try {
      await this.updateBill(billId, { status: 'cancelled' });
    } catch (error) {
      console.error("Error soft deleting bill:", error);
      throw error;
    }
  }

  async updatePaymentStatus(
    billId: string, 
    status: 'pending' | 'partial' | 'completed', 
    paymentDate?: Date,
    paymentMethod?: string
  ): Promise<void> {
    try {
      const updates: Partial<Bill> = {
        paymentStatus: status,
        updatedAt: Timestamp.now()
      };
      
      if (paymentDate) {
        updates.paymentDate = Timestamp.fromDate(paymentDate);
      }
      
      if (paymentMethod) {
        updates.paymentMethod = paymentMethod;
      }
      
      if (status === 'completed') {
        updates.status = 'paid';
      }
      
      await this.updateBill(billId, updates);
      
      try {
        const bill = await this.getBillById(billId);
        if (bill) {
          await addDoc(this.transactionsCollection, {
            ...bill,
            originalBillId: billId,
            transactionDate: Timestamp.now(),
            transactionType: 'payment_status_update',
            previousStatus: bill.paymentStatus,
            newStatus: status,
            ...(paymentMethod && { paymentMethod })
          });
        }
      } catch (transactionError) {
        console.warn("Could not create transaction record:", transactionError);
      }
    } catch (error) {
      console.error("Error updating payment status:", error);
      throw error;
    }
  }

  // ✅ FIXED: Get bills by date range without composite index
  async getBillsByDateRange(startDate: Date, endDate: Date, userId?: string): Promise<Bill[]> {
    try {
      let q;
      
      if (userId) {
        q = query(
          this.billsCollection,
          where("createdBy", "==", userId)
        );
      } else {
        q = query(this.billsCollection);
      }
      
      const querySnapshot = await getDocs(q);
      const bills: Bill[] = [];
      
      querySnapshot.forEach((doc) => {
        const bill = { id: doc.id, ...doc.data() } as Bill;
        const billDate = bill.billDate?.toDate();
        
        if (billDate && billDate >= startDate && billDate <= endDate) {
          bills.push(bill);
        }
      });
      
      // Sort by billDate descending (client-side)
      bills.sort((a, b) => {
        const dateA = a.billDate?.toDate?.() || new Date(0);
        const dateB = b.billDate?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      
      return bills;
    } catch (error) {
      console.error("Error fetching bills by date range:", error);
      if (error instanceof Error && error.message.includes("permission")) {
        return [];
      }
      throw error;
    }
  }

  async getBillStatistics(userId?: string, role?: string): Promise<{
    totalBills: number;
    totalRevenue: number;
    paidAmount: number;
    pendingAmount: number;
    partialAmount: number;
    averageBillValue: number;
    paidBillsCount: number;
    pendingBillsCount: number;
    partialBillsCount: number;
  }> {
    try {
      let bills: Bill[] = [];
      
      if (userId && role !== 'admin' && role !== 'manager') {
        bills = await this.getStaffBills(userId);
      } else if (userId && (role === 'admin' || role === 'manager')) {
        bills = await this.getBills({ userId });
      } else {
        bills = await this.getBills();
      }
      
      const totalRevenue = bills.reduce((sum, bill) => sum + bill.totalAmount, 0);
      const paidAmount = bills
        .filter(bill => bill.paymentStatus === 'completed')
        .reduce((sum, bill) => sum + bill.totalAmount, 0);
      const pendingAmount = bills
        .filter(bill => bill.paymentStatus === 'pending')
        .reduce((sum, bill) => sum + bill.totalAmount, 0);
      const partialAmount = bills
        .filter(bill => bill.paymentStatus === 'partial')
        .reduce((sum, bill) => sum + bill.totalAmount, 0);
      
      return {
        totalBills: bills.length,
        totalRevenue,
        paidAmount,
        pendingAmount,
        partialAmount,
        averageBillValue: bills.length > 0 ? totalRevenue / bills.length : 0,
        paidBillsCount: bills.filter(bill => bill.paymentStatus === 'completed').length,
        pendingBillsCount: bills.filter(bill => bill.paymentStatus === 'pending').length,
        partialBillsCount: bills.filter(bill => bill.paymentStatus === 'partial').length
      };
    } catch (error) {
      console.error("Error fetching bill statistics:", error);
      return {
        totalBills: 0,
        totalRevenue: 0,
        paidAmount: 0,
        pendingAmount: 0,
        partialAmount: 0,
        averageBillValue: 0,
        paidBillsCount: 0,
        pendingBillsCount: 0,
        partialBillsCount: 0
      };
    }
  }

  // ✅ FIXED: Get bills by customer without composite index
  async getBillsByCustomer(customerName: string): Promise<Bill[]> {
    try {
      const q = query(
        this.billsCollection,
        where("customerName", "==", customerName)
      );
      
      const querySnapshot = await getDocs(q);
      const bills: Bill[] = [];
      querySnapshot.forEach((doc) => {
        bills.push({ id: doc.id, ...doc.data() } as Bill);
      });
      
      // Sort by billDate descending (client-side)
      bills.sort((a, b) => {
        const dateA = a.billDate?.toDate?.() || new Date(0);
        const dateB = b.billDate?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      
      return bills;
    } catch (error) {
      console.error("Error fetching bills by customer:", error);
      if (error instanceof Error && error.message.includes("permission")) {
        return [];
      }
      throw error;
    }
  }

  // ✅ FIXED: Get pending payments without composite indexes
  async getPendingPayments(userId?: string, role?: string): Promise<Bill[]> {
    try {
      if (userId && role !== 'admin' && role !== 'manager') {
        return (await this.getStaffBills(userId))
          .filter(bill => bill.paymentStatus === 'pending' || bill.paymentStatus === 'partial')
          .sort((a, b) => {
            const dateA = a.dueDate?.toDate?.() || new Date(0);
            const dateB = b.dueDate?.toDate?.() || new Date(0);
            return dateA.getTime() - dateB.getTime();
          });
      }
      
      let q;
      if (userId && (role === 'admin' || role === 'manager')) {
        q = query(this.billsCollection, where("createdBy", "==", userId));
      } else {
        q = query(this.billsCollection);
      }
      
      const querySnapshot = await getDocs(q);
      const bills: Bill[] = [];
      
      querySnapshot.forEach((doc) => {
        const bill = { id: doc.id, ...doc.data() } as Bill;
        if (bill.paymentStatus === 'pending' || bill.paymentStatus === 'partial') {
          bills.push(bill);
        }
      });
      
      // Sort by dueDate ascending (client-side)
      bills.sort((a, b) => {
        const dateA = a.dueDate?.toDate?.() || new Date(0);
        const dateB = b.dueDate?.toDate?.() || new Date(0);
        return dateA.getTime() - dateB.getTime();
      });
      
      return bills;
    } catch (error) {
      console.error("Error fetching pending payments:", error);
      return [];
    }
  }

  // ✅ FIXED: Get overdue payments without composite indexes
  async getOverduePayments(userId?: string, role?: string): Promise<Bill[]> {
    try {
      const now = new Date();
      
      if (userId && role !== 'admin' && role !== 'manager') {
        return (await this.getStaffBills(userId))
          .filter(bill => 
            (bill.paymentStatus === 'pending' || bill.paymentStatus === 'partial') &&
            bill.dueDate.toDate() < now
          )
          .sort((a, b) => {
            const dateA = a.dueDate?.toDate?.() || new Date(0);
            const dateB = b.dueDate?.toDate?.() || new Date(0);
            return dateA.getTime() - dateB.getTime();
          });
      }
      
      let q;
      if (userId && (role === 'admin' || role === 'manager')) {
        q = query(this.billsCollection, where("createdBy", "==", userId));
      } else {
        q = query(this.billsCollection);
      }
      
      const querySnapshot = await getDocs(q);
      const bills: Bill[] = [];
      
      querySnapshot.forEach((doc) => {
        const bill = { id: doc.id, ...doc.data() } as Bill;
        if (
          (bill.paymentStatus === 'pending' || bill.paymentStatus === 'partial') &&
          bill.dueDate.toDate() < now
        ) {
          bills.push(bill);
        }
      });
      
      // Sort by dueDate ascending (client-side)
      bills.sort((a, b) => {
        const dateA = a.dueDate?.toDate?.() || new Date(0);
        const dateB = b.dueDate?.toDate?.() || new Date(0);
        return dateA.getTime() - dateB.getTime();
      });
      
      return bills;
    } catch (error) {
      console.error("Error fetching overdue payments:", error);
      return [];
    }
  }

  async getMonthlyRevenue(year: number, month: number, userId?: string): Promise<number> {
    try {
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0);
      
      const bills = await this.getBillsByDateRange(startDate, endDate, userId);
      
      return bills.reduce((sum, bill) => sum + bill.totalAmount, 0);
    } catch (error) {
      console.error("Error fetching monthly revenue:", error);
      throw error;
    }
  }

  async getDailyRevenue(date: Date, userId?: string): Promise<number> {
    try {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      const bills = await this.getBillsByDateRange(startDate, endDate, userId);
      
      return bills.reduce((sum, bill) => sum + bill.totalAmount, 0);
    } catch (error) {
      console.error("Error fetching daily revenue:", error);
      throw error;
    }
  }

  async markAsPaid(billId: string, paymentDate?: Date, paymentMethod?: string): Promise<void> {
    await this.updatePaymentStatus(billId, 'completed', paymentDate, paymentMethod);
  }

  async markAsPartiallyPaid(billId: string, paymentDate?: Date, paymentMethod?: string): Promise<void> {
    await this.updatePaymentStatus(billId, 'partial', paymentDate, paymentMethod);
  }

  async getPaymentSummary(billId: string): Promise<{
    totalAmount: number;
    paidAmount: number;
    pendingAmount: number;
    paymentStatus: string;
    paymentDate?: Timestamp;
    paymentMethod?: string;
  }> {
    try {
      const bill = await this.getBillById(billId);
      if (!bill) {
        throw new Error("Bill not found");
      }
      
      let paidAmount = 0;
      if (bill.paymentStatus === 'completed') {
        paidAmount = bill.totalAmount;
      } else if (bill.paymentStatus === 'partial') {
        paidAmount = bill.totalAmount / 2;
      }
      
      return {
        totalAmount: bill.totalAmount,
        paidAmount,
        pendingAmount: bill.totalAmount - paidAmount,
        paymentStatus: bill.paymentStatus || 'pending',
        paymentDate: bill.paymentDate,
        paymentMethod: bill.paymentMethod
      };
    } catch (error) {
      console.error("Error fetching payment summary:", error);
      throw error;
    }
  }

  async exportBillsToCSV(options?: {
    userId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    role?: string;
  }): Promise<string> {
    try {
      let bills: Bill[] = [];
      
      if (options?.userId && options?.role !== 'admin' && options?.role !== 'manager') {
        bills = await this.getStaffBills(options.userId);
      } else {
        bills = await this.getBills(options);
      }
      
      const headers = [
        'Bill ID',
        'Invoice Number',
        'Bill Date',
        'Due Date',
        'Customer Name',
        'Customer Contact',
        'Total Amount',
        'Status',
        'Payment Status',
        'Created By',
        'Created At'
      ];
      
      const rows = bills.map(bill => [
        bill.billId,
        bill.invoiceNumber,
        bill.billDate.toDate().toLocaleDateString(),
        bill.dueDate.toDate().toLocaleDateString(),
        bill.customerName,
        bill.customerContact,
        bill.totalAmount.toString(),
        bill.status,
        bill.paymentStatus || 'pending',
        bill.createdBy,
        bill.createdAt.toDate().toLocaleString()
      ]);
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');
      
      return csvContent;
    } catch (error) {
      console.error("Error exporting bills to CSV:", error);
      throw error;
    }
  }

  async deleteAllBills(): Promise<void> {
    try {
      const billsSnapshot = await getDocs(this.billsCollection);
      const transactionsSnapshot = await getDocs(this.transactionsCollection);
      
      const batch = writeBatch(db);
      
      billsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      transactionsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
    } catch (error) {
      console.error("Error deleting all bills:", error);
      throw error;
    }
  }
}

export const billService = new BillService();