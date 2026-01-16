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

    let aiData: any = null;
    if (report.aiAnalysis) {
      try {
        aiData = typeof report.aiAnalysis === 'string' ? JSON.parse(report.aiAnalysis) : report.aiAnalysis;
      } catch (e) {
        console.error("Failed to parse AI analysis for PDF", e);
      }
    }

    const reportPhotos = photoUrlsMap[report.id] || [];

    // Helper to format detections per image for the PDF
    const getAnalyzedImagesHtml = () => {
      if (!aiData || !aiData.detections) return '';

      const uniquePaths = Array.from(new Set(aiData.detections.map((d: any) => d.local_output_path).filter(Boolean)));
      if (uniquePaths.length === 0 && aiData.local_output_path) uniquePaths.push(aiData.local_output_path);

      return `
        <div class="card mt-8 border-blue-100 shadow-sm overflow-hidden" style="border: 1px solid #dbeafe; border-radius: 12px; margin-top: 32px;">
          <div class="card-header bg-white p-5 border-b border-blue-100" style="padding: 20px; border-bottom: 1px solid #dbeafe;">
            <h4 class="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2" style="font-size: 10px; font-weight: 900; color: #9ca3af; text-transform: uppercase;">
              Analyzed Imagery (${aiData.total_images_analyzed || 1})
            </h4>
          </div>
          <div class="card-content p-5" style="padding: 20px;">
            <div class="gallery-grid">
              ${uniquePaths.map((path: any, idx) => {
        const detections = aiData.detections.filter((d: any) => d.local_output_path === path);
        return `
                  <div class="gallery-item" style="margin-bottom: 24px;">
                    <div class="analyzed-image-container">
                      <img src="${photoUrlsMap[`ai_${path}`] || ''}" crossorigin="anonymous" />
                      <div class="img-badge">Img ${idx + 1}</div>
                    </div>
                    <div class="detections-box">
                      <h5 class="detections-title text-gray-400 uppercase tracking-wider">Visual Detections</h5>
                      ${detections.length > 0 ? detections.map((d: any) => `
                        <div class="detection-row">
                          <div class="detection-label-row">
                            <span class="badge badge-blue">${Math.round(d.confidence * 100)}%</span>
                            <span class="detection-label text-gray-700 font-bold">${d.label}</span>
                          </div>
                          ${d.notes ? `<p class="detection-notes text-gray-500 italic">"${d.notes}"</p>` : ''}
                        </div>
                      `).join('') : '<p class="text-xs text-gray-400">No specific detections marked on this image.</p>'}
                    </div>
                  </div>
                `;
      }).join('')}
            </div>
          </div>
        </div>
      `;
    };

    const styles = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; }
        
        body { 
          font-family: 'Inter', sans-serif; 
          padding: 30px; 
          color: #111827; 
          line-height: 1.4;
          background: #fff;
          max-width: 1200px;
          margin: 0 auto;
        }

        .flex { display: flex; }
        .justify-between { justify-content: space-between; }
        .items-center { align-items: center; }
        .gap-2 { gap: 8px; }
        .gap-3 { gap: 12px; }
        .gap-4 { gap: 16px; }
        .mt-8 { margin-top: 32px; }
        .mb-1 { margin-bottom: 4px; }
        .mb-2 { margin-bottom: 8px; }
        .mb-3 { margin-bottom: 12px; }
        .mb-4 { margin-bottom: 16px; }
        .mb-6 { margin-bottom: 24px; }
        
        .text-lg { font-size: 1.125rem; }
        .text-xl { font-size: 1.25rem; }
        .text-sm { font-size: 0.875rem; }
        .text-xs { font-size: 0.75rem; }
        .font-semibold { font-weight: 600; }
        .font-bold { font-weight: 700; }
        .font-black { font-weight: 900; }
        .font-mono { font-family: ui-monospace, monospace; }
        .text-gray-900 { color: #111827; }
        .text-gray-600 { color: #4b5563; }
        .text-gray-500 { color: #6b7280; }
        .text-gray-400 { color: #9ca3af; }
        .text-blue-600 { color: #2563eb; }
        .uppercase { text-transform: uppercase; }
        .tracking-widest { letter-spacing: 0.1em; }
        .tracking-wider { letter-spacing: 0.05em; }
        .tracking-tighter { letter-spacing: -0.05em; }

        .card { border-radius: 12px; border: 1px solid #e5e7eb; background: #fff; overflow: hidden; }
        .shadow-sm { box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); }
        .border-blue-100 { border-color: #dbeafe; }
        .bg-blue-600 { background-color: #2563eb; }
        .bg-blue-50 { background-color: #eff6ff; }
        .bg-red-50 { background-color: #fef2f2; }
        .bg-white { background-color: #fff; }

        .header-section { margin-bottom: 20px; }
        .name-title { font-size: 1.25rem; font-weight: 800; color: #111827; }
        
        .action-bar { display: flex; gap: 8px; justify-content: flex-end; margin-bottom: 24px; }
        .dummy-button {
          padding: 6px 12px; border-radius: 6px; border: 1px solid #e5e7eb;
          font-size: 12px; font-weight: 600; color: #374151; background: #fff;
          display: flex; align-items: center; gap: 4px; border: 1px solid #e5e7eb;
        }

        .info-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 40px; margin-bottom: 24px; }
        .info-col { display: flex; flex-direction: column; gap: 16px; }
        
        .label-caps { font-size: 10px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
        .value-text { font-size: 13px; color: #111827; }

        .photos-section { margin-top: 24px; }
        .photos-grid { display: grid; grid-template-cols: repeat(4, 1fr); gap: 12px; margin-top: 8px; }
        .photo-item { border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; position: relative; }
        .photo-item img { width: 100%; aspect-ratio: 16/9; object-fit: cover; }
        .photo-caption { font-size: 9px; color: #6b7280; text-align: center; padding: 4px; }

        .ai-card { border: 1px solid #dbeafe; background: rgba(239, 246, 255, 0.1); margin-top: 32px; border-radius: 12px; overflow: hidden; }
        .ai-card-header { background: #2563eb; color: #fff; padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; }
        .ai-title { font-size: 1.25rem; font-weight: 800; }
        .ai-badge { background: rgba(30, 64, 175, 0.4); border: 1px solid rgba(255, 255, 255, 0.4); padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 600; color: #fff; }

        .ai-verdict-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 24px; padding: 24px; }
        .verdict-card { background: #fff; border: 1px solid #dbeafe; padding: 20px; border-radius: 12px; }
        .verdict-title { font-size: 10px; font-weight: 900; color: #2563eb; text-transform: uppercase; margin-bottom: 12px; }
        .verdict-value { font-size: 1.875rem; font-weight: 900; color: #111827; text-transform: capitalize; }
        
        .match-badge { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; border: 1px solid; }
        .match-green { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
        .match-yellow { background: #fef9c3; color: #854d0e; border-color: #fef08a; }

        .gallery-grid { display: grid; grid-template-cols: 1fr; gap: 24px; }
        .analyzed-image-container { position: relative; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; aspect-ratio: 16/9; background: #f9fafb; display: flex; align-items: center; justify-content: center; }
        .analyzed-image-container img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .img-badge { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); color: #fff; font-size: 10px; padding: 2px 8px; border-radius: 4px; }

        .detections-box { background: #f9fafb; border-radius: 6px; padding: 12px; border: 1px solid #f3f4f6; margin-top: 12px; }
        .detections-title { font-size: 10px; font-weight: 700; margin-bottom: 8px; }
        .detection-row { border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 8px; }
        .detection-row:last-child { border-bottom: 0; padding-bottom: 0; margin-bottom: 0; }
        .detection-label-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .badge { padding: 2px 4px; border-radius: 4px; font-size: 10px; font-weight: 600; }
        .badge-blue { background: #dbeafe; color: #1d4ed8; }
        .detection-notes { font-size: 10px; padding-left: 0; color: #6b7280; }

        .bullets-grid { display: grid; grid-template-cols: 2fr 1.2fr; gap: 24px; padding: 0 24px 24px 24px; }
        .evidence-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; font-size: 11px; }
        .bullet-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
        
        .risk-card { background: rgba(254, 242, 242, 0.4); border: 1px solid #fee2e2; padding: 20px; border-radius: 12px; }
        .risk-title { font-size: 12px; font-weight: 900; color: #991b1b; text-transform: uppercase; margin-bottom: 16px; }
        .risk-signal { font-size: 10px; font-weight: 700; color: #b91c1c; display: flex; gap: 8px; margin-bottom: 8px; }

        @media print {
          body { padding: 30px; -webkit-print-color-adjust: exact; }
          .card { page-break-inside: avoid; }
        }
      </style>
    `;

    const aiSectionHtml = aiData && aiData.status !== 'pending' ? `
      <div class="card ai-card shadow-sm">
        <div class="ai-card-header">
          <div>
            <div class="ai-title">AI Damage Assessment</div>
            <div class="text-xs text-blue-100 mt-1">Computer vision analysis of incident evidence</div>
          </div>
          <div class="ai-badge">${aiData.total_images_analyzed || 1} Images Analyzed</div>
        </div>
        
        <div class="ai-verdict-grid">
          <div class="verdict-card shadow-sm">
            <div class="verdict-title tracking-widest">AI Verdict</div>
            <div class="flex items-center gap-4">
              <span class="verdict-value">${aiData.final_assessment}</span>
              <span style="color: #22c55e; font-size: 24px;">✔</span>
            </div>
            <p class="text-sm text-gray-600 mt-3 font-medium">
              Primary damage identified as <span class="text-blue-600 font-bold">${aiData.final_assessment}</span>.
            </p>
          </div>

          <div class="verdict-card shadow-sm">
            <div class="verdict-title tracking-widest">Peril Match Analysis</div>
            <div class="flex justify-between items-center mb-4">
              <div>
                <div class="text-[10px] text-gray-400 font-bold uppercase">Reported Peril</div>
                <div class="text-sm font-bold text-gray-800 capitalize">${aiData.peril_match?.reported_peril || 'Unknown'}</div>
              </div>
              <span class="match-badge ${aiData.peril_match?.match === 'match' ? 'match-green' : 'match-yellow'}">
                ${(aiData.peril_match?.match || 'UNKNOWN').replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <p class="text-xs text-gray-500 italic border-l-2 border-blue-200 pl-3">
              "${aiData.peril_match?.reason || 'No specific reason provided'}"
            </p>
          </div>
        </div>

        ${getAnalyzedImagesHtml()}

        <div class="bullets-grid">
          <div style="border-top: 1px solid #f3f4f6; padding-top: 24px;">
            <h4 class="label-caps mb-4" style="color: #166534">Evidence Bullets</h4>
            <div style="display: grid; grid-template-cols: 1fr 1fr; gap: 16px;">
              ${aiData.evidence_bullets?.map((bullet: string) => `
                <div class="evidence-row">
                  <div class="bullet-dot"></div>
                  <span>${bullet}</span>
                </div>
              `).join('') || ''}
            </div>
          </div>

          <div class="risk-card" style="margin-top: 24px;">
            <div class="risk-title">Risk Indicators</div>
            <div class="space-y-3">
              ${aiData.fraud_signals?.map((signal: string) => `
                <div class="risk-signal">
                  <span>⚠</span>
                  <span>${signal}</span>
                </div>
              `).join('') || '<p class="text-xs text-green-700 italic font-medium">No fraud signals identified.</p>'}
            </div>
          </div>
        </div>
      </div>
    ` : '';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${report.firstName} ${report.lastName} - Report Replication</title>
          ${styles}
        </head>
        <body>
          <div class="action-bar">
            <div class="dummy-button">${report.status || 'Submitted'} ↕</div>
            <div class="dummy-button" style="color: #2563eb; border-color: #bfdbfe;">✦ Analyze with AI</div>
            <div class="dummy-button">⤓ Export</div>
            <div class="dummy-button">✎ Edit</div>
            <div class="dummy-button" style="color: #dc2626; border-color: #fecaca;">🗑 Delete</div>
          </div>

          <div class="header-section">
            <h1 class="name-title">${report.firstName} ${report.lastName}</h1>
            <p class="text-sm text-gray-600 mb-1">Claim #: <span class="font-mono text-xs font-semibold">${report.claimNumber}</span></p>
            <p class="text-sm text-gray-400 mb-1">ID: <span class="font-mono text-xs">${report.id}</span></p>
            ${report.companyName ? `<p class="text-sm text-blue-600 font-bold">Company: ${report.companyName}</p>` : ''}
          </div>

          <div class="info-grid">
            <div class="info-col">
              <div>
                <div class="label-caps">Contact</div>
                <div class="value-text">${report.email}</div>
                <div class="value-text">${report.phone}</div>
              </div>
              <div>
                <div class="label-caps">Incident Date</div>
                <div class="value-text">${formatDateOnly(report.incidentDate)}</div>
              </div>
            </div>
            <div class="info-col">
              <div>
                <div class="label-caps">Location</div>
                <div class="value-text">${report.address}${report.apartment ? `, Apt ${report.apartment}` : ''}</div>
                <div class="value-text">${report.city}, ${report.state} ${report.zip}</div>
              </div>
              <div>
                <div class="label-caps">Submitted</div>
                <div class="value-text">${formatDate(report.submittedAt || report.createdAt)}</div>
              </div>
            </div>
          </div>

          <div class="mb-6">
            <div class="label-caps">Description</div>
            <div class="value-text" style="white-space: pre-wrap;">${report.description}</div>
          </div>

          ${report.shingleExposure ? `
            <div class="mb-6">
              <div class="label-caps">Shingle Exposure</div>
              <div class="value-text">${report.shingleExposure} inches</div>
            </div>
          ` : ''}

          <div class="photos-section">
            <div class="label-caps">Photos</div>
            <div class="photos-grid">
              ${reportPhotos.map((url, i) => `
                <div class="photo-item shadow-sm">
                  <img src="${url}" crossorigin="anonymous" />
                  <div class="photo-caption">Photo ${i + 1}</div>
                </div>
              `).join('')}
            </div>
          </div>

          ${aiSectionHtml}

          <div class="mt-8 text-center text-xs text-gray-400">
            Internal Predictif AI Audit Log &bull; ${new Date().toLocaleString()} &bull; Page 1
          </div>

          <script>
            window.onload = () => {
              const imgs = document.getElementsByTagName('img');
              let loaded = 0;
              const total = imgs.length;
              
              const startPrint = () => {
                setTimeout(() => { window.print(); }, 1500);
              };

              if (total === 0) startPrint();
              else {
                Array.from(imgs).forEach(img => {
                  if (img.complete) {
                    loaded++;
                    if (loaded === total) startPrint();
                  } else {
                    img.onload = () => {
                      loaded++;
                      if (loaded === total) startPrint();
                    };
                    img.onerror = () => {
                      loaded++;
                      if (loaded === total) startPrint();
                    };
                  }
                });
              }
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

