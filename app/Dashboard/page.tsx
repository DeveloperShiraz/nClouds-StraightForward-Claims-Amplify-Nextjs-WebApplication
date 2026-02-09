"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Heading from "@/components/ui/Heading";
import { useUserRole } from "@/lib/auth/useUserRole";
import type { NextPage } from "next";

const Dashboard: NextPage = () => {
  const router = useRouter();
  const { isAdmin, isIncidentReporter, isHomeOwner, isLoading, userEmail } = useUserRole();

  const [stats, setStats] = useState({ total: 0, pending: 0, resolved: 0 });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    // Redirect logic
    if (!isLoading) {
      if (isIncidentReporter) {
        router.push("/Dashboard/incident-form");
      } else if (isHomeOwner) {
        router.push("/Dashboard/reports");
      }
    }
  }, [isLoading, isIncidentReporter, isHomeOwner, router]);

  useEffect(() => {
    if (isAdmin && !isLoading) {
      fetchStats();
    }
  }, [isAdmin, isLoading]);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/incident-reports");
      const data = await response.json();

      if (response.ok && data.reports) {
        const reports = data.reports;
        const total = reports.length;
        const pending = reports.filter((r: any) => r.status === "in_review").length;
        const resolved = reports.filter((r: any) => r.status === "resolved").length;

        setStats({ total, pending, resolved });
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoadingStats(false);
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  // Only admins see the dashboard
  if (!isAdmin) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="p-6">
      <Heading size="sm" className="text-[#000000] mb-6">
        Admin Dashboard
      </Heading>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Dashboard Stats Cards */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Reports</h3>
          <p className="text-3xl font-bold text-gray-900">{loadingStats ? "-" : stats.total}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Pending Review</h3>
          <p className="text-3xl font-bold text-yellow-600">{loadingStats ? "-" : stats.pending}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Resolved</h3>
          <p className="text-3xl font-bold text-green-600">{loadingStats ? "-" : stats.resolved}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Welcome, Admin</h2>
        <p className="text-gray-600 mb-4">
          You are logged in as: <span className="font-medium">{userEmail}</span>
        </p>
        <p className="text-gray-600">
          Use the navigation menu to manage incident reports, users, and view analytics.
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
