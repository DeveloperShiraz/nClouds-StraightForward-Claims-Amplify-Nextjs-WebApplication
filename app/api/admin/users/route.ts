import { NextRequest, NextResponse } from "next/server";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { getCognitoClientConfig, getAdminActionsFunctionName } from "@/lib/aws-config";

const lambdaClient = new LambdaClient(getCognitoClientConfig());
const FUNCTION_NAME = getAdminActionsFunctionName();

export async function GET(request: NextRequest) {
  const debugInfo: any = {
    functionName: FUNCTION_NAME,
    hasFunctionName: !!FUNCTION_NAME,
    region: getCognitoClientConfig().region,
    hasManualCredentials: !!getCognitoClientConfig().credentials,
    // Safely check for env vars without exposing secrets
    env: {
      hasAwsKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasAwsSecret: !!process.env.AWS_SECRET_ACCESS_KEY,
      nodeEnv: process.env.NODE_ENV,
      lambdaName: process.env.AWS_LAMBDA_FUNCTION_NAME || "Not a Lambda",
    }
  };

  try {
    if (!FUNCTION_NAME) {
      console.error("ADMIN_ACTIONS_FUNCTION_NAME not configured");
      return NextResponse.json(
        { error: "Admin Actions Function not configured", debug: debugInfo },
        { status: 500 }
      );
    }

    // Call the admin-actions function to list users
    const command = new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      Payload: Buffer.from(JSON.stringify({
        action: "listUsers",
        payload: {}
      })),
    });

    const response = await lambdaClient.send(command);
    const result = JSON.parse(Buffer.from(response.Payload!).toString());

    if (response.FunctionError) {
      throw new Error(result.errorMessage || "Function execution failed");
    }

    const { users } = result;

    // Process users and groups (now handled within the function or returned as is)
    // The function already provides the users array.

    const formattedUsers = users.map((user: any) => {
      const username = user.Username || user.username;

      const attributes = (user.Attributes || []).reduce((acc: any, attr: any) => {
        acc[attr.Name] = attr.Value || "";
        return acc;
      }, {});

      return {
        username,
        email: attributes.email || "",
        emailVerified: attributes.email_verified === "true",
        status: user.UserStatus,
        enabled: user.Enabled,
        createdAt: user.UserCreateDate ? new Date(user.UserCreateDate).toISOString() : user.createdAt,
        groups: user.groups || [], // If function returns groups
        companyId: attributes["custom:companyId"] || null,
        companyName: attributes["custom:companyName"] || null,
      };
    });

    return NextResponse.json({ users: formattedUsers });
  } catch (error: any) {
    console.error("Error listing users:", error);
    return NextResponse.json(
      {
        error: "Failed to list users",
        details: error.message,
        code: error.name,
        debug: debugInfo
      },
      { status: 500 }
    );
  }
}
