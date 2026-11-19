import React, { useRef, useState, useEffect } from "react";
import { useAuth } from "../App";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";

export default function Login() {
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { login, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
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
    <div className="min-h-screen bg-white flex flex-col items-center justify-between py-6 px-4 font-sans text-[#0f1111]">
      {/* Top Header Logo */}
      <div className="w-full flex justify-center pt-2 pb-4">
        <img
          src="/ibots-logo.png"
          alt="iBots"
          className="h-9 sm:h-10 w-auto max-w-[130px] object-contain"
        />
      </div>

      {/* Center Sign In Box (Amazon Style) */}
      <div className="w-full max-w-[350px] bg-white border border-[#d5d9d9] rounded-[8px] p-6 sm:p-7 shadow-[0_1px_2px_rgba(15,17,17,0.05)] my-auto">
        <h1 className="text-[28px] font-normal text-[#0f1111] leading-tight mb-4">
          Sign in
        </h1>

        {/* Error message */}
        {error && (
          <div className="border border-red-300 bg-red-50 text-red-800 p-3 rounded text-xs mb-4 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-tight">{error}</div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 ml-1 font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-[13px] font-bold text-[#0f1111] mb-1">
              Email (phone for mobile accounts)
            </label>
            <input
              type="text"
              ref={emailRef}
              className="w-full h-8 px-2.5 text-[13px] text-[#0f1111] bg-white border border-[#888c8c] rounded-[3px] focus:border-[#007185] focus:ring-1 focus:ring-[#007185] focus:outline-none transition shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)]"
              required
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-[13px] font-bold text-[#0f1111] mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                ref={passwordRef}
                className="w-full h-8 pl-2.5 pr-8 text-[13px] text-[#0f1111] bg-white border border-[#888c8c] rounded-[3px] focus:border-[#007185] focus:ring-1 focus:ring-[#007185] focus:outline-none transition shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)]"
                required
                disabled={loading}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 p-0.5 cursor-pointer"
                tabIndex={-1}
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-8.5 bg-gradient-to-b from-[#f7dfa5] to-[#f0c14b] hover:from-[#f5d78e] hover:to-[#eeb933] active:from-[#f0c14b] active:to-[#eeb933] border border-[#a88734] border-t-[#a88734] border-b-[#846a29] text-[#111] rounded-[3px] text-[13px] font-normal shadow-[0_1px_0_rgba(255,255,255,0.4)_inset] cursor-pointer flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-3.5"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#111]" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign in</span>
            )}
          </button>

          <div className="pt-2">
            <label className="flex items-center gap-2 text-[12px] text-[#0f1111] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={keepSignedIn}
                onChange={(e) => setKeepSignedIn(e.target.checked)}
                className="rounded-[2px] border-[#888c8c] text-[#f0c14b] focus:ring-[#007185] h-3.5 w-3.5 cursor-pointer"
              />
              <span>
                Keep me signed in.{" "}
                <span className="text-[#0066c0] hover:text-[#c45500] hover:underline">
                  Details <span className="text-[10px]">▼</span>
                </span>
              </span>
            </label>
          </div>
        </form>
      </div>

      {/* Bottom Divider & Footer */}
      <div className="w-full max-w-[800px] mt-8 pt-4 flex flex-col items-center">
        <div className="w-full h-px bg-gradient-to-r from-transparent via-[#e7e7e7] to-transparent mb-5" />
        <div className="flex items-center gap-6 text-[11px] text-[#0066c0] mb-2.5">
          <span className="hover:text-[#c45500] hover:underline cursor-pointer">Conditions of Use</span>
          <span className="hover:text-[#c45500] hover:underline cursor-pointer">Privacy Notice</span>
          <span className="hover:text-[#c45500] hover:underline cursor-pointer">Help</span>
        </div>
        <p className="text-[11px] text-[#555]">
          © {new Date().getFullYear()}, Protowiz Private Limited or its affiliates
        </p>
      </div>
    </div>
  );
}



