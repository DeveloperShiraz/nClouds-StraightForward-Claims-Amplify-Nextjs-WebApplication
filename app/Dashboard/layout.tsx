"use client";

import TopBar from "@/components/Topbar";
import React, { useEffect, useState } from "react";
import { SidebarProvider } from "@/components/ui/Sidebar";
import { AppSidebar } from "@/components/App-sidebar";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { fetchAuthSession } from "aws-amplify/auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // State to track if we've checked authentication
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check auth on initial render, immediately redirect if needed
  useEffect(() => {
    // IIFE to run immediately
    (async () => {
      try {
        const session = await fetchAuthSession();
        const hasTokens = !!session.tokens?.accessToken;

        if (!hasTokens) {
          // Immediate redirect - don't even set state
          console.log("Not authenticated, redirecting to login");
          window.location.replace("/Login");
          return; // Don't continue execution
        }

        // Only set states if authenticated
        setIsAuthenticated(true);
        setCheckedAuth(true);
      } catch (error) {
        console.error("Auth check failed:", error);
        // Use replace for cleaner navigation history
        window.location.replace("/Login");
      }
    })();
  }, []);

  // Don't render anything until we've confirmed authentication
  if (!checkedAuth || !isAuthenticated) {
    // Return empty div - the useEffect redirect will happen
    return <div style={{ display: "none" }}></div>;
  }

  // Only render dashboard layout if authenticated
  return (
    <CompanyProvider>
      <SidebarProvider defaultOpen={true}>
        <AppSidebar />

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-auto min-h-screen">
          {/* Header */}
          <div className="sticky top-0 z-30 bg-background">
            <TopBar />
          </div>

          {/* Page Content */}
          <main className="flex-1 overflow-auto calc(100vh - 70px)">
            {children}
          </main>
        </div>
      </SidebarProvider>
    </CompanyProvider>
  );
}
