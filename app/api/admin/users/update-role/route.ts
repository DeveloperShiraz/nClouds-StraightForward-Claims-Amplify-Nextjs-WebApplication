import { NextRequest, NextResponse } from "next/server";
import { getCognitoClientConfig, getUserPoolId } from "@/lib/aws-config";
import {
  CognitoIdentityProviderClient,
  AdminRemoveUserFromGroupCommand,
  AdminAddUserToGroupCommand,
  AdminListGroupsForUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const USER_POOL_ID = getUserPoolId();

const client = new CognitoIdentityProviderClient({
  ...getCognitoClientConfig(),
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
    const { username, newRole } = body;

    if (!username || !newRole) {
      return NextResponse.json(
        { error: "Username and new role are required" },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ["Admin", "IncidentReporter", "Customer"];
    if (!validRoles.includes(newRole)) {
      return NextResponse.json(
        { error: `Invalid role: ${newRole}. Must be one of: ${validRoles.join(", ")}` },
        { status: 400 }
      );
    }

    // Get current groups
    const listGroupsCommand = new AdminListGroupsForUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    });

    const groupsResponse = await client.send(listGroupsCommand);
    const currentGroups = groupsResponse.Groups?.map((g) => g.GroupName!) || [];

    // Remove user from all current groups
    for (const group of currentGroups) {
      const removeCommand = new AdminRemoveUserFromGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        GroupName: group,
      });
      await client.send(removeCommand);
    }

    // Add user to new group
    const addCommand = new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      GroupName: newRole,
    });

    await client.send(addCommand);

    return NextResponse.json({
      success: true,
      message: `User role updated to ${newRole}`,
      username,
      newRole,
    });
  } catch (error: any) {
    console.error("Error updating user role:", error);

    if (error.name === "UserNotFoundException") {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
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
      { error: error.message || "Failed to update user role" },
      { status: 500 }
    );
  }
}
