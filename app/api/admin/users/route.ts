import { NextRequest, NextResponse } from "next/server";
import { getCognitoClientConfig, getUserPoolId } from "@/lib/aws-config";
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const USER_POOL_ID = getUserPoolId();

const client = new CognitoIdentityProviderClient({
  ...getCognitoClientConfig(),
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
          companyId: attributes["custom:companyId"] || null,
          companyName: attributes["custom:companyName"] || null,
        };
      })
    );

    return NextResponse.json({ users: usersWithGroups });
  } catch (error) {
    console.error("Error listing users:", error);
    return NextResponse.json(
      {
        error: "Failed to list users",
        details: error instanceof Error ? error.message : String(error),
        code: (error as any).name,
        userPoolIdConfigured: !!USER_POOL_ID
      },
      { status: 500 }
    );
  }
}
