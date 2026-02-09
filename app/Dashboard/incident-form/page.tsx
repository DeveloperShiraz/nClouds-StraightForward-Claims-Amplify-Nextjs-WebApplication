"use client";

import { useState } from "react";
import { IncidentReportForm } from "@/components/forms/IncidentReportForm";
import Heading from "@/components/ui/Heading";
import { useUserRole } from "@/lib/auth/useUserRole";
import { Button } from "@/components/ui/Button";
import { Copy, CheckCircle, ExternalLink } from "@/components/Icons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

const IncidentFormPage = () => {
  const { isAdmin, isSuperAdmin, isIncidentReporter, companyId, companyName } = useUserRole();
  const [copied, setCopied] = useState(false);

  const copyPublicLink = () => {
    if (!companyId) return;

    const baseUrl = window.location.origin;
    const publicUrl = `${baseUrl}/public-form/${companyId}`;

    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }).catch((err) => {
      console.error("Failed to copy link:", err);
    });
  };

  const openPublicForm = () => {
    if (!companyId) return;
    const baseUrl = window.location.origin;
    const publicUrl = `${baseUrl}/public-form/${companyId}`;
    window.open(publicUrl, '_blank');
  };

  return (
    <div className="p-6">
      <Heading size="sm" className="text-[#000000] mb-6">
        Submit Incident Report
      </Heading>

      {/* Shareable Link Card for Admins and Incident Reporters */}
      {(isAdmin || isSuperAdmin || isIncidentReporter) && companyId && (
        <Card className="mb-6 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              Public Incident Report Form
            </CardTitle>
            <CardDescription>
              Share this link with customers to allow them to submit incident reports without logging in
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md p-3 text-sm font-mono break-all">
                {`${typeof window !== 'undefined' ? window.location.origin : ''}/public-form/${companyId}`}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyPublicLink}
                  className="whitespace-nowrap"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Link
                    </>
                  )}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={openPublicForm}
                  className="whitespace-nowrap"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open
                </Button>
              </div>
            </div>
            {companyName && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                This form is for: <span className="font-semibold">{companyName}</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <IncidentReportForm />
    </div>
  );
};

export default IncidentFormPage;
