import { NextRequest, NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { getDynamoDBClientConfig, getIncidentReportTableName } from "@/lib/aws-config";

const client = new DynamoDBClient(getDynamoDBClientConfig());
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = getIncidentReportTableName();

export async function GET(request: NextRequest) {
  try {
    console.log("Fetching incident reports from DynamoDB...");

    const command = new ScanCommand({
      TableName: TABLE_NAME,
    });

    const response = await docClient.send(command);
    const reports = response.Items || [];

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

    const report = {
      id: randomUUID(),
      claimNumber,
      firstName,
      lastName,
      phone,
      email,
      address,
      apartment: apartment || "",
      city,
      state,
      zip,
      incidentDate,
      description,
      shingleExposure: shingleExposure || null,
      photoUrls: photoUrls || [],
      status: "submitted",
      submittedAt: new Date().toISOString(),
      companyId: companyId || null,
      companyName: companyName || null,
      submittedBy: submittedBy || null,
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: report,
    });

    await docClient.send(command);

    console.log("Incident report created:", report.id);
    return NextResponse.json({ report }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating incident report:", error);
    return NextResponse.json(
      { error: "Failed to create incident report", details: error.message },
      { status: 500 }
    );
  }
}
