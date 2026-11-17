import { NavLink } from "react-router-dom";
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
  TrendingUp
} from "lucide-react";
import { useAuth } from "../App"; 

interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed = false, onToggleCollapse }) => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isManagementOpen, setIsManagementOpen] = useState(false);

  const baseNavItems = [
    { name: "Dashboard", path: "/dashboard", icon: <LayoutDashboard size={20} /> },
    { name: "Enquiries", path: "/enquiries", icon: <Calculator size={20} /> },
    { name: "Bills", path:"/bills", icon:<Receipt size={20}/>},
    { name: "PNL", path: "/pnl", icon: <TrendingUp size={20} /> },
    { name: "Tasks", path:"/task", icon:<ListTodo size={20}/>},
    { name: "Dropped", path: "/dropped", icon: <Calculator size={20} /> },
    { name: "Inventory", path:"/inventory", icon:<Package size={20}/>},
    { name: "Training", path:"/training", icon:<GraduationCap size={20}/>},
    { name: "Reports", path:"/reports", icon:<BarChart3 size={20}/>},
  ];
  
  const managementItems = [
    { name: "Manage Users", path: "/admin/manage-users", icon: <Users size={18} /> },
    { name: "Manage Teams", path: "/manage-teams", icon: <UsersRound size={18} /> },
  ];

  const handleNavClick = (isAction: boolean) => {
    if (!isAction) {
      setIsOpen(false);
    }
  };

  const handleManagementClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsManagementOpen(!isManagementOpen);
  };

  return (
    <>
      {/* Mobile 3-Line Menu Button - Visible on small screens, hidden on md and up */}
      <button 
        onClick={() => setIsOpen(true)} 
        className="md:hidden fixed top-4 left-4 z-40 p-2 text-slate-700 bg-white/95 rounded-xl shadow-md border border-slate-200/90 backdrop-blur-xs hover:bg-slate-50 cursor-pointer"
        aria-label="Open menu"
      >
        <Menu size={22} />
      </button>

      {/* Modern Curved Sidebar matching reference image */}
      <aside 
        className={`
          fixed top-3 bottom-3 left-3 z-40
          bg-gradient-to-b from-[#0ea5e9] via-[#0284c7] to-[#0369a1]
          rounded-[28px] shadow-xl shadow-blue-600/20
          transition-all duration-300 ease-in-out select-none
          flex flex-col justify-between py-4
          ${isCollapsed ? "overflow-visible" : "overflow-y-auto no-scrollbar"}
          ${isCollapsed ? "w-[72px]" : "w-[256px]"}
          ${isOpen ? "translate-x-0" : "-translate-x-[120%] md:translate-x-0"}
        `}
      >
        <div>
          {/* Header area */}
          {!isCollapsed ? (
            <div className="flex items-center justify-between px-3.5 mb-4">
              <div className="flex items-center bg-white px-3 py-1.5 rounded-2xl shadow-xs">
                <img 
                  src="/ibots-logo.png" 
                  alt="iBots" 
                  className="h-7 w-auto max-w-[125px] object-contain"
                />
              </div>

              <div className="flex items-center gap-1">
                {/* Desktop Collapse Button */}
                {onToggleCollapse && (
                  <button 
                    onClick={onToggleCollapse}
                    className="hidden md:flex p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                    title="Collapse sidebar"
                    aria-label="Collapse sidebar"
                  >
                    <Menu size={20} />
                  </button>
                )}

                {/* Mobile Close Button */}
                <button 
                  onClick={() => setIsOpen(false)} 
                  className="md:hidden p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center mb-3">
              {onToggleCollapse && (
                <button 
                  onClick={onToggleCollapse}
                  className="hidden md:flex p-2.5 text-white hover:bg-white/15 rounded-2xl transition-colors cursor-pointer justify-center mb-2"
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                >
                  <Menu size={22} />
                </button>
              )}
            </div>
          )}

          {/* User Welcome Card */}
          {!isCollapsed ? (
            <div className="mx-3.5 mb-4 px-3.5 py-2.5 bg-white/10 backdrop-blur-xs border border-white/15 rounded-2xl flex items-center justify-between shadow-2xs">
              <div className="truncate">
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">Welcome</p>
                <p className="text-xs font-bold text-white capitalize truncate">{user?.name || user?.role || "User"}</p>
              </div>
              <span className="px-2.5 py-0.5 text-[10px] font-bold bg-white text-[#0284c7] rounded-full uppercase tracking-wider shrink-0 shadow-2xs">
                {user?.role || "Staff"}
              </span>
            </div>
          ) : (
            <div 
              className="mx-auto mb-3 w-9 h-9 rounded-full bg-white/20 border border-white/25 flex items-center justify-center text-white font-bold text-xs shadow-2xs"
              title={`Signed in as ${user?.name || user?.role || "User"}`}
            >
              {(user?.name || user?.role || "U").charAt(0).toUpperCase()}
            </div>
          )}

          {/* Navigation Items with Inverted Curved Active Indicator */}
          <nav className="flex flex-col gap-1">
            {baseNavItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => handleNavClick(false)}
                className={({ isActive }) => `
                  relative flex items-center transition-colors duration-150 group
                  ${isCollapsed ? "justify-center mx-2 px-0 py-3" : "gap-3.5 ml-3.5 pl-3.5 pr-3 py-3"}
                  ${
                    isActive
                      ? "bg-gray-50 text-slate-800 font-bold rounded-l-[26px] z-10"
                      : "text-white/90 hover:text-white hover:bg-white/10 font-medium rounded-l-2xl"
                  }
                `}
              >
                {({ isActive }) => (
                  <>
                    {/* Seamless Inverted Fillet Curves connecting into page background */}
                    {isActive && (
                      <>
                        {/* Top Inverted Curve */}
                        <svg 
                          className="absolute -top-5 right-0 w-5 h-5 pointer-events-none fill-gray-50" 
                          viewBox="0 0 20 20"
                        >
                          <path d="M 20 0 V 20 H 0 C 11.0457 20 20 11.0457 20 0 Z" />
                        </svg>

                        {/* Bottom Inverted Curve */}
                        <svg 
                          className="absolute -bottom-5 right-0 w-5 h-5 pointer-events-none fill-gray-50" 
                          viewBox="0 0 20 20"
                        >
                          <path d="M 20 20 V 0 H 0 C 11.0457 0 20 8.9543 20 20 Z" />
                        </svg>
                      </>
                    )}

                    {/* Icon */}
                    <span 
                      className={`shrink-0 transition-transform duration-200 ${
                        isActive ? "text-[#0284c7]" : "text-white group-hover:scale-110"
                      }`}
                    >
                      {item.icon}
                    </span>

                    {/* Label (Expanded Mode) */}
                    {!isCollapsed && (
                      <span className="text-sm font-semibold tracking-wide truncate">
                        {item.name}
                      </span>
                    )}

                    {/* Floating Tooltip (Collapsed Mode) */}
                    {isCollapsed && (
                      <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-xl shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50 border border-slate-700/60 flex items-center">
                        <span>{item.name}</span>
                        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900"></div>
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            ))}

            {/* Management Section (Admin Only) */}
            {user?.role === "admin" && (
              <div className="flex flex-col mt-1">
                <button
                  onClick={handleManagementClick}
                  className={`relative flex items-center transition-all duration-200 text-white/90 hover:text-white hover:bg-white/10 font-medium rounded-l-2xl cursor-pointer group ${
                    isCollapsed ? "justify-center mx-2 px-0 py-3" : "justify-between ml-3.5 pl-3.5 pr-3 py-3"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <span className="text-white group-hover:scale-110 transition-transform">
                      <Settings size={20} />
                    </span>
                    {!isCollapsed && <span className="text-sm font-semibold">Management</span>}
                  </div>
                  {!isCollapsed && (isManagementOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}

                  {isCollapsed && (
                    <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-xl shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50 border border-slate-700/60 flex items-center">
                      <span>Management</span>
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900"></div>
                    </div>
                  )}
                </button>

                {/* Sub-items */}
                {isManagementOpen && (
                  <div className={`my-1 flex flex-col gap-1 ${isCollapsed ? "items-center" : "ml-6 pl-2 border-l border-white/20"}`}>
                    {managementItems.map((item) => (
                      <NavLink
                        key={item.name}
                        to={item.path}
                        onClick={() => handleNavClick(false)}
                        className={({ isActive }) => `
                          relative flex items-center transition-all duration-200 group
                          ${isCollapsed ? "justify-center p-2 rounded-xl" : "gap-2.5 px-3 py-2 rounded-l-xl text-xs font-medium"}
                          ${
                            isActive
                              ? "bg-gray-50 text-[#0284c7] font-bold shadow-xs"
                              : "text-white/80 hover:text-white hover:bg-white/10"
                          }
                        `}
                      >
                        <span className="shrink-0">{item.icon}</span>
                        {!isCollapsed && <span>{item.name}</span>}
                        {isCollapsed && (
                          <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-xl shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50 border border-slate-700/60 flex items-center">
                            <span>{item.name}</span>
                            <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900"></div>
                          </div>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>
        </div>

        {/* Bottom Actions: Logout */}
        <div className="px-1 mt-4">
          <button
            onClick={() => {
              logout();
              handleNavClick(true);
            }}
            className={`relative flex items-center transition-all duration-200 text-white/90 hover:text-white hover:bg-rose-500/25 font-semibold rounded-l-2xl cursor-pointer group pt-2.5 border-t border-white/15 ${
              isCollapsed ? "justify-center mx-2 px-0 py-3" : "gap-3.5 ml-3.5 pl-3.5 pr-3 py-3"
            }`}
          >
            <span className="shrink-0 group-hover:scale-110 transition-transform text-rose-200 group-hover:text-white">
              <LogOut size={20} />
            </span>
            {!isCollapsed && <span className="text-sm">Logout</span>}
            {isCollapsed && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-xl shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50 flex items-center gap-1.5 border border-rose-400/40">
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
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-30 md:hidden" 
          onClick={() => setIsOpen(false)}
        ></div>
      )}
    </>
  );
};

export default Sidebar;
