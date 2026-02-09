"use client";

import { useState, useEffect } from "react";
import { getUrl, remove } from "aws-amplify/storage";
import { fetchAuthSession } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import Heading from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { RefreshCw, AlertCircle, CheckCircle, Clock, Edit, Trash2, Download, Zap, FileText } from "@/components/Icons";
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
  aiAnalysis?: any;
  weatherReport?: any;
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
  const { isAdmin, isIncidentReporter, isSuperAdmin, isHomeOwner, isLoading: roleLoading, companyId, userEmail } = useUserRole();
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
      // - HomeOwners: Can ONLY view reports where the email matches their account email

      if (!isSuperAdmin) {
        allReports = allReports.filter((report: IncidentReport) => {
          // 1. HomeOwner Rule: Strict email match
          if (isHomeOwner) {
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
        console.log("✅ AI Analysis triggered successfully. Starting polling...");

        // Polling logic: check the report every 5 seconds for up to 5 minutes
        const client = generateClient<Schema>();
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes (5s * 60)

        const poll = async () => {
          if (attempts >= maxAttempts) {
            console.error("❌ Polling timed out after 5 minutes");
            setAnalyzingId(null);
            return;
          }

          attempts++;
          try {
            const { data: updatedReport } = await client.models.IncidentReport.get({ id });

            if (updatedReport?.aiAnalysis) {
              const analysis = typeof updatedReport.aiAnalysis === 'string'
                ? JSON.parse(updatedReport.aiAnalysis)
                : updatedReport.aiAnalysis;

              if (analysis.status === "analyzing") {
                console.log(`Still analyzing... attempt ${attempts}`);
                setTimeout(poll, 5000);
              } else if (analysis.status === "failed") {
                console.error("❌ AI Analysis reported failure:", analysis.error);
                alert(`AI Analysis failed: ${analysis.error}`);
                setAnalyzingId(null);
              } else {
                console.log("✅ AI Analysis completed and data received");
                // Update the local state with the completed analysis
                setReports(prev => prev.map(report =>
                  report.id === id ? { ...report, aiAnalysis: updatedReport.aiAnalysis } : report
                ));
                setAnalyzingId(null);
              }
            } else {
              // This shouldn't happen if the API set it to 'analyzing', but safe to stay in loop
              setTimeout(poll, 5000);
            }
          } catch (pollError) {
            console.error("Error during polling:", pollError);
            setTimeout(poll, 5000);
          }
        };

        // Start polling
        poll();

      } else {
        console.error("❌ AI Analysis failed to start:", data.error);
        alert(`AI Analysis failed to start: ${data.error}`);
        setAnalyzingId(null);
      }
    } catch (error: any) {
      console.error("Error triggering AI analysis:", error);
      alert(`Error: ${error.message}`);
      setAnalyzingId(null);
    }
    // Note: setAnalyzingId(null) is handled inside the polling/error logic now
  };

  const handleExportPDF = async (report: IncidentReport) => {
    // 1. Resolve all necessary photo URLs (Original + AI)
    const resolvedUrls: Record<string, string> = {};

    // Resolve Original Photos
    if (report.photoUrls && report.photoUrls.length > 0) {
      const urls = await getSignedPhotoUrls(report.photoUrls);
      report.photoUrls.forEach((path, i) => {
        if (urls[i]) resolvedUrls[`original_${i}`] = urls[i];
      });
    }

    // Resolve AI Photos
    let aiData: any = null;
    if (report.aiAnalysis) {
      try {
        aiData = typeof report.aiAnalysis === 'string' ? JSON.parse(report.aiAnalysis) : report.aiAnalysis;
        if (aiData?.detections) {
          const uniquePaths = Array.from(new Set(aiData.detections.map((d: any) => d.local_output_path).filter(Boolean))) as string[];
          if (uniquePaths.length === 0 && aiData.local_output_path) uniquePaths.push(aiData.local_output_path);

          await Promise.all(uniquePaths.map(async (path) => {
            try {
              const res = await getUrl({ path });
              resolvedUrls[`ai_${path}`] = res.url.toString();
            } catch (err) {
              console.error("Error resolving AI photo for PDF:", path, err);
            }
          }));
        }
      } catch (e) {
        console.error("Failed to parse AI analysis for PDF", e);
      }
    }

    // Helper to format date
    const formatDateOnly = (dateStr: string) => {
      if (!dateStr) return 'N/A';
      return new Date(dateStr).toLocaleDateString();
    };

    // Parse weather report for PDF
    let weatherData: any = null;
    try {
      if (report.weatherReport) {
        weatherData = typeof report.weatherReport === 'string'
          ? JSON.parse(report.weatherReport)
          : report.weatherReport;
      }
    } catch (e) {
      console.error("Failed to parse weather report for PDF", e);
    }

    // Helper to format technical assessment per image for the PDF
    const getAnalyzedImagesHtml = () => {
      if (!aiData || !aiData.detections) return '';
      const uniquePaths = Array.from(new Set(aiData.detections.map((d: any) => d.local_output_path).filter(Boolean))) as string[];
      if (uniquePaths.length === 0 && aiData.local_output_path) uniquePaths.push(aiData.local_output_path);

      return `
        <div class="report-section">
          <h3 class="section-title">Visual Evidence Analysis</h3>
          <div class="photo-grid">
            ${uniquePaths.map((path: any, idx) => {
        const detections = aiData.detections.filter((d: any) => d.local_output_path === path);
        return `
                <div class="evidence-item">
                  <div class="evidence-img-container">
                    <img src="${resolvedUrls[`ai_${path}`] || ''}" crossorigin="anonymous" />
                  </div>
                  <div class="evidence-details">
                    <p class="evidence-label">EXHIBIT ${idx + 1}</p>
                    <div class="detection-list">
                      ${detections.length > 0 ? detections.map((d: any) => `
                        <div class="detection-entry" style="flex-direction: column; align-items: flex-start;">
                          <div style="display: flex; justify-content: space-between; width: 100%;">
                            <span class="detection-tag">${d.label}</span>
                            <span class="detection-conf">${Math.round(d.confidence * 100)}%</span>
                          </div>
                          ${d.notes ? `<div class="detection-notes" style="font-size: 7px; color: #666; font-style: italic; margin-top: 2px;">Note: ${d.notes}</div>` : ''}
                        </div>
                      `).join('') : '<p class="no-data">No technical labels applied.</p>'}
                    </div>
                  </div>
                </div>
              `;
      }).join('')}
          </div>
        </div>
      `;
    };

    const styles = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; }
        
        body { 
          font-family: 'Inter', sans-serif; 
          color: #1a1a1a; 
          line-height: 1.4;
          background: #fff;
          margin: 0;
          margin: 0;
          padding: 8mm;
          font-size: 11px;
        }

        /* Report Header */
        .report-header {
          border-bottom: 2px solid #000;
          padding-bottom: 5px;
          margin-bottom: 20px;
          text-align: left;
        }
        .report-title {
          font-size: 18px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0;
        }
        .report-id {
          font-size: 10px;
          color: #666;
          font-family: monospace;
        }

        /* Section Titles */
        .section-title {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          border-bottom: 1px solid #eee;
          padding-bottom: 3px;
          margin: 15px 0 10px 0;
          color: #333;
        }

        /* Info Grids - 3 Columns for density */
        .info-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-bottom: 10px;
        }
        .info-group {
          margin-bottom: 8px;
        }
        .info-label {
          font-size: 9px;
          font-weight: 700;
          color: #888;
          text-transform: uppercase;
          margin-bottom: 1px;
        }
        .info-value {
          font-size: 11px;
          font-weight: 500;
        }

        /* Assessment Summary & Findings */
        .assessment-summary {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 12px 15px;
          border-radius: 4px;
          margin-bottom: 15px;
        }
        .findings-container {
          margin-bottom: 15px;
        }
        .findings-col {
          margin-bottom: 15px;
        }
        .verdict-box {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .verdict-main {
          font-size: 15px;
          font-weight: 700;
          color: #2563eb;
        }
        .match-indicator {
          font-size: 9px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 3px;
          background: #fff;
          border: 1px solid #e2e8f0;
        }

        /* Photo Grids - Centered Flex (2-column look for multiples) */
        .photo-grid {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 15px;
        }
        .photo-box {
          border: 1px solid #eee;
          padding: 5px;
          background: #fff;
          page-break-inside: avoid;
          width: 48%; /* Simulates 2-column look */
          min-width: 250px;
        }
        .photo-box img {
          width: 100%;
          aspect-ratio: 4/3;
          object-fit: cover;
          display: block;
        }
        .photo-caption {
          font-size: 8px;
          text-align: center;
          margin-top: 3px;
          color: #666;
        }

        /* Technical Evidence Items (2-column layout) */
        .evidence-item {
          border: 1px solid #eee;
          padding: 5px;
          background: #fff;
          page-break-inside: avoid;
          display: flex;
          flex-direction: column;
          width: 48%; /* Simulates 2-column look */
          min-width: 250px;
        }
        .evidence-img-container img {
          width: 100%;
          aspect-ratio: 4/3;
          object-fit: cover;
          border: 1px solid #ddd;
        }
        .evidence-details {
          padding-top: 5px;
        }
        .evidence-label {
          font-size: 9px;
          font-weight: 700;
          margin: 0 0 3px 0;
          color: #2563eb;
        }
        .detection-entry {
          font-size: 8px;
          margin-bottom: 2px;
          padding-bottom: 2px;
          border-bottom: 1px dashed #eee;
          display: flex;
          justify-content: space-between;
        }
        .detection-tag {
          font-weight: 700;
          margin-right: 10px;
        }
        .detection-conf {
          color: #888;
        }
        .detection-desc {
          font-style: italic;
          color: #555;
          margin: 2px 0 0 10px;
        }

        /* Bullet Points */
        .findings-list {
          font-size: 10px;
          margin: 0;
          padding-left: 15px;
        }
        .findings-list li {
          margin-bottom: 3px;
        }

        /* Footer */
        .report-footer {
          margin-top: 30px;
          padding-top: 8px;
          border-top: 1px solid #eee;
          text-align: center;
          font-size: 9px;
          color: #999;
        }

        @media print {
          body { -webkit-print-color-adjust: exact; }
          /* .assessment-summary { page-break-inside: avoid; } */
          .evidence-item { page-break-inside: avoid; }
          .info-group { page-break-inside: avoid; }
          .report-header { page-break-after: avoid; }
          .section-title { page-break-after: avoid; }
        }
      </style>
    `;

    const aiSectionHtml = aiData && aiData.status !== 'pending' ? `
      <div class="report-section">
        <h3 class="section-title">Technical Damage Assessment</h3>
        <div class="assessment-summary">
          <div class="verdict-box">
            <div>
              <div class="info-label">Automated Findings Verdict</div>
              <div class="verdict-main">${aiData.final_assessment}</div>
            </div>
            <div class="match-indicator">
              ${(aiData.peril_match?.match || 'UNKNOWN').toUpperCase()} MATCH
            </div>
          </div>
          <p class="info-value" style="color: #444;">
            Based on computer vision analysis, the primary damage type is identified as <strong>${aiData.final_assessment}</strong>. 
            Peril matching indicates a ${aiData.peril_match?.match === 'match' ? 'consistent' : 'partial'} alignment with reported details: 
            <em>"${aiData.peril_match?.reason || 'Internal assessment logic applied.'}"</em>
          </p>
        </div>

        <div class="findings-container">
          <div class="findings-col">
            <div class="info-label">Key Evidence Findings</div>
            <ul class="findings-list">
              ${aiData.evidence_bullets?.map((bullet: string) => `<li>${bullet}</li>`).join('') || '<li>No specific evidence points flagged.</li>'}
            </ul>
          </div>
          <div class="findings-col">
            <div class="info-label">Risk Consistency Indicators</div>
            <ul class="findings-list" style="color: #b91c1c;">
              ${aiData.fraud_signals?.map((signal: string) => `<li>${signal}</li>`).join('') || '<li style="color: #166534;">No risk indicators identified.</li>'}
            </ul>
          </div>
        </div>

        ${getAnalyzedImagesHtml()}
      </div>
    ` : '';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Investigation Report - ${report.firstName} ${report.lastName}</title>
          ${styles}
        </head>
        <body>
          <div class="report-header">
            <div style="display: flex; align-items: center; gap: 20px;">
              <img src="/ClaimVerifAI.png" alt="ClaimVerifAI" style="height: 50px; width: auto; object-fit: contain;" />
              <h1 class="report-title" style="margin: 6px 0 0 0; line-height: 1;">Incident Investigation Report</h1>
            </div>
          </div>

          <div class="report-section" style="margin-top: 0;">
            <div class="info-grid">
              <div class="info-group">
                <div class="info-label">Home Owner Information</div>
                <div class="info-value" style="font-weight: 700; font-size: 13px;">${report.firstName} ${report.lastName}</div>
                <div class="info-value"><span style="color: #666; font-size: 9px; font-weight: 700;">EMAIL:</span> ${report.email}</div>
                <div class="info-value"><span style="color: #666; font-size: 9px; font-weight: 700;">PHONE:</span> ${report.phone}</div>
              </div>
              <div class="info-group">
                <div class="info-label">Loss & Claim Information</div>
                <div class="info-value"><span style="color: #666; font-size: 9px; font-weight: 700;">DATE OF LOSS:</span> ${formatDateOnly(report.incidentDate)}</div>
                <div class="info-value"><span style="color: #666; font-size: 9px; font-weight: 700;">CLAIM #:</span> ${report.claimNumber}</div>
                <div class="info-value"><span style="color: #666; font-size: 9px; font-weight: 700;">CASE ID:</span> <span style="font-family: monospace;">${report.id.slice(0, 8).toUpperCase()}</span></div>
              </div>
              <div class="info-group">
                <div class="info-label">Site Address</div>
                <div class="info-value">${report.address}${report.apartment ? `, Apt ${report.apartment}` : ''}</div>
                <div class="info-value">${report.city}, ${report.state} ${report.zip}</div>
                <div class="info-value" style="margin-top: 5px;"><span style="color: #666; font-size: 9px; font-weight: 700;">STATUS:</span> <span style="text-transform: uppercase; font-weight: 700; color: #2563eb;">${(report.status || 'SUBMITTED').replace('_', ' ')}</span></div>
              </div>
            </div>
            
            <div class="info-grid" style="border-top: 1px solid #eee; padding-top: 10px;">
              <div class="info-group">
                <div class="info-label">Reporting Organization</div>
                <div class="info-value">${report.companyName || 'Predictif AI Systems'}</div>
              </div>
              <div class="info-group">
                <div class="info-label">Date Submitted</div>
                <div class="info-value">${report.createdAt ? new Date(report.createdAt).toLocaleDateString() : 'N/A'} ${report.createdAt ? new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
              </div>
              <div class="info-group">
                <div class="info-label">Document Verity</div>
                <div class="info-value" style="color: #10b981;">&check; Electronically Signed & Validated</div>
              </div>
            </div>
          </div>

          ${weatherData ? `
          <div class="report-section">
            <h3 class="section-title">Weather Information</h3>
            <div class="info-grid">
               <div class="info-group">
                  <div class="info-label">Hail Size (Reported)</div>
                  <div class="info-value">${weatherData.reported_hail_size_inches || 'N/A'} inches</div>
               </div>
               <div class="info-group">
                  <div class="info-label">Weather Date</div>
                  <div class="info-value">${weatherData.weather_date ? formatDateOnly(weatherData.weather_date) : 'N/A'}</div>
               </div>
               <div class="info-group" style="grid-column: span 1;">
                 <div class="info-label">Weather Description</div>
                 <div class="info-value" style="font-style: italic;">"${weatherData.weather_description || 'No description'}"</div>
               </div>
            </div>
          </div>
          ` : ''}

          <div class="report-section">
            <h3 class="section-title">Incident Description</h3>
            <p class="info-value" style="white-space: pre-wrap; color: #444;">${report.description}</p>
            ${report.shingleExposure ? `
              <div class="info-group" style="margin-top: 15px;">
                <div class="info-label">Shingle Exposure Measurement</div>
                <div class="info-value">${report.shingleExposure} inches</div>
              </div>
            ` : ''}
          </div>

          <div class="report-section">
            <h3 class="section-title">On-Site Documentation</h3>
            <div class="photo-grid">
              ${(report.photoUrls || []).map((_, i) => `
                <div class="photo-box">
                  <img src="${resolvedUrls[`original_${i}`] || ''}" crossorigin="anonymous" />
                  <div class="photo-caption">Figure ${i + 1}</div>
                </div>
              `).join('')}
            </div>
          </div>

          ${aiSectionHtml}
          
          <div class="report-footer">
            Confidential Document &bull; Investigated by Predictif AI Systems &bull; Page 1 of 1
          </div>

          <script>
            window.onload = async () => {
              const imgs = Array.from(document.getElementsByTagName('img'));
              const loadPromises = imgs.filter(img => img.src).map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                  img.onload = resolve;
                  img.onerror = resolve;
                });
              });
              await Promise.all(loadPromises);
              setTimeout(() => { 
                window.print();
                window.parent.postMessage('print_done', '*');
              }, 1000);
            }
          </script>
        </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const cleanup = () => {
      document.body.removeChild(iframe);
      window.removeEventListener('message', handleMessage);
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'print_done') cleanup();
    };

    window.addEventListener('message', handleMessage);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    }
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

  // Authorization check: Only Admins, SuperAdmins, IncidentReporters AND HomeOwners can view reports
  if (!roleLoading && !isAdmin && !isIncidentReporter && !isHomeOwner) {
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

              {report.weatherReport && (() => {
                try {
                  const weather = typeof report.weatherReport === 'string'
                    ? JSON.parse(report.weatherReport)
                    : report.weatherReport;

                  if (!weather) return null;

                  return (
                    <div className="mb-4 bg-gray-50 p-4 rounded-md border border-gray-100">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        Weather Details
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {weather.reported_hail_size_inches && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Hail Size</p>
                            <p className="text-sm text-gray-900">{weather.reported_hail_size_inches} inches</p>
                          </div>
                        )}
                        {weather.weather_date && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Weather Date</p>
                            <p className="text-sm text-gray-900">{formatDateOnly(weather.weather_date)}</p>
                          </div>
                        )}
                        {weather.weather_description && (
                          <div className="md:col-span-2">
                            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Description</p>
                            <p className="text-sm text-gray-900 italic">"{weather.weather_description}"</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                } catch (e) {
                  console.error("Error parsing weather report for display:", e);
                  return null;
                }
              })()}

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

              {/* AI Analysis Section - Hidden for HomeOwners */}
              {!isHomeOwner && report.aiAnalysis && (
                <AIAnalysisDisplay analysis={report.aiAnalysis} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

