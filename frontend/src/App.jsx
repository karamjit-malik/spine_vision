import { Navigate, createBrowserRouter } from "react-router-dom";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/dashboard" replace /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    element: <ProtectedRoute />,
    children: [{ path: "/dashboard", element: <DashboardPage /> }],
  },
  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);
