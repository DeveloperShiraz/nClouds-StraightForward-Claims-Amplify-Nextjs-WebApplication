import { NextRequest, NextResponse } from "next/server";
import { getDynamoDBClientConfig, getIncidentReportTableName } from "@/lib/aws-config";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient(getDynamoDBClientConfig());
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = getIncidentReportTableName();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: { id },
    });

    const response = await docClient.send(command);

    if (!response.Item) {
      return NextResponse.json({ error: "Incident report not found" }, { status: 404 });
    }

    return NextResponse.json({ report: response.Item });
  } catch (error: any) {
    console.error("Error fetching incident report:", error);
    return NextResponse.json(
      { error: "Failed to fetch incident report", details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Build update expression dynamically
    const updateExpressionParts: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    Object.keys(body).forEach((key, index) => {
      if (key !== "id") {
        updateExpressionParts.push(`#field${index} = :value${index}`);
        expressionAttributeNames[`#field${index}`] = key;
        expressionAttributeValues[`:value${index}`] = body[key];
      }
    });

    if (updateExpressionParts.length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const command = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: `SET ${updateExpressionParts.join(", ")}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    });

    const response = await docClient.send(command);

    return NextResponse.json({ report: response.Attributes });
  } catch (error: any) {
    console.error("Error updating incident report:", error);
    return NextResponse.json(
      { error: "Failed to update incident report", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const command = new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { id },
    });

    await docClient.send(command);

    return NextResponse.json({ success: true, message: "Incident report deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting incident report:", error);
    return NextResponse.json(
      { error: "Failed to delete incident report", details: error.message },
      { status: 500 }
    );
  }
}
