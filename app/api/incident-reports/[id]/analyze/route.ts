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
                console.log(`🔍 Starting AI analysis for report: ${id}`);
                const client = createApiClient(contextSpec);

                // 1. Fetch the report to check if it exists and has photos
                console.log(`📥 Fetching report data...`);
                const { data: report, errors: fetchErrors } = await client.models.IncidentReport.get(contextSpec, { id });

                if (fetchErrors || !report) {
                    console.error("❌ Report not found:", fetchErrors);
                    return NextResponse.json({ error: "Report not found" }, { status: 404 });
                }

                if (!report.photoUrls || report.photoUrls.length === 0) {
                    console.error("❌ No photos to analyze");
                    return NextResponse.json({ error: "No photos to analyze" }, { status: 400 });
                }
                console.log(`✅ Report found with ${report.photoUrls.length} photos`);


                // 2. Clear previous analysis and set status to 'analyzing'
                console.log(`Setting status to 'analyzing' for report: ${id}`);
                const updateQuery = `
                    mutation UpdateIncidentReport($input: UpdateIncidentReportInput!) {
                        updateIncidentReport(input: $input) { id }
                    }
                `;

                const updateResult = await client.graphql(contextSpec, {
                    query: updateQuery,
                    variables: {
                        input: {
                            id,
                            aiAnalysis: JSON.stringify({ status: "analyzing", startTime: new Date().toISOString() })
                        }
                    }
                });
                console.log(`✅ Status updated to 'analyzing'`);


                // 3. Invoke the background Analyze Function
                // We'll use the AWS SDK to invoke it asynchronously (InvocationType: 'Event')
                const { LambdaClient, InvokeCommand } = await import("@aws-sdk/client-lambda");

                // Get function name from custom outputs
                console.log(`🔧 Looking for function name in outputs...`);
                const functionName = (outputs as any).custom?.analyzeReportFunctionName;
                if (!functionName) {
                    console.error("❌ Function name not found in outputs:", outputs);
                    throw new Error("Analyze function name not found in configuration. Please redeploy the backend.");
                }
                console.log(`✅ Found function: ${functionName}`);



                const region = process.env.AWS_REGION || "us-east-1";
                console.log(`🌍 Using region: ${region}`);

                // Get AWS credentials from the Amplify session
                console.log(`🔑 Fetching AWS credentials from session...`);
                const session = await fetchAuthSession(contextSpec);

                if (!session.credentials) {
                    console.error("❌ No credentials found in session");
                    throw new Error("Unable to obtain AWS credentials from session");
                }

                console.log(`✅ Credentials obtained successfully`);

                const lambdaClient = new LambdaClient({
                    region,
                    credentials: {
                        accessKeyId: session.credentials.accessKeyId,
                        secretAccessKey: session.credentials.secretAccessKey,
                        sessionToken: session.credentials.sessionToken,
                    }
                });

                const payload = {
                    reportId: id,
                    bucket: outputs.storage.bucket_name,
                    region,
                    apiEndpoint: (outputs as any).data?.url
                };
                console.log(`📤 Invoking Lambda with payload:`, payload);

                await lambdaClient.send(new InvokeCommand({
                    FunctionName: functionName,
                    InvocationType: 'Event', // This makes it asynchronous
                    Payload: JSON.stringify(payload)
                }));
                console.log(`✅ Lambda invoked successfully`);


                return NextResponse.json({
                    success: true,
                    message: "Analysis started in background"
                });

            } catch (error: any) {
                console.error("❌ Error triggering AI analysis:", error);
                console.error("Error stack:", error.stack);
                console.error("Error details:", {
                    message: error.message,
                    name: error.name,
                    code: error.code,
                    statusCode: error.$metadata?.httpStatusCode
                });

                // Provide more specific error messages based on error type
                let errorMessage = "Failed to start AI analysis";
                let statusCode = 500;

                if (error.name === 'AccessDeniedException' || error.code === 'AccessDeniedException') {
                    errorMessage = "Permission denied: Unable to invoke analysis function";
                    statusCode = 403;
                } else if (error.name === 'ResourceNotFoundException' || error.code === 'ResourceNotFoundException') {
                    errorMessage = "Analysis function not found. Please check deployment configuration.";
                    statusCode = 404;
                } else if (error.message?.includes('credentials')) {
                    errorMessage = "Authentication error: Unable to obtain AWS credentials";
                    statusCode = 401;
                } else if (error.message) {
                    errorMessage = error.message;
                }

                return NextResponse.json({
                    error: errorMessage,
                    details: process.env.NODE_ENV === 'development' ? {
                        message: error.message,
                        code: error.code,
                        name: error.name
                    } : undefined
                }, { status: statusCode });
            }
        },
    });
}
