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
  Loader2,
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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 sm:p-6 font-sans">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200/90 p-7 sm:p-8">
        {/* Brand Logo & Title */}
        <div className="flex flex-col items-center mb-6 text-center">
          <img
            src="/ibots-logo.png"
            alt="iBots"
            className="h-8 w-auto max-w-[140px] object-contain mb-3"
          />
          <h1 className="text-lg font-bold text-gray-900">Sign In</h1>
        </div>

        {/* Error Alert */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded-xl text-xs mb-4 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span className="truncate">{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-rose-500 hover:text-rose-700 cursor-pointer text-xs"
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sign In Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Email / Phone
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                ref={emailRef}
                className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs sm:text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                placeholder="Enter email or mobile number"
                required
                disabled={loading}
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                ref={passwordRef}
                className="w-full pl-10 pr-10 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs sm:text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                placeholder="Enter password"
                required
                disabled={loading}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition cursor-pointer p-0.5"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs hover:shadow transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}


