import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/amplify-server-utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, ...reportData } = body;

    // Validate company exists and is active
    if (!companyId) {
      return NextResponse.json(
        { error: "Company ID is required" },
        { status: 400 }
      );
    }

    const client = createServerClient();

    // Fetch company to validate it exists and is active
    const { data: company, errors: companyErrors } = await client.models.Company.get({ id: companyId });

    if (companyErrors) {
      console.error("Errors fetching company:", companyErrors);
      return NextResponse.json(
        { error: "Failed to validate company", details: companyErrors },
        { status: 500 }
      );
    }

    if (!company) {
      return NextResponse.json(
        { error: "Invalid company" },
        { status: 404 }
      );
    }

    if (company.isActive === false) {
      return NextResponse.json(
        { error: "This company is not currently accepting incident reports" },
        { status: 403 }
      );
    }

    // Create incident report
    const { data: report, errors } = await client.models.IncidentReport.create({
      ...reportData,
      companyId,
      companyName: company.name,
      status: "submitted",
      submittedAt: new Date().toISOString(),
      submittedBy: reportData.email || "Public Form Submission",
    });

    if (errors) {
      console.error("Errors creating incident report:", errors);
      return NextResponse.json(
        { error: "Failed to submit incident report", details: errors },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        reportId: report?.id,
        message: "Incident report submitted successfully",
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating public incident report:", error);
    return NextResponse.json(
      { error: "Failed to submit incident report", details: error.message },
      { status: 500 }
    );
  }
}
