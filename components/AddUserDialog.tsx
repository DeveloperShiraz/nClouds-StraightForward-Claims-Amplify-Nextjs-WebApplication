"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { AlertCircle, Loader2 } from "@/components/Icons";
import { useUserRole } from "@/lib/auth/useUserRole";
import { useCompany } from "@/contexts/CompanyContext";

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserCreated: () => void;
}

export function AddUserDialog({
  open,
  onOpenChange,
  onUserCreated,
}: AddUserDialogProps) {
  const { isSuperAdmin, companyId: userCompanyId, companyName: userCompanyName } = useUserRole();
  const { companies } = useCompany();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("HomeOwner");
  const [companyId, setCompanyId] = useState<string>("none");
  const [sendInvite, setSendInvite] = useState(true);
  const [passwordOption, setPasswordOption] = useState<"auto" | "manual">("auto");
  const [customPassword, setCustomPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Automatically set company to "none" when SuperAdmin role is selected
  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    if (newRole === "SuperAdmin") {
      setCompanyId("none");
    }
  };

  // Reset form when dialog opens/closes
  const resetForm = () => {
    setEmail("");
    setRole("HomeOwner");
    setCompanyId("none"); // Default to "none" for SuperAdmin compatibility
    setSendInvite(true);
    setPasswordOption("auto");
    setCustomPassword("");
    setError(null);
  };

  // Reset form when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate custom password if manual option is selected
    if (passwordOption === "manual") {
      if (!customPassword || customPassword.length < 8) {
        setError("Password must be at least 8 characters long");
        return;
      }
      if (!/[A-Z]/.test(customPassword)) {
        setError("Password must contain at least one uppercase letter");
        return;
      }
      if (!/[a-z]/.test(customPassword)) {
        setError("Password must contain at least one lowercase letter");
        return;
      }
      if (!/[0-9]/.test(customPassword)) {
        setError("Password must contain at least one number");
        return;
      }
      if (!/[^A-Za-z0-9]/.test(customPassword)) {
        setError("Password must contain at least one special character");
        return;
      }
    }

    // Validate company is selected for non-SuperAdmin roles when user is SuperAdmin
    if (isSuperAdmin && role !== "SuperAdmin" && (!companyId || companyId === "none")) {
      setError("Please select a company for this role");
      return;
    }

    setLoading(true);

    try {
      // Normalize email to lowercase for consistency
      const normalizedEmail = email.toLowerCase().trim();

      // Determine which company to assign
      // Use empty string for "none" selection
      const targetCompanyId = isSuperAdmin ? (companyId === "none" ? "" : companyId) : userCompanyId;
      const targetCompanyName = isSuperAdmin
        ? (companyId === "none" ? "" : companies.find(c => c.id === companyId)?.name)
        : userCompanyName;

      const response = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          groups: [role],
          sendInvite,
          companyId: targetCompanyId,
          companyName: targetCompanyName,
          temporaryPassword: passwordOption === "manual" ? customPassword : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create user");
      }

      // Reset form and close dialog
      resetForm();
      onOpenChange(false);
      onUserCreated();
    } catch (err: any) {
      setError(err.message || "An error occurred while creating the user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New User</DialogTitle>
          <DialogDescription>
            Create a new user account and assign them a role. You can either auto-generate
            a temporary password or set a specific one.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Email Field */}
            <div className="grid gap-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {/* Company Selection (SuperAdmin only) */}
            {isSuperAdmin && (
              <div className="grid gap-2">
                <Label htmlFor="company">Company</Label>
                <Select
                  value={companyId}
                  onValueChange={setCompanyId}
                  disabled={loading || role === "SuperAdmin"}
                >
                  <SelectTrigger id="company">
                    <SelectValue placeholder="Select a company" />
                  </SelectTrigger>
                  <SelectContent>
                    {role === "SuperAdmin" && (
                      <SelectItem value="none">
                        <div className="flex flex-col">
                          <span className="font-medium">None (Global Access)</span>
                          <span className="text-xs text-gray-500">
                            No company restriction
                          </span>
                        </div>
                      </SelectItem>
                    )}
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {role === "SuperAdmin"
                    ? "SuperAdmins have global access to all companies"
                    : "Required for all other roles"}
                </p>
              </div>
            )}

            {/* Role Field */}
            <div className="grid gap-2">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={handleRoleChange} disabled={loading}>
                <SelectTrigger id="role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {isSuperAdmin && (
                    <SelectItem value="SuperAdmin">
                      <div className="flex flex-col">
                        <span className="font-medium">SuperAdmin</span>
                        <span className="text-xs text-gray-500">
                          Global access to all companies
                        </span>
                      </div>
                    </SelectItem>
                  )}
                  <SelectItem value="Admin">
                    <div className="flex flex-col">
                      <span className="font-medium">Admin</span>
                      <span className="text-xs text-gray-500">
                        {isSuperAdmin ? "Company-scoped admin access" : "Full access to all features"}
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="IncidentReporter">
                    <div className="flex flex-col">
                      <span className="font-medium">Incident Reporter</span>
                      <span className="text-xs text-gray-500">
                        Can create and manage incident reports
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="HomeOwner">
                    <div className="flex flex-col">
                      <span className="font-medium">Home Owner</span>
                      <span className="text-xs text-gray-500">
                        Read-only access to reports
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Password Option */}
            <div className="grid gap-2">
              <Label>Password Setup</Label>
              <Select value={passwordOption} onValueChange={(value: "auto" | "manual") => setPasswordOption(value)} disabled={loading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    <div className="flex flex-col">
                      <span className="font-medium">Auto-generate temporary password</span>
                      <span className="text-xs text-gray-500">
                        User must change at first login
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="manual">
                    <div className="flex flex-col">
                      <span className="font-medium">Set specific password</span>
                      <span className="text-xs text-gray-500">
                        You provide the password
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Password Field (shown only when manual option is selected) */}
            {passwordOption === "manual" && (
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password (min 8 characters)"
                  value={customPassword}
                  onChange={(e) => setCustomPassword(e.target.value)}
                  required
                  disabled={loading}
                />
                <p className="text-xs text-gray-500">
                  Must contain: uppercase, lowercase, number, and special character
                </p>
              </div>
            )}

            {/* Send Invite Checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sendInvite"
                checked={sendInvite}
                onCheckedChange={(checked) =>
                  setSendInvite(checked as boolean)
                }
                disabled={loading}
              />
              <Label
                htmlFor="sendInvite"
                className="text-sm font-normal cursor-pointer"
              >
                Send invitation email to user
              </Label>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
