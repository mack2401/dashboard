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
      {/* Mobile Menu Button - Visible on small screens, hidden on md and up */}
      <button 
        onClick={() => setIsOpen(true)} 
        className="md:hidden fixed top-4 left-4 z-40 p-2 text-gray-700 bg-white rounded-xl shadow-md border border-gray-200 hover:bg-gray-50"
        aria-label="Open menu"
      >
        <Menu size={22} />
      </button>

      {/* Desktop 3-Line Menu Button - Shown when sidebar is collapsed/hidden */}
      {isCollapsed && onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="hidden md:flex fixed top-4 left-4 z-40 p-2.5 bg-white/95 hover:bg-gray-50 text-gray-700 hover:text-gray-900 rounded-2xl shadow-lg border border-gray-200/90 backdrop-blur-xs transition-all duration-200 cursor-pointer items-center justify-center group hover:scale-105 hover:border-blue-400"
          title="Open navigation panel"
          aria-label="Open navigation panel"
        >
          <Menu size={20} className="text-gray-700 group-hover:text-blue-600 transition-colors" />
        </button>
      )}

      {/* Sidebar - Modern Floating Island Shape in Light Theme */}
      <aside 
        className={`
          w-64 fixed top-3 bottom-3 left-3 bg-white/95 backdrop-blur-md border border-gray-200/90 shadow-xl shadow-slate-200/60 rounded-3xl p-4 overflow-y-auto z-40 transition-all duration-300 ease-in-out
          ${isCollapsed ? '-translate-x-[115%] md:-translate-x-[115%] pointer-events-none' : (isOpen ? 'translate-x-0' : '-translate-x-[115%] md:translate-x-0')}
        `}
      >
        <div className="flex justify-between items-center mb-5 pt-1">
          <div className="flex items-center bg-gray-50/90 px-3 py-1.5 rounded-2xl border border-gray-200/60 shadow-2xs">
            <img 
              src="/ibots-logo.png" 
              alt="iBots" 
              className="h-7 w-auto max-w-[130px] object-contain"
            />
          </div>

          <div className="flex items-center gap-1">
            {/* Desktop 3-Line Hide Button inside header */}
            {onToggleCollapse && (
              <button 
                onClick={onToggleCollapse}
                className="hidden md:flex p-2 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                title="Hide navigation panel"
                aria-label="Hide navigation panel"
              >
                <Menu size={20} />
              </button>
            )}

            {/* Close Button - Visible only on mobile inside the sidebar */}
            <button 
              onClick={() => setIsOpen(false)} 
              className="md:hidden p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* User Role Card */}
        <div className="mb-5 px-3.5 py-2.5 bg-gray-50/90 border border-gray-200/70 rounded-2xl flex items-center justify-between shadow-2xs">
          <div className="truncate">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Welcome</p>
            <p className="text-sm font-bold text-gray-800 capitalize truncate">{user?.name || user?.role || 'User'}</p>
          </div>
          <span className="px-2.5 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80 rounded-full uppercase tracking-wider shrink-0">
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
                className="flex items-center w-full gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-medium text-sm cursor-pointer"
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
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-md shadow-blue-500/20" 
                      : "text-gray-600 hover:bg-gray-100/80 hover:text-gray-900"
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
                className="flex items-center justify-between w-full gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Settings size={18} />
                  <span>Management</span>
                </div>
                {isManagementOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              
              {/* Dropdown items */}
              {isManagementOpen && (
                <div className="ml-4 pl-3 border-l-2 border-gray-200 my-1 flex flex-col gap-1">
                  {managementItems.map((item) => (
                    <NavLink
                      key={item.name}
                      to={item.path}
                      onClick={() => handleNavClick(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 text-xs font-medium ${
                          isActive 
                            ? "bg-blue-600 text-white font-semibold shadow-2xs" 
                            : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
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
                className="flex items-center w-full gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-medium text-sm cursor-pointer mt-3 pt-3 border-t border-gray-100"
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
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-md shadow-blue-500/20" 
                      : "text-gray-600 hover:bg-gray-100/80 hover:text-gray-900"
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