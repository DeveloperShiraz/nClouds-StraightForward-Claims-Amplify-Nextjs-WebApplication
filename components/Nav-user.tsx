"use client";

import {
  LogOut,
  Pencil1Icon,
} from "@/components/Icons";
import { useState, useEffect } from "react";
import { signOut, getCurrentUser, fetchUserAttributes } from "aws-amplify/auth";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import {
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/Sidebar";
import { EditProfileModal } from "@/components/forms/EditProfileModal";

export function NavUser() {
  const { isMobile } = useSidebar();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [userData, setUserData] = useState({
    name: "",
    given_name: "",
    family_name: "",
    phone_number: "",
    email: "",
    initials: "",
  });

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut({ global: true });
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/Login";
      setTimeout(() => {
        window.location.replace("/Login");
      }, 100);
    } catch (error) {
      console.error("Error signing out:", error);
      window.location.href = "/Login";
    }
  };

  const fetchUserData = async () => {
    try {
      const { username } = await getCurrentUser();
      const attributes = await fetchUserAttributes();
      const name = attributes.name || username;
      const given_name = attributes.given_name || "";
      const family_name = attributes.family_name || "";
      const email = attributes.email || "";
      const phone_number = attributes.phone_number || "";

      // Generate initials
      let initials = "";
      if (given_name && family_name) {
        initials = `${given_name[0]}${family_name[0]}`.toUpperCase();
      } else {
        const names = name.split(" ");
        initials =
          names.length >= 2
            ? `${names[0][0]}${names[1][0]}`.toUpperCase()
            : name.slice(0, 2).toUpperCase();
      }

      setUserData({
        name,
        given_name,
        family_name,
        email,
        phone_number,
        initials,
      });
    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, []);

  return (
    <SidebarMenu>
      <SidebarMenuItem className="min-h-[32px]">
        {isLoading ? (
          <div className="relative overflow-hidden">
            {/* Base blue circle */}
            <div className="h-8 w-8 rounded-full bg-blue-700" />

            {/* Animated gradient overlay */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                animation: "shimmer 1.5s infinite",
              }}
            />

            <style jsx>{`
              @keyframes shimmer {
                0% {
                  transform: translateX(-100%);
                }
                100% {
                  transform: translateX(100%);
                }
              }
            `}</style>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full hover:opacity-80 cursor-pointer">
                <Avatar className="h-8 w-8 bg-blue-700 text-white pt-[2px]">
                  <AvatarFallback className="bg-blue-700 text-white">
                    {userData.initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-56 rounded-lg bg-popover text-popover-foreground shadow-lg border border-border z-[9000]"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 bg-blue-700 text-white pt-[2px]">
                    <AvatarFallback className="bg-blue-700 text-white">
                      {userData.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {userData.given_name && userData.family_name
                        ? `${userData.given_name} ${userData.family_name}`
                        : userData.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {userData.email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                className="cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                onClick={() => setIsEditProfileModalOpen(true)}
              >
                <Pencil1Icon className="mr-2 h-4 w-4" />
                <span>Edit Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                onClick={handleSignOut}
                disabled={isSigningOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>{isSigningOut ? "Signing out..." : "Log out"}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarMenuItem>
      <EditProfileModal
        isOpen={isEditProfileModalOpen}
        onClose={() => setIsEditProfileModalOpen(false)}
        onSuccess={fetchUserData}
        userData={{
          given_name: userData.given_name,
          family_name: userData.family_name,
          phone_number: userData.phone_number,
          email: userData.email,
        }}
      />
    </SidebarMenu>
  );
}
