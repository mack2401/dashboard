import React, { useState } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
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
    <div className="flex min-h-screen w-full overflow-x-hidden bg-[#f0f1f7]">
      <Sidebar isCollapsed={isCollapsed} onToggleCollapse={toggleSidebar} />
      <div
        className={`flex-1 min-w-0 flex flex-col min-h-screen overflow-x-hidden transition-[margin,padding] duration-300 ease-in-out ${
          isCollapsed ? "md:ml-[88px]" : "md:ml-[272px]"
        }`}
      >
        <TopBar />
        <main className="flex-1 min-w-0 p-3 md:p-6 bg-[#f0f1f7] overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default SidebarLayout;
