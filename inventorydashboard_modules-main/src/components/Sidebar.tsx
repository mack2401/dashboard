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
    { name: "Dashboard", path: "/dashboard", icon: <LayoutDashboard size={18} /> },
    { name: "Enquiries", path: "/enquiries", icon: <Calculator size={18} /> },
    { name: "Bills", path:"/bills", icon:<Receipt size={18}/>},
    { name: "PNL", path: "/pnl", icon: <TrendingUp size={18} /> },
    { name: "Tasks", path:"/task", icon:<ListTodo size={18}/>},
    { name: "Dropped", path: "/dropped", icon: <Calculator size={18} /> },
    { name: "Inventory", path:"/inventory", icon:<Package size={18}/>},
    { name: "Training", path:"/training", icon:<GraduationCap size={18}/>},
    { name: "Reports", path:"/reports", icon:<BarChart3 size={18}/>},
    { name: "Logout", action: logout, icon: <LogOut size={18} /> },
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

  const navItems = [...baseNavItems.slice(0,2), ...baseNavItems.slice(2)];

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

      {/* Desktop 3-Line Menu Button - Shown when sidebar is collapsed/hidden */}
      {isCollapsed && onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="hidden md:flex fixed top-4 left-4 z-40 p-2.5 bg-white/95 hover:bg-slate-50 text-slate-700 hover:text-blue-600 rounded-2xl shadow-lg border border-slate-200/90 backdrop-blur-xs transition-all duration-200 cursor-pointer items-center justify-center group hover:scale-105 hover:border-blue-400"
          title="Open navigation panel"
          aria-label="Open navigation panel"
        >
          <Menu size={20} className="text-slate-700 group-hover:text-blue-600 transition-colors" />
        </button>
      )}

      {/* S-Shaped Curved Sidebar in Modern Light Theme */}
      <aside 
        className={`
          w-[285px] fixed top-0 bottom-0 left-0 z-40
          filter drop-shadow-[5px_0_18px_rgba(37,99,235,0.08)] drop-shadow-[1px_0_4px_rgba(15,23,42,0.04)]
          transition-transform duration-300 ease-in-out select-none
          ${isCollapsed ? '-translate-x-full md:-translate-x-full pointer-events-none' : (isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0')}
        `}
      >
        {/* S-Shaped SVG Background & Glowing Contour Line */}
        <svg 
          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" 
          viewBox="0 0 100 100" 
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="sidebarLightBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="35%" stopColor="#f8fbff" />
              <stop offset="68%" stopColor="#f1f6fd" />
              <stop offset="100%" stopColor="#eaf2fb" />
            </linearGradient>

            <linearGradient id="sidebarEdgeStroke" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.75" />
              <stop offset="20%" stopColor="#60a5fa" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#818cf8" stopOpacity="0.85" />
              <stop offset="80%" stopColor="#38bdf8" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.75" />
            </linearGradient>

            <radialGradient id="swellGlowTop" cx="95%" cy="18%" r="35%">
              <stop offset="0%" stopColor="#dbeafe" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>

            <radialGradient id="swellGlowBottom" cx="95%" cy="80%" r="35%">
              <stop offset="0%" stopColor="#e0e7ff" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* S-Curve Background Silhouette */}
          <path
            d="M 0,0 
               L 86,0 
               C 95,3 100,10 100,20
               C 100,32 88,40 80,50
               C 72,60 95,68 100,80
               C 100,90 95,98 86,100
               L 0,100 Z"
            fill="url(#sidebarLightBg)"
          />

          {/* Subtle Ambient Glows at the Wave Peaks */}
          <circle cx="95" cy="20" r="22" fill="url(#swellGlowTop)" />
          <circle cx="95" cy="80" r="22" fill="url(#swellGlowBottom)" />

          {/* Sculptural S-Curve Right Edge Stroke */}
          <path
            d="M 86,0 
               C 95,3 100,10 100,20
               C 100,32 88,40 80,50
               C 72,60 95,68 100,80
               C 100,90 95,98 86,100"
            fill="none"
            stroke="url(#sidebarEdgeStroke)"
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Inner Content Area - Safely fits within the S-curve waist (215px width) */}
        <div className="relative z-10 w-[215px] h-full flex flex-col justify-between pt-4 pb-4 pl-4 pr-1 overflow-y-auto sidebar-scroll pointer-events-auto">
          <div>
            {/* Header: Logo & 3-line Toggle */}
            <div className="flex justify-between items-center mb-4 pr-1">
              <div className="flex items-center bg-white/95 px-3 py-1.5 rounded-2xl border border-sky-100 shadow-2xs">
                <img 
                  src="/ibots-logo.png" 
                  alt="iBots" 
                  className="h-7 w-auto max-w-[125px] object-contain"
                />
              </div>

              <div className="flex items-center">
                {/* Desktop 3-Line Hide Button inside header */}
                {onToggleCollapse && (
                  <button 
                    onClick={onToggleCollapse}
                    className="hidden md:flex p-2 text-slate-500 hover:text-slate-800 hover:bg-white/80 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-slate-200/70"
                    title="Hide navigation panel"
                    aria-label="Hide navigation panel"
                  >
                    <Menu size={20} />
                  </button>
                )}

                {/* Close Button - Visible only on mobile inside the sidebar */}
                <button 
                  onClick={() => setIsOpen(false)} 
                  className="md:hidden p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* User Role Card */}
            <div className="mb-4 px-3 py-2 bg-white/80 backdrop-blur-xs border border-sky-100/90 rounded-2xl flex items-center justify-between shadow-2xs mr-1">
              <div className="truncate">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Welcome</p>
                <p className="text-xs font-bold text-slate-800 capitalize truncate">{user?.name || user?.role || 'User'}</p>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/70 rounded-full uppercase tracking-wider shrink-0">
                {user?.role || 'Staff'}
              </span>
            </div>

            {/* Navigation Menu */}
            <nav className="flex flex-col gap-1 pr-1">
              {/* First part of nav items (Dashboard, Enquiries) */}
              {navItems.slice(0, 2).map((item) => {
                const isAction = !!item.action;
                
                return item.action ? (
                  <button
                    key={item.name}
                    onClick={() => {
                      item.action();
                      handleNavClick(isAction);
                    }}
                    className="flex items-center w-full gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-medium text-sm cursor-pointer"
                  >
                    {item.icon}
                    <span>{item.name}</span>
                  </button>
                ) : (
                  <NavLink
                    key={item.name}
                    to={item.path}
                    onClick={() => handleNavClick(isAction)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-sm font-medium ${
                        isActive 
                          ? "bg-gradient-to-r from-blue-600 via-sky-600 to-indigo-600 text-white font-semibold shadow-md shadow-blue-500/25" 
                          : "text-slate-600 hover:bg-white/90 hover:text-blue-700 hover:shadow-2xs border border-transparent hover:border-sky-100/60"
                      }`
                    }
                  >
                    {item.icon}
                    <span>{item.name}</span>
                  </NavLink>
                );
              })}

              {/* Management Dropdown - Only for admin users */}
              {user?.role === "admin" && (
                <div className="flex flex-col">
                  <button
                    onClick={handleManagementClick}
                    className="flex items-center justify-between w-full gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-sm font-medium text-slate-600 hover:bg-white/90 hover:text-blue-700 hover:shadow-2xs border border-transparent hover:border-sky-100/60 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <Settings size={18} />
                      <span>Management</span>
                    </div>
                    {isManagementOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  
                  {/* Dropdown items */}
                  {isManagementOpen && (
                    <div className="ml-3.5 pl-2.5 border-l-2 border-sky-200 my-1 flex flex-col gap-1">
                      {managementItems.map((item) => (
                        <NavLink
                          key={item.name}
                          to={item.path}
                          onClick={() => handleNavClick(false)}
                          className={({ isActive }) =>
                            `flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-all duration-200 text-xs font-medium ${
                              isActive 
                                ? "bg-blue-600 text-white font-semibold shadow-2xs" 
                                : "text-slate-500 hover:bg-white/90 hover:text-blue-700"
                            }`
                          }
                        >
                          {item.icon}
                          <span>{item.name}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Remaining nav items (Bills, Tasks, Dropped, Inventory, Training, Reports, Logout) */}
              {navItems.slice(2).map((item) => {
                const isAction = !!item.action;
                
                return item.action ? (
                  <button
                    key={item.name}
                    onClick={() => {
                      item.action();
                      handleNavClick(isAction);
                    }}
                    className="flex items-center w-full gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-rose-600 hover:bg-rose-50/90 hover:text-rose-700 font-medium text-sm cursor-pointer mt-2 pt-2.5 border-t border-sky-100/80"
                  >
                    {item.icon}
                    <span>{item.name}</span>
                  </button>
                ) : (
                  <NavLink
                    key={item.name}
                    to={item.path}
                    onClick={() => handleNavClick(isAction)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-sm font-medium ${
                        isActive 
                          ? "bg-gradient-to-r from-blue-600 via-sky-600 to-indigo-600 text-white font-semibold shadow-md shadow-blue-500/25" 
                          : "text-slate-600 hover:bg-white/90 hover:text-blue-700 hover:shadow-2xs border border-transparent hover:border-sky-100/60"
                      }`
                    }
                  >
                    {item.icon}
                    <span>{item.name}</span>
                  </NavLink>
                );
              })}
            </nav>
          </div>
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
