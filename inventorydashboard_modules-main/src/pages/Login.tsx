import React, { useRef, useState, useEffect } from "react";
import { useAuth } from "../App";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  Loader2,
  BarChart3,
  Package,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

export default function Login() {
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { login, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const togglePasswordVisibility = () => setShowPassword(!showPassword);

  const normalizePhone = (s?: string) => {
    if (!s) return "";
    return s.replace(/\D/g, "").replace(/^0+/, "");
  };

  const lookupEmployeeEmail = async (identifier: string) => {
    // If looks like an email, use it directly (allow direct auth email login)
    if (identifier.includes("@")) {
      return identifier;
    }

    // treat as phone -> lookup employee doc to get associated email
    const digits = normalizePhone(identifier);
    if (digits) {
      const usersRef = collection(db, "employees");
      const q = query(usersRef, where("mobile", "==", digits));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data() as any;
        return data.email || null;
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const identifier = emailRef.current?.value?.trim();
    const password = passwordRef.current?.value?.trim();

    if (!identifier || !password) {
      setError("Please enter both Email / Phone and password");
      return;
    }

    setLoading(true);

    try {
      const emailToUse = await lookupEmployeeEmail(identifier);
      if (!emailToUse) {
        throw new Error("Identifier not found. Please check Email or Phone.");
      }

      await login(emailToUse, password);
      setLoading(false);
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err?.message || "Failed to log in. Please check credentials.");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50/50 p-4 sm:p-6 lg:p-8 font-sans selection:bg-blue-600 selection:text-white">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl border border-slate-200/90 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
        {/* Left Brand Panel (Desktop) */}
        <div className="hidden lg:flex lg:col-span-5 bg-gradient-to-br from-slate-900 via-slate-850 to-slate-950 p-8 flex-col justify-between text-white relative overflow-hidden">
          {/* Subtle Background Glow Elements */}
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

          {/* Top Branding */}
          <div className="relative z-10 space-y-4">
            <div className="inline-flex items-center bg-white px-3.5 py-1.5 rounded-xl shadow-xs">
              <img
                src="/ibots-logo.png"
                alt="iBots"
                className="h-6 w-auto max-w-[120px] object-contain"
              />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-slate-400">Protowiz Private Limited</p>
              <h2 className="text-xl font-bold text-white mt-1">Enterprise Operations Portal</h2>
            </div>
          </div>

          {/* Middle Value Highlights */}
          <div className="relative z-10 space-y-3.5 my-8">
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs">
              <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Financials & Real-time PNL</h4>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Track billing sales, purchase costs, and net margins instantly.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs">
              <div className="w-8 h-8 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                <Package className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Live Inventory & SOH</h4>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Real-time stock valuation and automatic low-stock notifications.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs">
              <div className="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/30">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Role-Based Workflows</h4>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Task assignments, subtasks progress, and secure admin controls.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Security Footer */}
          <div className="relative z-10 pt-4 border-t border-slate-800 flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>256-bit encrypted authentication session</span>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="col-span-1 lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center bg-white">
          <div className="w-full max-w-sm mx-auto">
            {/* Mobile Branding Header */}
            <div className="lg:hidden flex flex-col items-center mb-6 text-center">
              <div className="inline-flex items-center bg-slate-900 p-2.5 rounded-2xl shadow-xs mb-3">
                <div className="bg-white px-2.5 py-1 rounded-xl">
                  <img
                    src="/ibots-logo.png"
                    alt="iBots"
                    className="h-5 w-auto object-contain"
                  />
                </div>
              </div>
              <h1 className="text-xl font-bold text-slate-900">iBots CRM</h1>
              <p className="text-xs text-slate-500 mt-0.5">Protowiz Private Limited</p>
            </div>

            {/* Desktop Form Title */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Sign in to your account</h2>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Enter your authorized employee email or registered mobile number.
              </p>
            </div>

            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="bg-rose-50 border border-rose-200/90 text-rose-700 p-3.5 rounded-xl mb-5 flex items-start justify-between gap-2.5 shadow-2xs"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span className="text-xs font-semibold leading-relaxed">{error}</span>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-rose-400 hover:text-rose-700 p-0.5 transition cursor-pointer"
                    aria-label="Close error"
                  >
                    ✕
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Email / Mobile Number
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    ref={emailRef}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200/90 rounded-xl text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                    placeholder="name@ibots.in or 9876543210"
                    required
                    disabled={loading}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    ref={passwordRef}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200/90 rounded-xl text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                    placeholder="Enter your password"
                    required
                    disabled={loading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer p-0.5"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs hover:shadow transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="mt-8 pt-5 border-t border-slate-100 text-center space-y-2">
              <p className="text-[11px] text-slate-500">
                Authorized access only. Need help? Contact your administrator.
              </p>
              <p className="text-[10px] text-slate-400">
                © {new Date().getFullYear()} Protowiz Private Limited. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

