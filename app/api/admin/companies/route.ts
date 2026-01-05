import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/amplify-server-utils";

export async function GET(request: NextRequest) {
  try {
    console.log("Fetching companies...");

    const client = createServerClient();
    const { data: companies, errors } = await client.models.Company.list();

    if (errors) {
      console.error("Error fetching companies:", JSON.stringify(errors, null, 2));
      return NextResponse.json(
        { error: "Failed to fetch companies", details: errors },
        { status: 500 }
      );
    }

    console.log(`Found ${companies?.length || 0} companies`);
    return NextResponse.json({ companies: companies || [] });
  } catch (error: any) {
    console.error("Exception fetching companies:", error);
    console.error("Error stack:", error.stack);
    return NextResponse.json(
      { error: "Failed to fetch companies", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, domain, logoUrl, settings, maxUsers } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Company name is required" },
        { status: 400 }
      );
    }

    const client = createServerClient();
    const { data: company, errors } = await client.models.Company.create({
      name,
      domain: domain || null,
      logoUrl: logoUrl || null,
      settings: settings || null,
      maxUsers: maxUsers || null,
      isActive: true,
      createdAt: new Date().toISOString(),
    });

    if (errors) {
      console.error("Error creating company:", errors);
      return NextResponse.json(
        { error: "Failed to create company", details: errors },
        { status: 500 }
      );
    }

    return NextResponse.json({ company }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating company:", error);
    return NextResponse.json(
      { error: "Failed to create company", details: error.message },
      { status: 500 }
    );
  }
}
