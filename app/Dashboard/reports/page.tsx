"use client";

import { useState, useEffect } from "react";
import { getUrl, remove } from "aws-amplify/storage";
import { fetchAuthSession } from "aws-amplify/auth";
import Heading from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { RefreshCw, AlertCircle, CheckCircle, Clock, Edit, Trash2, Download, Zap, FileText } from "lucide-react";
import { EditIncidentReportModal } from "@/components/forms/EditIncidentReportModal";
import { AIAnalysisDisplay } from "@/components/AIAnalysisDisplay";
import { useUserRole } from "@/lib/auth/useUserRole";
import { useCompany } from "@/contexts/CompanyContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";

interface IncidentReport {
  id: string;
  claimNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  apartment?: string;
  city: string;
  state: string;
  zip: string;
  incidentDate: string;
  description: string;
  shingleExposure?: number;
  photoUrls?: string[];
  status?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
  companyId?: string | null;
  companyName?: string | null;
  submittedBy?: string;
  aiAnalysis?: string | null;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [filteredReports, setFilteredReports] = useState<IncidentReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingReport, setEditingReport] = useState<IncidentReport | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [photoUrlsMap, setPhotoUrlsMap] = useState<Record<string, string[]>>({});
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>("all");
  const { isAdmin, isIncidentReporter, isSuperAdmin, isCustomer, isLoading: roleLoading, companyId, userEmail } = useUserRole();
  const { companies } = useCompany();

  const getSignedPhotoUrls = async (photoPaths: string[]): Promise<string[]> => {
    if (!photoPaths || photoPaths.length === 0) return [];

    try {
      const urlPromises = photoPaths.map(async (path) => {
        try {
          const result = await getUrl({ path });
          return result.url.toString();
        } catch (error) {
          console.error(`Error getting URL for ${path}:`, error);
          return null;
        }
      });

      const urls = await Promise.all(urlPromises);
      return urls.filter((url): url is string => url !== null);
    } catch (error) {
      console.error("Error getting signed URLs:", error);
      return [];
    }
  };

  const fetchReports = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log("Fetching incident reports...");

      const response = await fetch("/api/incident-reports");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch incident reports");
      }

      let allReports = data.reports || [];

      // Sort by most recent first (submittedAt or createdAt)
      allReports.sort((a: IncidentReport, b: IncidentReport) => {
        const dateA = new Date(a.submittedAt || a.createdAt).getTime();
        const dateB = new Date(b.submittedAt || b.createdAt).getTime();
        return dateB - dateA; // Descending order (newest first)
      });

      // Apply authorization filtering:
      // - SuperAdmins: Can view all reports across all companies
      // - Admins: Can view reports within their assigned company only
      // - IncidentReporters: Can view reports within their assigned company OR reports they submitted
      // - Customers: Can ONLY view reports where the email matches their account email

      if (!isSuperAdmin) {
        allReports = allReports.filter((report: IncidentReport) => {
          // 1. Customer Rule: Strict email match
          if (isCustomer) {
            return userEmail && report.email === userEmail;
          }

          // 2. Admin/IncidentReporter Rule: Company match
          if (companyId && report.companyId === companyId) return true;

          // 3. Fallback: Creator match
          if (userEmail && report.submittedBy === userEmail) return true;

          return false;
        });
      }

      setReports(allReports);
      setFilteredReports(allReports);

      // Get signed URLs for photos
      const urlsMap: Record<string, string[]> = {};
      for (const report of allReports) {
        if (report.photoUrls && report.photoUrls.length > 0) {
          urlsMap[report.id] = await getSignedPhotoUrls(report.photoUrls);
        }
      }
      setPhotoUrlsMap(urlsMap);

      console.log(`✅ Loaded ${allReports.length} incident reports`);
    } catch (err: any) {
      console.error("Error fetching reports:", err);
      setError(err?.message || "Failed to load incident reports");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch reports once role is loaded
    if (!roleLoading) {
      fetchReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleLoading, isAdmin, isIncidentReporter]);

  // Apply company filter
  useEffect(() => {
    if (selectedCompanyFilter === "all") {
      setFilteredReports(reports);
    } else {
      setFilteredReports(
        reports.filter(report => report.companyId === selectedCompanyFilter)
      );
    }
  }, [selectedCompanyFilter, reports]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this incident report? This action cannot be undone.")) {
      return;
    }

    setDeletingId(id);
    try {
      console.log(`Deleting incident report with ID: ${id}`);

      // Find the report to get photo URLs
      const reportToDelete = reports.find(report => report.id === id);

      // Delete photos from S3 first
      if (reportToDelete?.photoUrls && reportToDelete.photoUrls.length > 0) {
        console.log(`Deleting ${reportToDelete.photoUrls.length} photos from S3...`);
        const deletePromises = reportToDelete.photoUrls.map(async (photoPath) => {
          try {
            await remove({ path: photoPath });
            console.log(`✅ Deleted photo: ${photoPath}`);
          } catch (error) {
            console.error(`Failed to delete photo ${photoPath}:`, error);
          }
        });
        await Promise.all(deletePromises);
        console.log("✅ All photos deleted from S3");
      }

      // AI Image deletion is now handled by the backend API to ensure correct bucket access.

      // Delete the report from DynamoDB via API
      const response = await fetch(`/api/incident-reports/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (response.ok) {
        console.log("✅ Successfully deleted incident report from database");
        // Remove from local state
        setReports(reports.filter(report => report.id !== id));
      } else {
        console.error("❌ Error deleting report:", data.error);
        alert(`Failed to delete report: ${data.error}`);
      }
    } catch (error: any) {
      console.error("Error deleting report:", error);
      alert(`Error deleting report: ${error?.message || "Unknown error"}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleAnalyze = async (id: string) => {
    setAnalyzingId(id);
    try {
      console.log(`Starting AI analysis for report: ${id}`);
      const response = await fetch(`/api/incident-reports/${id}/analyze`, {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok) {
        console.log("✅ AI Analysis completed successfully");
        // Update the local state with the new analysis
        setReports(prev => prev.map(report =>
          report.id === id ? { ...report, aiAnalysis: JSON.stringify(data.analysis) } : report
        ));
      } else {
        console.error("❌ AI Analysis failed:", data.error);
        alert(`AI Analysis failed: ${data.error}`);
      }
    } catch (error: any) {
      console.error("Error triggering AI analysis:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleExportPDF = (report: IncidentReport) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow pop-ups to export the report.");
      return;
    }

    let aiData = null;
    if (report.aiAnalysis) {
      try {
        aiData = typeof report.aiAnalysis === 'string' ? JSON.parse(report.aiAnalysis) : report.aiAnalysis;
      } catch (e) {
        console.error("Failed to parse AI analysis for PDF", e);
      }
    }

    const styles = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        body { 
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
          padding: 40px; 
          color: #1a1a1a; 
          line-height: 1.6;
          max-width: 900px;
          margin: 0 auto;
        }
        .header { 
          display: flex; 
          justify-content: space-between; 
          align-items: flex-start;
          border-bottom: 2px solid #e5e7eb; 
          margin-bottom: 30px; 
          padding-bottom: 20px; 
        }
        .logo-text {
          font-size: 24px;
          font-weight: 800;
          color: #2563eb;
          letter-spacing: -0.025em;
        }
        .report-title {
          text-align: right;
        }
        .title { font-size: 28px; font-weight: 700; color: #111827; margin: 0; }
        .claim-badge {
          display: inline-block;
          background: #f3f4f6;
          padding: 4px 12px;
          border-radius: 6px;
          font-family: monospace;
          font-weight: 600;
          font-size: 14px;
          margin-top: 8px;
        }
        .section { margin-bottom: 32px; }
        .section-title { 
          font-size: 16px; 
          font-weight: 700; 
          color: #374151; 
          text-transform: uppercase; 
          letter-spacing: 0.05em;
          border-bottom: 1px solid #e5e7eb; 
          margin-bottom: 16px; 
          padding-bottom: 8px; 
        }
        .grid { display: grid; grid-template-cols: 1fr 1fr; gap: 32px; }
        .data-item { margin-bottom: 16px; }
        .label { font-weight: 600; color: #6b7280; font-size: 11px; text-transform: uppercase; margin-bottom: 4px; }
        .value { font-size: 15px; color: #111827; }
        .description-box { 
          background: #f9fafb; 
          padding: 20px; 
          border-radius: 12px; 
          border: 1px solid #f3f4f6;
          white-space: pre-wrap; 
          font-size: 14px; 
        }
        
        /* AI Styles */
        .ai-card {
          border: 2px solid #dbeafe;
          background: #f0f9ff;
          padding: 24px;
          border-radius: 16px;
        }
        .peril-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 12px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 600;
          background: #dcfce7;
          color: #166534;
        }
        .bullet-list { margin: 10px 0; padding-left: 20px; }
        .bullet-list li { margin-bottom: 8px; font-size: 14px; }
        
        .footer { 
          margin-top: 60px; 
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px; 
          color: #9ca3af; 
          text-align: center; 
        }
        @media print {
          @page { margin: 1.5cm; }
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    `;

    const aiSection = aiData && aiData.status !== 'pending' ? `
      <div class="section">
        <div class="section-title">AI Damage Assessment</div>
        <div class="ai-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div class="label">Status: ${aiData.peril_match?.match || 'Analyzed'}</div>
            <div class="peril-badge">Validated ${aiData.peril_match?.reported_peril || 'Damage'}</div>
          </div>
          <div class="label">Final Assessment</div>
          <p style="font-size: 16px; font-weight: 600; color: #1e40af; margin-bottom: 16px;">
            ${aiData.final_assessment}
          </p>
          
          <div class="grid">
            <div>
              <div class="label">Evidence Key Findings</div>
              <ul class="bullet-list">
                ${aiData.evidence_bullets?.map((b: string) => `<li>${b}</li>`).join('') || '<li>Standard visual markers detected</li>'}
              </ul>
            </div>
            <div>
              <div class="label">Fraud / Risk Signals</div>
              <ul class="bullet-list">
                ${aiData.fraud_signals?.map((s: string) => `<li>${s}</li>`).join('') || '<li>No unusual signals detected</li>'}
              </ul>
            </div>
          </div>
        </div>
      </div>
    ` : '';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Export - ${report.claimNumber}</title>
          ${styles}
        </head>
        <body>
          <div class="header">
            <div class="logo-text">PREDICTIF<span style="color:#9ca3af">.AI</span></div>
            <div class="report-title">
              <h1 class="title">Incident Report</h1>
              <div class="claim-badge"># ${report.claimNumber}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Case Information</div>
            <div class="grid">
              <div class="col">
                <div class="data-item">
                  <div class="label">Customer Name</div>
                  <div class="value">${report.firstName} ${report.lastName}</div>
                </div>
                <div class="data-item">
                  <div class="label">Contact Details</div>
                  <div class="value">${report.email}</div>
                  <div class="value">${report.phone}</div>
                </div>
                <div class="data-item">
                  <div class="label">Submission Date</div>
                  <div class="value">${new Date(report.submittedAt || report.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</div>
                </div>
              </div>
              <div class="col">
                <div class="data-item">
                  <div class="label">Property Location</div>
                  <div class="value">${report.address}${report.apartment ? `, Apt ${report.apartment}` : ''}</div>
                  <div class="value">${report.city}, ${report.state} ${report.zip}</div>
                </div>
                <div class="data-item">
                  <div class="label">Date of Loss</div>
                  <div class="value">${report.incidentDate}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Incident Description</div>
            <div class="description-box">${report.description}</div>
          </div>

          ${aiSection}

          <div class="footer">
            This document is a formal record of incident submission ${report.id}.<br>
            &copy; ${new Date().getFullYear()} Predictif AI Systems. All rights reserved.
          </div>

          <script>
            window.onload = () => {
              setTimeout(() => {
                window.print();
              }, 500);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      console.log(`Updating status for report ${id} to ${newStatus}`);
      const response = await fetch(`/api/incident-reports/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        // Update local state
        setReports(prev => prev.map(report =>
          report.id === id ? { ...report, status: newStatus } : report
        ));
        console.log("✅ Status updated successfully");
      } else {
        const data = await response.json();
        console.error("❌ Failed to update status:", data.error);
        alert(`Failed to update status: ${data.error}`);
      }
    } catch (error: any) {
      console.error("Error updating status:", error);
      alert(`Error updating status: ${error.message}`);
    }
  };

  const handleEdit = (report: IncidentReport) => {
    setEditingReport(report);
  };

  const handleCloseModal = () => {
    setEditingReport(null);
  };

  const handleEditSuccess = () => {
    // Refresh the reports list after successful edit
    fetchReports();
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;

    const statusConfig = {
      submitted: { icon: Clock, color: "bg-blue-100 text-blue-800", label: "Submitted" },
      in_review: { icon: AlertCircle, color: "bg-yellow-100 text-yellow-800", label: "In Review" },
      resolved: { icon: CheckCircle, color: "bg-green-100 text-green-800", label: "Resolved" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.submitted;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const formatDateOnly = (dateString?: string) => {
    if (!dateString) return "N/A";
    try {
      // Parse date string without time to avoid timezone issues
      const [year, month, day] = dateString.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  // Authorization check: Only Admins, SuperAdmins, IncidentReporters AND Customers can view reports
  if (!roleLoading && !isAdmin && !isIncidentReporter && !isCustomer) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You don't have permission to view incident reports.</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || roleLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">Loading incident reports...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <Heading size="sm" className="text-[#000000]">
          Incident Reports
        </Heading>
        <div className="flex items-center gap-3">
          {/* Company Filter for SuperAdmin */}
          {isSuperAdmin && companies.length > 0 && (
            <Select value={selectedCompanyFilter} onValueChange={setSelectedCompanyFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={fetchReports} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-red-900 mb-1">Error Loading Reports</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {filteredReports.length === 0 && !error && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 font-medium mb-1">No incident reports found</p>
          <p className="text-sm text-gray-500">
            {selectedCompanyFilter !== "all"
              ? "No reports found for the selected company."
              : "Submit an incident report to see it here."}
          </p>
        </div>
      )}

      {editingReport && (
        <EditIncidentReportModal
          report={editingReport}
          isOpen={!!editingReport}
          onClose={handleCloseModal}
          onSuccess={handleEditSuccess}
        />
      )}

      {filteredReports.length > 0 && (
        <div className="space-y-4">
          {filteredReports.map((report) => (
            <div
              key={report.id}
              className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {report.firstName} {report.lastName}
                  </h3>
                  <p className="text-sm text-gray-600">
                    Claim #: <span className="font-mono text-xs font-semibold">{report.claimNumber}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    ID: <span className="font-mono text-xs">{report.id}</span>
                  </p>
                  {/* Show company name for SuperAdmin */}
                  {isSuperAdmin && report.companyName && (
                    <p className="text-sm text-blue-600 font-medium mt-1">
                      Company: {report.companyName}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Status Dropdown for Admins/Reporters, Badge for others */}
                  {(isAdmin || isIncidentReporter || isSuperAdmin) ? (
                    <Select
                      value={report.status || "submitted"}
                      onValueChange={(value) => handleStatusChange(report.id, value)}
                    >
                      <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="in_review">In Review</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    getStatusBadge(report.status)
                  )}
                  {/* Only admins and incident reporters can edit their reports */}
                  {(isAdmin || isIncidentReporter || isSuperAdmin) && (
                    <Button
                      onClick={() => handleAnalyze(report.id)}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                      disabled={analyzingId === report.id}
                    >
                      {analyzingId === report.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Zap className="w-4 h-4 fill-blue-600" />
                      )}
                      {analyzingId === report.id ? "Analyzing..." : "Analyze with AI"}
                    </Button>
                  )}
                  {/* Export to PDF Button */}
                  <Button
                    onClick={() => handleExportPDF(report)}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1 border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    <FileText className="w-4 h-4" />
                    Export
                  </Button>
                  {(isAdmin || isIncidentReporter) && (
                    <Button
                      onClick={() => handleEdit(report)}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1"
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </Button>
                  )}
                  {/* Only admins and incident reporters can delete their reports */}
                  {(isAdmin || isIncidentReporter) && (
                    <Button
                      onClick={() => handleDelete(report.id)}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                      disabled={deletingId === report.id}
                    >
                      {deletingId === report.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      {deletingId === report.id ? "Deleting..." : "Delete"}
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Contact</p>
                  <p className="text-sm text-gray-900">{report.email}</p>
                  <p className="text-sm text-gray-900">{report.phone}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Location</p>
                  <p className="text-sm text-gray-900">
                    {report.address}
                    {report.apartment && `, Apt ${report.apartment}`}
                  </p>
                  <p className="text-sm text-gray-900">
                    {report.city}, {report.state} {report.zip}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Incident Date</p>
                  <p className="text-sm text-gray-900">{formatDateOnly(report.incidentDate)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Submitted</p>
                  <p className="text-sm text-gray-900">{formatDate(report.submittedAt || report.createdAt)}</p>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">Description</p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{report.description}</p>
              </div>

              {report.shingleExposure && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Shingle Exposure</p>
                  <p className="text-sm text-gray-900">{report.shingleExposure} inches</p>
                </div>
              )}

              {photoUrlsMap[report.id] && photoUrlsMap[report.id].length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">Photos</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {photoUrlsMap[report.id].map((signedUrl, index) => (
                      <div key={index} className="relative group">
                        <a
                          href={signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <img
                            src={signedUrl}
                            alt={`Incident photo ${index + 1}`}
                            className="w-full h-32 object-cover rounded-lg border border-gray-200 hover:border-blue-400 transition-colors"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg flex items-center justify-center">
                            <Download className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </a>
                        <p className="text-xs text-gray-600 mt-1 text-center">Photo {index + 1}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Analysis Section - Hidden for Customers */}
              {!isCustomer && report.aiAnalysis && (
                <AIAnalysisDisplay analysis={report.aiAnalysis} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

