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
  ChevronLeft,
  ChevronRight,
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
      {/* Mobile Menu Button - Visible on small screens, hidden on md and up */}
      <button 
        onClick={() => setIsOpen(true)} 
        className="md:hidden fixed top-4 left-4 z-40 p-2 text-gray-700 bg-white rounded-lg shadow-md hover:bg-gray-100"
        aria-label="Open menu"
      >
        <Menu size={24} />
      </button>

      {/* Desktop Unhide Arrow Button - Shown when sidebar is collapsed/hidden */}
      {isCollapsed && onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="hidden md:flex fixed top-6 left-0 z-40 items-center gap-1.5 pl-2.5 pr-3.5 py-2 bg-slate-900/95 hover:bg-slate-800 text-slate-200 hover:text-white rounded-r-xl shadow-2xl border-y border-r border-slate-700/80 hover:border-sky-500/50 backdrop-blur-xs transition-all duration-200 cursor-pointer group"
          title="Unhide navigation panel"
          aria-label="Unhide navigation panel"
        >
          <ChevronRight size={18} className="text-sky-400 group-hover:text-sky-300 group-hover:translate-x-0.5 transition-transform" />
          <span className="text-xs font-semibold tracking-wide">Menu</span>
        </button>
      )}

      {/* Desktop Toggle Arrow on the right border of sidebar (when expanded) */}
      {!isCollapsed && onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="hidden md:flex fixed top-6 left-[242px] z-50 items-center justify-center w-7 h-7 bg-slate-900 hover:bg-sky-600 text-slate-300 hover:text-white rounded-full border border-slate-700 shadow-md transition-all duration-300 cursor-pointer group"
          title="Hide navigation panel"
          aria-label="Hide navigation panel"
        >
          <ChevronLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
        </button>
      )}

      {/* Sidebar - Positioned for fixed, full height */}
      <aside 
        className={`
          w-64 h-screen bg-slate-900 border-r border-slate-800 shadow-2xl p-4 fixed top-0 left-0 overflow-y-auto z-40 transition-transform duration-300 ease-in-out
          ${isCollapsed ? '-translate-x-full md:-translate-x-full pointer-events-none' : (isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0')}
        `}
      >
        <div className="flex justify-between items-center mb-6 pt-1">
          <div className="flex items-center bg-white px-3 py-1.5 rounded-xl shadow-xs">
            <img 
              src="/ibots-logo.png" 
              alt="iBots" 
              className="h-7 w-auto max-w-[130px] object-contain"
            />
          </div>

          <div className="flex items-center gap-1">
            {/* Desktop Hide Button inside header */}
            {onToggleCollapse && (
              <button 
                onClick={onToggleCollapse}
                className="hidden md:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Hide navigation panel"
                aria-label="Hide navigation panel"
              >
                <ChevronLeft size={20} />
              </button>
            )}

            {/* Close Button - Visible only on mobile inside the sidebar */}
            <button 
              onClick={() => setIsOpen(false)} 
              className="md:hidden p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* User Role Card */}
        <div className="mb-6 px-3 py-2.5 bg-slate-800/70 border border-slate-700/60 rounded-xl flex items-center justify-between">
          <div className="truncate">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Welcome</p>
            <p className="text-sm font-bold text-white capitalize truncate">{user?.name || user?.role || 'User'}</p>
          </div>
          <span className="px-2 py-0.5 text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded-full uppercase tracking-wider shrink-0">
            {user?.role || 'Staff'}
          </span>
        </div>

        <nav className="flex flex-col gap-1.5">
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
                className="flex items-center w-full gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 font-medium text-sm cursor-pointer"
              >
                {item.icon}
                {item.name}
              </button>
            ) : (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => handleNavClick(isAction)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium ${
                    isActive 
                      ? "bg-sky-500 text-white font-semibold shadow-md shadow-sky-900/30" 
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`
                }
              >
                {item.icon}
                {item.name}
              </NavLink>
            )
          })}

          {/* Management Dropdown - Only for admin users */}
          {user?.role === "admin" && (
            <div className="flex flex-col">
              <button
                onClick={handleManagementClick}
                className="flex items-center justify-between w-full gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Settings size={18} />
                  <span>Management</span>
                </div>
                {isManagementOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              
              {/* Dropdown items */}
              {isManagementOpen && (
                <div className="ml-4 pl-3 border-l border-slate-700/80 my-1 flex flex-col gap-1">
                  {managementItems.map((item) => (
                    <NavLink
                      key={item.name}
                      to={item.path}
                      onClick={() => handleNavClick(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 text-xs font-medium ${
                          isActive 
                            ? "bg-sky-500 text-white font-semibold shadow-xs" 
                            : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        }`
                      }
                    >
                      {item.icon}
                      {item.name}
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
                className="flex items-center w-full gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 font-medium text-sm cursor-pointer mt-3 pt-3 border-t border-slate-800"
              >
                {item.icon}
                {item.name}
              </button>
            ) : (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => handleNavClick(isAction)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium ${
                    isActive 
                      ? "bg-sky-500 text-white font-semibold shadow-md shadow-sky-900/30" 
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`
                }
              >
                {item.icon}
                {item.name}
              </NavLink>
            )
          })}
        </nav>
      </aside>
      
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden" 
          onClick={() => setIsOpen(false)}
        ></div>
      )}
    </>
  );
};

export default Sidebar;