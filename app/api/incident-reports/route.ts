import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/amplify-server-utils";

export async function GET(request: NextRequest) {
  try {
    console.log("Fetching incident reports from Amplify Data...");

    const client = createServerClient();
    const { data: reports, errors } = await client.models.IncidentReport.list();

    if (errors) {
      console.error("Errors fetching incident reports:", errors);
      return NextResponse.json(
        { error: "Failed to fetch incident reports", details: errors },
        { status: 500 }
      );
    }

    console.log(`Found ${reports?.length || 0} incident reports`);
    return NextResponse.json({ reports: reports || [] });
  } catch (error: any) {
    console.error("Exception fetching incident reports:", error);
    console.error("Error stack:", error.stack);
    return NextResponse.json(
      { error: "Failed to fetch incident reports", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      claimNumber,
      firstName,
      lastName,
      phone,
      email,
      address,
      apartment,
      city,
      state,
      zip,
      incidentDate,
      description,
      shingleExposure,
      photoUrls,
      companyId,
      companyName,
      submittedBy,
    } = body;

    // Validate required fields
    if (!claimNumber || !firstName || !lastName || !phone || !email || !address || !city || !state || !zip || !incidentDate || !description) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const client = createServerClient();

    const { data: report, errors } = await client.models.IncidentReport.create({
      claimNumber,
      firstName,
      lastName,
      phone,
      email,
      address,
      apartment: apartment || undefined,
      city,
      state,
      zip,
      incidentDate,
      description,
      shingleExposure: shingleExposure || undefined,
      photoUrls: photoUrls || undefined,
      status: "submitted",
      submittedAt: new Date().toISOString(),
      companyId: companyId || undefined,
      companyName: companyName || undefined,
      submittedBy: submittedBy || undefined,
    });

    if (errors) {
      console.error("Errors creating incident report:", errors);
      return NextResponse.json(
        { error: "Failed to create incident report", details: errors },
        { status: 500 }
      );
    }

    console.log("Incident report created:", report?.id);
    return NextResponse.json({ report }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating incident report:", error);
    return NextResponse.json(
      { error: "Failed to create incident report", details: error.message },
      { status: 500 }
    );
  }
}
