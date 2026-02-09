"use client";

import {
  Settings,
  Users,
  Shield,
  Database,
  Key,
  LogOut,
  ServerCog,
  ChevronsUpDown,
} from "@/components/Icons";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/Sidebar";
import { MaterialIcons } from "@/components/Icons";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function NavAdmin() {
  const { isMobile } = useSidebar();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              variant="default"
              className={cn(
                "w-full",
                "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
                "flex items-center justify-start",
                "group-data-[collapsible=icon]:justify-center"
              )}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg">
                <MaterialIcons.Settings className="h-4 w-4 text-black dark:text-white" />
              </div>
              <div className="flex flex-col items-start pl-2 group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-semibold">Admin</span>
              </div>
              <ChevronsUpDown
                className={cn(
                  "ml-auto size-4",
                  "group-data-[collapsible=icon]:hidden"
                )}
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg bg-white dark:bg-zinc-950"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">Administrator Settings</p>
                <p className="text-xs text-muted-foreground">
                  Manage system configuration
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <Link href="/Journey/UserManagement">
                <DropdownMenuItem className="hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                  <Users className="mr-2 h-4 w-4" />
                  User Management
                </DropdownMenuItem>
              </Link>
              <Link href="/Journey/DatabaseConfiguration">
                <DropdownMenuItem className="hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                  <Database className="mr-2 h-4 w-4" />
                  Database Configuration
                </DropdownMenuItem>
              </Link>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
