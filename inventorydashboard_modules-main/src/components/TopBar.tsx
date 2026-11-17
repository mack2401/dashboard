import React, { useState, useRef, useEffect } from "react";
import { Search, Bell, X, Shield, User as UserIcon, ChevronUp, ChevronDown } from "lucide-react";
import { useAuth } from "../App";
import { useNotifications } from "../hooks/useNotifications";
import NotificationsPopover from "./NotificationsPopover";
import { useGlobalFind } from "../hooks/useGlobalFind";
import SearchFindPopover from "./SearchFindPopover";

interface TopBarProps {
  onSearch?: (query: string) => void;
}

const TopBar: React.FC<TopBarProps> = ({ onSearch }) => {
  const { user } = useAuth();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
    dismissNotification,
  } = useNotifications();
  const [searchQuery, setSearchQuery] = useState("");
  const [showFindResults, setShowFindResults] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const {
    inPageMatches,
    activeMatchIndex,
    moduleMatches,
    isSearching,
    nextMatch,
    prevMatch,
    jumpToMatch,
    clearHighlights,
  } = useGlobalFind(searchQuery);

  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Close notifications dropdown and search popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        notificationRef.current &&
        !notificationRef.current.contains(target)
      ) {
        setShowNotifications(false);
      }
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(target)
      ) {
        setShowFindResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        prevMatch();
      } else {
        nextMatch();
      }
    } else if (e.key === "Escape") {
      clearSearch();
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    setShowFindResults(val.trim().length >= 2);
    if (onSearch) {
      onSearch(val);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setShowFindResults(false);
    clearHighlights();
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
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-[#E1E5F0] px-4 pl-16 md:px-6 flex items-center justify-between shadow-2xs transition-all">
      {/* Search Bar Section with Integrated Real-World Find Tool */}
      <div className="flex-1 max-w-xs sm:max-w-sm md:max-w-md relative" ref={searchContainerRef}>
        <div className="relative flex items-center">
          <Search
            size={18}
            className="absolute left-3.5 text-[#78839A] pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => {
              if (searchQuery.trim().length >= 2) setShowFindResults(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Find on page or across bills, tasks, enquiries..."
            className="w-full pl-10 pr-24 py-2 text-xs sm:text-sm bg-[#F5F6FC] border border-[#E1E5F0] rounded-xl text-[#25324A] placeholder-[#78839A] focus:outline-none focus:ring-2 focus:ring-[#7889F5]/20 focus:border-[#7889F5] focus:bg-white transition-all shadow-2xs"
          />

          {/* Stepper controls inside search bar when matches exist */}
          <div className="absolute right-2.5 flex items-center gap-1">
            {inPageMatches.length > 0 && (
              <div className="flex items-center gap-0.5 bg-white border border-[#E1E5F0] px-1.5 py-0.5 rounded-lg text-[10px] font-bold text-[#7889F5] shadow-2xs select-none">
                <span>{activeMatchIndex + 1}/{inPageMatches.length}</span>
                <button
                  type="button"
                  onClick={prevMatch}
                  className="p-0.5 hover:bg-[#F0F0FF] rounded text-[#78839A] hover:text-[#7889F5] transition-colors cursor-pointer"
                  title="Previous match (Shift + Enter)"
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  type="button"
                  onClick={nextMatch}
                  className="p-0.5 hover:bg-[#F0F0FF] rounded text-[#78839A] hover:text-[#7889F5] transition-colors cursor-pointer"
                  title="Next match (Enter)"
                >
                  <ChevronDown size={12} />
                </button>
              </div>
            )}

            {searchQuery && (
              <button
                onClick={clearSearch}
                className="text-[#78839A] hover:text-[#25324A] p-1 rounded-md hover:bg-gray-200/50 transition-colors cursor-pointer"
                aria-label="Clear search"
                title="Clear (Esc)"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Global Find Dropdown Popover */}
        {showFindResults && searchQuery.trim().length >= 2 && (
          <SearchFindPopover
            searchQuery={searchQuery}
            inPageMatches={inPageMatches}
            activeMatchIndex={activeMatchIndex}
            moduleMatches={moduleMatches}
            isSearching={isSearching}
            onNextMatch={nextMatch}
            onPrevMatch={prevMatch}
            onJumpToPageMatch={jumpToMatch}
            onClose={() => setShowFindResults(false)}
          />
        )}
      </div>

      {/* Right Controls: Notifications & Profile Badge */}
      <div className="flex items-center gap-2 sm:gap-3.5">
        {/* Notification Icon & Interactive Real-World Dropdown */}
        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 sm:p-2.5 rounded-xl border border-[#E1E5F0] bg-white hover:bg-[#F0F0FF] text-[#78839A] hover:text-[#7889F5] transition-all cursor-pointer shadow-2xs"
            title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}` : "Notifications"}
            aria-label="Notifications"
          >
            <Bell size={19} />
            {/* Dynamic Active Notification Badge */}
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#7889F5] text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-white shadow-xs animate-in zoom-in-75 duration-150">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Popover */}
          {showNotifications && (
            <NotificationsPopover
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkAsRead={markAsRead}
              onMarkAllAsRead={markAllAsRead}
              onClearAll={clearAll}
              onDismiss={dismissNotification}
              onClose={() => setShowNotifications(false)}
            />
          )}
        </div>

        {/* Vertical Divider */}
        <div className="h-7 w-px bg-[#E1E5F0]" />

        {/* Display-Only Profile Pic & Badge (Does not navigate to profile) */}
        <div
          className="flex items-center gap-2.5 pl-1 py-1 select-none cursor-default"
          title={`Signed in as ${displayName} (${roleDisplay})`}
        >
          {/* Avatar Picture in Lavender Gradient */}
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-[#7889F5] to-[#A5AEFF] text-white flex items-center justify-center font-bold text-xs sm:text-sm shadow-xs border border-white shrink-0">
            {getInitials(displayName, user?.email)}
          </div>

          {/* User Name & Staff / Admin Badge */}
          <div className="hidden sm:flex flex-col">
            <span className="text-xs sm:text-sm font-bold text-[#25324A] leading-tight truncate max-w-[130px] capitalize">
              {displayName}
            </span>
            <div className="mt-0.5">
              {isAdmin ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F0F0FF] text-[#7889F5] border border-[#A5AEFF] uppercase tracking-wider">
                  <Shield size={10} className="stroke-[2.5]" />
                  Admin
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F5F6FC] text-[#78839A] border border-[#E1E5F0] uppercase tracking-wider">
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
