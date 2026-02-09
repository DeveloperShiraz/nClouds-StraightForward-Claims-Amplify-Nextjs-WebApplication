"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { BarChart3, Camera, ChevronRight, Code } from "lucide-react";
import Logo from "@/public/ClaimVerifAI.png";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function Home() {
  const { resolvedTheme } = useTheme();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();

  const handleGetStarted = async () => {
    setIsLoading(true);

    try {
      // If we're still checking auth status, wait for it to complete
      if (authLoading) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Auth status should be resolved now, proceed with redirection
      if (isAuthenticated && user) {
        console.log("User is authenticated, redirecting to Dashboard");
        router.push("/Dashboard");
      } else {
        console.log("User is not authenticated, redirecting to Login");
        router.push("/Login");
      }
    } catch (error) {
      console.error("Error in handleGetStarted:", error);
      router.push("/Login"); // Default to Login on error
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Image
            src={Logo}
            alt="ClaimVerifAI Logo"
            width={220}
            height={70}
            className="object-contain text-center pl-1"
          />
          <div className="flex items-center gap-4">
            {/* <Link href="/Login" className="text-sm font-medium hover:underline">
              Login
            </Link> */}
            {/* <Link href="/Signup">
              <Button>Get Started</Button>
            </Link> */}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="py-20 px-4">
          <div className="container mx-auto max-w-5xl text-center">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6"></h1>
            <p className="text-xl text-muted-foreground mb-10 max-w-3xl mx-auto"></p>
            <Button
              size="lg"
              className="gap-2"
              onClick={handleGetStarted}
              disabled={isLoading}
            >
              {isLoading ? "Please wait..." : "Get Started"}{" "}
              {!isLoading && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} PREDICTif. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
