import { NextRequest, NextResponse } from "next/server";
import { getCognitoClientConfig, getUserPoolId } from "@/lib/aws-config";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminSetUserPasswordCommand,
  MessageActionType,
} from "@aws-sdk/client-cognito-identity-provider";

const USER_POOL_ID = getUserPoolId();

// Initialize client with credentials from environment
const client = new CognitoIdentityProviderClient(getCognitoClientConfig());

export async function POST(request: NextRequest) {
  try {
    if (!USER_POOL_ID) {
      return NextResponse.json(
        { error: "User pool ID not configured" },
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

    // Normalize email to lowercase to prevent duplicates with different cases
    const normalizedEmail = email.toLowerCase().trim();

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
        Value: normalizedEmail,
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

    // Create user (use normalized email as username)
    const createUserCommand = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: normalizedEmail,
      UserAttributes: userAttributes,
      DesiredDeliveryMediums: sendInvite ? ["EMAIL"] : undefined,
      MessageAction: sendInvite ? undefined : MessageActionType.SUPPRESS,
      TemporaryPassword: temporaryPassword, // Will be undefined if not provided (auto-generated)
    });

    const createUserResponse = await client.send(createUserCommand);

    // If a custom password was provided, set it as permanent
    if (temporaryPassword) {
      const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: normalizedEmail,
        Password: temporaryPassword,
        Permanent: true, // Make it permanent so user doesn't have to change it
      });

      await client.send(setPasswordCommand);
    }

    // Add user to groups
    for (const group of userGroups) {
      const addToGroupCommand = new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: normalizedEmail,
        GroupName: group,
      });

      await client.send(addToGroupCommand);
    }

    return NextResponse.json({
      success: true,
      user: {
        username: createUserResponse.User?.Username,
        email: normalizedEmail,
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

    if (error.name === "NotAuthorizedException" || error.name === "CredentialsProviderError" || error.name === "AccessDeniedException") {
      return NextResponse.json(
        {
          error: "Authentication Error",
          code: error.name,
          details: error.message,
          debug: {
            hasAppKey: !!process.env.APP_AWS_ACCESS_KEY_ID,
            hasAppSecret: !!process.env.APP_AWS_SECRET_ACCESS_KEY,
            hasStandardKey: !!process.env.AWS_ACCESS_KEY_ID,
            userPoolIdConfigured: !!USER_POOL_ID
          }
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
