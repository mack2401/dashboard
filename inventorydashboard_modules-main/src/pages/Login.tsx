import React, { useRef, useState, useEffect } from "react";
import { useAuth } from "../App";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { Eye, EyeOff, Loader2, AlertCircle, X, ShieldCheck, FileText, HelpCircle, Phone, Mail, Building2 } from "lucide-react";

export default function Login() {
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { login, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<"conditions" | "privacy" | "help" | null>(null);
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveModal(null);
      }
    };
    if (activeModal) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeModal]);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-between py-6 px-4 font-sans text-[#0f1111]">
      {/* Main Content: Logo + Sign In Box grouped together */}
      <div className="w-full max-w-[350px] flex flex-col items-center my-auto pt-4 sm:pt-6">
        {/* Logo positioned directly above the box */}
        <div className="mb-4.5 flex justify-center">
          <img
            src="/ibots-logo.png"
            alt="iBots"
            className="h-10 sm:h-11 w-auto max-w-[140px] object-contain"
          />
        </div>

        {/* Center Sign In Box (Amazon Style) */}
        <div className="w-full bg-white border border-[#d5d9d9] rounded-[8px] p-6 sm:p-7 shadow-[0_1px_2px_rgba(15,17,17,0.05)]">
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
                className="w-full h-8 px-2.5 text-[13px] text-[#0f1111] bg-white border border-[#888c8c] rounded-[3px] focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)]"
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
                  className="w-full h-8 pl-2.5 pr-8 text-[13px] text-[#0f1111] bg-white border border-[#888c8c] rounded-[3px] focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)]"
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
              className="w-full h-8.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-[3px] text-[13px] font-medium shadow-xs cursor-pointer flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-4"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign in</span>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Bottom Divider & Footer */}
      <div className="w-full max-w-[800px] mt-8 pt-4 flex flex-col items-center">
        <div className="w-full h-px bg-gradient-to-r from-transparent via-[#e7e7e7] to-transparent mb-5" />
        <div className="flex items-center gap-6 text-[11px] text-[#0066c0] mb-2.5">
          <button
            type="button"
            onClick={() => setActiveModal("conditions")}
            className="text-[11px] text-[#0066c0] hover:text-[#c45500] hover:underline cursor-pointer bg-transparent border-none p-0 font-normal"
          >
            Conditions of Use
          </button>
          <button
            type="button"
            onClick={() => setActiveModal("privacy")}
            className="text-[11px] text-[#0066c0] hover:text-[#c45500] hover:underline cursor-pointer bg-transparent border-none p-0 font-normal"
          >
            Privacy Notice
          </button>
          <button
            type="button"
            onClick={() => setActiveModal("help")}
            className="text-[11px] text-[#0066c0] hover:text-[#c45500] hover:underline cursor-pointer bg-transparent border-none p-0 font-normal"
          >
            Help
          </button>
        </div>
        <p className="text-[11px] text-[#555]">
          © {new Date().getFullYear()}, Protowiz Private Limited or its affiliates
        </p>
      </div>

      {/* Footer Info Modal */}
      {activeModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveModal(null);
          }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-lg shadow-xl border border-gray-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/70">
              <div className="flex items-center gap-2">
                {activeModal === "conditions" && (
                  <>
                    <FileText className="w-5 h-5 text-blue-600" />
                    <h3 className="text-base font-semibold text-gray-900">Conditions of Use</h3>
                  </>
                )}
                {activeModal === "privacy" && (
                  <>
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <h3 className="text-base font-semibold text-gray-900">Privacy Notice</h3>
                  </>
                )}
                {activeModal === "help" && (
                  <>
                    <HelpCircle className="w-5 h-5 text-blue-600" />
                    <h3 className="text-base font-semibold text-gray-900">Help & Support</h3>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto text-sm text-gray-600 space-y-4 leading-relaxed">
              {activeModal === "conditions" && (
                <>
                  <p className="text-gray-800 font-medium">
                    Welcome to the Protowiz Enterprise Management Portal. By accessing this dashboard, you agree to comply with the following operational terms:
                  </p>
                  <div className="space-y-3 text-xs text-gray-600">
                    <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                      <strong className="text-gray-900 block mb-1">1. Authorized Access Only</strong>
                      Access is restricted exclusively to authenticated employees, administrators, and authorized representatives of Protowiz Private Limited.
                    </div>
                    <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                      <strong className="text-gray-900 block mb-1">2. Confidentiality & Security</strong>
                      Client data, quotation histories, bills, and inventory values are strictly confidential. Sharing login credentials or unauthorized exporting of records is prohibited.
                    </div>
                    <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                      <strong className="text-gray-900 block mb-1">3. System Auditing</strong>
                      All logins, data modifications, bill generation actions, and task updates are logged for security and accountability.
                    </div>
                  </div>
                </>
              )}

              {activeModal === "privacy" && (
                <>
                  <p className="text-gray-800 font-medium">
                    Protowiz Private Limited is committed to maintaining the confidentiality and integrity of all internal operational data:
                  </p>
                  <div className="space-y-3 text-xs text-gray-600">
                    <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                      <strong className="text-gray-900 block mb-1">Data We Process</strong>
                      Employee email addresses, mobile numbers, login timestamps, and system change logs required for workflow and permission management.
                    </div>
                    <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                      <strong className="text-gray-900 block mb-1">Security & Encryption</strong>
                      Passwords and sensitive credentials are encrypted and stored securely via Firebase Authentication with role-based access rules.
                    </div>
                    <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                      <strong className="text-gray-900 block mb-1">Compliance & Retention</strong>
                      Business records, financial transactions, and invoice logs are preserved in accordance with standard statutory and accounting guidelines.
                    </div>
                  </div>
                </>
              )}

              {activeModal === "help" && (
                <>
                  <p className="text-gray-800 font-medium">
                    Need assistance logging into your Protowiz dashboard account?
                  </p>
                  <div className="space-y-3 text-xs text-gray-600">
                    <div className="p-3 bg-blue-50/50 rounded-md border border-blue-100 text-blue-950">
                      <strong className="text-blue-900 block mb-1">Login Options</strong>
                      You can log in using your official company email or your 10-digit registered mobile phone number.
                    </div>
                    <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                      <strong className="text-gray-900 block mb-1">Forgot Password or Account Locked?</strong>
                      Please contact your system Super Admin or HR administrator to reset your password or update your mobile number.
                    </div>
                    <div className="p-3 bg-gray-50 rounded-md border border-gray-200 space-y-2">
                      <strong className="text-gray-900 block">Contact Information:</strong>
                      <div className="flex items-center gap-2 text-gray-700">
                        <Mail className="w-3.5 h-3.5 text-blue-600" />
                        <span>admin@protowiz.in / support@protowiz.in</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-700">
                        <Phone className="w-3.5 h-3.5 text-emerald-600" />
                        <span>+91 89395 62624</span>
                      </div>
                      <div className="flex items-start gap-2 text-gray-700">
                        <Building2 className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
                        <span>Protowiz Private Limited, 34/17A, First floor, 4th Cross Rd, Ramalingam Nagar, Saibaba Colony, Coimbatore, Tamil Nadu 641011</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 bg-gray-800 hover:bg-gray-900 text-white rounded text-xs font-medium transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



