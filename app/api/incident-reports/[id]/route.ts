import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/amplify-server-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const client = createServerClient();
    const { data: report, errors } = await client.models.IncidentReport.get({ id });

    if (errors) {
      console.error("Errors fetching incident report:", errors);
      return NextResponse.json(
        { error: "Failed to fetch incident report", details: errors },
        { status: 500 }
      );
    }

    if (!report) {
      return NextResponse.json({ error: "Incident report not found" }, { status: 404 });
    }

    return NextResponse.json({ report });
  } catch (error: any) {
    console.error("Error fetching incident report:", error);
    return NextResponse.json(
      { error: "Failed to fetch incident report", details: error.message },
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

    const { data: report, errors } = await client.models.IncidentReport.update({
      id,
      ...updateData,
    });

    if (errors) {
      console.error("Errors updating incident report:", errors);
      return NextResponse.json(
        { error: "Failed to update incident report", details: errors },
        { status: 500 }
      );
    }

    return NextResponse.json({ report });
  } catch (error: any) {
    console.error("Error updating incident report:", error);
    return NextResponse.json(
      { error: "Failed to update incident report", details: error.message },
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

    const client = createServerClient();
    const { errors } = await client.models.IncidentReport.delete({ id });

    if (errors) {
      console.error("Errors deleting incident report:", errors);
      return NextResponse.json(
        { error: "Failed to delete incident report", details: errors },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: "Incident report deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting incident report:", error);
    return NextResponse.json(
      { error: "Failed to delete incident report", details: error.message },
      { status: 500 }
    );
  }
}
