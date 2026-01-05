"use client";

import { useState, useEffect } from "react";
import { useUserRole } from "@/lib/auth/useUserRole";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  Building,
  Plus,
  Edit,
  Trash2,
  Users,
  AlertCircle,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface Company {
  id: string;
  name: string;
  domain?: string | null;
  logoUrl?: string | null;
  settings?: any;
  isActive?: boolean | null;
  createdAt?: string | null;
  maxUsers?: number | null;
}

interface CompanyWithUserCount extends Company {
  userCount?: number;
}

export default function CompaniesPage() {
  const router = useRouter();
  const { isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const { companies, refreshCompanies, isLoading: companiesLoading } = useCompany();

  const [companiesWithCounts, setCompaniesWithCounts] = useState<CompanyWithUserCount[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    domain: "",
    maxUsers: "",
  });

  // Redirect non-SuperAdmins
  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) {
      router.push("/Dashboard");
    }
  }, [isSuperAdmin, roleLoading, router]);

  // Fetch user counts for each company
  useEffect(() => {
    async function fetchUserCounts() {
      if (companies.length === 0) return;

      try {
        const response = await fetch("/api/admin/users");
        if (!response.ok) throw new Error("Failed to fetch users");

        const data = await response.json();
        const users = data.users || [];

        // Count users per company
        const companyCounts = companies.map((company) => ({
          ...company,
          userCount: users.filter((u: any) => u.companyId === company.id).length,
        }));

        setCompaniesWithCounts(companyCounts);
      } catch (err) {
        console.error("Error fetching user counts:", err);
        setCompaniesWithCounts(companies.map((c) => ({ ...c, userCount: 0 })));
      }
    }

    fetchUserCounts();
  }, [companies]);

  const handleRefresh = async () => {
    setError(null);
    setSuccess(null);
    await refreshCompanies();
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const response = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          domain: formData.domain || null,
          maxUsers: formData.maxUsers ? parseInt(formData.maxUsers) : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create company");
      }

      setSuccess(`Company "${formData.name}" created successfully!`);
      setFormData({ name: "", domain: "", maxUsers: "" });
      setIsAddDialogOpen(false);
      await refreshCompanies();
    } catch (err: any) {
      setError(err.message || "An error occurred while creating the company");
    } finally {
      setLoading(false);
    }
  };

  const handleEditCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const response = await fetch(`/api/admin/companies/${selectedCompany.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          domain: formData.domain || null,
          maxUsers: formData.maxUsers ? parseInt(formData.maxUsers) : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update company");
      }

      setSuccess(`Company "${formData.name}" updated successfully!`);
      setFormData({ name: "", domain: "", maxUsers: "" });
      setIsEditDialogOpen(false);
      setSelectedCompany(null);
      await refreshCompanies();
    } catch (err: any) {
      setError(err.message || "An error occurred while updating the company");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!selectedCompany) return;

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const response = await fetch(`/api/admin/companies/${selectedCompany.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete company");
      }

      setSuccess(`Company "${selectedCompany.name}" deleted successfully!`);
      setIsDeleteDialogOpen(false);
      setSelectedCompany(null);
      await refreshCompanies();
    } catch (err: any) {
      setError(err.message || "An error occurred while deleting the company");
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (company: Company) => {
    setSelectedCompany(company);
    setFormData({
      name: company.name,
      domain: company.domain || "",
      maxUsers: company.maxUsers?.toString() || "",
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (company: Company) => {
    setSelectedCompany(company);
    setIsDeleteDialogOpen(true);
  };

  if (roleLoading || companiesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building className="h-8 w-8" />
            Company Management
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage all companies in the system
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={companiesLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${companiesLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Company
          </Button>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-6 flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 p-4 rounded-md">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          <p>{success}</p>
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-4 rounded-md">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Companies Grid */}
      {companiesWithCounts.length === 0 ? (
        <Card className="p-8 text-center">
          <Building className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Companies Yet</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Get started by creating your first company
          </p>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Company
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {companiesWithCounts.map((company) => (
            <Card key={company.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Building className="h-5 w-5" />
                      {company.name}
                    </CardTitle>
                    {company.domain && (
                      <CardDescription className="mt-1">
                        {company.domain}
                      </CardDescription>
                    )}
                  </div>
                  <Badge variant={company.isActive ? "default" : "secondary"}>
                    {company.isActive !== false ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Active
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3 mr-1" />
                        Inactive
                      </>
                    )}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-3">
                  {/* User Count */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Users className="h-4 w-4" />
                      Users
                    </span>
                    <span className="font-semibold">
                      {company.userCount || 0}
                      {company.maxUsers && ` / ${company.maxUsers}`}
                    </span>
                  </div>

                  {/* Created Date */}
                  {company.createdAt && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Created: {new Date(company.createdAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </CardContent>

              <CardFooter className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => openEditDialog(company)}
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  onClick={() => openDeleteDialog(company)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Add Company Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Company</DialogTitle>
            <DialogDescription>
              Create a new company in the system. Users can be assigned to this company.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddCompany}>
            <div className="grid gap-4 py-4">
              {/* Company Name */}
              <div className="grid gap-2">
                <Label htmlFor="name">Company Name *</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="e.g., Acme Corporation"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  disabled={loading}
                />
              </div>

              {/* Domain */}
              <div className="grid gap-2">
                <Label htmlFor="domain">Domain</Label>
                <Input
                  id="domain"
                  type="text"
                  placeholder="e.g., acme.com"
                  value={formData.domain}
                  onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  disabled={loading}
                />
                <p className="text-xs text-gray-500">Optional company domain</p>
              </div>

              {/* Max Users */}
              <div className="grid gap-2">
                <Label htmlFor="maxUsers">Max Users</Label>
                <Input
                  id="maxUsers"
                  type="number"
                  placeholder="e.g., 100"
                  min="1"
                  value={formData.maxUsers}
                  onChange={(e) => setFormData({ ...formData, maxUsers: e.target.value })}
                  disabled={loading}
                />
                <p className="text-xs text-gray-500">Optional user limit</p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? "Creating..." : "Create Company"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Company Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
            <DialogDescription>
              Update company information. Changes will be reflected across the system.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditCompany}>
            <div className="grid gap-4 py-4">
              {/* Company Name */}
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Company Name *</Label>
                <Input
                  id="edit-name"
                  type="text"
                  placeholder="e.g., Acme Corporation"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  disabled={loading}
                />
              </div>

              {/* Domain */}
              <div className="grid gap-2">
                <Label htmlFor="edit-domain">Domain</Label>
                <Input
                  id="edit-domain"
                  type="text"
                  placeholder="e.g., acme.com"
                  value={formData.domain}
                  onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  disabled={loading}
                />
              </div>

              {/* Max Users */}
              <div className="grid gap-2">
                <Label htmlFor="edit-maxUsers">Max Users</Label>
                <Input
                  id="edit-maxUsers"
                  type="number"
                  placeholder="e.g., 100"
                  min="1"
                  value={formData.maxUsers}
                  onChange={(e) => setFormData({ ...formData, maxUsers: e.target.value })}
                  disabled={loading}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Company Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Company</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedCompany?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {selectedCompany && companiesWithCounts.find(c => c.id === selectedCompany.id)?.userCount! > 0 && (
            <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p>
                This company has {companiesWithCounts.find(c => c.id === selectedCompany.id)?.userCount} user(s).
                Deleting it will leave these users without a company assignment.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteCompany}
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Deleting..." : "Delete Company"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
