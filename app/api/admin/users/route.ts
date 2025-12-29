import { NextRequest, NextResponse } from "next/server";
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const USER_POOL_ID = process.env.AMPLIFY_AUTH_USERPOOL_ID;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

const client = new CognitoIdentityProviderClient({
  region: AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

export async function GET(request: NextRequest) {
  try {
    if (!USER_POOL_ID) {
      return NextResponse.json(
        { error: "User pool ID not configured" },
        { status: 500 }
      );
    }

    // List all users in the user pool
    const listUsersCommand = new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
    });

    const usersResponse = await client.send(listUsersCommand);

    // Get groups for each user
    const usersWithGroups = await Promise.all(
      (usersResponse.Users || []).map(async (user) => {
        const username = user.Username!;

        // Get user groups
        const listGroupsCommand = new AdminListGroupsForUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
        });

        const groupsResponse = await client.send(listGroupsCommand);
        const groups = groupsResponse.Groups?.map((g) => g.GroupName!) || [];

        // Extract user attributes
        const attributes = user.Attributes?.reduce((acc, attr) => {
          if (attr.Name) {
            acc[attr.Name] = attr.Value || "";
          }
          return acc;
        }, {} as Record<string, string>) || {};

        return {
          username,
          email: attributes.email || "",
          emailVerified: attributes.email_verified === "true",
          status: user.UserStatus,
          enabled: user.Enabled,
          createdAt: user.UserCreateDate?.toISOString(),
          groups,
        };
      })
    );

    return NextResponse.json({ users: usersWithGroups });
  } catch (error) {
    console.error("Error listing users:", error);
    return NextResponse.json(
      { error: "Failed to list users" },
      { status: 500 }
    );
  }
}
