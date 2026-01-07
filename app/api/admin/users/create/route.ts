import { NextRequest, NextResponse } from "next/server";
import { generateServerClientUsingCookies } from "@aws-amplify/adapter-nextjs/data";
import { cookies } from "next/headers";
import outputs from "@/amplify_outputs.json";
import { type Schema } from "@/amplify/data/resource";

const client = generateServerClientUsingCookies<Schema>({
  config: outputs,
  cookies,
});

export async function POST(request: NextRequest) {
  try {
    const { email, password, group, companyId, companyName } = await request.json();

    if (!email || !password || !group) {
      return NextResponse.json(
        { error: "Email, password, and group are required" },
        { status: 400 }
      );
    }

    // Call the custom mutation in our Data API
    const { data: user, errors } = await client.queries.createUser({
      email,
      tempPassword: password,
      group,
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
