"use client";


import { ThemeToggle } from "@/components/ThemeToggle";
import { PanelLeft } from "@/components/Icons";
import { Button } from "@/components/ui/Button";
import NavNotifications from "@/components/Nav-notifications";
import { NavUser } from "@/components/Nav-user";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/Sidebar";
import { useState, useEffect } from "react";

// Custom SidebarTrigger with 360 rotation
const CustomSidebarTrigger = () => {
  const { toggleSidebar, state } = useSidebar();
  const [rotation, setRotation] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = () => {
    setIsAnimating(true);
    // Set the target rotation based on current state
    // Adding 360 for a full rotation before returning to normal position
    setRotation((prev) => prev + 360);
    toggleSidebar();
  };

  useEffect(() => {
    // Reset animation state after animation completes
    if (isAnimating) {
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isAnimating]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "h-7 w-7 transition-all duration-1000",
        isAnimating ? "scale-110" : ""
      )}
      onClick={handleClick}
    >
      <PanelLeft
        className="transition-transform duration-1000"
        style={{
          transform: `rotate(${rotation}deg)`,
        }}
      />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
};

export default function TopBar() {
  return (
    <div className="w-full">
      <div
        className={cn(
          "flex justify-between items-center p-4 h-[64px]",
          "bg-[hsl(var(--theme-topbar))]",
          "border-b border-gray-300 dark:border-gray-700",
          "transition-colors duration-200",
          "relative z-[9000]" // Updated z-index
        )}
      >
        <CustomSidebarTrigger />
        <div className="flex items-center gap-4">
          <ThemeToggle className={cn("px-8")} />
          <NavUser />
        </div>
      </div>
    </div>
  );
}
