import { NextRequest, NextResponse } from "next/server";
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const client = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || "us-east-1",
});

const USER_POOL_ID = process.env.AMPLIFY_AUTH_USERPOOL_ID;

export async function DELETE(request: NextRequest) {
  try {
    if (!USER_POOL_ID) {
      return NextResponse.json(
        { error: "User pool ID not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { username } = body;

    if (!username) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }

    // Delete user
    const deleteUserCommand = new AdminDeleteUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    });

    await client.send(deleteUserCommand);

    return NextResponse.json({
      success: true,
      message: `User ${username} deleted successfully`,
    });
  } catch (error: any) {
    console.error("Error deleting user:", error);

    // Handle specific error cases
    if (error.name === "UserNotFoundException") {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: error.message || "Failed to delete user" },
      { status: 500 }
    );
  }
}
