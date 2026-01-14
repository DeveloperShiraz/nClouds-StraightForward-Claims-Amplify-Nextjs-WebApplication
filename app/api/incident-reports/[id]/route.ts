import { NextRequest, NextResponse } from "next/server";
import { runWithAmplifyServerContext, createApiClient } from "@/lib/amplify-server-utils";

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

        const client = createApiClient(contextSpec);
        const { data: report, errors } = await client.models.IncidentReport.get(contextSpec, { id });

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
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const response = NextResponse.next();
  return await runWithAmplifyServerContext({
    nextServerContext: { request, response },
    operation: async (contextSpec) => {
      try {
        const { id } = await params;
        const body = await request.json();

        if (Object.keys(body).filter(key => key !== "id").length === 0) {
          return NextResponse.json(
            { error: "No fields to update" },
            { status: 400 }
          );
        }

        const client = createApiClient(contextSpec);

        // Remove id from body if present
        const { id: _, ...updateData } = body;

        const { data: report, errors } = await client.models.IncidentReport.update(contextSpec, {
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
    },
  });
}

import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Initialize S3 Client. Note: The bucket 'roof-inspection-poc-output' is likely in us-east-2 or us-east-1.
// We should preferably use the region from the environment or a safe default.
const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

export async function DELETE(
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

        // 1. Fetch the report first to get AI analysis data
        const { data: reportToDelete, errors: fetchErrors } = await client.models.IncidentReport.get(contextSpec, { id });

        if (fetchErrors || !reportToDelete) {
          console.error("Error fetching report for deletion:", fetchErrors);
          // Proceed to delete user record anyway if not found? 
          // If report is not found, we can't delete associated files, but technically redundant.
          // We'll proceed to try deleting the DB record just in case.
        }

        // 2. Cascading Deletion for AI S3 Images
        if (reportToDelete?.aiAnalysis) {
          try {
            const aiData = JSON.parse(reportToDelete.aiAnalysis);
            const aiPathsToDelete = new Set<string>();
            const bucketName = "roof-inspection-poc-output"; // Hardcoded specific bucket

            // Legacy single path
            if (aiData.local_output_path) aiPathsToDelete.add(aiData.local_output_path);

            // Summary list
            if (Array.isArray(aiData.all_local_paths)) {
              aiData.all_local_paths.forEach((p: string) => aiPathsToDelete.add(p));
            }

            // Detections
            if (Array.isArray(aiData.detections)) {
              aiData.detections.forEach((d: any) => {
                if (d.local_output_path) aiPathsToDelete.add(d.local_output_path);
              });
            }
            if (aiPathsToDelete.size > 0) {
              console.log(`Backend: Deleting ${aiPathsToDelete.size} AI images from bucket '${bucketName}'...`);

              const deletePromises = Array.from(aiPathsToDelete).map(async (pathKey) => {
                // Clean up key if it's a full URL or s3:// URI
                // The storage logic usually saves relative paths like "incident-photos/..."
                // But just in case, let's strip prefixes if found.
                let key = pathKey;
                if (key.startsWith("s3://")) key = key.replace("s3://" + bucketName + "/", "");
                if (key.startsWith("http")) {
                  try {
                    const url = new URL(key);
                    key = url.pathname.substring(1); // Remove leading slash
                  } catch (e) {
                    // fallback
                  }
                }

                try {
                  const params = {
                    Bucket: bucketName,
                    Key: key
                  };
                  const command = new DeleteObjectCommand(params);
                  await s3Client.send(command);
                } catch (s3Err: any) {
                  console.error(`Failed to delete S3 Object ${key}:`, s3Err);
                }
              });

              await Promise.all(deletePromises);
              console.log("✅ AI analyzed images deleted successfully.");
            }
          } catch (parseErr) {
            console.error("Backend: Error parsing AI analysis for S3 deletion:", parseErr);
          }
        }

        // 3. Delete from DynamoDB
        const { errors } = await client.models.IncidentReport.delete(contextSpec, { id }, { selectionSet: ['id'] });

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
    },
  });
}
