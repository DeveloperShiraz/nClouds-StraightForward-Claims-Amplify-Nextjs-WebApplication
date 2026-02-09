"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { CheckCircle, AlertCircle, Loader2 } from "@/components/Icons";
import { IncidentReportForm } from "@/components/forms/IncidentReportForm";
import { Button } from "@/components/ui/Button";

interface CompanyInfo {
  id: string;
  name: string;
  logoUrl?: string;
  isActive: boolean;
}

export default function PublicIncidentFormPage() {
  const params = useParams();
  const companyId = params?.companyId as string;

  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Fetch company information
  useEffect(() => {
    async function fetchCompany() {
      if (!companyId) {
        setError("Invalid company link");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/public/companies/${companyId}`);
        if (!response.ok) {
          throw new Error("Company not found");
        }

        const data = await response.json();

        if (data.company.isActive === false) {
          setError("This company is not currently accepting incident reports");
          setLoading(false);
          return;
        }

        setCompany(data.company);
        setLoading(false);
      } catch (err: any) {
        setError(err.message || "Failed to load company information");
        setLoading(false);
      }
    }

    fetchCompany();
  }, [companyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="max-w-md w-full text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Unable to Load Form</h1>
          <p className="text-gray-600 dark:text-gray-400">{error || "Company not found"}</p>
        </div>
      </div>
    );
  }

  if (submitSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="max-w-md w-full text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Report Submitted Successfully!</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Thank you for submitting your incident report to {company.name}.
            We have received your information and will review it shortly.
          </p>
          <Button onClick={() => setSubmitSuccess(false)}>
            Submit Another Report
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Company Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6 text-center">
          {company.logoUrl && (
            <img
              src={company.logoUrl}
              alt={company.name}
              className="h-16 mx-auto mb-4 object-contain"
            />
          )}
          <h1 className="text-3xl font-bold mb-2">{company.name}</h1>
          <p className="text-gray-600 dark:text-gray-400">Incident Report Form</p>
        </div>

        {/* Use the shared form component */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <IncidentReportForm
            publicMode={true}
            companyId={companyId}
            companyName={company.name}
            onSuccess={() => setSubmitSuccess(true)}
          />
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-500 dark:text-gray-400">
          <p>This form is provided by {company.name}</p>
          <p>Your information will be kept confidential</p>
        </div>
      </div>
    </div>
  );
}
