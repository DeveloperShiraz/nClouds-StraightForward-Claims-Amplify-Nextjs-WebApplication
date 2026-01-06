import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/amplify-server-utils";

export async function GET(request: NextRequest) {
  try {
    console.log("Fetching companies from Amplify Data...");

    const client = createServerClient();
    const { data: companies, errors } = await client.models.Company.list();

    if (errors) {
      console.error("Errors fetching companies:", errors);
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
      domain: domain || undefined,
      logoUrl: logoUrl || undefined,
      settings: settings || undefined,
      maxUsers: maxUsers || undefined,
      isActive: true,
      createdAt: new Date().toISOString(),
    });

    if (errors) {
      console.error("Errors creating company:", errors);
      return NextResponse.json(
        { error: "Failed to create company", details: errors },
        { status: 500 }
      );
    }

    console.log("Company created:", company?.id);
    return NextResponse.json({ company }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating company:", error);
    return NextResponse.json(
      { error: "Failed to create company", details: error.message },
      { status: 500 }
    );
  }
}
