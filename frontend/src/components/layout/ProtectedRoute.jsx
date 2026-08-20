import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

/** Redirects to /login when there is no session. */
export function ProtectedRoute() {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}
