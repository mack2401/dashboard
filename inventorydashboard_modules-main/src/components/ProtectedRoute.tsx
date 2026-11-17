import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../App";

type Props = {
  children: React.ReactElement;
  allowedRoles?: string[]; // if omitted -> any authenticated user
};

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const auth = useAuth();
  const user = auth?.user ?? null;
  const loading = auth?.loading ?? true;
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-gray-500 font-medium">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && (!user.role || !allowedRoles.includes(user.role))) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}