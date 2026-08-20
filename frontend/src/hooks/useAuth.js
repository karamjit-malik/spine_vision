import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { login as loginRequest, register as registerRequest } from "@/api/auth";
import { useAuthStore } from "@/stores/authStore";

/**
 * Turn an Axios failure into something the user can act on.
 * A request that never got a response is a connectivity/CORS problem, not a
 * credential problem — saying "invalid password" there sends people hunting
 * for the wrong bug.
 */
function authErrorMessage(error, fallback) {
  // Never reveal which field was wrong on a genuine rejection.
  if (error.response?.status === 401) return "Invalid email or password";
  if (error.response) return error.response.data?.message ?? fallback;
  return "Cannot reach the server. Check that the backend is running.";
}

/** Auth actions plus the current session, for forms and the navbar. */
export function useAuth() {
  const navigate = useNavigate();
  const { user, accessToken, setSession, logout } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: (data) => {
      setSession(data);
      toast.success(`Signed in as ${data.user.email}`);
      navigate("/dashboard", { replace: true });
    },
    onError: (error) => {
      toast.error(authErrorMessage(error, "Unable to sign in right now"));
    },
  });

  const registerMutation = useMutation({
    mutationFn: registerRequest,
    onSuccess: () => {
      toast.success("Account created — sign in to continue");
      navigate("/login", { replace: true });
    },
    onError: (error) => {
      toast.error(authErrorMessage(error, "Registration failed"));
    },
  });

  return {
    user,
    isAuthenticated: Boolean(user),
    accessToken,
    login: loginMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    register: registerMutation.mutate,
    isRegistering: registerMutation.isPending,
    logout: () => {
      logout();
      navigate("/login", { replace: true });
    },
  };
}
