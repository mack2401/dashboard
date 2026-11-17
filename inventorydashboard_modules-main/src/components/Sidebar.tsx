import { NavLink, useLocation, useNavigate } from "react-router-dom";
import React, { useState } from "react"; 
import {
  LayoutDashboard,
  Calculator,
  ShieldCheck,
  Users,
  UsersRound,
  LogOut,
  Menu, 
  X, 
  ListTodo,
  Package,
  ChevronDown,
  ChevronUp,
  Settings,
  GraduationCap,
  BarChart3,
  Receipt,
  TrendingUp,
  ShoppingCart,
  Layers
} from "lucide-react";
import { useAuth } from "../App"; 

interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed = false, onToggleCollapse }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isManagementOpen, setIsManagementOpen] = useState(() => 
    location.pathname.startsWith("/admin/manage-users") || location.pathname.startsWith("/manage-teams")
  );
  const [isEnquiriesOpen, setIsEnquiriesOpen] = useState(() => 
    location.pathname.startsWith("/enquiries")
  );

  const topNavItems = [
    { name: "Dashboard", path: "/dashboard", icon: <LayoutDashboard size={20} /> },
  ];

  const enquiryItems = [
    { name: "All Enquiries", path: "/enquiries", icon: <Layers size={17} /> },
    { name: "E-Commerce", path: "/enquiries/ecommerce", icon: <ShoppingCart size={17} /> },
    { name: "Academic", path: "/enquiries/academic", icon: <GraduationCap size={17} /> },
    { name: "Dropped Enquiries", path: "/dropped", icon: <TrendingUp size={17} /> },
  ];

  const bottomNavItems = [
    { name: "Inventory", path: "/inventory", icon: <Package size={20} /> },
    { name: "Billing", path: "/bills", icon: <Receipt size={20} /> },
    { name: "Client Purchase Summary", path: "/reports/client-summary", icon: <BarChart3 size={20} /> },
    { name: "Comparison Analytics", path: "/reports/comparison-analytics", icon: <TrendingUp size={20} /> },
    { name: "PnL", path: "/pnl", icon: <Calculator size={20} /> },
    { name: "Master Data", path: "/master-data", icon: <ShieldCheck size={20} /> },
    { name: "Task Management", path: "/task", icon: <ListTodo size={20} /> },
    { name: "Training Management", path: "/training", icon: <GraduationCap size={20} /> },
  ];

  const managementItems = [
    { name: "Manage Users", path: "/admin/manage-users", icon: <Users size={17} /> },
    { name: "Manage Teams", path: "/manage-teams", icon: <UsersRound size={17} /> },
  ];

  const handleNavClick = (isLogoutAction = false) => {
    if (window.innerWidth < 768 && !isLogoutAction) {
      setIsOpen(false);
    }
  };

  const handleManagementClick = () => {
    if (isCollapsed && onToggleCollapse) {
      onToggleCollapse();
      setIsManagementOpen(true);
    } else {
      setIsManagementOpen((prev) => !prev);
    }
  };

  const handleEnquiriesClick = () => {
    if (isCollapsed && onToggleCollapse) {
      onToggleCollapse();
      setIsEnquiriesOpen(true);
    } else {
      setIsEnquiriesOpen((prev) => !prev);
    }
  };

  const isEnquiriesActive = location.pathname.startsWith("/enquiries") || location.pathname === "/dropped";
  const isManagementActive = location.pathname.startsWith("/admin/manage-users") || location.pathname.startsWith("/manage-teams");

  return (
    <>
      {/* Mobile Toggle Button */}
      <button 
        onClick={() => setIsOpen(true)} 
        className="md:hidden fixed top-3.5 left-3.5 z-40 p-2 text-[#25324A] bg-white rounded-xl shadow-md border border-[#E1E5F0] hover:bg-[#F5F6FC] cursor-pointer transition-colors"
        aria-label="Open menu"
      >
        <Menu size={22} />
      </button>

      {/* Normal Square Sidebar */}
      <aside 
        className={`
          fixed top-0 bottom-0 left-0 z-40 h-screen
          bg-[#1E315B] border-r border-[#293F70] shadow-md
          transition-all duration-300 ease-in-out select-none
          flex flex-col justify-between
          ${isCollapsed ? "w-[72px]" : "w-64"}
          ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header area (h-16 matching TopBar) */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-[#293F70] shrink-0">
            {!isCollapsed ? (
              <>
                <div className="flex items-center bg-white px-3 py-1.5 rounded-lg shadow-xs">
                  <img 
                    src="/ibots-logo.png" 
                    alt="iBots" 
                    className="h-6.5 w-auto max-w-[125px] object-contain"
                  />
                </div>

                <div className="flex items-center gap-1">
                  {/* Desktop Collapse Button */}
                  {onToggleCollapse && (
                    <button 
                      onClick={onToggleCollapse}
                      className="hidden md:flex p-1.5 text-slate-300 hover:text-white hover:bg-[#293F70] rounded-lg transition-colors cursor-pointer"
                      title="Collapse sidebar"
                      aria-label="Collapse sidebar"
                    >
                      <Menu size={19} />
                    </button>
                  )}

                  {/* Mobile Close Button */}
                  <button 
                    onClick={() => setIsOpen(false)} 
                    className="md:hidden p-1.5 text-slate-300 hover:text-white hover:bg-[#293F70] rounded-lg transition-colors cursor-pointer"
                    aria-label="Close menu"
                  >
                    <X size={19} />
                  </button>
                </div>
              </>
            ) : (
              <div className="w-full flex items-center justify-center">
                {onToggleCollapse && (
                  <button 
                    onClick={onToggleCollapse}
                    className="p-1.5 text-slate-300 hover:text-white hover:bg-[#293F70] rounded-lg transition-colors cursor-pointer"
                    title="Expand sidebar"
                    aria-label="Expand sidebar"
                  >
                    <Menu size={20} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Navigation Items (Normal rectangular layout) */}
          <nav className="p-3 flex flex-col gap-1 overflow-y-auto sidebar-scroll flex-1 min-h-0">
            {topNavItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => handleNavClick(false)}
                className={({ isActive }) => `
                  relative flex items-center transition-all duration-150 group rounded-xl
                  ${isCollapsed ? "justify-center mx-auto w-10 h-10 my-0.5" : "gap-3.5 px-3.5 py-2.5"}
                  ${
                    isActive
                      ? "bg-[#293F70] text-[#7889F5] font-bold shadow-xs border-l-4 border-[#7889F5]"
                      : "text-slate-300 hover:text-white hover:bg-[#293F70]/60 font-medium"
                  }
                `}
              >
                {({ isActive }) => (
                  <>
                    <span 
                      className={`shrink-0 transition-transform duration-200 ${
                        isActive ? "text-[#7889F5]" : "text-slate-300 group-hover:text-white group-hover:scale-105"
                      }`}
                    >
                      {item.icon}
                    </span>

                    {!isCollapsed && (
                      <span className={`text-sm tracking-wide truncate ${isActive ? "text-white font-bold" : ""}`}>
                        {item.name}
                      </span>
                    )}

                    {isCollapsed && (
                      <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#1E315B] text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50 border border-[#293F70] flex items-center">
                        <span>{item.name}</span>
                        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#1E315B]"></div>
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            ))}

            {/* Enquiries Section (Dropdown) */}
            <div className="flex flex-col">
              <button
                onClick={handleEnquiriesClick}
                className={`relative flex items-center transition-all duration-150 rounded-xl cursor-pointer group ${
                  isCollapsed ? "justify-center mx-auto w-10 h-10 my-0.5" : "justify-between px-3.5 py-2.5"
                } ${
                  isEnquiriesActive
                    ? "bg-[#293F70]/70 text-[#7889F5] font-semibold"
                    : "text-slate-300 hover:text-white hover:bg-[#293F70]/60 font-medium"
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <span className={`${isEnquiriesActive ? "text-[#7889F5]" : "text-slate-300 group-hover:text-white"} transition-transform group-hover:scale-105`}>
                    <Calculator size={20} />
                  </span>
                  {!isCollapsed && <span className="text-sm font-semibold text-slate-200">Enquiries</span>}
                </div>
                {!isCollapsed && (isEnquiriesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}

                {isCollapsed && (
                  <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#1E315B] text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50 border border-[#293F70] flex items-center">
                    <span>Enquiries</span>
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#1E315B]"></div>
                  </div>
                )}
              </button>

              {/* Sub-items - only rendered when not collapsed */}
              {!isCollapsed && isEnquiriesOpen && (
                <div className="my-1 flex flex-col gap-1 ml-5 pl-3 border-l border-[#293F70]">
                  {enquiryItems.map((item) => (
                    <NavLink
                      key={item.name}
                      to={item.path}
                      end={item.path === "/enquiries"}
                      onClick={() => handleNavClick(false)}
                      className={({ isActive }) => `
                        flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150
                        ${
                          isActive
                            ? "bg-[#293F70] text-[#7889F5] font-bold shadow-xs border-l-2 border-[#7889F5]"
                            : "text-slate-300 hover:text-white hover:bg-[#293F70]/50"
                        }
                      `}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      <span className="truncate">{item.name}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>

            {bottomNavItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => handleNavClick(false)}
                className={({ isActive }) => `
                  relative flex items-center transition-all duration-150 group rounded-xl
                  ${isCollapsed ? "justify-center mx-auto w-10 h-10 my-0.5" : "gap-3.5 px-3.5 py-2.5"}
                  ${
                    isActive
                      ? "bg-[#293F70] text-[#7889F5] font-bold shadow-xs border-l-4 border-[#7889F5]"
                      : "text-slate-300 hover:text-white hover:bg-[#293F70]/60 font-medium"
                  }
                `}
              >
                {({ isActive }) => (
                  <>
                    <span 
                      className={`shrink-0 transition-transform duration-200 ${
                        isActive ? "text-[#7889F5]" : "text-slate-300 group-hover:text-white group-hover:scale-105"
                      }`}
                    >
                      {item.icon}
                    </span>

                    {!isCollapsed && (
                      <span className={`text-sm tracking-wide truncate ${isActive ? "text-white font-bold" : ""}`}>
                        {item.name}
                      </span>
                    )}

                    {isCollapsed && (
                      <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#1E315B] text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50 border border-[#293F70] flex items-center">
                        <span>{item.name}</span>
                        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#1E315B]"></div>
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            ))}

            {/* Management Section (Admin Only) */}
            {user?.role === "admin" && (
              <div className="flex flex-col">
                <button
                  onClick={handleManagementClick}
                  className={`relative flex items-center transition-all duration-150 rounded-xl cursor-pointer group ${
                    isCollapsed ? "justify-center mx-auto w-10 h-10 my-0.5" : "justify-between px-3.5 py-2.5"
                  } ${
                    isManagementActive
                      ? "bg-[#293F70]/70 text-[#7889F5] font-semibold"
                      : "text-slate-300 hover:text-white hover:bg-[#293F70]/60 font-medium"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <span className={`${isManagementActive ? "text-[#7889F5]" : "text-slate-300 group-hover:text-white"} transition-transform group-hover:scale-105`}>
                      <Settings size={20} />
                    </span>
                    {!isCollapsed && <span className="text-sm font-semibold text-slate-200">Management</span>}
                  </div>
                  {!isCollapsed && (isManagementOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}

                  {isCollapsed && (
                    <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#1E315B] text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50 border border-[#293F70] flex items-center">
                      <span>Management</span>
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#1E315B]"></div>
                    </div>
                  )}
                </button>

                {/* Sub-items - only rendered when not collapsed */}
                {!isCollapsed && isManagementOpen && (
                  <div className="my-1 flex flex-col gap-1 ml-5 pl-3 border-l border-[#293F70]">
                    {managementItems.map((item) => (
                      <NavLink
                        key={item.name}
                        to={item.path}
                        onClick={() => handleNavClick(false)}
                        className={({ isActive }) => `
                          flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150
                          ${
                            isActive
                              ? "bg-[#293F70] text-[#7889F5] font-bold shadow-xs border-l-2 border-[#7889F5]"
                              : "text-slate-300 hover:text-white hover:bg-[#293F70]/50"
                          }
                        `}
                      >
                        <span className="shrink-0">{item.icon}</span>
                        <span className="truncate">{item.name}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>
        </div>

        {/* Bottom Actions: Logout */}
        <div className="p-3 border-t border-[#293F70] shrink-0">
          <button
            onClick={() => {
              logout();
              handleNavClick(true);
            }}
            className={`relative flex items-center transition-all duration-150 text-slate-300 hover:text-white hover:bg-rose-500/20 font-semibold cursor-pointer group ${
              isCollapsed ? "w-10 h-10 mx-auto justify-center rounded-xl" : "w-full gap-3.5 px-3.5 py-2.5 rounded-xl"
            }`}
            title={isCollapsed ? "" : "Logout"}
          >
            <span className="shrink-0 group-hover:scale-110 transition-transform text-rose-300 group-hover:text-rose-200">
              <LogOut size={20} />
            </span>
            {!isCollapsed && <span className="text-sm font-semibold">Logout</span>}
            {isCollapsed && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50 flex items-center gap-1.5 border border-rose-400/40">
                <span>Logout</span>
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-rose-600"></div>
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-30 md:hidden" 
          onClick={() => setIsOpen(false)}
        ></div>
      )}
    </>
  );
};

export default Sidebar;
