import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/amplify-server-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const client = createServerClient();
    const { data: company, errors } = await client.models.Company.get({ id });

    if (errors) {
      console.error("Error fetching company:", errors);
      return NextResponse.json(
        { error: "Failed to fetch company", details: errors },
        { status: 500 }
      );
    }

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json({ company });
  } catch (error: any) {
    console.error("Error fetching company:", error);
    return NextResponse.json(
      { error: "Failed to fetch company", details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    const client = createServerClient();
    const { data: company, errors } = await client.models.Company.update({
      id,
      ...body,
    });

    if (errors) {
      console.error("Error updating company:", errors);
      return NextResponse.json(
        { error: "Failed to update company", details: errors },
        { status: 500 }
      );
    }

    return NextResponse.json({ company });
  } catch (error: any) {
    console.error("Error updating company:", error);
    return NextResponse.json(
      { error: "Failed to update company", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // TODO: Add validation to prevent deletion if company has users or reports
    // You may want to implement soft deletion instead

    const client = createServerClient();
    const { data, errors } = await client.models.Company.delete({ id });

    if (errors) {
      console.error("Error deleting company:", errors);
      return NextResponse.json(
        { error: "Failed to delete company", details: errors },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: "Company deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting company:", error);
    return NextResponse.json(
      { error: "Failed to delete company", details: error.message },
      { status: 500 }
    );
  }
}
