import { NextRequest, NextResponse } from "next/server";
import { runWithAmplifyServerContext, createApiClient } from "@/lib/amplify-server-utils";

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  return await runWithAmplifyServerContext({
    nextServerContext: { request, response },
    operation: async (contextSpec) => {
      try {
        console.log("Fetching incident reports from Amplify Data...");

        const client = createApiClient(contextSpec);

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

        const response = await client.graphql(contextSpec, {
          query: listQuery
        }) as any;

        if (response.errors) {
          console.error("Errors fetching incident reports:", response.errors);
          return NextResponse.json(
            { error: "Failed to fetch incident reports", details: response.errors },
            { status: 500 }
          );
        }

        const reports = response.data.listIncidentReports.items;

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
    },
  });
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
