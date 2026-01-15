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

                // 1. Fetch the report to get photo paths
                const { data: report, errors: fetchErrors } = await client.models.IncidentReport.get(contextSpec, { id });

                if (fetchErrors) {
                    console.error("Errors fetching report for AI analysis:", fetchErrors);
                    return NextResponse.json({ error: "Failed to fetch report", details: fetchErrors }, { status: 500 });
                }

                if (!report) {
                    return NextResponse.json({ error: "Report not found" }, { status: 404 });
                }

                if (!report.photoUrls || report.photoUrls.length === 0) {
                    return NextResponse.json({ error: "No photos to analyze" }, { status: 400 });
                }

                // 2. Prepare payload for AI Lambda
                const bucket = outputs.storage.bucket_name;

                // Helper to map extension to Bedrock-supported media types
                const getMediaType = (path: string) => {
                    const ext = path.split('.').pop()?.toLowerCase();
                    if (ext === 'png') return 'image/png';
                    if (ext === 'webp') return 'image/webp';
                    if (ext === 'gif') return 'image/gif';
                    return 'image/jpeg'; // Default for jpg, jpeg, or others
                };

                // The Lambda expects s3://bucket/key
                const images = report.photoUrls
                    .filter((path): path is string => !!path)
                    .map(path => ({
                        s3_uri: `s3://${bucket}/${path}`,
                        format: getMediaType(path)
                    }));

                const payload = {
                    images,
                    analysis_context: {
                        image_id: report.id,
                        reported_peril: "hail", // This could be dynamic based on report content
                        weather_summary: `Analysis for incident on ${report.incidentDate}`,
                        notes: report.description
                    }
                };

                console.log("🔍 Sending payload to AI Lambda...");

                // 3. Call the AI Lambda
                const aiResponse = await fetch(AI_LAMBDA_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    // Add a timeout if needed, though fetch timeout is tricky in Node.js
                    // signal: AbortSignal.timeout(60000) // 60 seconds
                });

                if (!aiResponse.ok) {
                    const errorText = await aiResponse.text();
                    console.error("❌ AI Lambda returned error:", aiResponse.status, errorText);
                    return NextResponse.json({
                        error: "AI Analysis function failed",
                        statusCode: aiResponse.status,
                        details: errorText
                    }, { status: aiResponse.status });
                }

                const aiResult = await aiResponse.json();
                console.log("✅ AI Analysis result received.");

                // Check for errors returned in the result body (Lambda might return 200 OK even on Bedrock errors)
                const resultData = aiResult.result || aiResult;
                if (resultData.error) {
                    console.error("❌ AI Analysis failed with internal error:", resultData.error);
                    return NextResponse.json({
                        error: "AI Analysis failed",
                        details: resultData.error,
                        type: resultData.error_type
                    }, { status: 502 }); // 502 Bad Gateway is appropriate if the upstream (Bedrock) failed
                }

                // 4. Save result back to report
                // Based on provided JSON, the actual data is inside result.result or just aiResult.result
                let analysisData = resultData;

                // 4.1 Copy the analyzed image to our bucket if it exists
                // 4.1 Copy ALL unique analyzed images to our bucket
                if (analysisData.detections && analysisData.detections.length > 0) {
                    try {
                        // 1. Identify unique output URIs
                        const uniqueOutputUris = new Set<string>();
                        analysisData.detections.forEach((d: any) => {
                            if (d.output_s3_uri) uniqueOutputUris.add(d.output_s3_uri);
                        });

                        console.log(`Found ${uniqueOutputUris.size} unique analyzed images to copy.`);

                        // 2. Copy each unique image and map URI -> Local Key
                        const uriToLocalKeyMap = new Map<string, string>();
                        import { fetchAuthSession } from "aws-amplify/auth/server";

                        // ... inside the function ...

                        // 2. Copy each unique image and map URI -> Local Key
                        const uriToLocalKeyMap = new Map<string, string>();

                        // FIX: Retrieve credentials from the Amplify Context (which works in Hosting)
                        // instead of relying on environment variables which seem stripped or custom.
                        const session = await fetchAuthSession(contextSpec);
                        const credentials = session.credentials;

                        if (!credentials) {
                            throw new Error("Failed to retrieve credentials from Amplify Server Context");
                        }

                        console.log("✅ Successfully retrieved temporary credentials for S3 Copy");

                        const s3Client = new S3Client({
                            region: process.env.AWS_REGION || "us-east-1",
                            credentials: credentials
                        });

                        const copyErrors: any[] = [];
                        for (const outputS3Uri of Array.from(uniqueOutputUris)) {
                            // ... (parsing logic)
                            const uriParts = outputS3Uri.replace("s3://", "").split("/");
                            const sourceBucket = uriParts.shift();
                            const sourceKey = uriParts.join("/");

                            if (sourceBucket && sourceKey) {
                                try {
                                    console.log("Copying analyzed image from:", outputS3Uri);

                                    // Get the object from the external bucket
                                    const getCommand = new GetObjectCommand({
                                        Bucket: sourceBucket,
                                        Key: sourceKey
                                    });
                                    const sourceObj = await s3Client.send(getCommand);

                                    // Upload to our storage bucket
                                    const uniqueSuffix = Math.random().toString(36).substring(7);
                                    const targetKey = `incident-photos/${report.id}/analyzed-${Date.now()}-${uniqueSuffix}.jpeg`;

                                    const upload = new Upload({
                                        client: s3Client,
                                        params: {
                                            Bucket: outputs.storage.bucket_name,
                                            Key: targetKey,
                                            Body: sourceObj.Body,
                                            ContentType: "image/jpeg"
                                        }
                                    });

                                    await upload.done();
                                    console.log("✅ Analyzed image copied to:", targetKey);
                                    uriToLocalKeyMap.set(outputS3Uri, targetKey);
                                } catch (innerCopyError: any) {
                                    console.error(`❌ Failed to copy image ${outputS3Uri}:`, innerCopyError);
                                    let errorMsg = innerCopyError.message;
                                    if (innerCopyError.name === 'CredentialsProviderError') {
                                        errorMsg += " (This usually happens when running locally without AWS credentials. Please test on the deployed site.)";
                                    }
                                    copyErrors.push({ uri: outputS3Uri, error: errorMsg, name: innerCopyError.name });
                                }
                            }
                        }

                        // ... (update detections logic uses uriToLocalKeyMap)

                        // Attach copy errors to analysis data for visibility if needed, or just log
                        if (copyErrors.length > 0) {
                            (analysisData as any).copy_warnings = copyErrors;
                        }

                        // 3. Update detections with the correct local path (unchanged)
                        analysisData.detections = analysisData.detections.map((d: any) => ({
                            ...d,
                            local_output_path: d.output_s3_uri ? uriToLocalKeyMap.get(d.output_s3_uri) : undefined
                        }));

                        // Also add a top-level summary of paths
                        (analysisData as any).all_local_paths = Array.from(uriToLocalKeyMap.values());

                    } catch (copyError) { // Outermost catch for the block
                        // ...
                    }
                }

                // 4.2 Save result using raw GraphQL to bypass client schema validation issues
                console.log("Updating report with AI analysis via GraphQL...");
                const updateQuery = `
                    mutation UpdateIncidentReport($input: UpdateIncidentReportInput!) {
                        updateIncidentReport(input: $input) {
                            id
                            updatedAt
                        }
                    }
                `;

                const response = await client.graphql(contextSpec, {
                    query: updateQuery,
                    variables: {
                        input: {
                            id: report.id,
                            aiAnalysis: JSON.stringify(analysisData)
                        }
                    }
                }) as any;

                // Check for GraphQL errors
                if (response.errors) {
                    console.error("❌ GraphQL errors saving AI analysis:", response.errors);
                    return NextResponse.json({ error: "Failed to save AI analysis via GraphQL", details: response.errors }, { status: 500 });
                }

                const updatedReport = response.data.updateIncidentReport;

                return NextResponse.json({
                    success: true,
                    analysis: analysisData
                });

            } catch (error: any) {
                console.error("Error in AI analysis route:", error);
                return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
            }
        },
    });
}
