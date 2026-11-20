import { NavLink, useLocation, useNavigate } from "react-router-dom";
import React, { useState } from "react"; 
import {
  LayoutDashboard,
  Calculator,
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
  ShoppingCart
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

  React.useEffect(() => {
    if (location.pathname.startsWith("/enquiries")) {
      setIsEnquiriesOpen(true);
    }
  }, [location.pathname]);

  const navItems = [
    { name: "Dashboard", path: "/dashboard", icon: <LayoutDashboard size={19} /> },
    { name: "Enquiries", path: "/enquiries", icon: <Calculator size={19} /> },
    { name: "Bills", path: "/bills", icon: <Receipt size={19} /> },
    { name: "PNL", path: "/pnl", icon: <TrendingUp size={19} /> },
    { name: "Tasks", path: "/task", icon: <ListTodo size={19} /> },
    { name: "Dropped", path: "/dropped", icon: <Calculator size={19} /> },
    { name: "Inventory", path: "/inventory", icon: <Package size={19} /> },
    { name: "Training", path: "/training", icon: <GraduationCap size={19} /> },
    { name: "Reports", path: "/reports", icon: <BarChart3 size={19} /> },
  ];
  
  const managementItems = [
    { name: "Manage Users", path: "/admin/manage-users", icon: <Users size={16} /> },
    { name: "Manage Teams", path: "/manage-teams", icon: <UsersRound size={16} /> },
  ];

  const enquiryItems = [
    { name: "All Enquiries", path: "/enquiries", icon: <Calculator size={15} /> },
    { name: "E-commerce", path: "/enquiries/ecommerce", icon: <ShoppingCart size={15} /> },
    { name: "Academic", path: "/enquiries/academic", icon: <GraduationCap size={15} /> },
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
      setIsEnquiriesOpen((prev) => !prev);
      if (!location.pathname.startsWith("/enquiries")) {
        navigate("/enquiries");
        handleNavClick(false);
      }
    }
  };

  const isEnquiriesActive = location.pathname.startsWith("/enquiries");

  const handleManagementClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isCollapsed) {
      navigate("/admin/manage-users");
      handleNavClick(false);
    } else {
      setIsManagementOpen(!isManagementOpen);
    }
  };

  const isManagementActive = location.pathname.startsWith("/admin/manage-users") || location.pathname.startsWith("/manage-teams");

  return (
    <>
      {/* Mobile Menu Button */}
      <button 
        onClick={() => setIsOpen(true)} 
        className="md:hidden fixed top-3.5 left-3.5 z-40 p-2 text-slate-700 bg-white rounded-xl shadow-sm border border-slate-200 hover:bg-slate-50 cursor-pointer"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Docked Clean Professional Sidebar */}
      <aside 
        className={`
          fixed top-0 bottom-0 left-0 z-40
          bg-slate-900 border-r border-slate-800 text-slate-300
          transition-all duration-300 ease-in-out select-none
          flex flex-col justify-between py-4 shadow-lg
          ${isCollapsed ? "w-20" : "w-64"}
          ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header area with Logo */}
          {!isCollapsed ? (
            <div className="flex items-center justify-between px-4 mb-4 shrink-0">
              <div className="flex items-center bg-white px-3 py-1.5 rounded-xl shadow-xs">
                <img 
                  src="/ibots-logo.png" 
                  alt="iBots" 
                  className="h-6 w-auto max-w-[120px] object-contain"
                />
              </div>

              <div className="flex items-center gap-1">
                {onToggleCollapse && (
                  <button 
                    onClick={onToggleCollapse}
                    className="hidden md:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    title="Collapse sidebar"
                    aria-label="Collapse sidebar"
                  >
                    <Menu size={18} />
                  </button>
                )}

                <button 
                  onClick={() => setIsOpen(false)} 
                  className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  aria-label="Close menu"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 mb-4 px-2 shrink-0">
              <div 
                onClick={onToggleCollapse} 
                className="w-10 h-10 bg-white rounded-xl shadow-xs p-1 flex items-center justify-center cursor-pointer hover:shadow-md transition-all"
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
                  className="hidden md:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer justify-center"
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                >
                  <Menu size={18} />
                </button>
              )}
            </div>
          )}

          {/* Navigation Items */}
          <nav className="flex flex-col gap-1 overflow-y-auto no-scrollbar flex-1 min-h-0 px-2.5">
            {navItems.map((item) => {
              if (item.name === "Enquiries") {
                return (
                  <div key={item.name} className="flex flex-col">
                    <button
                      onClick={handleEnquiriesClick}
                      className={`relative flex items-center transition-colors duration-150 cursor-pointer group ${
                        isCollapsed
                          ? "justify-center mx-auto w-10 h-10 my-0.5 rounded-lg"
                          : "justify-between px-3 py-2.5 rounded-lg text-sm"
                      } ${
                        isEnquiriesActive && !isEnquiriesOpen
                          ? isCollapsed
                            ? "bg-slate-800 text-white font-semibold shadow-xs"
                            : "bg-slate-800 text-white font-semibold shadow-xs border-l-2 border-blue-500"
                          : isEnquiriesActive
                          ? "bg-slate-800/80 text-white font-semibold shadow-xs"
                          : "text-slate-300 hover:text-white hover:bg-slate-800/60 font-medium"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`shrink-0 transition-transform duration-150 ${
                            isEnquiriesActive ? "text-blue-400" : "text-slate-400 group-hover:text-white"
                          }`}
                        >
                          {item.icon}
                        </span>
                        {!isCollapsed && <span className="truncate">{item.name}</span>}
                      </div>

                      {!isCollapsed && (
                        <span className="text-slate-400 group-hover:text-white">
                          {isEnquiriesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </span>
                      )}

                      {/* Floating Flyout Tooltip (Collapsed Mode) */}
                      {isCollapsed && (
                        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 p-2 bg-slate-800 text-white text-xs font-medium rounded-md shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-150 whitespace-nowrap z-50 border border-slate-700 flex flex-col gap-1">
                          <span className="font-bold text-slate-300 pb-1 border-b border-slate-700">Enquiries</span>
                          <NavLink to="/enquiries" end onClick={() => handleNavClick(false)} className="hover:text-blue-400 py-0.5">All Enquiries</NavLink>
                          <NavLink to="/enquiries/ecommerce" onClick={() => handleNavClick(false)} className="hover:text-blue-400 py-0.5">E-commerce</NavLink>
                          <NavLink to="/enquiries/academic" onClick={() => handleNavClick(false)} className="hover:text-blue-400 py-0.5">Academic</NavLink>
                          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800"></div>
                        </div>
                      )}
                    </button>

                    {/* Sub-items (Expanded Mode) */}
                    {!isCollapsed && isEnquiriesOpen && (
                      <div className="my-1 flex flex-col gap-0.5 ml-5 pl-2.5 border-l border-slate-800">
                        {enquiryItems.map((subItem) => (
                          <NavLink
                            key={subItem.name}
                            to={subItem.path}
                            end={subItem.path === "/enquiries"}
                            onClick={() => handleNavClick(false)}
                            className={({ isActive }) => `
                              flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors
                              ${
                                isActive
                                  ? "bg-slate-800 text-white font-semibold border-l-2 border-blue-500"
                                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                              }
                            `}
                          >
                            <span className="shrink-0">{subItem.icon}</span>
                            <span className="truncate">{subItem.name}</span>
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
              <NavLink
                key={item.name}
                to={item.path}
                end={item.path === "/dashboard"}
                onClick={() => handleNavClick(false)}
                className={({ isActive }) => `
                  relative flex items-center transition-colors duration-150 group
                  ${isCollapsed ? "justify-center mx-auto w-10 h-10 my-0.5 rounded-lg" : "gap-3 px-3 py-2.5 rounded-lg text-sm"}
                  ${
                    isActive
                      ? isCollapsed
                        ? "bg-slate-800 text-white font-semibold shadow-xs"
                        : "bg-slate-800 text-white font-semibold shadow-xs border-l-2 border-blue-500"
                      : "text-slate-300 hover:text-white hover:bg-slate-800/60 font-medium"
                  }
                `}
              >
                {({ isActive }) => (
                  <>
                    {/* Icon */}
                    <span 
                      className={`shrink-0 transition-transform duration-150 ${
                        isActive ? "text-blue-400" : "text-slate-400 group-hover:text-white"
                      }`}
                    >
                      {item.icon}
                    </span>

                    {/* Label (Expanded Mode) */}
                    {!isCollapsed && (
                      <span className="truncate">
                        {item.name}
                      </span>
                    )}

                    {/* Floating Tooltip (Collapsed Mode) */}
                    {isCollapsed && (
                      <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-800 text-white text-xs font-medium rounded-md shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50 border border-slate-700 flex items-center">
                        <span>{item.name}</span>
                        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800"></div>
                      </div>
                    )}
                  </>
                )}
              </NavLink>
              );
            })}

            {/* Management Section (Admin Only) */}
            {user?.role === "admin" && (
              <div className="flex flex-col mt-1 pt-1 border-t border-slate-800/80">
                <button
                  onClick={handleManagementClick}
                  className={`relative flex items-center transition-colors duration-150 text-slate-300 hover:text-white hover:bg-slate-800/60 font-medium cursor-pointer group ${
                    isCollapsed ? "justify-center mx-auto w-10 h-10 my-0.5 rounded-lg" : "justify-between px-3 py-2.5 rounded-lg text-sm"
                  } ${isManagementActive && !isManagementOpen ? "bg-slate-800 text-white font-semibold" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`${isManagementActive ? "text-blue-400" : "text-slate-400 group-hover:text-white"}`}>
                      <Settings size={19} />
                    </span>
                    {!isCollapsed && <span className="truncate">Management</span>}
                  </div>
                  {!isCollapsed && (isManagementOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}

                  {isCollapsed && (
                    <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-800 text-white text-xs font-medium rounded-md shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50 border border-slate-700 flex items-center">
                      <span>Management</span>
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800"></div>
                    </div>
                  )}
                </button>

                {/* Sub-items - only rendered when not collapsed */}
                {!isCollapsed && isManagementOpen && (
                  <div className="my-1 flex flex-col gap-0.5 ml-5 pl-2.5 border-l border-slate-800">
                    {managementItems.map((item) => (
                      <NavLink
                        key={item.name}
                        to={item.path}
                        onClick={() => handleNavClick(false)}
                        className={({ isActive }) => `
                          flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors
                          ${
                            isActive
                              ? "bg-slate-800 text-white font-semibold border-l-2 border-blue-500"
                              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
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
        <div className="shrink-0 pt-3 px-3 pb-1 border-t border-slate-800">
          <button
            onClick={() => {
              logout();
              handleNavClick(true);
            }}
            className={`relative flex items-center transition-colors duration-150 text-slate-400 hover:text-rose-300 hover:bg-rose-950/25 font-medium cursor-pointer group ${
              isCollapsed ? "w-10 h-10 mx-auto justify-center rounded-lg" : "w-full gap-3 px-3 py-2.5 rounded-lg text-sm"
            }`}
            title={isCollapsed ? "" : "Logout"}
          >
            <span className="shrink-0 group-hover:text-rose-300">
              <LogOut size={19} />
            </span>
            {!isCollapsed && <span>Logout</span>}
            {isCollapsed && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-rose-900 text-white text-xs font-medium rounded-md shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 whitespace-nowrap z-50 flex items-center gap-1.5 border border-rose-700">
                <span>Logout</span>
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-rose-900"></div>
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
