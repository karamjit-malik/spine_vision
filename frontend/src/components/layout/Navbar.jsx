import { LogOut, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-ink-700 bg-black/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-2.5">
          <img src="/spine-vision-logo.svg" alt="" className="h-7 w-7" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-[0.2em] text-ash-100">
              SPINE VISION
            </p>
            <p className="text-[0.65rem] uppercase tracking-[0.18em] text-ash-500">
              AI Lumbar Diagnostics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 text-sm text-ash-400 sm:flex">
            <User size={14} />
            {user?.name ?? user?.email}
          </span>
          <button
            onClick={logout}
            className="btn-ghost px-3 py-1.5 text-xs"
            aria-label="Log out"
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
