"use client";

import { useState, useEffect } from "react";
import Heading from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import {
  RefreshCw,
  UserPlus,
  Shield,
  FileText,
  Users as UsersIcon,
  Trash2,
  AlertCircle,
  Filter,
} from "lucide-react";
import { useUserRole } from "@/lib/auth/useUserRole";
import { useRouter } from "next/navigation";
import { AddUserDialog } from "@/components/AddUserDialog";
import { EditUserRoleDialog } from "@/components/EditUserRoleDialog";
import { Badge } from "@/components/ui/Badge";
import { useCompany } from "@/contexts/CompanyContext";

interface User {
  username: string;
  email: string;
  emailVerified: boolean;
  status: string;
  enabled: boolean;
  createdAt: string;
  groups: string[];
  companyId?: string | null;
  companyName?: string | null;
}

type RoleFilter = "all" | "Admin" | "IncidentReporter" | "HomeOwner";

export default function UsersPage() {
  const router = useRouter();
  const { isSuperAdmin, isAdmin, isLoading: roleLoading, userEmail, companyId: userCompanyId } = useUserRole();
  const { companies } = useCompany();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");

  // Edit role dialog state
  const [editRoleDialogOpen, setEditRoleDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{
    username: string;
    email: string;
    currentRole: string;
  } | null>(null);

  // Redirect if not admin or superadmin
  useEffect(() => {
    if (!roleLoading && !isAdmin && !isSuperAdmin) {
      router.push("/Dashboard");
    }
  }, [isAdmin, isSuperAdmin, roleLoading, router]);

  // Fetch users
  const fetchUsers = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/users");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch users");
      }

      setUsers(data.users);
    } catch (err: any) {
      setError(err.message || "An error occurred while fetching users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin || isSuperAdmin) {
      fetchUsers();
    }
  }, [isAdmin, isSuperAdmin]);

  const handleDeleteUser = async (username: string, email: string) => {
    // Prevent deleting yourself
    if (email === userEmail) {
      alert("You cannot delete your own account!");
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to delete user ${email}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingUser(username);

    try {
      const response = await fetch("/api/admin/users/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete user");
      }

      // Refresh user list
      await fetchUsers();
    } catch (err: any) {
      alert(err.message || "An error occurred while deleting the user");
    } finally {
      setDeletingUser(null);
    }
  };

  const handleEditRole = (user: User) => {
    // Get the primary role (first one in the array), or empty string if no groups
    const primaryRole = user.groups[0] || "";
    setSelectedUser({
      username: user.username,
      email: user.email,
      currentRole: primaryRole,
    });
    setEditRoleDialogOpen(true);
  };

  // Filter users based on role filter and company filter
  const filteredUsers = users.filter((user) => {
    // Hide SuperAdmin users from non-SuperAdmin users
    if (!isSuperAdmin && user.groups.includes("SuperAdmin")) {
      return false;
    }

    // Role filter
    if (roleFilter !== "all" && !user.groups.includes(roleFilter)) {
      return false;
    }

    // Company filter (SuperAdmin only)
    if (isSuperAdmin && companyFilter !== "all") {
      if (companyFilter === "no-company") {
        return !user.companyId;
      }
      return user.companyId === companyFilter;
    }

    // Regular admins only see their company users
    if (!isSuperAdmin && userCompanyId) {
      return user.companyId === userCompanyId || !user.companyId;
    }

    return true;
  });

  // Calculate role counts (excluding SuperAdmins for non-SuperAdmin users)
  // For regular admins, only count users in their company
  const visibleUsers = isSuperAdmin
    ? users
    : users.filter((u) => {
      // Exclude SuperAdmins
      if (u.groups.includes("SuperAdmin")) return false;
      // Only include users from the same company
      if (userCompanyId) {
        return u.companyId === userCompanyId || !u.companyId;
      }
      return true;
    });

  const adminCount = visibleUsers.filter((u) => u.groups.includes("Admin")).length;
  const incidentReporterCount = visibleUsers.filter((u) =>
    u.groups.includes("IncidentReporter")
  ).length;
  const customerCount = visibleUsers.filter((u) =>
    u.groups.includes("HomeOwner")
  ).length;

  if (roleLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <Heading size="sm" className="text-[#000000]">
          User Management
        </Heading>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchUsers}
            disabled={loading}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setAddUserDialogOpen(true)}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Role Stats Cards - Now clickable for filtering */}
        <button
          onClick={() => setRoleFilter(roleFilter === "Admin" ? "all" : "Admin")}
          className={`bg-white rounded-lg shadow p-6 border transition-all text-left ${roleFilter === "Admin"
              ? "border-red-600 ring-2 ring-red-600"
              : "border-gray-200 hover:border-red-300"
            }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-5 h-5 text-red-600" />
            <h3 className="text-sm font-medium text-gray-500">Admins</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{adminCount}</p>
          {roleFilter === "Admin" && (
            <p className="text-xs text-red-600 mt-2">Filtering by this role</p>
          )}
        </button>

        <button
          onClick={() =>
            setRoleFilter(
              roleFilter === "IncidentReporter" ? "all" : "IncidentReporter"
            )
          }
          className={`bg-white rounded-lg shadow p-6 border transition-all text-left ${roleFilter === "IncidentReporter"
              ? "border-blue-600 ring-2 ring-blue-600"
              : "border-gray-200 hover:border-blue-300"
            }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-medium text-gray-500">
              Incident Reporters
            </h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {incidentReporterCount}
          </p>
          {roleFilter === "IncidentReporter" && (
            <p className="text-xs text-blue-600 mt-2">Filtering by this role</p>
          )}
        </button>

        <button
          onClick={() =>
            setRoleFilter(roleFilter === "HomeOwner" ? "all" : "HomeOwner")
          }
          className={`bg-white rounded-lg shadow p-6 border transition-all text-left ${roleFilter === "HomeOwner"
              ? "border-green-600 ring-2 ring-green-600"
              : "border-gray-200 hover:border-green-300"
            }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <UsersIcon className="w-5 h-5 text-green-600" />
            <h3 className="text-sm font-medium text-gray-500">Home Owners</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{customerCount}</p>
          {roleFilter === "HomeOwner" && (
            <p className="text-xs text-green-600 mt-2">Filtering by this role</p>
          )}
        </button>
      </div>

      {/* Company Filter (SuperAdmin only) */}
      {isSuperAdmin && companies.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Company
          </label>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="block w-full md:w-64 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Companies</option>
            <option value="no-company">No Company Assigned</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {roleFilter === "all" ? "All Users" : `${roleFilter === "IncidentReporter" ? "Incident Reporters" : roleFilter + "s"}`}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {roleFilter === "all"
                  ? "Manage user accounts and roles"
                  : `Showing ${filteredUsers.length} ${roleFilter === "IncidentReporter" ? "incident reporters" : roleFilter.toLowerCase() + "s"}`}
              </p>
            </div>
            {(roleFilter !== "all" || companyFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRoleFilter("all");
                  setCompanyFilter("all");
                }}
              >
                <Filter className="w-4 h-4 mr-2" />
                Clear All Filters
              </Button>
            )}
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-md mb-4">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-500">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400" />
              <p className="font-medium">Loading users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <UsersIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="font-medium mb-2">
                {roleFilter === "all"
                  ? "No users found"
                  : `No ${roleFilter === "IncidentReporter" ? "incident reporters" : roleFilter.toLowerCase() + "s"} found`}
              </p>
              <p className="text-sm">
                {roleFilter === "all"
                  ? 'Click "Add User" to create your first user account.'
                  : "Try selecting a different filter or add new users."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Email
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Company
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Role
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Created
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.username}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900">
                            {user.email}
                          </span>
                          {user.email === userEmail && (
                            <span className="text-xs text-blue-600">
                              (You)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {user.companyName ? (
                          <Badge variant="outline" className="text-xs">
                            {user.companyName}
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400 italic">
                            No company
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {user.groups.length > 0 ? (
                            user.groups.map((group) => (
                              <button
                                key={group}
                                onClick={() => handleEditRole(user)}
                                className="transition-transform hover:scale-105"
                              >
                                <Badge
                                  variant={
                                    group === "Admin"
                                      ? "destructive"
                                      : group === "IncidentReporter"
                                        ? "default"
                                        : "secondary"
                                  }
                                  className="cursor-pointer hover:opacity-80"
                                >
                                  {group === "IncidentReporter"
                                    ? "Reporter"
                                    : group}
                                </Badge>
                              </button>
                            ))
                          ) : (
                            <button
                              onClick={() => handleEditRole(user)}
                              className="transition-transform hover:scale-105"
                            >
                              <Badge
                                variant="secondary"
                                className="cursor-pointer hover:opacity-80"
                              >
                                Home Owner (Default)
                              </Badge>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            user.status === "CONFIRMED"
                              ? "default"
                              : user.status === "FORCE_CHANGE_PASSWORD"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {user.status === "FORCE_CHANGE_PASSWORD"
                            ? "Pending"
                            : user.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleDeleteUser(user.username, user.email)
                          }
                          disabled={
                            deletingUser === user.username ||
                            user.email === userEmail
                          }
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {deletingUser === user.username ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add User Dialog */}
      <AddUserDialog
        open={addUserDialogOpen}
        onOpenChange={setAddUserDialogOpen}
        onUserCreated={fetchUsers}
      />

      {/* Edit Role Dialog */}
      {selectedUser && (
        <EditUserRoleDialog
          open={editRoleDialogOpen}
          onOpenChange={setEditRoleDialogOpen}
          username={selectedUser.username}
          email={selectedUser.email}
          currentRole={selectedUser.currentRole}
          onRoleUpdated={fetchUsers}
        />
      )}
    </div>
  );
}
