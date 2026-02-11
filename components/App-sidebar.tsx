"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/public/ClaimVerifAI.png";
import {
  LayoutDashboard,
  Home,
  LinkIcon,
  Code,
  Lightbulb,
  Settings,
  BrainCircuit,
  History,
  FileText,
  Users,
  Building,
  MessageSquare,
} from "@/components/Icons";
import { useUserRole } from "@/lib/auth/useUserRole";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarRail,
  SidebarMenuButton,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/Sidebar";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
// import { useAuth } from "@/contexts/AuthContext";

// Sidebar animation styles as a string to be used in a style tag
const sidebarStyles = `
  /* Base sidebar animations */
  .sidebar {
    --sidebar-transition-duration: 1s;
    transition: width var(--sidebar-transition-duration) ease-in-out;
  }

  /* Menu item animations */
  .menu-item-enter {
    transform: translateX(-20px);
    opacity: 0;
    animation: slideIn 0.5s forwards;
  }

  /* Logo animations */
  .sidebar-logo-full {
    position: absolute;
    left: 0;
    width: 100%;
    opacity: 1;
    transition: opacity 0.6s ease-in-out 0.5s;
    z-index: 1;
  }

  .sidebar-logo-icon {
    position: absolute;
    left: 0;
    right: 0;
    opacity: 0;
    transform: scale(0.8);
    transition: opacity 0.4s ease-in-out 0.1s, transform 0.4s ease-in-out 0.1s;
    z-index: 2;
  }

  /* Sidebar when collapsed */
  [data-state="collapsed"] .sidebar-logo-full {
    opacity: 0;
    transition-delay: 0.1s;
  }

  /* Added a delay to the icon animation for the Letter */
  [data-state="collapsed"] .sidebar-logo-icon {
    opacity: 1;
    transform: scale(1);
    transition-delay: 0.6s;
  }

  /* Menu item label styling - positioned absolutely to fade in place */
  .menu-item-hover span {
    position: absolute;
    left: 40px;
    white-space: nowrap;
    opacity: 1;
    transition: opacity var(--sidebar-transition-duration) ease-in-out;
  }
  
  /* Keep menu items aligned properly in all states */
  .menu-item-inner {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 32px;
    position: relative;
    padding: 4px 0;
  }
  
  /* Space between icon and label */
  .icon-container {
    margin-right: 8px;
  }
  
  /* In collapsed state, remove margin from icon container */
  [data-state="collapsed"] .icon-container {
    margin-right: 0;
  }
  
  /* Keep icons aligned left when expanded */
  .left-aligned-button {
    justify-content: flex-start !important;
  }
  
  /* Center icons when collapsed */
  [data-state="collapsed"] .left-aligned-button {
    justify-content: center !important;
  }
  
  /* Icon container styles - base styling for all states */
  .icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.25rem;
    position: relative;
    width: 32px;
    height: 32px;
    min-width: 32px; /* Ensure icon container doesn't shrink */
    transition: background-color 0.3s ease-in-out, border-radius 0.3s ease-in-out;
  }
  
  /* Base styles for menu items */
  [data-sidebar="menu-button"] {
    transition: background-color 0.3s ease-in-out;
  }
  
  /* Fade out the text labels when collapsed */
  [data-state="collapsed"] .menu-item-hover span {
    opacity: 0;
    pointer-events: none;
  }

  /* Remove hover background completely */
  [data-sidebar="menu-button"]:hover {
    background-color: transparent !important;
  }
  
  /* Style active menu item with background */
  [data-sidebar="menu-button"][data-active="true"] {
    background-color: var(--active-bg) !important;
  }
  
  /* Only in expanded state, the button gets a background */
  [data-state="expanded"] [data-sidebar="menu-button"][data-active="true"] {
    background-color: var(--active-bg) !important;
  }
  
  /* Base style for all collapsed states - ensure circle is visible */
  [data-state="collapsed"] [data-sidebar="menu-button"][data-active="true"] {
    background-color: transparent !important;
  }
  
  /* In collapsed state, the icon container gets the circular background */
  [data-state="collapsed"] [data-sidebar="menu-button"][data-active="true"] .icon-container {
    background-color: var(--active-bg) !important;
    border-radius: 50% !important;
    transition: background-color 0.3s ease-in-out, border-radius 0.3s ease-in-out;
  }
  
  /* In expanded state, the icon container is transparent */
  [data-state="expanded"] [data-sidebar="menu-button"][data-active="true"] .icon-container {
    background-color: transparent !important;
    border-radius: 0.25rem;
    transition: background-color 0.3s ease-in-out, border-radius 0.3s ease-in-out;
  }
  
  /* Active icon color */
  [data-sidebar="menu-button"][data-active="true"] .icon-rotate {
    color: var(--active-icon);
    transition: color 0.3s ease;
  }

  /* Icon animations */
  .icon-rotate {
    transition: transform 0.3s ease, color 0.3s ease;
  }

  .menu-item-hover:hover .icon-rotate {
    transform: scale(1);
    color: var(--hover-text);
  }

  @keyframes slideIn {
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  /* Dark mode support */
  :root {
    --hover-bg: rgba(0, 0, 0, 0.05);
    --active-bg: rgba(0, 0, 0, 0.1);
    --hover-text: #ef1a2e;
    --active-icon: #333333;
  }
  
  [data-theme="dark"] {
    --hover-bg: rgba(255, 255, 255, 0.05);
    --active-bg: rgba(255, 255, 255, 0.1);
    --hover-text: #ef1a2e;
    --active-icon: #ffffff;
  }
`;

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();
  const { role, isLoading, isSuperAdmin, isAdmin, isIncidentReporter } = useUserRole();

  // Define routes based on user role
  const getRoutesByRole = () => {
    if (isLoading) return [];

    if (isSuperAdmin) {
      // SuperAdmin: Dashboard, Incident Form, Reports, Companies, Users
      return [
        {
          label: "Dashboard",
          icon: LayoutDashboard,
          href: "/Dashboard",
          active: pathname === "/Dashboard",
        },
        {
          label: "Incident Form",
          icon: FileText,
          href: "/Dashboard/incident-form",
          active: pathname === "/Dashboard/incident-form",
        },
        {
          label: "Reports",
          icon: FileText,
          href: "/Dashboard/reports",
          active: pathname === "/Dashboard/reports",
        },
        {
          label: "Companies",
          icon: Building,
          href: "/Dashboard/companies",
          active: pathname === "/Dashboard/companies",
        },
        {
          label: "Users",
          icon: Users,
          href: "/Dashboard/users",
          active: pathname === "/Dashboard/users",
        },
      ];
    }

    if (isAdmin) {
      // Admin: Dashboard, Incident Form, Reports, Users (company-scoped)
      return [
        {
          label: "Dashboard",
          icon: LayoutDashboard,
          href: "/Dashboard",
          active: pathname === "/Dashboard",
        },
        {
          label: "Incident Form",
          icon: FileText,
          href: "/Dashboard/incident-form",
          active: pathname === "/Dashboard/incident-form",
        },
        {
          label: "Reports",
          icon: FileText,
          href: "/Dashboard/reports",
          active: pathname === "/Dashboard/reports",
        },
        {
          label: "Users",
          icon: Users,
          href: "/Dashboard/users",
          active: pathname === "/Dashboard/users",
        },
      ];
    }

    if (isIncidentReporter) {
      // IncidentReporter: Incident Form, Reports (only their own)
      return [
        {
          label: "Incident Form",
          icon: FileText,
          href: "/Dashboard/incident-form",
          active: pathname === "/Dashboard/incident-form",
        },
        {
          label: "Reports",
          icon: FileText,
          href: "/Dashboard/reports",
          active: pathname === "/Dashboard/reports",
        },
      ];
    }

    // Home Owner: Home Management, Reports (read-only)
    return [
      {
        label: "Home Management",
        icon: Home,
        href: "/Dashboard/home-management",
        active: pathname === "/Dashboard/home-management",
      },
      {
        label: "Reports",
        icon: FileText,
        href: "/Dashboard/reports",
        active: pathname === "/Dashboard/reports",
      },
    ];
  };

  const routes = getRoutesByRole();

  // Add data-theme attribute to html element for dark mode detection in CSS
  React.useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      resolvedTheme || "light"
    );
  }, [resolvedTheme]);

  return (
    <>
      {/* Add style tag with CSS */}
      <style jsx global>
        {sidebarStyles}
      </style>

      <Sidebar
        collapsible="icon"
        className={cn("transition-all h-full sidebar")}
        {...props}
      >
        <SidebarHeader>
          <div
            className={cn(
              "flex items-center h-[60px] transition-all duration-300 ease-in-out",
              "justify-center"
            )}
          >
            {/* Full width logo - shown when expanded */}
            <div className="sidebar-logo-full">
              <Link
                href="/"
                className="flex items-center gap-2 font-semibold pl-6"
              >
                <Image
                  src={Logo}
                  alt="ClaimVerifAI Logo"
                  width={180}
                  height={70}
                  className="object-contain text-center pl-1"
                />
              </Link>
            </div>

            {/* Letter logo - shown when collapsed */}
            <div className="sidebar-logo-icon">
              <Link href="/" className="flex items-center justify-center">
                <div className="w-8 h-8 flex items-center justify-center">
                  <span className="text-[#000000] dark:text-white font-black text-3xl">
                    CV
                  </span>
                </div>
              </Link>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="p-4">
          <SidebarMenu className="nav-menu">
            {routes.map((route, index) => (
              <SidebarMenuItem
                key={route.href}
                className="menu-item-enter"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <SidebarMenuButton
                  asChild
                  isActive={route.active}
                  variant="menuItem"
                  className={cn(
                    "w-full transition-all duration-300 ease-in-out",
                    "menu-item-hover left-aligned-button"
                  )}
                >
                  <Link href={route.href}>
                    <div className="menu-item-inner">
                      {/* Container for icon - fixed width and centered in collapsed state */}
                      <div className="icon-container">
                        <route.icon className="h-5 w-5 icon-rotate" />
                      </div>
                      <span className="transition-all duration-300 ease-in-out">
                        {route.label}
                      </span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>

        {/* <SidebarFooter>
          <div className="p-2">
            <div className="flex items-center gap-2 text-sm">
              <div className="rounded-full h-8 w-8 bg-primary/10 flex items-center justify-center text-primary">
                {user && (user as any).organization
                  ? (user as any).organization.charAt(0)
                  : "O"}
              </div>
              <div className="space-y-1 overflow-hidden group-data-[collapsible=icon]:hidden">
                <p className="font-medium leading-none truncate">
                  {user && (user as any).organization
                    ? (user as any).organization
                    : "Your Organization"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {user && (user as any).domain
                    ? (user as any).domain
                    : "example.com"}
                </p>
              </div>
            </div>
          </div>
        </SidebarFooter> */}

        <SidebarRail />
      </Sidebar>
    </>
  );
}
