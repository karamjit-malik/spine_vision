import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterForm() {
  const { register: registerUser, isRegistering } = useAuth();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const password = watch("password");

  const onSubmit = ({ name, email, password: pwd }) =>
    registerUser({ name, email, password: pwd });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label="Name"
        autoComplete="name"
        placeholder="Dr. A. Sharma"
        error={errors.name?.message}
        {...register("name", { required: "Name is required" })}
      />
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
        autoComplete="new-password"
        placeholder="••••••••"
        error={errors.password?.message}
        {...register("password", {
          required: "Password is required",
          minLength: { value: 8, message: "Minimum 8 characters" },
        })}
      />
      <Input
        label="Confirm Password"
        type="password"
        autoComplete="new-password"
        placeholder="••••••••"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword", {
          required: "Confirm your password",
          validate: (value) => value === password || "Passwords do not match",
        })}
      />

      <Button type="submit" disabled={isRegistering} className="w-full">
        {isRegistering ? "Creating account…" : "Create Account"}
      </Button>

      <p className="text-center text-sm text-ash-500">
        Already registered?{" "}
        <Link to="/login" className="text-ash-200 underline underline-offset-4 hover:text-white">
          Login →
        </Link>
      </p>
    </form>
  );
}
