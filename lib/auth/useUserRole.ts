"use client";

import { useState, useEffect } from "react";
import { fetchAuthSession, fetchUserAttributes, getCurrentUser } from "aws-amplify/auth";

export type UserRole = "SuperAdmin" | "Admin" | "IncidentReporter" | "HomeOwner" | null;

interface UseUserRoleReturn {
  role: UserRole;
  isLoading: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isIncidentReporter: boolean;
  isHomeOwner: boolean;
  userEmail: string | null;
  companyId: string | null;
  companyName: string | null;
  username: string | null;
}

export function useUserRole(): UseUserRoleReturn {
  const [role, setRole] = useState<UserRole>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    async function getUserRole() {
      try {
        const session = await fetchAuthSession();
        const attributes = await fetchUserAttributes();
        const currentUser = await getCurrentUser().catch(() => null);

        if (currentUser) {
          setUsername(currentUser.username);
        }

        setUserEmail(attributes.email || null);
        setCompanyId(attributes["custom:companyId"] || null);
        setCompanyName(attributes["custom:companyName"] || null);

        // Get groups from Cognito token
        const groups = session.tokens?.accessToken?.payload["cognito:groups"] as string[] | undefined;

        if (groups && groups.length > 0) {
          // Priority: SuperAdmin > Admin > IncidentReporter > HomeOwner
          if (groups.includes("SuperAdmin")) {
            setRole("SuperAdmin");
          } else if (groups.includes("Admin")) {
            setRole("Admin");
          } else if (groups.includes("IncidentReporter")) {
            setRole("IncidentReporter");
          } else if (groups.includes("HomeOwner")) {
            setRole("HomeOwner");
          } else {
            setRole(null);
          }
        } else {
          // Default to HomeOwner if no group assigned
          setRole("HomeOwner");
        }
      } catch (error) {
        console.error("Error fetching user role:", error);
        setRole(null);
      } finally {
        setIsLoading(false);
      }
    }

    getUserRole();
  }, []);

  return {
    role,
    isLoading,
    isSuperAdmin: role === "SuperAdmin",
    isAdmin: role === "Admin" || role === "SuperAdmin",
    isIncidentReporter: role === "IncidentReporter",
    isHomeOwner: role === "HomeOwner",
    userEmail,
    companyId,
    companyName,
    username,
  };
}
