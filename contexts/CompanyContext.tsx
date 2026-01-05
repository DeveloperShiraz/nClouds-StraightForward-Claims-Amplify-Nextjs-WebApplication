"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useUserRole } from "@/lib/auth/useUserRole";

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

interface CompanyContextType {
  currentCompany: Company | null;
  companies: Company[];
  isLoading: boolean;
  refreshCompanies: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType>({
  currentCompany: null,
  companies: [],
  isLoading: true,
  refreshCompanies: async () => {},
});

export const useCompany = () => useContext(CompanyContext);

export const CompanyProvider = ({ children }: { children: ReactNode }) => {
  const { companyId, isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshCompanies = async () => {
    if (roleLoading) return;

    setIsLoading(true);
    try {
      // Fetch companies from the API
      console.log("CompanyContext: Fetching companies...");
      const response = await fetch("/api/admin/companies");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("CompanyContext: Failed to fetch companies:", response.status, errorData);

        // If there's an authorization error, just set empty arrays
        // This allows the app to continue working even if companies can't be fetched
        setCompanies([]);
        setCurrentCompany(null);
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      const fetchedCompanies = data.companies || [];

      console.log("CompanyContext: Fetched companies:", fetchedCompanies.length);
      setCompanies(fetchedCompanies);

      // Set current company for non-SuperAdmins
      if (!isSuperAdmin && companyId) {
        const userCompany = fetchedCompanies.find((c: Company) => c.id === companyId);
        setCurrentCompany(userCompany || null);
      } else if (isSuperAdmin && fetchedCompanies.length > 0) {
        // SuperAdmins might not have a current company, but we'll set the first one as default
        setCurrentCompany(fetchedCompanies[0]);
      }
    } catch (error) {
      console.error("CompanyContext: Exception fetching companies:", error);
      setCompanies([]);
      setCurrentCompany(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!roleLoading) {
      refreshCompanies();
    }
  }, [companyId, isSuperAdmin, roleLoading]);

  return (
    <CompanyContext.Provider
      value={{
        currentCompany,
        companies,
        isLoading,
        refreshCompanies,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
};
