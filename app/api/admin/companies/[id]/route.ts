import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/amplify-server-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const client = createServerClient();
    const { data: company, errors } = await client.models.Company.get({ id });

    if (errors) {
      console.error("Errors fetching company:", errors);
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (Object.keys(body).filter(key => key !== "id").length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const client = createServerClient();

    // Remove id from body if present
    const { id: _, ...updateData } = body;

    const { data: company, errors } = await client.models.Company.update({
      id,
      ...updateData,
    });

    if (errors) {
      console.error("Errors updating company:", errors);
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // TODO: Add validation to prevent deletion if company has users or reports
    // You may want to implement soft deletion instead

    const client = createServerClient();
    const { errors } = await client.models.Company.delete({ id });

    if (errors) {
      console.error("Errors deleting company:", errors);
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
