import { NextRequest, NextResponse } from "next/server";
import { getCognitoClientConfig, getUserPoolId } from "@/lib/aws-config";
import {
    CognitoIdentityProviderClient,
    AdminUpdateUserAttributesCommand,
    AttributeType,
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
        const { username, attributes } = body;

        if (!username || !attributes) {
            return NextResponse.json(
                { error: "Username and attributes are required" },
                { status: 400 }
            );
        }

        // Convert attributes object to Cognito AttributeType array
        const userAttributes: AttributeType[] = Object.entries(attributes).map(
            ([key, value]) => ({
                Name: key,
                Value: String(value),
            })
        );

        const command = new AdminUpdateUserAttributesCommand({
            UserPoolId: USER_POOL_ID,
            Username: username,
            UserAttributes: userAttributes,
        });

        await client.send(command);

        return NextResponse.json({
            success: true,
            message: "User profile updated successfully",
            username,
        });
    } catch (error: any) {
        console.error("Error updating user profile:", error);

        if (error.name === "UserNotFoundException") {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 }
            );
        }

        if (
            error.name === "NotAuthorizedException" ||
            error.name === "CredentialsProviderError"
        ) {
            return NextResponse.json(
                {
                    error:
                        "AWS credentials not configured or insufficient permissions. Please check IAM roles.",
                    details: error.message,
                },
                { status: 401 }
            );
        }

        return NextResponse.json(
            { error: error.message || "Failed to update user profile" },
            { status: 500 }
        );
    }
}
