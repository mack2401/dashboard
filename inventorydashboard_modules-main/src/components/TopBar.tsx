import React, { useState, useRef, useEffect } from "react";
import { Search, Bell, X, CheckCircle2, Shield, User as UserIcon } from "lucide-react";
import { useAuth } from "../App";

interface TopBarProps {
  onSearch?: (query: string) => void;
}

const TopBar: React.FC<TopBarProps> = ({ onSearch }) => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Close notifications dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (onSearch) {
      onSearch(val);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    if (onSearch) {
      onSearch("");
    }
  };

  // Determine user initials
  const getInitials = (name?: string | null, email?: string | null) => {
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return "U";
  };

  const rawRole = (user?.role || "").toLowerCase();
  const isAdmin = rawRole === "admin" || rawRole.includes("admin");
  const roleDisplay = isAdmin ? "Admin" : "Staff";
  const displayName = user?.name || (user?.email ? user.email.split("@")[0] : roleDisplay);

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-[#e9edf6] px-4 pl-16 md:px-6 flex items-center justify-between shadow-2xs transition-all">
      {/* Search Bar Section */}
      <div className="flex-1 max-w-xs sm:max-w-sm md:max-w-md">
        <div className="relative flex items-center">
          <Search
            size={18}
            className="absolute left-3.5 text-[#8c9097] pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search bills, items, enquiries, tasks..."
            className="w-full pl-10 pr-9 py-2 text-xs sm:text-sm bg-[#f0f1f7] border border-[#e9edf6] rounded-xl text-[#111c43] placeholder-[#8c9097] focus:outline-none focus:ring-2 focus:ring-[#845adf]/20 focus:border-[#845adf] focus:bg-white transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-3 text-[#8c9097] hover:text-[#111c43] p-0.5 rounded-md transition-colors cursor-pointer"
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Right Controls: Notifications & Profile Badge */}
      <div className="flex items-center gap-2 sm:gap-3.5">
        {/* Notification Icon */}
        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 sm:p-2.5 rounded-xl border border-[#e9edf6] bg-white hover:bg-[#f0f1f7] text-[#535d74] hover:text-[#845adf] transition-all cursor-pointer shadow-2xs"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell size={19} />
            {/* Active Notification Dot in Ynex Purple */}
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#845adf] ring-2 ring-white" />
          </button>

          {/* Notifications Dropdown Popover */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white border border-[#e9edf6] rounded-2xl shadow-xl shadow-[#111c43]/5 py-3 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-4 pb-2.5 border-b border-[#e9edf6] flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#111c43]">
                  Notifications
                </span>
                <span className="text-[11px] font-semibold text-[#845adf] bg-[#ece6fa] px-2 py-0.5 rounded-full">
                  1 New
                </span>
              </div>
              <div className="p-3">
                <div className="p-2.5 rounded-xl bg-[#f0f1f7] border border-[#e9edf6] flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-[#ece6fa] text-[#845adf] shrink-0 mt-0.5">
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#111c43]">System Ready</p>
                    <p className="text-[11px] text-[#535d74] mt-0.5">
                      All inventory modules, billing, and analytics are synced.
                    </p>
                    <span className="text-[10px] text-[#8c9097] mt-1 block">Just now</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Vertical Divider */}
        <div className="h-7 w-px bg-[#e9edf6]" />

        {/* Display-Only Profile Pic & Badge (Does not navigate to profile) */}
        <div
          className="flex items-center gap-2.5 pl-1 py-1 select-none cursor-default"
          title={`Signed in as ${displayName} (${roleDisplay})`}
        >
          {/* Avatar Picture in Ynex Purple Gradient */}
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-[#845adf] to-[#9e7ded] text-white flex items-center justify-center font-bold text-xs sm:text-sm shadow-xs border border-white shrink-0">
            {getInitials(displayName, user?.email)}
          </div>

          {/* User Name & Staff / Admin Badge */}
          <div className="hidden sm:flex flex-col">
            <span className="text-xs sm:text-sm font-bold text-[#111c43] leading-tight truncate max-w-[130px] capitalize">
              {displayName}
            </span>
            <div className="mt-0.5">
              {isAdmin ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ece6fa] text-[#845adf] border border-[#d9cef7] uppercase tracking-wider">
                  <Shield size={10} className="stroke-[2.5]" />
                  Admin
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f0f1f7] text-[#535d74] border border-[#e9edf6] uppercase tracking-wider">
                  <UserIcon size={10} className="stroke-[2.5]" />
                  Staff
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
