import React, { useEffect, useState, useMemo } from "react";
import {
  Users,
  IndianRupee,
  ShoppingCart,
  TrendingUp,
  Search,
  Download,
  Calendar,
  Eye,
  X,
  Package,
  CreditCard,
  Phone,
  Mail,
  MapPin,
  Building,
  CheckCircle,
  FileText,
  Clock,
  ArrowUpDown,
  Filter,
  FileSpreadsheet
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell
} from "recharts";
import {
  collection,
  onSnapshot,
  query,
  orderBy
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../App";
import ComparisonAnalytics from "../components/reports/ComparisonAnalytics";

// --- Types ---
export interface PurchasedProductSummary {
  productName: string;
  totalQuantity: number;
  totalAmount: number;
  orderCount: number;
  lastPurchasedDate?: Date | null;
}

export interface ClientOrderItem {
  productName: string;
  quantity: number;
  price: number;
  totalAmount: number;
  hsnCode?: string;
}

export interface ClientOrder {
  id: string;
  enqId?: string;
  invoiceNumber?: string;
  date: Date;
  status: string;
  paymentStatus: string;
  paymentMode: string;
  totalAmount: number;
  items: ClientOrderItem[];
  isProformaInvoice?: boolean;
}

export interface ClientReport {
  key: string;
  customerName: string;
  companyName?: string;
  contactNumber: string;
  email: string;
  city: string;
  state: string;
  gstin?: string;
  totalSpent: number;
  purchaseCount: number;
  totalEnquiries: number;
  firstOrderDate: Date | null;
  lastOrderDate: Date | null;
  paymentModes: Record<string, number>;
  primaryPaymentMode: string;
  purchasedProducts: PurchasedProductSummary[];
  orders: ClientOrder[];
}

const COLORS = ["#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#14B8A6", "#6366F1"];

const Reports: React.FC = () => {
  const { user } = useAuth();
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "this_month" | "last_30_days" | "custom">("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [sortBy, setSortBy] = useState<"spent" | "orders" | "name" | "recent">("spent");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Selected client for detail drill-down modal
  const [selectedClient, setSelectedClient] = useState<ClientReport | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<"products" | "orders">("products");

  // Fetch enquiries and bills in real-time
  useEffect(() => {
    setLoading(true);

    const unsubEnquiries = onSnapshot(collection(db, "enquiries"), (snap) => {
      const enqList: any[] = [];
      snap.forEach((doc) => {
        enqList.push({ id: doc.id, ...doc.data() });
      });
      setEnquiries(enqList);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching enquiries for reports:", err);
      setLoading(false);
    });

    const unsubBills = onSnapshot(collection(db, "bills"), (snap) => {
      const billList: any[] = [];
      snap.forEach((doc) => {
        billList.push({ id: doc.id, ...doc.data() });
      });
      setBills(billList);
    }, (err) => {
      console.error("Error fetching bills for reports:", err);
    });

    return () => {
      unsubEnquiries();
      unsubBills();
    };
  }, []);

  // Filter raw data by date
  const filterDateRange = (date: Date | null): boolean => {
    if (!date) return true;
    const now = new Date();

    if (dateFilter === "today") {
      return date.toDateString() === now.toDateString();
    } else if (dateFilter === "this_month") {
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    } else if (dateFilter === "last_30_days") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return date >= thirtyDaysAgo;
    } else if (dateFilter === "custom") {
      if (customStartDate && date < new Date(customStartDate)) return false;
      if (customEndDate) {
        const end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
        if (date > end) return false;
      }
      return true;
    }
    return true;
  };

  // Aggregate Client Purchase Data
  const clientReports = useMemo(() => {
    const clientMap = new Map<string, ClientReport>();

    // Helper to get normalized client key (primarily by customer name to avoid mixing different companies with same phone)
    const getClientKey = (name?: string, contact?: string, email?: string) => {
      const cleanName = (name || "").trim().toLowerCase();
      if (cleanName) {
        return `name_${cleanName}`;
      }
      const cleanContact = (contact || "").replace(/\D/g, "");
      if (cleanContact.length >= 10) return `phone_${cleanContact.slice(-10)}`;
      if (email && email.trim()) return `email_${email.trim().toLowerCase()}`;
      return `unknown_${Math.random()}`;
    };

    // Helper to parse date
    const parseDate = (d: any): Date => {
      if (!d) return new Date();
      if (typeof d.toDate === "function") return d.toDate();
      if (d instanceof Date) return d;
      return new Date(d);
    };

    // Helper to parse items/materials
    const parseItems = (raw: any): ClientOrderItem[] => {
      if (!raw) return [];
      let parsed = raw;
      if (typeof raw === "string") {
        try {
          parsed = JSON.parse(raw);
        } catch {
          return [];
        }
      }
      if (!Array.isArray(parsed)) return [];

      return parsed.map((item) => ({
        productName: item.productName || item.name || "Unknown Product",
        quantity: Number(item.quantity) || 1,
        price: Number(item.price) || 0,
        totalAmount: Number(item.totalAmount) || (Number(item.price || 0) * Number(item.quantity || 1)),
        hsnCode: item.hsnCode || item.hsn || "",
      }));
    };

    // 1. Process Enquiries
    enquiries.forEach((enq) => {
      // Role filtering for non-admin/non-manager
      if (user?.role !== "admin" && user?.role !== "manager") {
        if (enq.assignedTo !== user?.uid && enq.createdBy !== user?.uid) {
          return;
        }
      }

      const orderDate = parseDate(enq.createdAt);
      if (!filterDateRange(orderDate)) return;

      const customerName = enq.customerName || enq.companyDetails?.companyName || "Unknown Customer";
      const contactNumber = enq.contactNumber || enq.companyDetails?.companyMobile || "";
      const email = enq.email || enq.companyDetails?.companyEmail || "";
      const city = enq.city || enq.companyDetails?.companyCity || "";
      const state = enq.state || enq.companyDetails?.companyState || "";
      const companyName = enq.companyDetails?.companyName || "";
      const gstin = enq.companyDetails?.companyGST || "";

      const clientKey = getClientKey(customerName, contactNumber, email);

      if (!clientMap.has(clientKey)) {
        clientMap.set(clientKey, {
          key: clientKey,
          customerName: customerName,
          companyName: companyName,
          contactNumber: contactNumber,
          email: email,
          city: city,
          state: state,
          gstin: gstin,
          totalSpent: 0,
          purchaseCount: 0,
          totalEnquiries: 0,
          firstOrderDate: null,
          lastOrderDate: null,
          paymentModes: {},
          primaryPaymentMode: "N/A",
          purchasedProducts: [],
          orders: [],
        });
      }

      const client = clientMap.get(clientKey)!;
      client.totalEnquiries += 1;

      // Determine if this enquiry is a confirmed purchase/order
      const pStatus = (enq.paymentStatus || "").toLowerCase();
      const status = (enq.status || "").toLowerCase();
      const isPaid = pStatus === "paid" || pStatus === "completed";
      const isApproved = status === "approved" || status === "completed";
      const isPurchase = isPaid || isApproved;
      const amount = Number(enq.finalTotal || enq.value || 0);

      // Only count confirmed purchases in purchaseCount, totalSpent, and purchased orders
      if (isPurchase) {
        client.purchaseCount += 1;
        client.totalSpent += amount;

        // Track Payment Mode
        const mode = enq.paymentSubStatus || enq.paymentType || (isPaid ? "Paid" : "Approved");
        if (mode && mode !== "N/A") {
          client.paymentModes[mode] = (client.paymentModes[mode] || 0) + 1;
        }

        // Dates
        if (!client.firstOrderDate || orderDate < client.firstOrderDate) {
          client.firstOrderDate = orderDate;
        }
        if (!client.lastOrderDate || orderDate > client.lastOrderDate) {
          client.lastOrderDate = orderDate;
        }

        const items = parseItems(enq.materials);

        client.orders.push({
          id: enq.id,
          enqId: enq.enqId,
          date: orderDate,
          status: enq.status || "N/A",
          paymentStatus: enq.paymentStatus || "N/A",
          paymentMode: enq.paymentSubStatus || enq.paymentType || "N/A",
          totalAmount: amount,
          items: items,
          isProformaInvoice: enq.isProformaInvoice || false,
        });
      }
    });

    // 2. Compute aggregated product summaries & primary payment mode for each client
    clientMap.forEach((client) => {
      // Aggregate products
      const productMap = new Map<string, PurchasedProductSummary>();

      client.orders.forEach((order) => {
        order.items.forEach((item) => {
          const pName = item.productName.trim();
          if (!productMap.has(pName)) {
            productMap.set(pName, {
              productName: pName,
              totalQuantity: 0,
              totalAmount: 0,
              orderCount: 0,
              lastPurchasedDate: order.date,
            });
          }
          const pSum = productMap.get(pName)!;
          pSum.totalQuantity += item.quantity;
          pSum.totalAmount += item.totalAmount;
          pSum.orderCount += 1;
          if (!pSum.lastPurchasedDate || order.date > pSum.lastPurchasedDate) {
            pSum.lastPurchasedDate = order.date;
          }
        });
      });

      client.purchasedProducts = Array.from(productMap.values()).sort(
        (a, b) => b.totalAmount - a.totalAmount
      );

      // Primary Payment Mode
      let maxCount = 0;
      let primaryMode = "N/A";
      Object.entries(client.paymentModes).forEach(([mode, count]) => {
        if (count > maxCount) {
          maxCount = count;
          primaryMode = mode;
        }
      });
      client.primaryPaymentMode = primaryMode;

      // Sort orders descending by date
      client.orders.sort((a, b) => b.date.getTime() - a.date.getTime());
    });

    return Array.from(clientMap.values());
  }, [enquiries, bills, user, dateFilter, customStartDate, customEndDate]);

  // Search & Sorting Filter
  const filteredAndSortedClients = useMemo(() => {
    let result = clientReports.filter((client) => {
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      const inName = client.customerName.toLowerCase().includes(q);
      const inCompany = (client.companyName || "").toLowerCase().includes(q);
      const inPhone = client.contactNumber.includes(q);
      const inEmail = client.email.toLowerCase().includes(q);
      const inCity = client.city.toLowerCase().includes(q);
      const inProducts = client.purchasedProducts.some((p) =>
        p.productName.toLowerCase().includes(q)
      );
      return inName || inCompany || inPhone || inEmail || inCity || inProducts;
    });

    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "spent") {
        comparison = b.totalSpent - a.totalSpent;
      } else if (sortBy === "orders") {
        comparison = b.purchaseCount - a.purchaseCount;
      } else if (sortBy === "name") {
        comparison = a.customerName.localeCompare(b.customerName);
      } else if (sortBy === "recent") {
        const timeA = a.lastOrderDate ? a.lastOrderDate.getTime() : 0;
        const timeB = b.lastOrderDate ? b.lastOrderDate.getTime() : 0;
        comparison = timeB - timeA;
      }
      return sortOrder === "asc" ? -comparison : comparison;
    });

    return result;
  }, [clientReports, searchTerm, sortBy, sortOrder]);

  // Overall KPI Metrics
  const totalMetrics = useMemo(() => {
    const totalClients = clientReports.length;
    const totalPurchasingClients = clientReports.filter((c) => c.totalSpent > 0).length;
    const totalRevenue = clientReports.reduce((sum, c) => sum + c.totalSpent, 0);
    const totalOrders = clientReports.reduce((sum, c) => sum + c.purchaseCount, 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      totalClients,
      totalPurchasingClients,
      totalRevenue,
      totalOrders,
      avgOrderValue,
    };
  }, [clientReports]);

  // Top 5 Clients for Chart
  const topClientsChartData = useMemo(() => {
    return [...clientReports]
      .filter((c) => c.totalSpent > 0)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5)
      .map((c) => ({
        name: c.customerName.length > 14 ? `${c.customerName.substring(0, 12)}...` : c.customerName,
        fullName: c.customerName,
        totalSpent: c.totalSpent,
        orders: c.purchaseCount,
      }));
  }, [clientReports]);

  // Top 5 Products Purchased Overall
  const topProductsChartData = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; revenue: number }>();
    clientReports.forEach((c) => {
      c.purchasedProducts.forEach((p) => {
        if (!map.has(p.productName)) {
          map.set(p.productName, { name: p.productName, quantity: 0, revenue: 0 });
        }
        const entry = map.get(p.productName)!;
        entry.quantity += p.totalQuantity;
        entry.revenue += p.totalAmount;
      });
    });

    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((p) => ({
        name: p.name.length > 14 ? `${p.name.substring(0, 12)}...` : p.name,
        fullName: p.name,
        revenue: p.revenue,
        quantity: p.quantity,
      }));
  }, [clientReports]);

  // CSV Export Handler
  const handleExportCSV = () => {
    const headers = [
      "Client Name",
      "Company Name",
      "Contact Number",
      "Email",
      "City",
      "State",
      "Purchase Count",
      "Total Amount Spent (INR)",
      "Primary Payment Mode",
      "Top Products Purchased",
      "First Purchase Date",
      "Last Purchase Date",
    ];

    const rows = filteredAndSortedClients.map((client) => [
      `"${client.customerName.replace(/"/g, '""')}"`,
      `"${(client.companyName || "").replace(/"/g, '""')}"`,
      `"${client.contactNumber}"`,
      `"${client.email}"`,
      `"${client.city}"`,
      `"${client.state}"`,
      client.purchaseCount,
      client.totalSpent.toFixed(2),
      `"${client.primaryPaymentMode}"`,
      `"${client.purchasedProducts.map((p) => `${p.productName} (${p.totalQuantity})`).join("; ")}"`,
      client.firstOrderDate ? client.firstOrderDate.toLocaleDateString("en-IN") : "N/A",
      client.lastOrderDate ? client.lastOrderDate.toLocaleDateString("en-IN") : "N/A",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `client_purchase_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Generate Automatic PDF Report
  const handleGenerateAutomaticPDF = (period: "daily" | "weekly" | "monthly") => {
    const now = new Date();
    let startDate = new Date();
    let periodTitle = "";
    let dateRangeStr = "";

    if (period === "daily") {
      startDate.setHours(0, 0, 0, 0);
      periodTitle = "Daily Business & Enquiry Report";
      dateRangeStr = now.toLocaleDateString("en-IN", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } else if (period === "weekly") {
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      periodTitle = "Weekly Business & Enquiry Report";
      dateRangeStr = `${startDate.toLocaleDateString("en-IN", { day: 'numeric', month: 'short' })} - ${now.toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      periodTitle = "Monthly Business & Enquiry Report";
      dateRangeStr = now.toLocaleDateString("en-IN", { month: 'long', year: 'numeric' });
    }

    // Helper to parse date
    const parseDocDate = (d: any): Date => {
      if (!d) return new Date(0);
      if (typeof d.toDate === "function") return d.toDate();
      if (d instanceof Date) return d;
      return new Date(d);
    };

    // Filter enquiries in date window
    const periodEnquiries = enquiries.filter((e) => {
      const d = parseDocDate(e.createdAt);
      return d >= startDate && d <= now;
    });

    // Filter bills in date window
    const periodBills = bills.filter((b) => {
      const d = parseDocDate(b.billDate || b.createdAt);
      return d >= startDate && d <= now;
    });

    // Calculate metrics
    let totalRevenue = 0;
    periodBills.forEach((b) => {
      totalRevenue += b.totalAmount || 0;
    });

    // Status breakdown
    const statusMap: Record<string, { count: number; totalVal: number }> = {};
    periodEnquiries.forEach((e) => {
      const st = e.status || "Enquiry";
      if (!statusMap[st]) statusMap[st] = { count: 0, totalVal: 0 };
      statusMap[st].count += 1;
      statusMap[st].totalVal += Number(e.value) || 0;
    });

    // Source breakdown
    const sourceMap: Record<string, { count: number; totalVal: number }> = {};
    periodEnquiries.forEach((e) => {
      const src = e.mode || "Direct / Walk-in";
      if (!sourceMap[src]) sourceMap[src] = { count: 0, totalVal: 0 };
      sourceMap[src].count += 1;
      sourceMap[src].totalVal += Number(e.value) || 0;
    });

    // Top products sold / quoted
    const productMap: Record<string, { qty: number; totalVal: number }> = {};
    periodEnquiries.forEach((e) => {
      let materials: any[] = [];
      try {
        if (typeof e.materials === "string") materials = JSON.parse(e.materials);
        else if (Array.isArray(e.materials)) materials = e.materials;
      } catch (err) {}

      materials.forEach((m) => {
        const name = m.productName || "Unknown Product";
        if (!productMap[name]) productMap[name] = { qty: 0, totalVal: 0 };
        productMap[name].qty += Number(m.quantity) || 1;
        productMap[name].totalVal += Number(m.totalAmount || m.price * m.quantity) || 0;
      });
    });

    const topProducts = Object.entries(productMap)
      .sort((a, b) => b[1].totalVal - a[1].totalVal)
      .slice(0, 10);

    const LOGO_URL = "https://ibots.in/wp-content/uploads/2024/07/ibots-logo.png";

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to generate the PDF report.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${periodTitle} - ${dateRangeStr}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px 30px; background: white; color: #1e293b; font-size: 12px; }
            .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #6366f1; padding-bottom: 15px; margin-bottom: 20px; }
            .company-info h2 { font-size: 20px; color: #1e1b4b; font-weight: 800; }
            .company-info p { color: #64748b; font-size: 11px; margin-top: 2px; }
            .report-title-box { text-align: right; }
            .report-title { font-size: 18px; font-weight: 700; color: #4338ca; }
            .report-date { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 4px; }
            
            .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
            .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
            .kpi-label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; }
            .kpi-value { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 4px; }
            
            .section-title { font-size: 13px; font-weight: 700; color: #1e293b; margin: 15px 0 8px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
            
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11px; }
            th { background: #f1f5f9; color: #334155; font-weight: 600; text-align: left; padding: 6px 8px; border: 1px solid #e2e8f0; }
            td { padding: 6px 8px; border: 1px solid #e2e8f0; color: #334155; }
            tr:nth-child(even) td { background: #fafafa; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            
            .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
            
            @media print {
              .no-print { display: none !important; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="text-align: center; margin-bottom: 20px; background: #e0e7ff; padding: 10px; border-radius: 8px;">
            <button onclick="window.print();" style="padding: 8px 20px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; margin-right: 10px;">🖨 Print / Save as PDF</button>
            <button onclick="window.close();" style="padding: 8px 16px; background: #64748b; color: white; border: none; border-radius: 6px; cursor: pointer;">✕ Close</button>
          </div>

          <div class="header-container">
            <div style="display: flex; align-items: center; gap: 12px;">
              <img src="${LOGO_URL}" alt="Logo" style="height: 42px;" onerror="this.style.display='none'" />
              <div class="company-info">
                <h2>Protowiz Private Limited</h2>
                <p>Order Flow & Inventory Management System</p>
              </div>
            </div>
            <div class="report-title-box">
              <div class="report-title">${periodTitle}</div>
              <div class="report-date">${dateRangeStr}</div>
            </div>
          </div>

          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-label">Total Enquiries</div>
              <div class="kpi-value">${periodEnquiries.length}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Invoices / Orders</div>
              <div class="kpi-value">${periodBills.length}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Total Revenue</div>
              <div class="kpi-value" style="color: #16a34a;">₹${totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Conversion Rate</div>
              <div class="kpi-value" style="color: #6366f1;">
                ${periodEnquiries.length > 0 ? ((periodBills.length / periodEnquiries.length) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div>
              <div class="section-title">Enquiry Status Breakdown</div>
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th class="text-center">Count</th>
                    <th class="text-right">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  ${Object.entries(statusMap).length === 0 ? '<tr><td colspan="3" class="text-center">No enquiries in this period</td></tr>' : 
                    Object.entries(statusMap).map(([status, d]) => `
                      <tr>
                        <td><strong>${status}</strong></td>
                        <td class="text-center">${d.count}</td>
                        <td class="text-right">₹${d.totalVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      </tr>
                    `).join('')
                  }
                </tbody>
              </table>
            </div>

            <div>
              <div class="section-title">Source of Enquiry Breakdown</div>
              <table>
                <thead>
                  <tr>
                    <th>Source / Mode</th>
                    <th class="text-center">Leads</th>
                    <th class="text-right">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  ${Object.entries(sourceMap).length === 0 ? '<tr><td colspan="3" class="text-center">No source data</td></tr>' : 
                    Object.entries(sourceMap).map(([src, d]) => `
                      <tr>
                        <td><strong>${src}</strong></td>
                        <td class="text-center">${d.count}</td>
                        <td class="text-right">₹${d.totalVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      </tr>
                    `).join('')
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div class="section-title">Top Products / Materials in This Period</div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product Name</th>
                <th class="text-center">Total Quantity</th>
                <th class="text-right">Total Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${topProducts.length === 0 ? '<tr><td colspan="4" class="text-center">No products recorded in this period</td></tr>' : 
                topProducts.map(([name, data], idx) => `
                  <tr>
                    <td style="width: 30px;">${idx + 1}</td>
                    <td><strong>${name}</strong></td>
                    <td class="text-center">${data.qty}</td>
                    <td class="text-right font-bold">₹${data.totalVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  </tr>
                `).join('')
              }
            </tbody>
          </table>

          <div class="footer">
            <div>Generated automatically by iBots Dashboard on ${new Date().toLocaleString('en-IN')}</div>
            <div>Confidential & Proprietary - Protowiz Private Limited</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
            <Users className="text-purple-600 w-8 h-8" />
            Client & Business Reports
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Automatic Daily, Weekly & Monthly PDF summaries, and complete client purchase history.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl border border-gray-200">
            <button
              onClick={() => handleGenerateAutomaticPDF("daily")}
              className="flex items-center gap-1.5 px-3 py-2 bg-white text-gray-800 hover:text-purple-600 font-semibold rounded-lg shadow-xs transition text-xs"
              title="Generate PDF report for Today"
            >
              <FileText className="w-3.5 h-3.5 text-purple-600" />
              Daily PDF
            </button>
            <button
              onClick={() => handleGenerateAutomaticPDF("weekly")}
              className="flex items-center gap-1.5 px-3 py-2 bg-white text-gray-800 hover:text-indigo-600 font-semibold rounded-lg shadow-xs transition text-xs"
              title="Generate PDF report for Last 7 Days"
            >
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              Weekly PDF
            </button>
            <button
              onClick={() => handleGenerateAutomaticPDF("monthly")}
              className="flex items-center gap-1.5 px-3 py-2 bg-white text-gray-800 hover:text-blue-600 font-semibold rounded-lg shadow-xs transition text-xs"
              title="Generate PDF report for Current Month"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
              Monthly PDF
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl shadow-sm transition-all text-xs"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Clients</p>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">{totalMetrics.totalClients}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{totalMetrics.totalPurchasingClients} with completed purchases</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <IndianRupee className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Client Revenue</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">
              ₹{totalMetrics.totalRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Across all client purchases</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Purchases</p>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">{totalMetrics.totalOrders}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Completed client orders</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Order Value</p>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">
              ₹{totalMetrics.avgOrderValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Per client transaction</p>
          </div>
        </div>
      </div>

      {/* MOM and YOY Values & Volume Comparison Analytics */}
      <ComparisonAnalytics bills={bills} enquiries={enquiries} user={user} />

      {/* Visual Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Clients Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              Top Clients by Spend
            </h3>
            <span className="text-xs text-gray-400 font-medium">Top 5</span>
          </div>
          <div className="h-64">
            {topClientsChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topClientsChartData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6B7280" }} interval={0} angle={-15} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(val: any) => [`₹${Number(val).toLocaleString("en-IN")}`, "Total Spent"]}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Bar dataKey="totalSpent" fill="#8B5CF6" radius={[6, 6, 0, 0]}>
                    {topClientsChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                No purchase data available
              </div>
            )}
          </div>
        </div>

        {/* Top Products Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-600" />
              Top Purchased Products
            </h3>
            <span className="text-xs text-gray-400 font-medium">By Revenue</span>
          </div>
          <div className="h-64">
            {topProductsChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProductsChartData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6B7280" }} interval={0} angle={-15} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(val: any, name: any, item: any) => [
                      `₹${Number(val).toLocaleString("en-IN")} (${item.payload.quantity} qty)`,
                      "Total Revenue",
                    ]}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Bar dataKey="revenue" fill="#3B82F6" radius={[6, 6, 0, 0]}>
                    {topProductsChartData.map((_, index) => (
                      <Cell key={`prod-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                No product purchase data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Search Input */}
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by client name, mobile, email, city, or product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filters & Sorting */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            {/* Date Preset Filter */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg text-xs font-medium text-gray-600">
              <button
                onClick={() => setDateFilter("all")}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${dateFilter === "all" ? "bg-white text-purple-700 shadow-xs" : "hover:text-gray-900"}`}
              >
                All Time
              </button>
              <button
                onClick={() => setDateFilter("this_month")}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${dateFilter === "this_month" ? "bg-white text-purple-700 shadow-xs" : "hover:text-gray-900"}`}
              >
                This Month
              </button>
              <button
                onClick={() => setDateFilter("last_30_days")}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${dateFilter === "last_30_days" ? "bg-white text-purple-700 shadow-xs" : "hover:text-gray-900"}`}
              >
                Last 30 Days
              </button>
              <button
                onClick={() => setDateFilter("custom")}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${dateFilter === "custom" ? "bg-white text-purple-700 shadow-xs" : "hover:text-gray-900"}`}
              >
                Custom
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700">
              <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
              <span>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent border-none text-xs focus:ring-0 cursor-pointer font-semibold text-purple-700"
              >
                <option value="spent">Highest Spend</option>
                <option value="orders">Most Orders</option>
                <option value="recent">Recently Purchased</option>
                <option value="name">Client Name (A-Z)</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                className="ml-1 p-1 hover:bg-gray-200 rounded text-gray-500"
                title={`Sort ${sortOrder === "asc" ? "Descending" : "Ascending"}`}
              >
                {sortOrder === "asc" ? "▲" : "▼"}
              </button>
            </div>
          </div>
        </div>

        {/* Custom Date Range Row */}
        {dateFilter === "custom" && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100 text-xs">
            <span className="text-gray-500 font-medium">From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-200 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            <span className="text-gray-500 font-medium">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-200 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
        )}
      </div>

      {/* Client Summary Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div>
            <h3 className="font-bold text-gray-800 text-base">Client Purchase Summary</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Showing {filteredAndSortedClients.length} client{filteredAndSortedClients.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-3"></div>
            <p className="text-sm">Loading client purchase records...</p>
          </div>
        ) : filteredAndSortedClients.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-medium text-gray-700">No client purchase data found</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your search query or date filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs font-semibold uppercase tracking-wider border-b border-gray-100">
                  <th className="px-6 py-3.5">Client & Contact</th>
                  <th className="px-4 py-3.5 text-center">Orders Count</th>
                  <th className="px-4 py-3.5 text-right">Total Spent</th>
                  <th className="px-6 py-3.5">What All Purchased</th>
                  <th className="px-4 py-3.5 text-center">Payment Mode</th>
                  <th className="px-4 py-3.5 text-center">Last Order</th>
                  <th className="px-4 py-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredAndSortedClients.map((client) => (
                  <tr
                    key={client.key}
                    className="hover:bg-purple-50/40 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedClient(client);
                      setActiveModalTab("products");
                    }}
                  >
                    {/* Client & Contact */}
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                          {client.customerName}
                          {client.companyName && (
                            <span className="text-xs font-normal text-gray-500">({client.companyName})</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
                          {client.contactNumber && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-gray-400" />
                              {client.contactNumber}
                            </span>
                          )}
                          {client.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3 text-gray-400" />
                              {client.email}
                            </span>
                          )}
                          {client.city && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-gray-400" />
                              {client.city}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Orders Count (How many times purchased) */}
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 bg-purple-100 text-purple-700 font-bold rounded-full text-xs">
                        {client.purchaseCount} order{client.purchaseCount === 1 ? "" : "s"}
                      </span>
                    </td>

                    {/* Total Spent (How much purchased) */}
                    <td className="px-4 py-4 text-right">
                      <div className="font-bold text-gray-900">
                        ₹{client.totalSpent.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {client.purchaseCount > 0 && (
                        <div className="text-xs text-gray-400">
                          Avg: ₹{(client.totalSpent / client.purchaseCount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </div>
                      )}
                    </td>

                    {/* What All Purchased */}
                    <td className="px-6 py-4">
                      {client.purchasedProducts.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-w-md">
                          {client.purchasedProducts.slice(0, 3).map((p, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                              title={`${p.productName} - Qty: ${p.totalQuantity} (₹${p.totalAmount.toFixed(0)})`}
                            >
                              <Package className="w-3 h-3 text-gray-400" />
                              <span className="truncate max-w-[130px]">{p.productName}</span>
                              <span className="text-purple-600 font-semibold">x{p.totalQuantity}</span>
                            </span>
                          ))}
                          {client.purchasedProducts.length > 3 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 bg-purple-50 text-purple-600 font-medium rounded text-xs">
                              +{client.purchasedProducts.length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No products recorded</span>
                      )}
                    </td>

                    {/* Primary Payment Mode */}
                    <td className="px-4 py-4 text-center">
                      {client.primaryPaymentMode && client.primaryPaymentMode !== "N/A" ? (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          client.primaryPaymentMode === "GPay"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : client.primaryPaymentMode === "Cash"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                        }`}>
                          <CreditCard className="w-3 h-3" />
                          {client.primaryPaymentMode}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>

                    {/* Last Order Date */}
                    <td className="px-4 py-4 text-center text-xs text-gray-500">
                      {client.lastOrderDate ? (
                        <div>
                          <div>{client.lastOrderDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                          <div className="text-[10px] text-gray-400">{client.lastOrderDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>

                    {/* Action Button */}
                    <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setSelectedClient(client);
                          setActiveModalTab("products");
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-medium transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Client Detailed Drill-down Modal */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/10 rounded-xl">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{selectedClient.customerName}</h2>
                  {selectedClient.companyName && (
                    <p className="text-xs text-purple-100">{selectedClient.companyName}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedClient(null)}
                className="p-1.5 hover:bg-white/20 rounded-full text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Client Info Banner */}
            <div className="bg-purple-50/70 px-6 py-3 border-b border-purple-100 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-gray-700">
                {selectedClient.contactNumber && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-purple-600" />
                    <strong>Phone:</strong> {selectedClient.contactNumber}
                  </span>
                )}
                {selectedClient.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-purple-600" />
                    <strong>Email:</strong> {selectedClient.email}
                  </span>
                )}
                {selectedClient.city && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-purple-600" />
                    <strong>Location:</strong> {selectedClient.city}{selectedClient.state ? `, ${selectedClient.state}` : ""}
                  </span>
                )}
                {selectedClient.gstin && (
                  <span className="flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-purple-600" />
                    <strong>GSTIN:</strong> {selectedClient.gstin}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 bg-white border border-purple-200 rounded-md font-bold text-purple-700">
                  Total: ₹{selectedClient.totalSpent.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
                <span className="px-2.5 py-1 bg-purple-600 text-white rounded-md font-bold">
                  {selectedClient.purchaseCount} Purchase{selectedClient.purchaseCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-gray-200 px-6 bg-gray-50">
              <button
                onClick={() => setActiveModalTab("products")}
                className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
                  activeModalTab === "products"
                    ? "border-purple-600 text-purple-700 bg-white"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Package className="w-4 h-4" />
                What All Purchased ({selectedClient.purchasedProducts.length} items)
              </button>
              <button
                onClick={() => setActiveModalTab("orders")}
                className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
                  activeModalTab === "orders"
                    ? "border-purple-600 text-purple-700 bg-white"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <FileText className="w-4 h-4" />
                Order & Purchase History ({selectedClient.orders.length})
              </button>
            </div>

            {/* Modal Content Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {/* Tab 1: What All Purchased */}
              {activeModalTab === "products" && (
                <div>
                  <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-purple-600" />
                    Complete Breakdown of Purchased Products
                  </h4>

                  {selectedClient.purchasedProducts.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      No item-level product data recorded for this client.
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-gray-600 text-xs font-semibold uppercase border-b border-gray-200">
                            <th className="px-4 py-3">Product Name</th>
                            <th className="px-4 py-3 text-center">Total Qty Bought</th>
                            <th className="px-4 py-3 text-right">Avg Unit Price</th>
                            <th className="px-4 py-3 text-right">Total Spend</th>
                            <th className="px-4 py-3 text-center">Times Ordered</th>
                            <th className="px-4 py-3 text-center">Last Purchased</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {selectedClient.purchasedProducts.map((p, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-semibold text-gray-800">
                                {p.productName}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-700 font-bold rounded text-xs">
                                  {p.totalQuantity}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-gray-600">
                                ₹{(p.totalQuantity > 0 ? p.totalAmount / p.totalQuantity : 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-gray-900">
                                ₹{p.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-3 text-center text-xs text-gray-500">
                                {p.orderCount} order{p.orderCount === 1 ? "" : "s"}
                              </td>
                              <td className="px-4 py-3 text-center text-xs text-gray-500">
                                {p.lastPurchasedDate ? p.lastPurchasedDate.toLocaleDateString("en-IN") : "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Order & Transaction History */}
              {activeModalTab === "orders" && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-purple-600" />
                    Chronological Order History
                  </h4>

                  {selectedClient.orders.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      No order transactions found.
                    </div>
                  ) : (
                    selectedClient.orders.map((order, idx) => (
                      <div
                        key={idx}
                        className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-purple-700 text-sm">
                              {order.enqId || order.invoiceNumber || `Order #${idx + 1}`}
                            </span>
                            <span className="text-xs text-gray-400">•</span>
                            <span className="text-xs text-gray-500">
                              {order.date.toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}{" "}
                              at {order.date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Payment Mode Badge */}
                            {order.paymentMode && order.paymentMode !== "N/A" && (
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-semibold flex items-center gap-1">
                                <CreditCard className="w-3 h-3" />
                                {order.paymentMode}
                              </span>
                            )}

                            {/* Payment Status Badge */}
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              order.paymentStatus === "Paid"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {order.paymentStatus}
                            </span>

                            {/* Order Amount */}
                            <span className="font-bold text-gray-900 text-sm ml-2">
                              ₹{order.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        {/* Order Items Table */}
                        {order.items.length > 0 && (
                          <div className="bg-gray-50 rounded-lg p-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                              Items in this order:
                            </p>
                            <div className="space-y-1 text-xs">
                              {order.items.map((item, iIdx) => (
                                <div key={iIdx} className="flex justify-between items-center text-gray-700 py-0.5 border-b border-gray-100 last:border-none">
                                  <span className="font-medium">{item.productName}</span>
                                  <div className="flex items-center gap-3">
                                    <span className="text-gray-500">Qty: {item.quantity} × ₹{item.price.toFixed(2)}</span>
                                    <span className="font-bold text-gray-900 w-20 text-right">₹{item.totalAmount.toFixed(2)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setSelectedClient(null)}
                className="px-5 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
