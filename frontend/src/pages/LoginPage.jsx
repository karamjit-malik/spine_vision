import { Navigate } from "react-router-dom";
import { LoginForm } from "@/components/auth/LoginForm";
import { Disclaimer } from "@/components/layout/Disclaimer";
import { useAuthStore } from "@/stores/authStore";

export default function LoginPage() {
  const user = useAuthStore((state) => state.user);
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm animate-fade-up space-y-8">
        <div className="space-y-2 text-center">
          <img src="/spine-vision-logo.svg" alt="" className="mx-auto h-12 w-12" />
          <h1 className="text-2xl font-semibold tracking-[0.28em] text-ash-100">
            SPINE VISION
          </h1>
          <p className="text-xs uppercase tracking-[0.2em] text-ash-500">
            AI-Powered Spine Diagnostics
          </p>
        </div>

        <div className="panel p-6">
          <LoginForm />
        </div>

        <Disclaimer />
      </div>
    </main>
  );
}
