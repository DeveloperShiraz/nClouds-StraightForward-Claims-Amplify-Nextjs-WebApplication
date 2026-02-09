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
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { AlertCircle, Loader2 } from "lucide-react";

interface EditUserRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  email: string;
  currentRole: string;
  onRoleUpdated: () => void;
}

export function EditUserRoleDialog({
  open,
  onOpenChange,
  username,
  email,
  currentRole,
  onRoleUpdated,
}: EditUserRoleDialogProps) {
  const [newRole, setNewRole] = useState<string>(currentRole || "HomeOwner");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // If currentRole is empty (no group) and newRole is being set, allow it
    if (newRole === currentRole && currentRole !== "") {
      onOpenChange(false);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/admin/users/update-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          newRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update user role");
      }

      // Close dialog and refresh user list
      onOpenChange(false);
      onRoleUpdated();
    } catch (err: any) {
      setError(err.message || "An error occurred while updating the user role");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit User Role</DialogTitle>
          <DialogDescription>
            Change the role for {email}. This will immediately affect their access permissions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Current Role Display */}
            <div className="grid gap-2">
              <Label>Current Role</Label>
              <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-md text-sm">
                {currentRole === ""
                  ? "No Role Assigned (Default: Home Owner)"
                  : currentRole === "IncidentReporter"
                    ? "Incident Reporter"
                    : currentRole === "HomeOwner"
                      ? "Home Owner"
                      : currentRole}
              </div>
            </div>

            {/* New Role Selection */}
            <div className="grid gap-2">
              <Label htmlFor="newRole">New Role</Label>
              <Select value={newRole} onValueChange={setNewRole} disabled={loading}>
                <SelectTrigger id="newRole">
                  <SelectValue placeholder="Select a new role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Admin">
                    <div className="flex flex-col">
                      <span className="font-medium">Admin</span>
                      <span className="text-xs text-gray-500">
                        Full access to all features
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
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || (newRole === currentRole && currentRole !== "")}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Updating..." : "Update Role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
