import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const AI_LAMBDA_URL = "https://xkhwrtjkwriyfonzpjdhuvmdky0ufdxf.lambda-url.us-east-1.on.aws/";

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
            peril_match: { match: "unknown", reason: "" },
            all_local_paths: [] as string[]
        };

        const uniqueAssessments = new Set<string>();

        console.log(`Processing ${report.photoUrls.length} images...`);

        for (const [index, path] of report.photoUrls.entries()) {
            console.log(`Analyzing image ${index + 1}/${report.photoUrls.length}: ${path}`);

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
                    continue; // Skip failed image but continue others
                }

                const aiResult = await aiResponse.json();
                const resultData = aiResult.result || aiResult;

                if (resultData.error) {
                    console.error(`AI Analysis internal error for image ${path}: ${resultData.error}`);
                    continue;
                }

                // Aggregate Results
                if (resultData.detections) {
                    aggregatedData.detections.push(...resultData.detections);
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
            }
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

        let analysisData = aggregatedData;

        // 3. Copy Analyzed Images
        if (analysisData.detections && analysisData.detections.length > 0) {
            const uniqueOutputUris = new Set<string>();
            analysisData.detections.forEach((d: any) => {
                if (d.output_s3_uri) uniqueOutputUris.add(d.output_s3_uri);
            });

            console.log(`Copying ${uniqueOutputUris.size} unique analyzed images...`);
            const s3Client = new S3Client({ region });
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
        }

        // 4. Update Report with Results
        console.log("Saving results to report...");
        const updateQuery = `
            mutation UpdateIncidentReport($input: UpdateIncidentReportInput!) {
                updateIncidentReport(input: $input) {
                    id
                }
            }
        `;

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
