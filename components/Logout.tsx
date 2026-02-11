"use client";

import { signOut } from "aws-amplify/auth";
import React, { useState } from "react";

// Constants for auth-related items that should be cleared
const AUTH_STORAGE_KEYS = [
  "amplify-authenticator-authState",
  "amplify-signin-with-hostedUI",
  "amplify-signin-with-hostedUI-oauth-state",
  // Add any other auth-related keys here
];

// Constants for preferences that should be preserved
const PREFERENCES_TO_PRESERVE = [
  "local_datagrid_views",
  "user-view-preferences",
  "datagrid-density-preference",
  "component-theme",
  "theme",
] as const;

interface PreservedData {
  [key: string]: string;
}

const Logout = () => {
  const [isLoading, setIsLoading] = useState(false);

  const handleSignOut = async () => {
    setIsLoading(true);

    // Store current preferences
    const preservedData: PreservedData = {};

    // Log initial state
    console.log("Before logout - localStorage state:", {
      ...PREFERENCES_TO_PRESERVE.reduce(
        (acc, key) => ({
          ...acc,
          [key]: localStorage.getItem(key),
        }),
        {}
      ),
    });

    // Save preferences
    PREFERENCES_TO_PRESERVE.forEach((key) => {
      const value = localStorage.getItem(key);
      if (value) {
        preservedData[key] = value;
      }
    });

    try {
      // Sign out from Amplify
      await signOut({ global: true });

      // Only clear auth-related items
      AUTH_STORAGE_KEYS.forEach((key) => {
        localStorage.removeItem(key);
      });

      // Verify preferences are still intact
      PREFERENCES_TO_PRESERVE.forEach((key) => {
        const currentValue = localStorage.getItem(key);
        if (preservedData[key] && currentValue !== preservedData[key]) {
          localStorage.setItem(key, preservedData[key]);
        }
      });

      // Log final state
      console.log("After logout - preserved data:", preservedData);
      console.log("After logout - localStorage state:", {
        ...PREFERENCES_TO_PRESERVE.reduce(
          (acc, key) => ({
            ...acc,
            [key]: localStorage.getItem(key),
          }),
          {}
        ),
      });

      // Navigate to login page
      window.location.href = "/";
    } catch (error) {
      console.error("Error signing out:", error);

      // Restore preferences if something went wrong
      Object.entries(preservedData).forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });

      window.location.href = "/";
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={isLoading}
      className="px-4 py-2 bg-white text-black hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed rounded"
    >
      {isLoading ? "Signing out..." : "Sign out"}
    </button>
  );
};

export default Logout;
