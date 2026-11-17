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
  ];

  const bottomNavItems = [
    { name: "Bills", path:"/bills", icon:<Receipt size={20}/>},
    { name: "PNL", path: "/pnl", icon: <TrendingUp size={20} /> },
    { name: "Tasks", path:"/task", icon:<ListTodo size={20}/>},
    { name: "Dropped", path: "/dropped", icon: <Calculator size={20} /> },
    { name: "Inventory", path:"/inventory", icon:<Package size={20}/>},
    { name: "Training", path:"/training", icon:<GraduationCap size={20}/>},
    { name: "Reports", path:"/reports", icon:<BarChart3 size={20}/>},
  ];
  
  const managementItems = [
    { name: "Manage Users", path: "/admin/manage-users", icon: <Users size={17} /> },
    { name: "Manage Teams", path: "/manage-teams", icon: <UsersRound size={17} /> },
  ];

  const handleNavClick = (isAction: boolean) => {
    if (!isAction) {
      setIsOpen(false);
    }
  };

  const handleEnquiriesClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isCollapsed) {
      navigate("/enquiries");
      handleNavClick(false);
    } else {
      setIsEnquiriesOpen(!isEnquiriesOpen);
    }
  };

  const handleManagementClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isCollapsed) {
      navigate("/admin/manage-users");
      handleNavClick(false);
    } else {
      setIsManagementOpen(!isManagementOpen);
    }
  };

  const isEnquiriesActive = location.pathname.startsWith("/enquiries");
  const isManagementActive = location.pathname.startsWith("/admin/manage-users") || location.pathname.startsWith("/manage-teams");

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
          bg-gradient-to-b from-[#1E315B] via-[#213562] to-[#192A4E]
          rounded-[28px] shadow-xl shadow-[#1E315B]/30
          transition-all duration-300 ease-in-out select-none
          flex flex-col justify-between py-3
          ${isCollapsed ? "overflow-visible w-[72px]" : "overflow-y-auto no-scrollbar w-[256px]"}
          ${isOpen ? "translate-x-0" : "-translate-x-[120%] md:translate-x-0"}
        `}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header area */}
          {!isCollapsed ? (
            <div className="flex items-center justify-between px-3.5 mb-3 shrink-0">
              <div className="flex items-center bg-white px-3 py-1.5 rounded-xl shadow-xs">
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
                    className="hidden md:flex p-1.5 text-white/80 hover:text-white hover:bg-[#293F70] rounded-xl transition-colors cursor-pointer"
                    title="Collapse sidebar"
                    aria-label="Collapse sidebar"
                  >
                    <Menu size={19} />
                  </button>
                )}

                {/* Mobile Close Button */}
                <button 
                  onClick={() => setIsOpen(false)} 
                  className="md:hidden p-1.5 text-white/80 hover:text-white hover:bg-[#293F70] rounded-xl transition-colors cursor-pointer"
                  aria-label="Close menu"
                >
                  <X size={19} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 mb-2.5 px-2 shrink-0">
              <div 
                onClick={onToggleCollapse} 
                className="w-10 h-10 bg-white rounded-xl shadow-xs p-1 flex items-center justify-center cursor-pointer hover:shadow-md hover:scale-105 transition-all"
                title="Expand sidebar"
              >
                <img 
                  src="/ibots-logo.png" 
                  alt="iBots" 
                  className="w-full h-full object-contain"
                />
              </div>
              {onToggleCollapse && (
                <button 
                  onClick={onToggleCollapse}
                  className="hidden md:flex p-1.5 text-white/90 hover:text-white hover:bg-white/15 rounded-xl transition-colors cursor-pointer justify-center"
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                >
                  <Menu size={18} />
                </button>
              )}
            </div>
          )}

          {/* Navigation Items with Inverted Curved Active Indicator */}
          <nav className="flex flex-col gap-1 sm:gap-1.5 overflow-y-auto no-scrollbar flex-1 min-h-0">
            {topNavItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => handleNavClick(false)}
                className={({ isActive }) => `
                  relative flex items-center transition-colors duration-150 group
                  ${isCollapsed ? "justify-center mx-auto w-10 h-10 my-0.5 rounded-xl" : "gap-3.5 ml-3.5 pl-3.5 pr-3 py-2.5 rounded-l-[24px]"}
                  ${
                    isActive
                      ? isCollapsed
                        ? "bg-[#F5F6FC] text-[#7889F5] font-bold shadow-xs"
                        : "bg-[#F5F6FC] text-[#7889F5] font-bold z-10"
                      : "text-white/90 hover:text-white hover:bg-[#293F70] font-medium rounded-l-xl"
                  }
                `}
              >
                {({ isActive }) => (
                  <>
                    {/* Seamless Inverted Fillet Curves connecting into page background */}
                    {isActive && !isCollapsed && (
                      <>
                        {/* Top Inverted Curve */}
                        <svg 
                          className="absolute -top-5 right-0 w-5 h-5 pointer-events-none fill-[#F5F6FC]" 
                          viewBox="0 0 20 20"
                        >
                          <path d="M 20 0 V 20 H 0 C 11.0457 20 20 11.0457 20 0 Z" />
                        </svg>

                        {/* Bottom Inverted Curve */}
                        <svg 
                          className="absolute -bottom-5 right-0 w-5 h-5 pointer-events-none fill-[#F5F6FC]" 
                          viewBox="0 0 20 20"
                        >
                          <path d="M 20 20 V 0 H 0 C 11.0457 0 20 8.9543 20 20 Z" />
                        </svg>
                      </>
                    )}

                    {/* Icon */}
                    <span 
                      className={`shrink-0 transition-transform duration-200 ${
                        isActive ? "text-[#7889F5]" : "text-white group-hover:scale-110"
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
                      <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#1E315B] text-white text-xs font-semibold rounded-xl shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50 border border-[#E1E5F0]/30 flex items-center">
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
                className={`relative flex items-center transition-all duration-200 text-white/90 hover:text-white hover:bg-[#293F70] font-medium cursor-pointer group ${
                  isCollapsed ? "justify-center mx-auto w-10 h-10 my-0.5 rounded-xl" : "justify-between ml-3.5 pl-3.5 pr-3 py-2.5 rounded-l-xl"
                } ${isEnquiriesActive && !isEnquiriesOpen ? (isCollapsed ? "bg-[#F5F6FC] text-[#7889F5] font-bold shadow-xs" : "bg-white/15 text-white font-semibold") : ""}`}
              >
                <div className="flex items-center gap-3.5">
                  <span className={`${isEnquiriesActive && isCollapsed ? "text-[#7889F5]" : "text-white"} group-hover:scale-110 transition-transform`}>
                    <Calculator size={20} />
                  </span>
                  {!isCollapsed && <span className="text-sm font-semibold">Enquiries</span>}
                </div>
                {!isCollapsed && (isEnquiriesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}

                {isCollapsed && (
                  <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#1E315B] text-white text-xs font-semibold rounded-xl shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50 border border-[#E1E5F0]/30 flex items-center">
                    <span>Enquiries</span>
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#1E315B]"></div>
                  </div>
                )}
              </button>

              {/* Sub-items - only rendered when not collapsed */}
              {!isCollapsed && isEnquiriesOpen && (
                <div className="my-1 flex flex-col gap-0.5 ml-6 pl-2.5 border-l border-white/20">
                  {enquiryItems.map((item) => (
                    <NavLink
                      key={item.name}
                      to={item.path}
                      end={item.path === "/enquiries"}
                      onClick={() => handleNavClick(false)}
                      className={({ isActive }) => `
                        relative flex items-center transition-all duration-200 group
                        gap-2.5 px-3 py-2 rounded-l-xl text-xs font-medium
                        ${
                          isActive
                            ? "bg-[#F5F6FC] text-[#7889F5] font-bold shadow-xs"
                            : "text-white/80 hover:text-white hover:bg-[#293F70]"
                        }
                      `}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      <span>{item.name}</span>
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
                  relative flex items-center transition-colors duration-150 group
                  ${isCollapsed ? "justify-center mx-auto w-10 h-10 my-0.5 rounded-xl" : "gap-3.5 ml-3.5 pl-3.5 pr-3 py-2.5 rounded-l-[24px]"}
                  ${
                    isActive
                      ? isCollapsed
                        ? "bg-[#F5F6FC] text-[#7889F5] font-bold shadow-xs"
                        : "bg-[#F5F6FC] text-[#7889F5] font-bold z-10"
                      : "text-white/90 hover:text-white hover:bg-[#293F70] font-medium rounded-l-xl"
                  }
                `}
              >
                {({ isActive }) => (
                  <>
                    {/* Seamless Inverted Fillet Curves connecting into page background */}
                    {isActive && !isCollapsed && (
                      <>
                        {/* Top Inverted Curve */}
                        <svg 
                          className="absolute -top-5 right-0 w-5 h-5 pointer-events-none fill-[#F5F6FC]" 
                          viewBox="0 0 20 20"
                        >
                          <path d="M 20 0 V 20 H 0 C 11.0457 20 20 11.0457 20 0 Z" />
                        </svg>

                        {/* Bottom Inverted Curve */}
                        <svg 
                          className="absolute -bottom-5 right-0 w-5 h-5 pointer-events-none fill-[#F5F6FC]" 
                          viewBox="0 0 20 20"
                        >
                          <path d="M 20 20 V 0 H 0 C 11.0457 0 20 8.9543 20 20 Z" />
                        </svg>
                      </>
                    )}

                    {/* Icon */}
                    <span 
                      className={`shrink-0 transition-transform duration-200 ${
                        isActive ? "text-[#7889F5]" : "text-white group-hover:scale-110"
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
                      <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#1E315B] text-white text-xs font-semibold rounded-xl shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50 border border-[#E1E5F0]/30 flex items-center">
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
                  className={`relative flex items-center transition-all duration-200 text-white/90 hover:text-white hover:bg-[#293F70] font-medium cursor-pointer group ${
                    isCollapsed ? "justify-center mx-auto w-10 h-10 my-0.5 rounded-xl" : "justify-between ml-3.5 pl-3.5 pr-3 py-2.5 rounded-l-xl"
                  } ${isManagementActive && !isManagementOpen ? (isCollapsed ? "bg-[#F5F6FC] text-[#7889F5] font-bold shadow-xs" : "bg-white/15 text-white font-semibold") : ""}`}
                >
                  <div className="flex items-center gap-3.5">
                    <span className={`${isManagementActive && isCollapsed ? "text-[#7889F5]" : "text-white"} group-hover:scale-110 transition-transform`}>
                      <Settings size={20} />
                    </span>
                    {!isCollapsed && <span className="text-sm font-semibold">Management</span>}
                  </div>
                  {!isCollapsed && (isManagementOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}

                  {isCollapsed && (
                    <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#1E315B] text-white text-xs font-semibold rounded-xl shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50 border border-[#E1E5F0]/30 flex items-center">
                      <span>Management</span>
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#1E315B]"></div>
                    </div>
                  )}
                </button>

                {/* Sub-items - only rendered when not collapsed */}
                {!isCollapsed && isManagementOpen && (
                  <div className="my-1 flex flex-col gap-0.5 ml-6 pl-2.5 border-l border-white/20">
                    {managementItems.map((item) => (
                      <NavLink
                        key={item.name}
                        to={item.path}
                        onClick={() => handleNavClick(false)}
                        className={({ isActive }) => `
                          relative flex items-center transition-all duration-200 group
                          gap-2.5 px-3 py-2 rounded-l-xl text-xs font-medium
                          ${
                            isActive
                              ? "bg-[#F5F6FC] text-[#7889F5] font-bold shadow-xs"
                              : "text-white/80 hover:text-white hover:bg-[#293F70]"
                          }
                        `}
                      >
                        <span className="shrink-0">{item.icon}</span>
                        <span>{item.name}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>
        </div>

        {/* Bottom Actions: Logout */}
        <div className="shrink-0 pt-3 px-2.5 pb-1 border-t border-white/15 mt-3 sm:mt-4">
          <button
            onClick={() => {
              logout();
              handleNavClick(true);
            }}
            className={`relative flex items-center transition-all duration-200 text-white hover:bg-rose-500/25 font-semibold cursor-pointer group ${
              isCollapsed ? "w-10 h-10 mx-auto justify-center rounded-xl" : "w-full gap-3.5 px-3.5 py-2.5 rounded-xl"
            }`}
            title={isCollapsed ? "" : "Logout"}
          >
            <span className="shrink-0 group-hover:scale-110 transition-transform text-rose-200 group-hover:text-white">
              <LogOut size={20} />
            </span>
            {!isCollapsed && <span className="text-sm font-semibold">Logout</span>}
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
