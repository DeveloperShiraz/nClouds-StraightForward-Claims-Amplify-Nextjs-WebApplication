import { NextRequest, NextResponse } from "next/server";
import { generateServerClientUsingCookies } from "@aws-amplify/adapter-nextjs/data";
import { cookies } from "next/headers";
import { type Schema } from "@/amplify/data/resource";
import { getAmplifyRuntimeConfig } from "@/lib/amplify-runtime-config";

const client = generateServerClientUsingCookies<Schema>({
  config: getAmplifyRuntimeConfig(),
  cookies,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, temporaryPassword, group, groups, companyId, companyName } = body;

    // Extract the primary group and password from multiple possible keys
    const targetGroup = group || (groups && groups.length > 0 ? groups[0] : null);
    const targetPassword = password || temporaryPassword;

    if (!email || !targetGroup) {
      return NextResponse.json(
        { error: "Email and group (or groups) are required" },
        { status: 400 }
      );
    }

    // Call the custom mutation in our Data API
    const { data: user, errors } = await client.mutations.createUser({
      email,
      tempPassword: targetPassword,
      group: targetGroup,
      companyId,
      companyName,
    });

    if (errors) {
      console.error("AppSync errors:", errors);
      throw new Error(errors[0].message);
    }

    return NextResponse.json({
      success: true,
      user: {
        username: user?.username,
        email: user?.email,
        status: user?.status,
      },
    });
  } catch (error: any) {
    console.error("Error creating user:", error);
    const errorName = error.name || "Error";
    return NextResponse.json(
      {
        error: error.message || "Failed to create user",
        code: errorName,
        details: "See server logs for more information",
      },
      { status: 500 }
    );
  }
}
