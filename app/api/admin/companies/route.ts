import { NextRequest, NextResponse } from "next/server";
import { getDynamoDBClientConfig, getCompanyTableName } from "@/lib/aws-config";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient(getDynamoDBClientConfig());
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = getCompanyTableName();

export async function GET(request: NextRequest) {
  try {
    console.log("Fetching companies from DynamoDB...");

    const command = new ScanCommand({
      TableName: TABLE_NAME,
    });

    const response = await docClient.send(command);
    const companies = response.Items || [];

    console.log(`Found ${companies.length} companies`);
    return NextResponse.json({ companies });
  } catch (error: any) {
    console.error("Exception fetching companies:", error);
    console.error("Error stack:", error.stack);
    return NextResponse.json(
      { error: "Failed to fetch companies", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, domain, logoUrl, settings, maxUsers } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Company name is required" },
        { status: 400 }
      );
    }

    const company = {
      id: randomUUID(),
      name,
      domain: domain || null,
      logoUrl: logoUrl || null,
      settings: settings || null,
      maxUsers: maxUsers || null,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: company,
    });

    await docClient.send(command);

    console.log("Company created:", company.id);
    return NextResponse.json({ company }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating company:", error);
    return NextResponse.json(
      { error: "Failed to create company", details: error.message },
      { status: 500 }
    );
  }
}
