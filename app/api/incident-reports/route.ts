import { NextRequest, NextResponse } from "next/server";
import { runWithAmplifyServerContext, createApiClient } from "@/lib/amplify-server-utils";

export async function GET(request: NextRequest) {
  try {
    console.log("Fetching incident reports from Amplify Data (API Key auth)...");

    // Read AppSync endpoint and API key from amplify outputs
    const amplifyOutputs = require("@/amplify_outputs.json");
    const appsyncUrl = amplifyOutputs.data.url;
    const apiKey = amplifyOutputs.data.api_key;

    const listQuery = `
      query ListIncidentReports {
        listIncidentReports(limit: 1000) {
          items {
            id
            claimNumber
            companyId
            companyName
            firstName
            lastName
            phone
            email
            address
            apartment
            city
            state
            zip
            incidentDate
            description
            shingleExposure
            photoUrls
            status
            submittedAt
            submittedBy
            createdAt
            updatedAt
            aiAnalysis
            weatherReport
          }
        }
      }
    `;

    // Use direct fetch with API key header to bypass user-pool auth restrictions
    const appsyncResponse = await fetch(appsyncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ query: listQuery }),
    });

    const result = await appsyncResponse.json();

    if (result.errors) {
      console.error("Errors fetching incident reports:", result.errors);
      return NextResponse.json(
        { error: "Failed to fetch incident reports", details: result.errors },
        { status: 500 }
      );
    }

    const reports = result.data?.listIncidentReports?.items || [];

    console.log(`Found ${reports.length} incident reports`);
    return NextResponse.json({ reports });
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
  const response = NextResponse.next();
  return await runWithAmplifyServerContext({
    nextServerContext: { request, response },
    operation: async (contextSpec) => {
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
          weatherReport,
        } = body;

        // Validate required fields
        if (!claimNumber || !firstName || !lastName || !phone || !email || !address || !city || !state || !zip || !incidentDate || !description) {
          return NextResponse.json(
            { error: "Missing required fields" },
            { status: 400 }
          );
        }

        const client = createApiClient(contextSpec);

        const { data: report, errors } = await client.models.IncidentReport.create(contextSpec, {
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
          aiAnalysis: JSON.stringify({ status: 'pending' }),
          weatherReport: weatherReport || undefined,
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
    },
  });
}
