"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  signIn,
  signUp,
  confirmSignUp,
  resendSignUpCode,
  fetchAuthSession,
  signOut
} from "aws-amplify/auth";
import { UpdatePassword } from "@/components/UpdatePassword";
import { ResetPassword } from "@/components/ResetPassword";
import { LoadingSpinner, AlreadyAuthenticatedSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/components/ui/Button";
import Logo from "@/public/ClaimVerifAI.png";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Eye, EyeOff } from "@/components/Icons";

// Define the possible authentication states
type AuthState =
  | "initial"
  | "authenticated"
  | "unauthenticated"
  | "submitting"
  | "password-update"
  | "password-reset"
  | "signup"
  | "confirm-signup";

export default function LandingPage() {
  const router = useRouter();

  // Basic form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [role, setRole] = useState<"Contractor" | "HomeOwner">("HomeOwner");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState("");

  // Authentication and UI state
  const [authState, setAuthState] = useState<AuthState>("initial");
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [challengeResponse, setChallengeResponse] = useState<any>(null);

  // Initial auth check when component mounts
  useEffect(() => {
    async function checkAuthentication() {
      try {
        const session = await fetchAuthSession();
        if (session.tokens?.accessToken) {
          console.log("User is already authenticated");
          setAuthState("authenticated");
          router.push("/Dashboard");
        } else {
          setAuthState("unauthenticated");
        }
      } catch (error) {
        setAuthState("unauthenticated");
      }
    }
    checkAuthentication();
  }, [router]);

  const formatPhoneNumber = (value: string) => {
    // Remove all non-digits
    const phoneNumber = value.replace(/\D/g, '');

    // Format as (XXX) XXX-XXXX
    if (phoneNumber.length >= 6) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
    } else if (phoneNumber.length >= 3) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    } else {
      return phoneNumber;
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // First Name validation
    if (!firstName.trim()) {
      newErrors.firstName = "First name is required";
    }

    // Last Name validation
    if (!lastName.trim()) {
      newErrors.lastName = "Last name is required";
    }

    // Phone validation (exactly 10 digits as in IncidentReportForm)
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    if (!digitsOnly) {
      newErrors.phoneNumber = "Phone number is required";
    } else if (digitsOnly.length < 10) {
      newErrors.phoneNumber = "Phone number must be at least 10 digits";
    } else if (digitsOnly.length > 15) {
      newErrors.phoneNumber = "Phone number is too long";
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!emailRegex.test(email)) {
      newErrors.email = "Invalid email address";
    }

    // Password validation
    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }

    // Confirm Password validation
    if (!confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setFieldErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle Login submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setAuthState("submitting");

    try {
      const normalizedEmail = email.toLowerCase().trim();
      const { isSignedIn, nextStep } = await signIn({
        username: normalizedEmail,
        password,
      });

      if (nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
        setChallengeResponse(nextStep);
        setAuthState("password-update");
      } else if (isSignedIn) {
        router.push("/Dashboard");
      }
    } catch (err: any) {
      console.error("Error signing in:", err);
      if (err.message && err.message.includes("already a signed in user")) {
        try {
          await signOut();
          if (typeof window !== 'undefined') {
            localStorage.clear();
            sessionStorage.clear();
          }
          setError("Session cleared. Please try logging in again.");
          setAuthState("unauthenticated");
        } catch (signOutErr) {
          setError("Please refresh the page and try again.");
          setAuthState("unauthenticated");
        }
      } else if (err.name === 'UserNotConfirmedException') {
        // Auto-switch to confirmation if user tries to login but isn't confirmed
        setError("Please confirm your account.");
        // We need to resend code because we don't know if they have one
        try {
          await resendSignUpCode({ username: email.toLowerCase().trim() });
          setSuccessMessage("Verification code sent to your email.");
        } catch (resendError) {
          console.log("Auto-resend failed", resendError);
        }
        setAuthState("confirm-signup");
      } else {
        setError(err instanceof Error ? err.message : "Failed to sign in");
        setAuthState("unauthenticated");
      }
    }
  };

  // Handle Signup submission
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setSuccessMessage("");

    if (!validateForm()) {
      return;
    }

    setAuthState("submitting");

    try {
      const normalizedEmail = email.toLowerCase().trim();
      const { isSignUpComplete, nextStep } = await signUp({
        username: normalizedEmail,
        password,
        options: {
          userAttributes: {
            email: normalizedEmail,
            given_name: firstName,
            family_name: lastName,
            phone_number: `+1${phoneNumber.replace(/\D/g, '')}`,
            "custom:role": role,
          },
        },
      });

      if (nextStep.signUpStep === "CONFIRM_SIGN_UP") {
        setSuccessMessage("Account created! Please enter the code sent to your email.");
        setAuthState("confirm-signup");
      } else if (isSignUpComplete) {
        // Auto login? or just redirect to login
        setSuccessMessage("Account created successfully. Please login.");
        setAuthState("unauthenticated");
      }
    } catch (err: any) {
      console.error("Error signing up:", err);
      setError(err instanceof Error ? err.message : "Failed to sign up");
      setAuthState("signup");
    }
  };

  // Handle Confirmation submission
  const handleConfirmSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setAuthState("submitting");

    try {
      const normalizedEmail = email.toLowerCase().trim();
      const { isSignUpComplete } = await confirmSignUp({
        username: normalizedEmail,
        confirmationCode,
      });

      if (isSignUpComplete) {
        setSuccessMessage("Account verified! You can now login.");
        setAuthState("unauthenticated");
      }
    } catch (err: any) {
      console.error("Error confirming signup:", err);
      setError(err instanceof Error ? err.message : "Failed to verify code");
      setAuthState("confirm-signup");
    }
  };

  const handleResendCode = async () => {
    try {
      await resendSignUpCode({ username: email.toLowerCase().trim() });
      setSuccessMessage("Verification code resent to your email.");
    } catch (err: any) {
      setError("Failed to resend code: " + err.message);
    }
  };

  const handlePasswordUpdateSuccess = () => router.push("/Dashboard");
  const handlePasswordUpdateCancel = () => {
    setAuthState("unauthenticated");
    setPassword("");
    setChallengeResponse(null);
  };

  // Render content based on auth state
  const renderAuthContent = () => {
    switch (authState) {
      case "initial":
        return null;
      case "authenticated":
        return <AlreadyAuthenticatedSpinner />;
      case "submitting":
        return <LoadingSpinner />;
      case "password-update":
        return (
          <div className="w-full max-w-sm">
            <UpdatePassword
              onSuccess={handlePasswordUpdateSuccess}
              onCancel={handlePasswordUpdateCancel}
              challengeResponse={challengeResponse}
            />
          </div>
        );
      case "password-reset":
        return (
          <div className="w-full max-w-sm">
            <ResetPassword onCancel={() => setAuthState("unauthenticated")} />
          </div>
        );
      case "signup":
        return (
          <div className="w-full max-w-lg space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex flex-col space-y-2 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Create Account</h1>
              <p className="text-sm text-muted-foreground">
                Enter your details to create a new account
              </p>
            </div>
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      if (fieldErrors.firstName) setFieldErrors(prev => ({ ...prev, firstName: "" }));
                    }}
                    className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${fieldErrors.firstName ? 'border-red-500' : 'border-input'}`}
                    required
                    placeholder="John"
                  />
                  {fieldErrors.firstName && <p className="text-xs text-red-500 mt-1">{fieldErrors.firstName}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      if (fieldErrors.lastName) setFieldErrors(prev => ({ ...prev, lastName: "" }));
                    }}
                    className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${fieldErrors.lastName ? 'border-red-500' : 'border-input'}`}
                    required
                    placeholder="Doe"
                  />
                  {fieldErrors.lastName && <p className="text-xs text-red-500 mt-1">{fieldErrors.lastName}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Phone Number</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => {
                      const formatted = formatPhoneNumber(e.target.value);
                      setPhoneNumber(formatted);
                      if (fieldErrors.phoneNumber) setFieldErrors(prev => ({ ...prev, phoneNumber: "" }));
                    }}
                    className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${fieldErrors.phoneNumber ? 'border-red-500' : 'border-input'}`}
                    required
                    placeholder="(555) 555-5555"
                    maxLength={14}
                  />
                  {fieldErrors.phoneNumber && <p className="text-xs text-red-500 mt-1">{fieldErrors.phoneNumber}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: "" }));
                    }}
                    className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${fieldErrors.email ? 'border-red-500' : 'border-input'}`}
                    required
                    placeholder="john@example.com"
                  />
                  {fieldErrors.email && <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Password</label>
                  <div className="relative">
                    <input
                      type={showSignupPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: "" }));
                      }}
                      className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 pr-10 ${fieldErrors.password ? 'border-red-500' : 'border-input'}`}
                      required
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword(!showSignupPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                    >
                      {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (fieldErrors.confirmPassword) setFieldErrors(prev => ({ ...prev, confirmPassword: "" }));
                      }}
                      className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 pr-10 ${fieldErrors.confirmPassword ? 'border-red-500' : 'border-input'}`}
                      required
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && <p className="text-xs text-red-500 mt-1">{fieldErrors.confirmPassword}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Create Profile as:</label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setRole("Contractor")}
                    className={`flex-1 py-2 px-4 rounded-md border text-sm font-medium transition-colors ${role === "Contractor"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-background text-foreground border-input hover:bg-accent hover:text-accent-foreground"
                      }`}
                  >
                    Contractor
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("HomeOwner")}
                    className={`flex-1 py-2 px-4 rounded-md border text-sm font-medium transition-colors ${role === "HomeOwner"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-background text-foreground border-input hover:bg-accent hover:text-accent-foreground"
                      }`}
                  >
                    Home Owner
                  </button>
                </div>
              </div>

              {error && <div className="text-sm text-red-500 font-medium">{error}</div>}
              <Button type="submit" className="w-full bg-[#17315f] hover:bg-[#1a3a73] text-white">
                Submit
              </Button>
            </form>
            <div className="text-center text-sm">
              Already have an account?{" "}
              <button onClick={() => setAuthState("unauthenticated")} className="text-blue-600 hover:underline">
                Login here
              </button>
            </div>
          </div>
        );

      case "confirm-signup":
        return (
          <div className="w-full max-w-sm space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex flex-col space-y-2 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Verify Email</h1>
              <p className="text-sm text-muted-foreground">
                We sent a code to {email}. Please enter it below.
              </p>
            </div>
            {successMessage && <div className="text-sm text-green-600 bg-green-50 p-2 rounded text-center">{successMessage}</div>}
            <form onSubmit={handleConfirmSignup} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Verification Code</label>
                <input
                  type="text"
                  value={confirmationCode}
                  onChange={(e) => setConfirmationCode(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  required
                  placeholder="123456"
                />
              </div>
              {error && <div className="text-sm text-red-500 font-medium">{error}</div>}
              <Button type="submit" className="w-full bg-[#17315f] hover:bg-[#1a3a73] text-white">
                Verify Account
              </Button>
            </form>
            <div className="text-center text-sm space-y-2">
              <button onClick={handleResendCode} className="text-blue-600 hover:underline block w-full">
                Resend Code
              </button>
              <button onClick={() => setAuthState("unauthenticated")} className="text-gray-500 hover:text-gray-700">
                Back to Login
              </button>
            </div>
          </div>
        );

      default: // "unauthenticated" (Login)
        return (
          <div className="w-full max-w-sm space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex flex-col space-y-2 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
              <p className="text-sm text-muted-foreground">
                Enter your credentials to access your account
              </p>
            </div>

            {successMessage && <div className="text-sm text-green-600 bg-green-50 dark:bg-green-900/20 p-2 rounded text-center">{successMessage}</div>}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  required
                  placeholder="john@example.com"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium leading-none">Password</label>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 pr-10"
                    required
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && <div className="text-sm text-red-500 font-medium">{error}</div>}

              <Button
                type="submit"
                className="w-full bg-[#17315f] hover:bg-[#1a3a73] text-white"
              >
                Login
              </Button>
            </form>

            <div className="text-center space-y-4">
              <button
                type="button"
                onClick={() => setAuthState("password-reset")}
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-4"
              >
                Forgot Password? Reset Here
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setError("");
                  setSuccessMessage("");
                  setAuthState("signup");
                }}
              >
                Sign Up
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground transition-colors duration-300">
      {/* Theme Toggle - Top Right */}
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Left Side - Branding */}
      <div className="hidden lg:flex w-1/2 relative flex-col justify-center items-center text-white p-10 overflow-hidden">
        {/* Background Image */}
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: "url('/Template_Background.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-[#17315f]/80 dark:bg-[#0a192f]/90 mix-blend-multiply" />
        </div>

        {/* Content Overlay */}
        <div className="relative z-10 flex flex-col items-center text-center space-y-6 max-w-lg">
          <div className="bg-white dark:bg-[#111827] p-6 rounded-2xl shadow-xl mb-4 border border-transparent dark:border-white/10 transition-all duration-300">
            <Image
              src={Logo}
              alt="ClaimVerifAI Logo"
              width={280}
              height={100}
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">AI-Powered Roof Claim Intelligence</h1>
          <p className="text-xl text-blue-100/90 leading-relaxed">
            Streamline your claim investigations with advanced computer vision and automated report generation.
            Reliable, fast, and accurate.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4 text-left w-full max-w-md">
            {[
              "Automated Damage Detection",
              "Instant PDF Reports",
              "Fraud Signal Analysis",
              "Weather Data Verification"
            ].map((feature, i) => (
              <div key={i} className="flex items-center space-x-2 bg-white/10 p-3 rounded-lg backdrop-blur-sm border border-white/10">
                <div className="h-2 w-2 rounded-full bg-green-400" />
                <span className="text-sm font-medium">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex w-full lg:w-1/2 flex-col justify-center items-center p-8 lg:p-12 relative bg-background">
        <div className="absolute top-8 left-8 lg:hidden">
          {/* Mobile Logo or other header elements if needed */}
        </div>

        {/* Mobile Logo for small screens */}
        <div className="lg:hidden mb-8">
          <div className="bg-white/90 p-4 rounded-xl shadow-md backdrop-blur-sm">
            <Image
              src={Logo}
              alt="ClaimVerifAI Logo"
              width={200}
              height={70}
              className="object-contain"
              priority
            />
          </div>
        </div>

        {renderAuthContent()}
      </div>
    </div>
  );
}
