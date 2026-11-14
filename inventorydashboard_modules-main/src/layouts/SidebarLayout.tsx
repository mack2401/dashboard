import Sidebar from "../components/Sidebar";
import { Outlet } from "react-router-dom";

const SidebarLayout = () => {
  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-gray-50">
      <Sidebar />
      <main className="md:ml-64 flex-1 min-w-0 p-3 md:p-6 bg-gray-50 min-h-screen overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
};

export default SidebarLayout;
