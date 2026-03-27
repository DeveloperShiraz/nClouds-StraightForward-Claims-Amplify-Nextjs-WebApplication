import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const AI_LAMBDA_URL = "https://xkhwrtjkwriyfonzpjdhuvmdky0ufdxf.lambda-url.us-east-1.on.aws/";
const BEDROCK_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_AI_SOURCE_IMAGE_BYTES = Math.floor(BEDROCK_MAX_IMAGE_BYTES * 0.75);

function getErrorMessage(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

/**
 * Background worker to handle AI analysis without blocking the Next.js API route.
 * This function can run for up to 300 seconds.
 */
export const handler = async (event: { reportId: string, bucket?: string, region?: string, apiEndpoint?: string }) => {
    const { reportId } = event;
    const bucket = process.env.AMPLIFY_STORAGE_BUCKET_NAME || event.bucket;
    const region = process.env.AWS_REGION || event.region || "us-east-1";
    const apiEndpoint = process.env.AWS_APPSYNC_GRAPHQL_URL || event.apiEndpoint;
    const apiKey = process.env.AWS_APPSYNC_API_KEY;

    if (!apiEndpoint) throw new Error("AppSync endpoint not found in environment or event");
    if (!bucket) throw new Error("Storage bucket not found in environment or event");

    console.log(`Starting background AI analysis for report: ${reportId}`);

    try {
        // 1. Fetch report details
        console.log("Fetching report data...");
        const getReportQuery = `
            query GetIncidentReport($id: ID!) {
                getIncidentReport(id: $id) {
                    id
                    incidentDate
                    description
                    photoUrls
                    weatherReport
                    shingleExposure
                }
            }
        `;

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'x-api-key': apiKey } : {})
            },
            body: JSON.stringify({ query: getReportQuery, variables: { id: reportId } })
        });

        const reportData = await response.json();
        console.log(`📥 Fetched report data response:`, JSON.stringify(reportData));
        const report = reportData.data?.getIncidentReport;

        if (!report) {
            throw new Error(`Report ${reportId} not found`);
        }

        if (!report.photoUrls || report.photoUrls.length === 0) {
            console.log("No photos to analyze. Task complete.");
            return { success: true, message: "No photos to analyze" };
        }

        // 2. Process images sequentially
        const getMediaType = (path: string) => {
            const ext = path.split('.').pop()?.toLowerCase();
            if (ext === 'png') return 'image/png';
            if (ext === 'webp') return 'image/webp';
            if (ext === 'gif') return 'image/gif';
            return 'image/jpeg';
        };

        // Parse weather report if it exists
        let weatherReport = null;
        try {
            if (report.weatherReport) {
                weatherReport = typeof report.weatherReport === 'string'
                    ? JSON.parse(report.weatherReport)
                    : report.weatherReport;
            }
        } catch (e) {
            console.warn("Failed to parse weather report:", e);
        }

        const aggregatedData = {
            detections: [] as any[],
            evidence_bullets: [] as string[],
            fraud_signals: [] as string[],
            final_assessment: "",
            peril_match: { reported_peril: "", match: "unknown", reason: "" },
            all_local_paths: [] as string[],
            total_images_uploaded: report.photoUrls.length,
            total_images_attempted: 0,
            total_images_analyzed: 0,
            total_images_succeeded: 0,
            total_images_failed: 0,
            total_images_with_detections: 0,
            copied_image_count: 0,
            failed_images: [] as Array<{ path: string; stage: "preflight" | "analysis"; error: string }>,
            processed_images: [] as Array<{
                path: string;
                status: "detected" | "no_detections" | "failed";
                detection_count: number;
                stage?: "preflight" | "analysis";
                error?: string;
                output_s3_uris?: string[];
                local_output_paths?: string[];
            }>,
            copy_warnings: [] as Array<{ name: string; uri: string; error: string }>,
        };

        const uniqueAssessments = new Set<string>();
        const s3Client = new S3Client({ region });
        const updateQuery = `
            mutation UpdateIncidentReport($input: UpdateIncidentReportInput!) {
                updateIncidentReport(input: $input) {
                    id
                }
            }
        `;

        const publishProgress = async (overrides: Record<string, unknown> = {}) => {
            const progressPayload = {
                ...aggregatedData,
                status: "analyzing",
                progress: {
                    total_images: report.photoUrls.length,
                    completed_images: aggregatedData.processed_images.length,
                    current_image_index: Math.min(aggregatedData.processed_images.length + 1, report.photoUrls.length),
                    percent_complete: report.photoUrls.length > 0
                        ? Math.round((aggregatedData.processed_images.length / report.photoUrls.length) * 100)
                        : 100,
                },
                ...overrides,
            };

            try {
                await fetch(apiEndpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(apiKey ? { "x-api-key": apiKey } : {})
                    },
                    body: JSON.stringify({
                        query: updateQuery,
                        variables: {
                            input: {
                                id: reportId,
                                aiAnalysis: JSON.stringify(progressPayload),
                            }
                        }
                    })
                });
            } catch (error) {
                console.error("Failed to publish AI progress update:", error);
            }
        };

        const pushFailedImage = (path: string, stage: "preflight" | "analysis", error: string) => {
            aggregatedData.total_images_failed += 1;
            aggregatedData.failed_images.push({ path, stage, error });
            aggregatedData.processed_images.push({
                path,
                stage,
                status: "failed",
                error,
                detection_count: 0,
            });
        };

        console.log(`Processing ${report.photoUrls.length} images...`);
        await publishProgress({
            progress: {
                total_images: report.photoUrls.length,
                completed_images: 0,
                current_image_index: 1,
                current_image_path: report.photoUrls[0],
                current_image_name: report.photoUrls[0]?.split("/").pop() || report.photoUrls[0],
                percent_complete: 0,
            }
        });

        for (const [index, path] of report.photoUrls.entries()) {
            console.log(`Analyzing image ${index + 1}/${report.photoUrls.length}: ${path}`);
            aggregatedData.total_images_attempted += 1;

            try {
                const sourceObject = await s3Client.send(new HeadObjectCommand({
                    Bucket: bucket,
                    Key: path,
                }));
                const sourceSize = sourceObject.ContentLength || 0;

                if (sourceSize > MAX_AI_SOURCE_IMAGE_BYTES) {
                    const sizeError = `Source image is ${sourceSize} bytes, which exceeds the current AI-safe limit of ${MAX_AI_SOURCE_IMAGE_BYTES} bytes before base64 encoding.`;
                    console.error(`Skipping oversized image ${path}: ${sizeError}`);
                    pushFailedImage(path, "preflight", sizeError);
                    continue;
                }
            } catch (err) {
                const errorMessage = `Unable to inspect source image: ${getErrorMessage(err)}`;
                console.error(`Failed to inspect ${path}:`, err);
                pushFailedImage(path, "preflight", errorMessage);
                await publishProgress({
                    progress: {
                        total_images: report.photoUrls.length,
                        completed_images: aggregatedData.processed_images.length,
                        current_image_index: Math.min(index + 2, report.photoUrls.length),
                        current_image_path: report.photoUrls[index + 1],
                        current_image_name: report.photoUrls[index + 1]?.split("/").pop() || report.photoUrls[index + 1],
                        percent_complete: Math.round((aggregatedData.processed_images.length / report.photoUrls.length) * 100),
                    }
                });
                continue;
            }

            const imagePayload = {
                s3_uri: `s3://${bucket}/${path}`,
                format: getMediaType(path)
            };

            const payload = {
                images: [imagePayload], // Send one image at a time
                analysis_context: {
                    image_id: `${report.id}_${index}`, // Unique ID for this specific call
                    reported_peril: "",
                    weather_summary: weatherReport?.weather_description || `Analysis for incident on ${report.incidentDate}`,
                    notes: report.description
                },
                shingle_size_inches: report.shingleExposure || 5.0,
                weather_report: weatherReport ? {
                    reported_hail_size_inches: weatherReport.reported_hail_size_inches || 1.5,
                    weather_date: weatherReport.weather_date || report.incidentDate,
                    weather_description: weatherReport.weather_description || "Severe thunderstorm with hail reported in area"
                } : undefined
            };

            try {
                const aiResponse = await fetch(AI_LAMBDA_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!aiResponse.ok) {
                    const errorText = await aiResponse.text();
                    console.error(`AI Lambda failed for image ${path}: ${errorText}`);
                    pushFailedImage(path, "analysis", `AI service returned ${aiResponse.status}: ${errorText}`);
                    continue; // Skip failed image but continue others
                }

                const aiResult = await aiResponse.json();
                const resultData = aiResult.result || aiResult;

                if (resultData.error) {
                    console.error(`AI Analysis internal error for image ${path}: ${resultData.error}`);
                    pushFailedImage(path, "analysis", resultData.error);
                    continue;
                }

                const detections = Array.isArray(resultData.detections) ? resultData.detections : [];
                const outputS3UriSet = new Set<string>();
                detections.forEach((d: any) => {
                    if (typeof d.output_s3_uri === "string" && d.output_s3_uri.length > 0) {
                        outputS3UriSet.add(d.output_s3_uri);
                    }
                });
                const outputS3Uris = Array.from(outputS3UriSet);

                aggregatedData.total_images_analyzed += 1;
                aggregatedData.total_images_succeeded += 1;
                if (detections.length > 0) {
                    aggregatedData.total_images_with_detections += 1;
                }
                aggregatedData.processed_images.push({
                    path,
                    status: detections.length > 0 ? "detected" : "no_detections",
                    detection_count: detections.length,
                    output_s3_uris: outputS3Uris,
                });

                // Aggregate Results
                if (detections.length > 0) {
                    aggregatedData.detections.push(...detections);
                }
                if (resultData.evidence_bullets) {
                    aggregatedData.evidence_bullets.push(...resultData.evidence_bullets);
                }
                if (resultData.fraud_signals) {
                    aggregatedData.fraud_signals.push(...resultData.fraud_signals);
                }
                if (resultData.final_assessment) {
                    uniqueAssessments.add(resultData.final_assessment);
                }
                // Keep the last/best peril match (simplification)
                if (resultData.peril_match && resultData.peril_match.match !== 'unknown') {
                    aggregatedData.peril_match = resultData.peril_match;
                }

            } catch (err) {
                console.error(`Exception processing image ${path}:`, err);
                pushFailedImage(path, "analysis", getErrorMessage(err));
            }

            await publishProgress({
                progress: {
                    total_images: report.photoUrls.length,
                    completed_images: aggregatedData.processed_images.length,
                    current_image_index: Math.min(index + 2, report.photoUrls.length),
                    current_image_path: report.photoUrls[index + 1],
                    current_image_name: report.photoUrls[index + 1]?.split("/").pop() || report.photoUrls[index + 1],
                    percent_complete: Math.round((aggregatedData.processed_images.length / report.photoUrls.length) * 100),
                }
            });
        }

        // Finalize aggregated data
        if (uniqueAssessments.size > 0) {
            aggregatedData.final_assessment = Array.from(uniqueAssessments).join("; ");
        } else {
            aggregatedData.final_assessment = "Assessment Incomplete";
        }

        // Remove duplicates from bullets/signals
        aggregatedData.evidence_bullets = Array.from(new Set(aggregatedData.evidence_bullets));
        aggregatedData.fraud_signals = Array.from(new Set(aggregatedData.fraud_signals));
        (aggregatedData as any).status = aggregatedData.total_images_failed > 0 ? "completed_with_warnings" : "completed";
        (aggregatedData as any).completedAt = new Date().toISOString();
        (aggregatedData as any).progress = {
            total_images: report.photoUrls.length,
            completed_images: aggregatedData.processed_images.length,
            current_image_index: report.photoUrls.length,
            current_image_path: undefined,
            current_image_name: undefined,
            percent_complete: 100,
        };

        let analysisData = aggregatedData;

        // 3. Copy Analyzed Images
        if (analysisData.detections && analysisData.detections.length > 0) {
            const uniqueOutputUris = new Set<string>();
            analysisData.detections.forEach((d: any) => {
                if (d.output_s3_uri) uniqueOutputUris.add(d.output_s3_uri);
            });

            console.log(`Copying ${uniqueOutputUris.size} unique analyzed images...`);
            const uriToLocalKeyMap = new Map<string, string>();

            for (const outputS3Uri of Array.from(uniqueOutputUris)) {
                const uriParts = outputS3Uri.replace("s3://", "").split("/");
                const sourceBucket = uriParts.shift();
                const sourceKey = uriParts.join("/");

                if (sourceBucket && sourceKey) {
                    try {
                        const sourceObj = await s3Client.send(new GetObjectCommand({
                            Bucket: sourceBucket,
                            Key: sourceKey
                        }));

                        const uniqueSuffix = Math.random().toString(36).substring(7);
                        const targetKey = `incident-photos/${report.id}/analyzed-${Date.now()}-${uniqueSuffix}.jpeg`;

                        const upload = new Upload({
                            client: s3Client,
                            params: {
                                Bucket: bucket,
                                Key: targetKey,
                                Body: sourceObj.Body,
                                ContentType: "image/jpeg"
                            }
                        });

                        await upload.done();
                        uriToLocalKeyMap.set(outputS3Uri, targetKey);
                    } catch (e) {
                        const errorMessage = getErrorMessage(e);
                        analysisData.copy_warnings.push({
                            name: sourceKey.split("/").pop() || outputS3Uri,
                            uri: outputS3Uri,
                            error: errorMessage,
                        });
                        console.error(`Failed to copy ${outputS3Uri}:`, e);
                    }
                }
            }

            // Update detections with local paths
            analysisData.detections = analysisData.detections.map((d: any) => ({
                ...d,
                local_output_path: d.output_s3_uri ? uriToLocalKeyMap.get(d.output_s3_uri) : undefined
            }));
            analysisData.all_local_paths = Array.from(uriToLocalKeyMap.values());
            analysisData.copied_image_count = analysisData.all_local_paths.length;
            analysisData.processed_images = analysisData.processed_images.map((image) => {
                if (!image.output_s3_uris || image.output_s3_uris.length === 0) {
                    return image;
                }

                const localOutputPaths = image.output_s3_uris
                    .map((uri) => uriToLocalKeyMap.get(uri))
                    .filter(Boolean) as string[];

                return {
                    ...image,
                    local_output_paths: localOutputPaths,
                };
            });
        }

        // 4. Update Report with Results
        console.log("Saving results to report...");
        const updateResponse = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'x-api-key': apiKey } : {})
            },
            body: JSON.stringify({
                query: updateQuery,
                variables: {
                    input: {
                        id: reportId,
                        aiAnalysis: JSON.stringify(analysisData),
                        status: 'submitted' // Reset status to stop polling
                    }
                }
            })
        });

        if (!updateResponse.ok) {
            const err = await updateResponse.text();
            console.error(`❌ Failed to update report:`, err);
            throw new Error(`Failed to update report: ${err}`);
        }

        const updateData = await updateResponse.json();
        console.log(`✅ Update response data:`, JSON.stringify(updateData));

        console.log("✅ Background AI Analysis complete!");
        return { success: true };

    } catch (error: any) {
        console.error("❌ Background analysis failed:", error);

        // Attempt to mark as failed in the DB
        try {
            const failQuery = `
                mutation UpdateIncidentReport($input: UpdateIncidentReportInput!) {
                    updateIncidentReport(input: $input) { id }
                }
            `;
            await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey ? { 'x-api-key': apiKey } : {})
                },
                body: JSON.stringify({
                    query: failQuery,
                    variables: {
                        input: {
                            id: reportId,
                            aiAnalysis: JSON.stringify({ status: "failed", error: error.message }),
                            status: 'submitted' // Reset status to stop polling
                        }
                    }
                })
            });
        } catch (dbErr) {
            console.error("Failed to even log the failure:", dbErr);
        }

        throw error;
    }
};
