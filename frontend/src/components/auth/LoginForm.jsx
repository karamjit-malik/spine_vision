import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const { login, isLoggingIn, loginError } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ defaultValues: { email: "", password: "" } });

  return (
    <form onSubmit={handleSubmit((values) => login(values))} className="space-y-4">
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@hospital.org"
        error={errors.email?.message}
        {...register("email", {
          required: "Email is required",
          pattern: { value: EMAIL_PATTERN, message: "Enter a valid email address" },
        })}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        placeholder="••••••••"
        error={errors.password?.message}
        {...register("password", {
          required: "Password is required",
          minLength: { value: 8, message: "Minimum 8 characters" },
        })}
      />

      {loginError && (
        <p role="alert" className="text-sm text-ash-300">
          {loginError.response
            ? "Invalid email or password"
            : "Cannot reach the server. Check that the backend is running."}
        </p>
      )}

      <Button type="submit" disabled={isLoggingIn} className="w-full">
        {isLoggingIn ? "Signing in…" : "Login"}
      </Button>

      <p className="text-center text-sm text-ash-500">
        Don't have an account?{" "}
        <Link to="/register" className="text-ash-200 underline underline-offset-4 hover:text-white">
          Register →
        </Link>
      </p>
    </form>
  );
}
