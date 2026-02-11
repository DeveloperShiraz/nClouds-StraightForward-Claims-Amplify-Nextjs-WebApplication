"use client";

import { useState } from "react";
import { resetPassword, confirmResetPassword } from "aws-amplify/auth";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/ui/Button";

type ResetPasswordStep = "REQUEST_CODE" | "VERIFY_CODE" | "SET_PASSWORD";

export function ResetPassword({ onCancel }: { onCancel: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<ResetPasswordStep>("REQUEST_CODE");

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      await resetPassword({ username: email });
      setStep("VERIFY_CODE");
    } catch (err) {
      console.error("Error requesting password reset:", err);
      setError(
        err instanceof Error ? err.message : "Failed to request password reset"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      });
      setStep("SET_PASSWORD");
      // Redirect to login after successful password reset
      window.location.href = "/";
    } catch (err) {
      console.error("Error verifying code:", err);
      setError(err instanceof Error ? err.message : "Failed to verify code");
    } finally {
      setIsLoading(false);
    }
  };

  const renderRequestCodeForm = () => (
    <form onSubmit={handleRequestCode} className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          required
        />
      </div>

      {error && <div className="text-sm text-red-500">{error}</div>}

      <div className="flex space-x-4">
        <Button
          type="submit"
          disabled={isLoading}
          variant="default"
          className="flex-1"
        >
          {isLoading ? "Sending..." : "Send Reset Code"}
        </Button>
        <Button
          type="button"
          onClick={onCancel}
          variant="outline"
          className="flex-1"
        >
          Cancel
        </Button>
      </div>
    </form>
  );

  const renderVerifyCodeForm = () => (
    <form onSubmit={handleVerifyCode} className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="code"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Verification Code
        </label>
        <input
          id="code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          required
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="newPassword"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          New Password
        </label>
        <input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          required
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="confirmPassword"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Confirm New Password
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          required
        />
      </div>

      {error && <div className="text-sm text-red-500">{error}</div>}

      <div className="flex space-x-4">
        <Button
          type="submit"
          disabled={isLoading || newPassword !== confirmPassword}
          variant="default"
          className="flex-1"
        >
          {isLoading ? "Resetting..." : "Reset Password"}
        </Button>
        <Button
          type="button"
          onClick={onCancel}
          variant="outline"
          className="flex-1"
        >
          Cancel
        </Button>
      </div>
    </form>
  );

  return (
    <div className="z-10 w-full max-w-md p-6 space-y-6 bg-white/90 dark:bg-zinc-900/90 rounded-lg shadow-xl backdrop-blur-sm">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">
          {step === "REQUEST_CODE"
            ? "Reset Password"
            : "Enter Verification Code"}
        </h1>
        <p className="text-muted-foreground">
          {step === "REQUEST_CODE"
            ? "Enter your email to receive a reset code"
            : "Enter the code sent to your email and your new password"}
        </p>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : step === "REQUEST_CODE" ? (
        renderRequestCodeForm()
      ) : (
        renderVerifyCodeForm()
      )}
    </div>
  );
}
