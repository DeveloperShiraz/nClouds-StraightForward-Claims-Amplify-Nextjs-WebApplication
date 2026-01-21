import { NextRequest, NextResponse } from "next/server";
import { runWithAmplifyServerContext, createApiClient } from "@/lib/amplify-server-utils";
import { fetchAuthSession } from "aws-amplify/auth/server";
import outputs from "@/amplify_outputs.json";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const AI_LAMBDA_URL = "https://xkhwrtjkwriyfonzpjdhuvmdky0ufdxf.lambda-url.us-east-1.on.aws/";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const response = NextResponse.next();
    return await runWithAmplifyServerContext({
        nextServerContext: { request, response },
        operation: async (contextSpec) => {
            try {
                const { id } = await params;
                const client = createApiClient(contextSpec);

                // 1. Fetch the report to check if it exists and has photos
                const { data: report, errors: fetchErrors } = await client.models.IncidentReport.get(contextSpec, { id });

                if (fetchErrors || !report) {
                    return NextResponse.json({ error: "Report not found" }, { status: 404 });
                }

                if (!report.photoUrls || report.photoUrls.length === 0) {
                    return NextResponse.json({ error: "No photos to analyze" }, { status: 400 });
                }

                // 2. Clear previous analysis and set status to 'analyzing'
                console.log(`Setting status to 'analyzing' for report: ${id}`);
                const updateQuery = `
                    mutation UpdateIncidentReport($input: UpdateIncidentReportInput!) {
                        updateIncidentReport(input: $input) { id }
                    }
                `;

                await client.graphql(contextSpec, {
                    query: updateQuery,
                    variables: {
                        input: {
                            id,
                            aiAnalysis: JSON.stringify({ status: "analyzing", startTime: new Date().toISOString() })
                        }
                    }
                });

                // 3. Invoke the background Analyze Function
                // We'll use the AWS SDK to invoke it asynchronously (InvocationType: 'Event')
                const { LambdaClient, InvokeCommand } = await import("@aws-sdk/client-lambda");

                // Get function name from custom outputs
                const functionName = (outputs as any).custom?.analyzeReportFunctionName;
                if (!functionName) {
                    throw new Error("Analyze function name not found in configuration");
                }

                const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || "us-east-1" });

                console.log(`Triggering background function: ${functionName}`);
                await lambdaClient.send(new InvokeCommand({
                    FunctionName: functionName,
                    InvocationType: 'Event', // This makes it asynchronous
                    Payload: JSON.stringify({
                        reportId: id,
                        bucket: outputs.storage.bucket_name,
                        region: process.env.AWS_REGION || "us-east-1",
                        apiEndpoint: (outputs as any).data?.url // Fallback endpoint
                    })
                }));

                return NextResponse.json({
                    success: true,
                    message: "Analysis started in background"
                });

            } catch (error: any) {
                console.error("Error triggering AI analysis:", error);
                return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
            }
        },
    });
}
