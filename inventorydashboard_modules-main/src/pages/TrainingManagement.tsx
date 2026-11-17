import React, { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../App";
import * as XLSX from 'xlsx';
import { 
  Eye, 
  Edit, 
  Trash2, 
  CreditCard, 
  Bell, 
  Download,
  Search,
  Filter,
  SortAsc,
  SortDesc,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  IndianRupee,
  User,
  Mail,
  Phone,
  Briefcase,
  GraduationCap,
  MapPin,
  Clock,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

interface Employee {
  id: string;
  employeeName: string;
  role: string;
}

interface TrainingData {
  id?: string;
  enqId: string;
  enqDate: Date;
  modeOfEnq: string;
  staffName?: string;
  pr: string;
  prId: string;
  handledBy: string;
  handledById: string;
  name: string;
  age: number;
  phoneNo: string;
  gender: string;
  email: string;
  profession: string;
  schoolCollege?: string;
  stdDept?: string;
  institutionCompany?: string;
  designation?: string;
  otherDesc?: string;
  programMode: string;
  course: string;
  courseDuration: string;
  preferredMode: string;
  demoSessionDate: Date;
  trainer: string;
  trainerId: string;
  subTrainer: string;
  enqStatus: string;
  remarks: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  payment?: PaymentData;
}

interface PaymentData {
  preferredCourse: string;
  courseFees: string;
  discount: string;
  batchTiming: string;
  startDate: Date;
  paymentStatus: string;
  paidAmount: string;
  paymentMode: string;
  paymentDate: Date;
  updatedAt?: Timestamp;
}

const TrainingManagement: React.FC = () => {
  const { user } = useAuth();
  const [trainings, setTrainings] = useState<TrainingData[]>([]);
  const [filteredTrainings, setFilteredTrainings] = useState<TrainingData[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedTraining, setSelectedTraining] = useState<TrainingData | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentData | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [professionFilter, setProfessionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState('enqId');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'enqId', 'enqDate', 'name', 'course', 'enqStatus'
  ]);
  const [formData, setFormData] = useState<Partial<TrainingData>>({
    modeOfEnq: '',
    profession: '',
    programMode: '',
    course: '',
    preferredMode: '',
    enqStatus: 'Follow-up',
    gender: '',
  });
  const [paymentData, setPaymentData] = useState<Partial<PaymentData>>({
    paymentStatus: 'Pending',
    paymentMode: 'Cash',
    batchTiming: '10AM-12PM',
  });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, professionFilter, statusFilter, itemsPerPage]);

  const columns = [
    { id: 'enqId', label: 'Enquiry ID', icon: <Hash className="w-4 h-4" /> },
    { id: 'enqDate', label: 'Enquiry Date', icon: <Calendar className="w-4 h-4" /> },
    { id: 'name', label: 'Name', icon: <User className="w-4 h-4" /> },
    { id: 'phoneNo', label: 'Phone', icon: <Phone className="w-4 h-4" /> },
    { id: 'email', label: 'Email', icon: <Mail className="w-4 h-4" /> },
    { id: 'course', label: 'Course', icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'programMode', label: 'Program Mode', icon: <Briefcase className="w-4 h-4" /> },
    { id: 'enqStatus', label: 'Status', icon: <AlertCircle className="w-4 h-4" /> },
    { id: 'profession', label: 'Profession', icon: <Briefcase className="w-4 h-4" /> },
  ];

  useEffect(() => {
    fetchTrainings();
    fetchEmployees();
  }, []);

  useEffect(() => {
    filterAndSortTrainings();
  }, [trainings, searchTerm, professionFilter, statusFilter, sortField, sortDirection]);

  const fetchTrainings = async () => {
    try {
      const q = query(collection(db, "training"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          enqDate: data.enqDate?.toDate(),
          demoSessionDate: data.demoSessionDate?.toDate(),
          payment: data.payment ? {
            ...data.payment,
            startDate: data.payment.startDate?.toDate(),
            paymentDate: data.payment.paymentDate?.toDate(),
          } : undefined,
        };
      }) as TrainingData[];
      setTrainings(data);
    } catch (error) {
      console.error("Error fetching trainings:", error);
    }
  };

  const fetchEmployees = async () => {
    try {
      const q = query(
        collection(db, "employees"), 
        where("role", "in", ["staff", "manager"])
      );
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Employee[];
      setEmployees(data);
    } catch (error) {
      console.error("Error fetching employees:", error);
    }
  };

  const generateEnqId = () => {
    const lastTraining = trainings[0];
    if (!lastTraining) return "IBT1";
    
    const lastNumber = parseInt(lastTraining.enqId.replace("IBT", ""));
    return `IBT${lastNumber + 1}`;
  };

  const filterAndSortTrainings = () => {
    let filtered = [...trainings];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(t => 
        t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.phoneNo?.includes(searchTerm)
      );
    }

    // Profession filter
    if (professionFilter) {
      filtered = filtered.filter(t => t.profession === professionFilter);
    }

    // Status filter
    if (statusFilter) {
      filtered = filtered.filter(t => t.enqStatus === statusFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal = a[sortField as keyof TrainingData];
      let bVal = b[sortField as keyof TrainingData];

      if (sortField === 'enqDate') {
        aVal = a.enqDate?.getTime() || 0;
        bVal = b.enqDate?.getTime() || 0;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      
      return sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    setFilteredTrainings(filtered);
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const trainingData = {
        ...formData,
        enqId: editingId ? formData.enqId : generateEnqId(),
        enqDate: Timestamp.fromDate(new Date(formData.enqDate || new Date())),
        demoSessionDate: Timestamp.fromDate(new Date(formData.demoSessionDate || new Date())),
        createdBy: user.uid,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      if (editingId) {
        const docRef = doc(db, "training", editingId);
        await updateDoc(docRef, trainingData);
      } else {
        await addDoc(collection(db, "training"), trainingData);
      }

      setShowForm(false);
      setEditingId(null);
      setFormData({});
      fetchTrainings();
    } catch (error) {
      console.error("Error saving training:", error);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTraining?.id) return;

    try {
      const paymentDataWithTimestamp = {
        ...paymentData,
        paymentDate: Timestamp.fromDate(new Date(paymentData.paymentDate || new Date())),
        startDate: Timestamp.fromDate(new Date(paymentData.startDate || new Date())),
        updatedAt: Timestamp.now(),
      };

      const docRef = doc(db, "training", selectedTraining.id);
      await updateDoc(docRef, {
        payment: paymentDataWithTimestamp,
        updatedAt: Timestamp.now(),
      });

      setShowPaymentForm(false);
      setSelectedPayment(null);
      fetchTrainings();
    } catch (error) {
      console.error("Error saving payment:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(user.role==="admin")) return;
    
    if (window.confirm("Are you sure you want to delete this training?")) {
      try {
        await deleteDoc(doc(db, "training", id));
        fetchTrainings();
      } catch (error) {
        console.error("Error deleting training:", error);
      }
    }
  };

  const checkReminder = (training: TrainingData) => {
    if (!training.payment) return false;
    if (training.payment.paymentStatus !== 'Pending') return false;
    if (training.programMode !== 'Regular') return false;

    const paymentDate = training.payment.paymentDate;
    if (!paymentDate) return false;

    const today = new Date();
    const nextMonth = new Date(paymentDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(nextMonth.getDate() - 2);

    return today >= nextMonth;
  };

  const handleMakePayment = async (training: TrainingData) => {
    if (!training.id) return;

    try {
      const docRef = doc(db, "training", training.id);
      await updateDoc(docRef, {
        'payment.paymentDate': Timestamp.fromDate(new Date()),
        'payment.paymentStatus': 'Pending',
        updatedAt: Timestamp.now(),
      });
      fetchTrainings();
    } catch (error) {
      console.error("Error updating payment:", error);
    }
  };

  const exportToExcel = () => {
    const exportData = filteredTrainings.map(t => {
      const row: any = {};
      selectedColumns.forEach(col => {
        if (col === 'enqDate') {
          row[col] = t.enqDate?.toLocaleDateString();
        } else {
          row[col] = t[col as keyof TrainingData];
        }
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Trainings");
    XLSX.writeFile(wb, `trainings_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const totalPages = Math.max(1, Math.ceil(filteredTrainings.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredTrainings.length);
  const currentTrainings = filteredTrainings.slice(startIndex, endIndex);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#119ED0] via-[#087EBC] to-[#066597] bg-clip-text text-transparent mb-4 md:mb-0">
              Training Management System
            </h1>
            <button
              onClick={() => {
                setFormData({});
                setEditingId(null);
                setShowForm(true);
              }}
              className="px-6 py-3 bg-gradient-to-r from-[#119ED0] via-[#087EBC] to-[#066597] text-white rounded-xl hover:from-[#087EBC] hover:to-[#066597] transition-all transform hover:scale-105 shadow-lg flex items-center gap-2"
            >
              <span className="text-lg">+</span> Add New Training
            </button>
          </div>
        </div>

        {/* Filters and Controls */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by name, email, phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Profession Filter */}
            <select
              value={professionFilter}
              onChange={(e) => setProfessionFilter(e.target.value)}
              className="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Professions</option>
              <option value="Student">Student</option>
              <option value="Working">Working</option>
              <option value="Others">Others</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="Follow-up">Follow-up</option>
              <option value="Interested">Interested</option>
              <option value="Not Interested">Not Interested</option>
            </select>

            {/* Export and Column Selector */}
            <div className="flex gap-2">
              <button
                onClick={exportToExcel}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" /> Export
              </button>
              <button
                onClick={() => setShowColumnSelector(!showColumnSelector)}
                className="px-4 py-3 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-all relative"
              >
                <Filter className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Column Selector Dropdown */}
          {showColumnSelector && (
            <div className="mt-4 p-4 border border-gray-200 rounded-xl bg-gray-50">
              <h3 className="font-semibold mb-3">Select Columns to Export</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {columns.map(col => (
                  <label key={col.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedColumns.includes(col.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedColumns([...selectedColumns, col.id]);
                        } else {
                          setSelectedColumns(selectedColumns.filter(c => c !== col.id));
                        }
                      }}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm">{col.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                <tr>
                  {columns.filter(col => selectedColumns.includes(col.id)).map(col => (
                    <th
                      key={col.id}
                      onClick={() => handleSort(col.id)}
                      className="px-6 py-4 text-left text-sm font-semibold text-gray-600 cursor-pointer hover:bg-gray-200 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {col.icon}
                        {col.label}
                        {sortField === col.id && (
                          sortDirection === 'asc' ? 
                            <SortAsc className="w-4 h-4" /> : 
                            <SortDesc className="w-4 h-4" />
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {currentTrainings.map((training) => (
                  <tr 
                    key={training.id} 
                    className={`hover:bg-gray-50 transition-colors ${
                      checkReminder(training) ? 'bg-red-300' : ''
                    }`}
                  >
                    {selectedColumns.includes('enqId') && (
                      <td className="px-6 py-4">
                        <span className="font-medium text-gray-900">{training.enqId}</span>
                      </td>
                    )}
                    {selectedColumns.includes('enqDate') && (
                      <td className="px-6 py-4 text-gray-600">
                        {training.enqDate?.toLocaleDateString()}
                      </td>
                    )}
                    {selectedColumns.includes('name') && (
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{training.name}</div>
                      </td>
                    )}
                    {selectedColumns.includes('phoneNo') && (
                      <td className="px-6 py-4 text-gray-600">{training.phoneNo}</td>
                    )}
                    {selectedColumns.includes('email') && (
                      <td className="px-6 py-4 text-gray-600">{training.email}</td>
                    )}
                    {selectedColumns.includes('course') && (
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                          {training.course}
                        </span>
                      </td>
                    )}
                    {selectedColumns.includes('programMode') && (
                      <td className="px-6 py-4 text-gray-600">{training.programMode}</td>
                    )}
                    {selectedColumns.includes('enqStatus') && (
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-sm ${
                          training.enqStatus === 'Interested' ? 'bg-green-100 text-green-800' :
                          training.enqStatus === 'Not Interested' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {training.enqStatus}
                        </span>
                      </td>
                    )}
                    {selectedColumns.includes('profession') && (
                      <td className="px-6 py-4 text-gray-600">{training.profession}</td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedTraining(training);
                            setShowDetails(true);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            setFormData(training);
                            setEditingId(training.id || null);
                            setShowForm(true);
                          }}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                        {user.role==="admin" && (
                          <button
                            onClick={() => handleDelete(training.id!)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelectedTraining(training);
                            setPaymentData(training.payment || {});
                            setShowPaymentForm(true);
                          }}
                          className="p-2 text-[#087EBC] hover:bg-blue-50 rounded-lg transition-colors"
                          title="Payment"
                        >
                          <CreditCard className="w-5 h-5" />
                        </button>
                        {checkReminder(training) && (
                          <button
                            onClick={() => handleMakePayment(training)}
                            className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors animate-pulse"
                            title="Make Payment"
                          >
                            <Bell className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Controls */}
          {filteredTrainings.length > 0 && (
            <div className="p-4 border-t border-gray-150 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm">
              <div className="text-gray-500 font-medium">
                Showing <span className="font-semibold text-gray-900">{startIndex + 1}</span> to{" "}
                <span className="font-semibold text-gray-900">{endIndex}</span> of{" "}
                <span className="font-semibold text-gray-900">{filteredTrainings.length}</span> entries
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-xl text-gray-700 bg-white hover:bg-gray-50 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold shadow-2xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((page) => {
                      if (totalPages <= 5) return true;
                      if (page === 1 || page === totalPages) return true;
                      return Math.abs(page - currentPage) <= 1;
                    })
                    .map((page, idx, arr) => {
                      const prevPage = arr[idx - 1];
                      const showEllipsis = prevPage && page - prevPage > 1;

                      return (
                        <React.Fragment key={page}>
                          {showEllipsis && (
                            <span className="px-1 text-gray-400 font-bold">...</span>
                          )}
                          <button
                            onClick={() => setCurrentPage(page)}
                            className={`w-8 h-8 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center ${
                              currentPage === page
                                ? "bg-blue-600 text-white shadow-xs"
                                : "text-gray-700 hover:bg-gray-100 bg-white border border-gray-200"
                            }`}
                          >
                            {page}
                          </button>
                        </React.Fragment>
                      );
                    })}
                </div>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-xl text-gray-700 bg-white hover:bg-gray-50 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold shadow-2xs"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Training Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-gradient-to-r from-[#119ED0] via-[#087EBC] to-[#066597] text-white p-6 rounded-t-2xl">
                <h2 className="text-2xl font-bold">{editingId ? 'Edit' : 'Add'} Training</h2>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-8">
                {/* Enquiry Details */}
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-gray-800 border-b pb-2">Enquiry Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Enquiry ID</label>
                      <input
                        type="text"
                        value={editingId ? formData.enqId || '' : generateEnqId()}
                        disabled
                        className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-600"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Enquiry Date</label>
                      <input
                        type="date"
                        required
                        value={formData.enqDate ? new Date(formData.enqDate).toISOString().split('T')[0] : ''}
                        onChange={(e) => setFormData({...formData, enqDate: new Date(e.target.value)})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Mode of Enquiry</label>
                      <select
                        required
                        value={formData.modeOfEnq}
                        onChange={(e) => setFormData({...formData, modeOfEnq: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Mode</option>
                        <option value="Walk-In">Walk-In</option>
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="Instagram">Instagram</option>
                        <option value="Reference">Reference</option>
                        <option value="Ibots Store">Ibots Store</option>
                        <option value="Founder">Founder</option>
                        <option value="Staff">Staff</option>
                        <option value="Others">Others</option>
                      </select>
                    </div>
                    {formData.modeOfEnq === 'Staff' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Staff Name</label>
                        <input
                          type="text"
                          required
                          value={formData.staffName || ''}
                          onChange={(e) => setFormData({...formData, staffName: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">PR</label>
                      <select
                        required
                        value={formData.prId}
                        onChange={(e) => {
                          const selectedEmp = employees.find(emp => emp.id === e.target.value);
                          setFormData({
                            ...formData, 
                            prId: e.target.value,
                            pr: selectedEmp?.employeeName || ''
                          });
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select PR</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.employeeName}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Handled By</label>
                      <select
                        required
                        value={formData.handledById}
                        onChange={(e) => {
                          const selectedEmp = employees.find(emp => emp.id === e.target.value);
                          setFormData({
                            ...formData, 
                            handledById: e.target.value,
                            handledBy: selectedEmp?.employeeName || ''
                          });
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Handler</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.employeeName}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Personal Details */}
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-gray-800 border-b pb-2">Personal Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                      <input
                        type="text"
                        required
                        value={formData.name || ''}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Age</label>
                      <input
                        type="number"
                        required
                        value={formData.age || ''}
                        onChange={(e) => setFormData({...formData, age: parseInt(e.target.value)})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Phone No</label>
                      <input
                        type="tel"
                        required
                        value={formData.phoneNo || ''}
                        onChange={(e) => setFormData({...formData, phoneNo: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                      <select
                        required
                        value={formData.gender}
                        onChange={(e) => setFormData({...formData, gender: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                      <input
                        type="email"
                        required
                        value={formData.email || ''}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Profession</label>
                      <select
                        required
                        value={formData.profession}
                        onChange={(e) => setFormData({...formData, profession: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Profession</option>
                        <option value="Student">Student</option>
                        <option value="Working">Working</option>
                        <option value="Others">Others</option>
                      </select>
                    </div>
                  </div>

                  {/* Dynamic fields based on profession */}
                  {formData.profession === 'Student' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">School/College Name</label>
                        <input
                          type="text"
                          required
                          value={formData.schoolCollege || ''}
                          onChange={(e) => setFormData({...formData, schoolCollege: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Std/Dept</label>
                        <input
                          type="text"
                          required
                          value={formData.stdDept || ''}
                          onChange={(e) => setFormData({...formData, stdDept: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}

                  {formData.profession === 'Working' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Institution/Company Name</label>
                        <input
                          type="text"
                          required
                          value={formData.institutionCompany || ''}
                          onChange={(e) => setFormData({...formData, institutionCompany: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Designation</label>
                        <input
                          type="text"
                          required
                          value={formData.designation || ''}
                          onChange={(e) => setFormData({...formData, designation: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}

                  {formData.profession === 'Others' && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                      <textarea
                        required
                        value={formData.otherDesc || ''}
                        onChange={(e) => setFormData({...formData, otherDesc: e.target.value})}
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>

                {/* Program Details */}
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-gray-800 border-b pb-2">Program Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Mode</label>
                      <select
                        required
                        value={formData.programMode}
                        onChange={(e) => setFormData({...formData, programMode: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Mode</option>
                        <option value="Intern">Intern</option>
                        <option value="Regular">Regular</option>
                        <option value="Summer">Summer</option>
                        <option value="Winter">Winter</option>
                        <option value="Workshop">Workshop</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Course</label>
                      <select
                        required
                        value={formData.course}
                        onChange={(e) => setFormData({...formData, course: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Course</option>
                        <option value="Electronics">Electronics</option>
                        <option value="Embedded">Embedded</option>
                        <option value="Iot">Iot</option>
                        <option value="Robotics">Robotics</option>
                        <option value="Drone">Drone</option>
                        <option value="Ev">Ev</option>
                        <option value="AI with RPI">AI with RPI</option>
                        <option value="Mechatronics">Mechatronics</option>
                        <option value="others">others</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Course Duration</label>
                      <input
                        type="text"
                        required
                        value={formData.courseDuration || ''}
                        onChange={(e) => setFormData({...formData, courseDuration: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Mode</label>
                      <select
                        required
                        value={formData.preferredMode}
                        onChange={(e) => setFormData({...formData, preferredMode: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Mode</option>
                        <option value="online">Online</option>
                        <option value="offline">Offline</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Demo Session Date</label>
                      <input
                        type="date"
                        required
                        value={formData.demoSessionDate ? new Date(formData.demoSessionDate).toISOString().split('T')[0] : ''}
                        onChange={(e) => setFormData({...formData, demoSessionDate: new Date(e.target.value)})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Trainer</label>
                      <select
                        required
                        value={formData.trainerId}
                        onChange={(e) => {
                          const selectedEmp = employees.find(emp => emp.id === e.target.value);
                          setFormData({
                            ...formData, 
                            trainerId: e.target.value,
                            trainer: selectedEmp?.employeeName || ''
                          });
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Trainer</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.employeeName}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Sub Trainer</label>
                      <input
                        type="text"
                        value={formData.subTrainer || ''}
                        onChange={(e) => setFormData({...formData, subTrainer: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Enquiry Status</label>
                      <select
                        required
                        value={formData.enqStatus}
                        onChange={(e) => setFormData({...formData, enqStatus: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Follow-up">Follow-up</option>
                        <option value="Interested">Interested</option>
                        <option value="Not Interested">Not Interested</option>
                      </select>
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
                      <textarea
                        value={formData.remarks || ''}
                        onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex gap-4 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-[#119ED0] via-[#087EBC] to-[#066597] text-white rounded-xl hover:from-[#087EBC] hover:to-[#066597] transition-all font-semibold"
                  >
                    {editingId ? 'Update' : 'Save'} Training
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                      setFormData({});
                    }}
                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-all font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Payment Form Modal */}
        {showPaymentForm && selectedTraining && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full">
              <div className="sticky top-0 bg-gradient-to-r from-[#119ED0] via-[#087EBC] to-[#066597] text-white p-6 rounded-t-2xl">
                <h2 className="text-2xl font-bold">Payment Details - {selectedTraining.name}</h2>
              </div>
              
              <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Course</label>
                    <select
                      required
                      value={paymentData.preferredCourse || selectedTraining.course}
                      onChange={(e) => setPaymentData({...paymentData, preferredCourse: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#087EBC]"
                    >
                      <option value="">Select Course</option>
                      <option value="Electronics">Electronics</option>
                      <option value="Embedded">Embedded</option>
                      <option value="Iot">Iot</option>
                      <option value="Robotics">Robotics</option>
                      <option value="Drone">Drone</option>
                      <option value="Ev">Ev</option>
                      <option value="AI with RPI">AI with RPI</option>
                      <option value="Mechatronics">Mechatronics</option>
                      <option value="others">others</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Course Fees</label>
                    <input
                      type="text"
                      required
                      value={paymentData.courseFees || ''}
                      onChange={(e) => setPaymentData({...paymentData, courseFees: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#087EBC]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Discount</label>
                    <input
                      type="text"
                      value={paymentData.discount || ''}
                      onChange={(e) => setPaymentData({...paymentData, discount: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#087EBC]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Batch Timing</label>
                    <select
                      required
                      value={paymentData.batchTiming}
                      onChange={(e) => setPaymentData({...paymentData, batchTiming: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#087EBC]"
                    >
                      <option value="10AM-12PM">10AM - 12PM</option>
                      <option value="12PM-2PM">12PM - 2PM</option>
                      <option value="2PM-4PM">2PM - 4PM</option>
                      <option value="4PM-6PM">4PM - 6PM</option>
                      <option value="6PM-8PM">6PM - 8PM</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                    <input
                      type="date"
                      required
                      value={paymentData.startDate ? new Date(paymentData.startDate).toISOString().split('T')[0] : ''}
                      onChange={(e) => setPaymentData({...paymentData, startDate: new Date(e.target.value)})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#087EBC]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Payment Status</label>
                    <select
                      required
                      value={paymentData.paymentStatus}
                      onChange={(e) => setPaymentData({...paymentData, paymentStatus: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#087EBC]"
                    >
                      <option value="Pending">Pending</option>
                      <option value="Paid">Paid</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Paid Amount</label>
                    <input
                      type="text"
                      required
                      value={paymentData.paidAmount || ''}
                      onChange={(e) => setPaymentData({...paymentData, paidAmount: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#087EBC]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Payment Mode</label>
                    <select
                      required
                      value={paymentData.paymentMode}
                      onChange={(e) => setPaymentData({...paymentData, paymentMode: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#087EBC]"
                    >
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Payment Date</label>
                    <input
                      type="date"
                      required
                      value={paymentData.paymentDate ? new Date(paymentData.paymentDate).toISOString().split('T')[0] : ''}
                      onChange={(e) => setPaymentData({...paymentData, paymentDate: new Date(e.target.value)})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#087EBC]"
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-[#119ED0] via-[#087EBC] to-[#066597] text-white rounded-xl hover:from-[#087EBC] hover:to-[#066597] transition-all font-semibold"
                  >
                    Save Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPaymentForm(false);
                      setSelectedPayment(null);
                    }}
                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-all font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Details View Modal */}
        {showDetails && selectedTraining && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-gradient-to-r from-[#119ED0] via-[#087EBC] to-[#066597] text-white p-6 rounded-t-2xl flex justify-between items-center">
                <h2 className="text-2xl font-bold">Training Details - {selectedTraining.enqId}</h2>
                <button
                  onClick={() => setShowDetails(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Enquiry Details */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Enquiry Details</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <DetailItem label="Enquiry ID" value={selectedTraining.enqId} />
                    <DetailItem label="Enquiry Date" value={selectedTraining.enqDate?.toLocaleDateString()} />
                    <DetailItem label="Mode of Enquiry" value={selectedTraining.modeOfEnq} />
                    {selectedTraining.staffName && (
                      <DetailItem label="Staff Name" value={selectedTraining.staffName} />
                    )}
                    <DetailItem label="PR" value={selectedTraining.pr} />
                    <DetailItem label="Handled By" value={selectedTraining.handledBy} />
                  </div>
                </div>

                {/* Personal Details */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Personal Details</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <DetailItem label="Name" value={selectedTraining.name} />
                    <DetailItem label="Age" value={selectedTraining.age?.toString()} />
                    <DetailItem label="Phone" value={selectedTraining.phoneNo} />
                    <DetailItem label="Gender" value={selectedTraining.gender} />
                    <DetailItem label="Email" value={selectedTraining.email} />
                    <DetailItem label="Profession" value={selectedTraining.profession} />
                    {selectedTraining.profession === 'Student' && (
                      <>
                        <DetailItem label="School/College" value={selectedTraining.schoolCollege} />
                        <DetailItem label="Std/Dept" value={selectedTraining.stdDept} />
                      </>
                    )}
                    {selectedTraining.profession === 'Working' && (
                      <>
                        <DetailItem label="Company" value={selectedTraining.institutionCompany} />
                        <DetailItem label="Designation" value={selectedTraining.designation} />
                      </>
                    )}
                    {selectedTraining.profession === 'Others' && (
                      <DetailItem label="Description" value={selectedTraining.otherDesc} />
                    )}
                  </div>
                </div>

                {/* Program Details */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Program Details</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <DetailItem label="Program Mode" value={selectedTraining.programMode} />
                    <DetailItem label="Course" value={selectedTraining.course} />
                    <DetailItem label="Duration" value={selectedTraining.courseDuration} />
                    <DetailItem label="Preferred Mode" value={selectedTraining.preferredMode} />
                    <DetailItem label="Demo Date" value={selectedTraining.demoSessionDate?.toLocaleDateString()} />
                    <DetailItem label="Trainer" value={selectedTraining.trainer} />
                    <DetailItem label="Sub Trainer" value={selectedTraining.subTrainer} />
                    <DetailItem label="Status" value={selectedTraining.enqStatus} />
                    <DetailItem label="Remarks" value={selectedTraining.remarks} className="col-span-2" />
                  </div>
                </div>

                {/* Payment Details */}
                {selectedTraining.payment && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Payment Details</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <DetailItem label="Preferred Course" value={selectedTraining.payment.preferredCourse} />
                      <DetailItem label="Course Fees" value={selectedTraining.payment.courseFees} />
                      <DetailItem label="Discount" value={selectedTraining.payment.discount} />
                      <DetailItem label="Batch Timing" value={selectedTraining.payment.batchTiming} />
                      <DetailItem label="Start Date" value={selectedTraining.payment.startDate?.toLocaleDateString()} />
                      <DetailItem label="Payment Status" value={selectedTraining.payment.paymentStatus} />
                      <DetailItem label="Paid Amount" value={selectedTraining.payment.paidAmount} />
                      <DetailItem label="Payment Mode" value={selectedTraining.payment.paymentMode} />
                      <DetailItem label="Payment Date" value={selectedTraining.payment.paymentDate?.toLocaleDateString()} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const DetailItem: React.FC<{ label: string; value?: string; className?: string }> = ({ label, value, className }) => (
  <div className={className}>
    <p className="text-sm text-gray-500">{label}</p>
    <p className="font-medium text-gray-900">{value || 'N/A'}</p>
  </div>
);

const Hash: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
  </svg>
);

export default TrainingManagement;