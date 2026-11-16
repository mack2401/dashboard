import React, { useState } from "react";
import Sidebar from "../components/Sidebar";
import { Outlet } from "react-router-dom";

const SidebarLayout = () => {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar_collapsed", String(next));
      } catch (e) {
        console.error("Failed to save sidebar state:", e);
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-gray-50">
      <Sidebar isCollapsed={isCollapsed} onToggleCollapse={toggleSidebar} />
      <main
        className={`flex-1 min-w-0 p-3 md:p-6 bg-gray-50 min-h-screen overflow-x-hidden transition-[margin,padding] duration-300 ease-in-out ${
          isCollapsed ? "md:ml-0 md:pl-16" : "md:ml-64"
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
};

export default SidebarLayout;
