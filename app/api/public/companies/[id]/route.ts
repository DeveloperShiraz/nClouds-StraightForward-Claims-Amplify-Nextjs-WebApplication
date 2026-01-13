import { NextRequest, NextResponse } from "next/server";
import { runWithAmplifyServerContext, createApiClient } from "@/lib/amplify-server-utils";

/**
 * Public endpoint to fetch company information.
 * Used by the public incident report form to validate the company.
 * Uses 'identityPool' (guest) authorization.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const response = NextResponse.next();
    return await runWithAmplifyServerContext({
        nextServerContext: { request, response },
        operation: async (contextSpec) => {
            try {
                const { id } = await params;

                // Use 'identityPool' auth mode to allow guest access as configured in schema
                const client = createApiClient(contextSpec, 'identityPool');

                const { data: company, errors } = await client.models.Company.get(contextSpec, { id }, {
                    selectionSet: ['id', 'name', 'logoUrl', 'isActive'],
                });

                if (errors) {
                    console.error("Errors fetching company (public):", errors);
                    return NextResponse.json(
                        { error: "Failed to fetch company information", details: errors },
                        { status: 500 }
                    );
                }

                if (!company) {
                    return NextResponse.json({ error: "Company not found" }, { status: 404 });
                }

                return NextResponse.json({ company });
            } catch (error: any) {
                console.error("Error in public company fetch:", error);
                return NextResponse.json(
                    { error: "Failed to fetch company information", details: error.message },
                    { status: 500 }
                );
            }
        },
    });
}
