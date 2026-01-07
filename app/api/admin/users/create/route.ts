import { NextRequest, NextResponse } from "next/server";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { getCognitoClientConfig } from "@/lib/aws-config";

const lambdaClient = new LambdaClient(getCognitoClientConfig());
const FUNCTION_NAME = process.env.ADMIN_ACTIONS_FUNCTION_NAME;

export async function POST(request: NextRequest) {
  try {
    if (!FUNCTION_NAME) {
      console.error("ADMIN_ACTIONS_FUNCTION_NAME not configured");
      return NextResponse.json(
        { error: "Admin Actions Function not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { email, groups, sendInvite = true, companyId, companyName, temporaryPassword } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Build user attributes
    const userAttributes = [
      { Name: "email", Value: normalizedEmail },
      { Name: "email_verified", Value: "true" },
    ];

    if (companyId) {
      userAttributes.push({ Name: "custom:companyId", Value: companyId });
    }
    if (companyName) {
      userAttributes.push({ Name: "custom:companyName", Value: companyName });
    }

    // Call the admin-actions function to create user
    const command = new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      Payload: Buffer.from(JSON.stringify({
        action: "createUser",
        payload: {
          email: normalizedEmail,
          userAttributes,
          sendInvite,
          temporaryPassword,
          groups: Array.isArray(groups) ? groups : [groups]
        }
      })),
    });

    const response = await lambdaClient.send(command);
    const result = JSON.parse(Buffer.from(response.Payload!).toString());

    if (response.FunctionError) {
      // If the function returned an error, check if it's a known exception
      const errorDetail = result.errorMessage || result.details || "Function execution failed";

      if (result.errorType === "UsernameExistsException" || errorDetail.includes("already exists")) {
        return NextResponse.json(
          { error: "User with this email already exists" },
          { status: 409 }
        );
      }

      throw new Error(errorDetail);
    }

    return NextResponse.json({
      success: true,
      user: {
        username: normalizedEmail,
        email: normalizedEmail,
        groups: Array.isArray(groups) ? groups : [groups],
        companyId: companyId || null,
        companyName: companyName || null,
      },
    });
  } catch (error: any) {
    console.error("Error creating user:", error);

    // Handle specific error cases that might come from SDK or Function
    const errorName = error.name || error.errorType;

    if (errorName === "UsernameExistsException") {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: error.message || "Failed to create user",
        code: errorName,
        details: "See server logs for more information"
      },
      { status: 500 }
    );
  }
}
