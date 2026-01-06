import { NextRequest, NextResponse } from "next/server";
import { getDynamoDBClientConfig, getIncidentReportTableName, getCompanyTableName } from "@/lib/aws-config";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient(getDynamoDBClientConfig());
const docClient = DynamoDBDocumentClient.from(client);
const INCIDENT_TABLE = getIncidentReportTableName();
const COMPANY_TABLE = getCompanyTableName();

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

    const companyCommand = new GetCommand({
      TableName: COMPANY_TABLE,
      Key: { id: companyId },
    });

    const companyResponse = await docClient.send(companyCommand);

    if (!companyResponse.Item) {
      return NextResponse.json(
        { error: "Invalid company" },
        { status: 404 }
      );
    }

    if (companyResponse.Item.isActive === false) {
      return NextResponse.json(
        { error: "This company is not currently accepting incident reports" },
        { status: 403 }
      );
    }

    // Create incident report
    const report = {
      id: randomUUID(),
      ...reportData,
      companyId,
      companyName: companyResponse.Item.name,
      status: "submitted",
      submittedAt: new Date().toISOString(),
      submittedBy: reportData.email || "Public Form Submission",
    };

    const putCommand = new PutCommand({
      TableName: INCIDENT_TABLE,
      Item: report,
    });

    await docClient.send(putCommand);

    return NextResponse.json(
      {
        success: true,
        reportId: report.id,
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
