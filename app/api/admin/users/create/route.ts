import { NextRequest, NextResponse } from "next/server";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  MessageActionType,
} from "@aws-sdk/client-cognito-identity-provider";

const USER_POOL_ID = process.env.AMPLIFY_AUTH_USERPOOL_ID;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

// Initialize client with credentials from environment
const client = new CognitoIdentityProviderClient({
  region: AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

export async function POST(request: NextRequest) {
  try {
    if (!USER_POOL_ID) {
      return NextResponse.json(
        { error: "User pool ID not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { email, groups, sendInvite = true, companyId, companyName } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Validate groups
    const validGroups = ["SuperAdmin", "Admin", "IncidentReporter", "Customer"];
    const userGroups = Array.isArray(groups) ? groups : [groups];

    for (const group of userGroups) {
      if (!validGroups.includes(group)) {
        return NextResponse.json(
          { error: `Invalid group: ${group}. Must be one of: ${validGroups.join(", ")}` },
          { status: 400 }
        );
      }
    }

    // Build user attributes
    const userAttributes = [
      {
        Name: "email",
        Value: email,
      },
      {
        Name: "email_verified",
        Value: "true",
      },
    ];

    // Add company attributes if provided (not required for SuperAdmins)
    if (companyId) {
      userAttributes.push({
        Name: "custom:companyId",
        Value: companyId,
      });
    }

    if (companyName) {
      userAttributes.push({
        Name: "custom:companyName",
        Value: companyName,
      });
    }

    // Create user
    const createUserCommand = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: userAttributes,
      DesiredDeliveryMediums: sendInvite ? ["EMAIL"] : undefined,
      MessageAction: sendInvite ? undefined : MessageActionType.SUPPRESS,
    });

    const createUserResponse = await client.send(createUserCommand);

    // Add user to groups
    for (const group of userGroups) {
      const addToGroupCommand = new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        GroupName: group,
      });

      await client.send(addToGroupCommand);
    }

    return NextResponse.json({
      success: true,
      user: {
        username: createUserResponse.User?.Username,
        email,
        groups: userGroups,
        companyId: companyId || null,
        companyName: companyName || null,
      },
    });
  } catch (error: any) {
    console.error("Error creating user:", error);
    console.error("Error details:", {
      name: error.name,
      message: error.message,
      code: error.$metadata?.httpStatusCode,
    });

    // Handle specific error cases
    if (error.name === "UsernameExistsException") {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 409 }
      );
    }

    if (error.name === "InvalidParameterException") {
      return NextResponse.json(
        { error: `Invalid parameter: ${error.message}` },
        { status: 400 }
      );
    }

    if (error.name === "NotAuthorizedException" || error.name === "CredentialsProviderError") {
      return NextResponse.json(
        {
          error: "AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.",
          details: error.message
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: error.message || "Failed to create user",
        errorType: error.name,
        details: "Check server logs for more information"
      },
      { status: 500 }
    );
  }
}
