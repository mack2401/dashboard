import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, LogOut, ChevronDown, Shield, Mail, CheckCircle2 } from "lucide-react";
import { useAuth } from "../App";

export default function ProfileDropdown() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      console.error("Failed to log out:", err);
    }
  };

  const displayName = user?.name || (user?.email ? user.email.split("@")[0] : "User");
  const displayEmail = user?.email || "No email available";
  const displayRole = user?.role || "Staff";
  const initial = displayName.charAt(0).toUpperCase();

  const getRoleBadgeClasses = (role: string) => {
    const r = role.toLowerCase();
    if (r === "admin") return "bg-rose-50 text-rose-700 border-rose-200";
    if (r === "manager") return "bg-purple-50 text-purple-700 border-purple-200";
    return "bg-sky-50 text-sky-700 border-sky-200";
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
        className="flex items-center gap-2.5 p-1 sm:pr-3 bg-white hover:bg-gray-50 border border-gray-200/90 rounded-2xl shadow-xs transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500/20"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {/* Avatar Circle */}
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-[#0284c7] to-[#0ea5e9] text-white font-bold text-xs sm:text-sm flex items-center justify-center shadow-xs shrink-0 select-none">
          {initial}
        </div>

        {/* User Info (hidden on very small screens) */}
        <div className="hidden sm:flex flex-col text-left">
          <span className="text-xs font-bold text-gray-900 leading-tight truncate max-w-[120px]">
            {displayName}
          </span>
          <span className="text-[10px] font-semibold text-gray-500 capitalize leading-tight">
            {displayRole}
          </span>
        </div>

        {/* Chevron icon */}
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 shrink-0 ${
            isOpen ? "rotate-180 text-gray-700" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 sm:w-72 bg-white rounded-2xl shadow-xl border border-gray-150 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* Header Info Banner */}
          <div className="p-4 bg-gradient-to-br from-sky-50/80 via-white to-slate-50/60 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#0284c7] to-[#0ea5e9] text-white font-bold text-base flex items-center justify-center shadow-sm shrink-0">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-bold text-gray-900 truncate">{displayName}</h4>
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                </div>
                <p className="text-xs text-gray-500 flex items-center gap-1 truncate mt-0.5" title={displayEmail}>
                  <Mail className="w-3 h-3 text-gray-400 shrink-0" />
                  <span className="truncate">{displayEmail}</span>
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between pt-2.5 border-t border-gray-200/60">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Account Role</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize ${getRoleBadgeClasses(displayRole)}`}>
                <Shield className="w-3 h-3 inline mr-1" />
                {displayRole}
              </span>
            </div>
          </div>

          {/* User Details / Actions */}
          <div className="p-2">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-rose-500 shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
