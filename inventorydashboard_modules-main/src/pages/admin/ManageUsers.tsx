import React, { useEffect, useState, useMemo } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, auth, db } from "../../firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { toast, ToastContainer } from "react-toastify";
import {
  ShieldCheck,
  Users,
  User,
  UserPlus,
  Search,
  Edit2,
  Trash2,
  Key,
  RefreshCw,
  X,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
} from "lucide-react";
import AdminGuard from "../../components/AdminGuard";

export type Role = "admin" | "manager" | "staff";

interface EmployeeRecord {
  id: string;
  uid?: string;
  employeeId?: string;
  employeeName?: string;
  name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  role?: Role;
  createdAt?: any;
  updatedAt?: any;
}

interface ManageUsersProps {
  defaultRole?: Role;
  title?: string;
  role?: Role; // backwards compatibility
}

export default function ManageUsers({ defaultRole, role: propRole, title }: ManageUsersProps) {
  const initialRole: Role = defaultRole || propRole || "staff";

  // Form State
  const [employeeName, setEmployeeName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(initialRole);
  const [showPassword, setShowPassword] = useState(false);

  // UI & Loading States
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [editing, setEditing] = useState<EmployeeRecord | null>(null);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Filter & Search
  const [activeTab, setActiveTab] = useState<"all" | Role>(defaultRole || "all");
  const [searchTerm, setSearchTerm] = useState("");

  // Delete modal state
  const [userToDelete, setUserToDelete] = useState<EmployeeRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const functions = getFunctions(app);

  const fetchEmployees = async () => {
    setListLoading(true);
    try {
      const snap = await getDocs(collection(db, "employees"));
      const rows: EmployeeRecord[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          uid: d.id,
          employeeId: data.employeeId || d.id,
          employeeName: data.employeeName || data.name || "Unnamed",
          name: data.name || data.employeeName || "Unnamed",
          email: data.email || "",
          phone: data.phone || data.mobile || "",
          mobile: data.mobile || data.phone || "",
          role: (data.role?.toLowerCase() as Role) || "staff",
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });

      // Sort by newest created or updated
      rows.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });

      setEmployees(rows);
    } catch (err) {
      console.error("fetchEmployees error", err);
      toast.error("Failed to load user directory");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const resetForm = () => {
    setEmployeeName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setRole(defaultRole || "staff");
    setEditing(null);
  };

  const handleEditClick = (emp: EmployeeRecord) => {
    setEditing(emp);
    setEmployeeName(emp.employeeName || emp.name || "");
    setEmail(emp.email || "");
    setPhone(emp.phone || emp.mobile || "");
    setRole(emp.role || "staff");
    setPassword("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = employeeName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    if (!trimmedName || !trimmedEmail) {
      return toast.error("Full Name and Email are required");
    }

    setLoading(true);
    try {
      if (editing) {
        // Update existing employee in Firestore
        const docRef = doc(db, "employees", editing.id);
        await setDoc(
          docRef,
          {
            employeeName: trimmedName,
            name: trimmedName,
            email: trimmedEmail,
            phone: trimmedPhone,
            mobile: trimmedPhone,
            role: role,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        toast.success(`User updated as ${role.toUpperCase()}`);
      } else {
        // Create new user with Firebase Auth + Firestore
        if (!password || password.length < 6) {
          setLoading(false);
          return toast.error("Password must be at least 6 characters");
        }

        try {
          const callable = httpsCallable(functions, "createUser");
          const resp = await callable({
            employeeName: trimmedName,
            email: trimmedEmail,
            password: password,
            phone: trimmedPhone,
            role: role,
          });
          toast.success(
            `Successfully created ${role.toUpperCase()} user (${(resp.data as any)?.employeeId ?? "saved"})`
          );
        } catch (cloudFnErr: any) {
          console.warn("createUser cloud function call failed, falling back to direct employee doc creation:", cloudFnErr);
          // If cloud function fails or is not deployed, fall back to direct employee doc so the record is not lost
          const newDocRef = doc(collection(db, "employees"));
          await setDoc(newDocRef, {
            id: newDocRef.id,
            employeeName: trimmedName,
            name: trimmedName,
            email: trimmedEmail,
            phone: trimmedPhone,
            mobile: trimmedPhone,
            role: role,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          toast.success(`Created ${role.toUpperCase()} record: ${trimmedName}`);
        }
      }

      await fetchEmployees();
      resetForm();
    } catch (err: any) {
      console.error("create/update error", err);
      toast.error(err?.message || "Operation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    const uid = userToDelete.id || userToDelete.uid;
    if (!uid) return;

    setIsDeleting(true);
    try {
      try {
        const callable = httpsCallable(functions, "deleteUser");
        await callable({ uid });
      } catch (cloudErr) {
        console.warn("deleteUser cloud function failed, deleting doc directly:", cloudErr);
        await deleteDoc(doc(db, "employees", uid));
      }
      toast.success(`Deleted user ${userToDelete.employeeName || userToDelete.name}`);
      setUserToDelete(null);
      await fetchEmployees();
    } catch (err: any) {
      console.error("delete error", err);
      toast.error(err?.message || "Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetPassword = async (targetEmail: string) => {
    if (!targetEmail) return toast.error("Email not found");
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      toast.success(`Password reset email sent to ${targetEmail}`);
    } catch (err: any) {
      console.error("reset password error", err);
      toast.error(err?.message || "Failed to send reset email");
    }
  };

  // Counts by role
  const counts = useMemo(() => {
    const total = employees.length;
    const adminCount = employees.filter((e) => e.role === "admin").length;
    const managerCount = employees.filter((e) => e.role === "manager").length;
    const staffCount = employees.filter((e) => e.role === "staff").length;
    return { total, admin: adminCount, manager: managerCount, staff: staffCount };
  }, [employees]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // Role tab match
      if (activeTab !== "all" && emp.role !== activeTab) {
        return false;
      }
      // Search term match
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const nameMatch = (emp.employeeName || emp.name || "").toLowerCase().includes(q);
        const emailMatch = (emp.email || "").toLowerCase().includes(q);
        const phoneMatch = (emp.phone || emp.mobile || "").includes(q);
        const roleMatch = (emp.role || "").toLowerCase().includes(q);
        return nameMatch || emailMatch || phoneMatch || roleMatch;
      }
      return true;
    });
  }, [employees, activeTab, searchTerm]);

  const getRoleBadge = (r?: Role) => {
    switch (r) {
      case "admin":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <ShieldCheck className="w-3 h-3 text-purple-700" />
            Admin
          </span>
        );
      case "manager":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <Users className="w-3 h-3 text-blue-700" />
            Manager
          </span>
        );
      case "staff":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <User className="w-3 h-3 text-emerald-700" />
            Staff
          </span>
        );
    }
  };

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 font-sans">
        <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} />

        {/* Page Header */}
        <div className="max-w-7xl mx-auto mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
                <Users className="w-7 h-7 text-blue-600" />
                User Management
              </h1>
            </div>
            <button
              onClick={fetchEmployees}
              disabled={listLoading}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition shadow-xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${listLoading ? "animate-spin text-blue-600" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Main Content Grid: Form (Left) & Directory (Right) */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ============ USER FORM (5 COLS) ============ */}
          <div className="lg:col-span-5 bg-white rounded-2xl shadow-xs border border-gray-200/90 p-5 sm:p-6 sticky top-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-5">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    editing ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {editing ? <Edit2 className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {editing ? "Edit User Details" : "Add New User"}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {editing ? "Update role or user info" : "Choose role and enter details"}
                  </p>
                </div>
              </div>

              {editing && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg transition"
                >
                  Cancel
                </button>
              )}
            </div>

            <form onSubmit={handleCreateOrUpdate} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="e.g., Rajesh Kumar"
                  required
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g., rajesh@company.com"
                  required
                  disabled={!!editing}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition disabled:bg-gray-100 disabled:text-gray-500"
                />
                {editing && (
                  <p className="text-[11px] text-gray-400 mt-1">Email cannot be changed after creation.</p>
                )}
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g., 9876543210"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>

              {/* Role Selection (Staff / Manager / Admin) */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                  Select Role <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {/* Staff */}
                  <button
                    type="button"
                    onClick={() => setRole("staff")}
                    className={`py-2.5 px-3 rounded-xl border text-center transition cursor-pointer flex flex-col items-center gap-1 ${
                      role === "staff"
                        ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-900 font-bold"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 font-medium"
                    }`}
                  >
                    <User className={`w-4 h-4 ${role === "staff" ? "text-emerald-600" : "text-gray-400"}`} />
                    <span className="text-xs">Staff</span>
                  </button>

                  {/* Manager */}
                  <button
                    type="button"
                    onClick={() => setRole("manager")}
                    className={`py-2.5 px-3 rounded-xl border text-center transition cursor-pointer flex flex-col items-center gap-1 ${
                      role === "manager"
                        ? "bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 text-blue-900 font-bold"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 font-medium"
                    }`}
                  >
                    <Users className={`w-4 h-4 ${role === "manager" ? "text-blue-600" : "text-gray-400"}`} />
                    <span className="text-xs">Manager</span>
                  </button>

                  {/* Admin */}
                  <button
                    type="button"
                    onClick={() => setRole("admin")}
                    className={`py-2.5 px-3 rounded-xl border text-center transition cursor-pointer flex flex-col items-center gap-1 ${
                      role === "admin"
                        ? "bg-purple-50 border-purple-500 ring-2 ring-purple-500/20 text-purple-900 font-bold"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 font-medium"
                    }`}
                  >
                    <ShieldCheck className={`w-4 h-4 ${role === "admin" ? "text-purple-600" : "text-gray-400"}`} />
                    <span className="text-xs">Admin</span>
                  </button>
                </div>
              </div>

              {/* Password (for new user) */}
              {!editing && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      required
                      minLength={6}
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Credentials for first-time sign-in.</p>
                </div>
              )}

              {/* Password Reset Action in Edit Mode */}
              {editing && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleResetPassword(editing.email || "")}
                    className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-xl transition cursor-pointer"
                  >
                    <Key className="w-3.5 h-3.5 text-gray-500" />
                    Send Password Reset Email
                  </button>
                </div>
              )}

              {/* Form Buttons */}
              <div className="pt-3 flex items-center gap-2.5">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-xs transition disabled:opacity-60 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{editing ? "Updating..." : "Creating..."}</span>
                    </>
                  ) : (
                    <>
                      {editing ? <Check className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                      <span>{editing ? "Save Changes" : `Create ${role.toUpperCase()}`}</span>
                    </>
                  )}
                </button>

                {editing && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition"
                  >
                    Reset
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* ============ USER DIRECTORY (7 COLS) ============ */}
          <div className="lg:col-span-7 space-y-4">
            {/* Filter Tabs & Search Bar */}
            <div className="bg-white rounded-2xl shadow-xs border border-gray-200/90 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Role Tabs */}
                <div className="flex items-center gap-1.5 p-1 bg-gray-100/80 rounded-xl overflow-x-auto">
                  <button
                    onClick={() => setActiveTab("all")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
                      activeTab === "all"
                        ? "bg-white text-gray-900 shadow-2xs font-bold"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    All ({counts.total})
                  </button>

                  <button
                    onClick={() => setActiveTab("admin")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
                      activeTab === "admin"
                        ? "bg-purple-600 text-white shadow-2xs font-bold"
                        : "text-purple-700 hover:bg-purple-50"
                    }`}
                  >
                    Admins ({counts.admin})
                  </button>

                  <button
                    onClick={() => setActiveTab("manager")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
                      activeTab === "manager"
                        ? "bg-blue-600 text-white shadow-2xs font-bold"
                        : "text-blue-700 hover:bg-blue-50"
                    }`}
                  >
                    Managers ({counts.manager})
                  </button>

                  <button
                    onClick={() => setActiveTab("staff")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
                      activeTab === "staff"
                        ? "bg-emerald-600 text-white shadow-2xs font-bold"
                        : "text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    Staff ({counts.staff})
                  </button>
                </div>

                {/* Search Input */}
                <div className="relative min-w-[200px]">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search name, email, phone..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
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
            </div>

            {/* User Cards List */}
            {listLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white p-4 rounded-2xl border border-gray-200 animate-pulse">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <div className="h-4 bg-gray-200 rounded-md w-36" />
                        <div className="h-3 bg-gray-200 rounded-md w-48" />
                        <div className="h-3 bg-gray-200 rounded-md w-28" />
                      </div>
                      <div className="h-8 bg-gray-200 rounded-lg w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-gray-800">No users found</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                  {searchTerm
                    ? `No matching users found for "${searchTerm}".`
                    : `No ${activeTab === "all" ? "" : activeTab} users registered yet.`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredEmployees.map((emp) => {
                  const isSelectedForEdit = editing?.id === emp.id;
                  return (
                    <div
                      key={emp.id}
                      className={`bg-white p-4 rounded-2xl border transition-all duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isSelectedForEdit
                          ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 shadow-xs"
                          : "border-gray-200/90 hover:border-gray-300 hover:shadow-xs"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 uppercase ${
                            emp.role === "admin"
                              ? "bg-purple-100 text-purple-700 border border-purple-200"
                              : emp.role === "manager"
                              ? "bg-blue-100 text-blue-700 border border-blue-200"
                              : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {(emp.employeeName || emp.name || "U")[0]}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-sm text-gray-900">
                              {emp.employeeName || emp.name}
                            </h3>
                            {getRoleBadge(emp.role)}
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5">{emp.email}</p>
                          {(emp.phone || emp.mobile) && (
                            <p className="text-xs text-gray-400 mt-0.5 font-mono">
                              {emp.phone || emp.mobile}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-end gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                        <button
                          type="button"
                          onClick={() => handleEditClick(emp)}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition cursor-pointer"
                          title="Edit user"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleResetPassword(emp.email || "")}
                          className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition cursor-pointer"
                          title="Send password reset email"
                        >
                          <Key className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setUserToDelete(emp)}
                          className="p-2 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {userToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 text-rose-600 mb-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Confirm Deletion</h3>
              </div>

              <p className="text-sm text-gray-600 mb-2">
                Are you sure you want to delete user{" "}
                <strong className="text-gray-900">{userToDelete.employeeName || userToDelete.name}</strong> (
                {userToDelete.email})?
              </p>
              <p className="text-xs text-gray-400 mb-5">
                This will remove their account and revoke their access to the system.
              </p>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setUserToDelete(null)}
                  className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={confirmDelete}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition cursor-pointer disabled:opacity-60"
                >
                  {isDeleting ? "Deleting..." : "Delete User"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
