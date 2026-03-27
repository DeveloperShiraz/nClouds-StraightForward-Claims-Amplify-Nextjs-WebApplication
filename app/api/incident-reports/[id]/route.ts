import { NextRequest, NextResponse } from "next/server";
import {
  DeleteObjectsCommand,
  GetBucketVersioningCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { runWithAmplifyServerContext, createApiClient } from "@/lib/amplify-server-utils";
import { getIncidentStorageBucketName } from "@/lib/amplify-runtime-config";

type AIAnalysisPayload = {
  local_output_path?: string;
  all_local_paths?: string[];
  detections?: Array<{
    local_output_path?: string;
    output_s3_uri?: string;
  }>;
  processed_images?: Array<{
    local_output_paths?: string[];
    output_s3_uris?: string[];
  }>;
};

function parseAIAnalysis(aiAnalysis: unknown): AIAnalysisPayload | null {
  if (!aiAnalysis) {
    return null;
  }

  try {
    return typeof aiAnalysis === "string"
      ? JSON.parse(aiAnalysis)
      : (aiAnalysis as AIAnalysisPayload);
  } catch (error) {
    console.error("Failed to parse AI analysis payload for deletion:", error);
    return null;
  }
}

function normalizeKey(value: string, bucketName?: string) {
  if (!value) {
    return null;
  }

  if (value.startsWith("s3://")) {
    const parsed = parseS3Uri(value);
    return parsed?.key || null;
  }

  if (value.startsWith("http")) {
    try {
      const url = new URL(value);
      let key = url.pathname.replace(/^\/+/, "");
      if (bucketName && key.startsWith(`${bucketName}/`)) {
        key = key.slice(bucketName.length + 1);
      }
      return key || null;
    } catch (error) {
      console.error("Failed to normalize URL key:", value, error);
      return null;
    }
  }

  return value.replace(/^\/+/, "") || null;
}

function parseS3Uri(uri: string) {
  if (!uri.startsWith("s3://")) {
    return null;
  }

  const withoutScheme = uri.slice("s3://".length);
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex === -1) {
    return null;
  }

  return {
    bucket: withoutScheme.slice(0, slashIndex),
    key: withoutScheme.slice(slashIndex + 1),
  };
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

async function listKeysForPrefix(s3Client: S3Client, bucket: string, prefix: string) {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));

    response.Contents?.forEach((item) => {
      if (item.Key) {
        keys.push(item.Key);
      }
    });

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function deleteCurrentObjects(s3Client: S3Client, bucket: string, keys: string[]) {
  for (const chunk of chunkArray(keys, 1000)) {
    const response = await s3Client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: chunk.map((key) => ({ Key: key })),
        Quiet: false,
      },
    }));

    if (response.Errors && response.Errors.length > 0) {
      throw new Error(
        `Failed to delete ${response.Errors.length} object(s) from ${bucket}: ${response.Errors
          .map((error) => `${error.Key || "unknown"} (${error.Code || "UnknownCode"})`)
          .join(", ")}`
      );
    }
  }
}

async function deleteAllObjectVersions(s3Client: S3Client, bucket: string, keys: string[]) {
  for (const key of keys) {
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    const objectsToDelete: Array<{ Key: string; VersionId?: string }> = [];

    do {
      const response = await s3Client.send(new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: key,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }));

      response.Versions?.forEach((version) => {
        if (version.Key === key) {
          objectsToDelete.push({
            Key: version.Key,
            VersionId: version.VersionId,
          });
        }
      });

      response.DeleteMarkers?.forEach((marker) => {
        if (marker.Key === key) {
          objectsToDelete.push({
            Key: marker.Key,
            VersionId: marker.VersionId,
          });
        }
      });

      keyMarker = response.IsTruncated ? response.NextKeyMarker : undefined;
      versionIdMarker = response.IsTruncated ? response.NextVersionIdMarker : undefined;
    } while (keyMarker);

    if (objectsToDelete.length === 0) {
      objectsToDelete.push({ Key: key });
    }

    for (const chunk of chunkArray(objectsToDelete, 1000)) {
      const response = await s3Client.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: chunk,
          Quiet: false,
        },
      }));

      if (response.Errors && response.Errors.length > 0) {
        throw new Error(
          `Failed to purge versioned object(s) from ${bucket}: ${response.Errors
            .map((error) => `${error.Key || "unknown"} (${error.Code || "UnknownCode"})`)
            .join(", ")}`
        );
      }
    }
  }
}

async function deleteBucketObjects(s3Client: S3Client, bucket: string, keys: string[]) {
  if (keys.length === 0) {
    return;
  }

  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  const versioning = await s3Client.send(new GetBucketVersioningCommand({ Bucket: bucket }));
  const versioningEnabled = versioning.Status === "Enabled" || versioning.Status === "Suspended";

  if (versioningEnabled) {
    await deleteAllObjectVersions(s3Client, bucket, uniqueKeys);
    return;
  }

  await deleteCurrentObjects(s3Client, bucket, uniqueKeys);
}

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

        if (Object.keys(body).filter((key) => key !== "id").length === 0) {
          return NextResponse.json(
            { error: "No fields to update" },
            { status: 400 }
          );
        }

        const client = createApiClient(contextSpec);
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
        const incidentBucket = getIncidentStorageBucketName();

        if (!incidentBucket) {
          return NextResponse.json(
            { error: "Incident storage bucket is not configured" },
            { status: 500 }
          );
        }

        const { data: reportToDelete, errors: fetchErrors } = await client.models.IncidentReport.get(contextSpec, { id });

        if (fetchErrors) {
          console.error("Error fetching report for deletion:", fetchErrors);
          return NextResponse.json(
            { error: "Failed to load incident report before deletion", details: fetchErrors },
            { status: 500 }
          );
        }

        if (!reportToDelete) {
          return NextResponse.json({ error: "Incident report not found" }, { status: 404 });
        }

        const aiData = parseAIAnalysis(reportToDelete.aiAnalysis);
        const incidentBucketKeys = new Set<string>();
        const externalBucketTargets = new Map<string, Set<string>>();
        const reportScopedPrefix = `incident-photos/${id}/`;

        reportToDelete.photoUrls?.forEach((photoPath) => {
          if (typeof photoPath !== "string") {
            return;
          }
          const normalized = normalizeKey(photoPath, incidentBucket);
          if (normalized) {
            incidentBucketKeys.add(normalized);
          }
        });

        if (aiData?.local_output_path) {
          const normalized = normalizeKey(aiData.local_output_path, incidentBucket);
          if (normalized) {
            incidentBucketKeys.add(normalized);
          }
        }

        aiData?.all_local_paths?.forEach((path) => {
          if (typeof path !== "string") {
            return;
          }
          const normalized = normalizeKey(path, incidentBucket);
          if (normalized) {
            incidentBucketKeys.add(normalized);
          }
        });

        aiData?.detections?.forEach((detection) => {
          const localPath = normalizeKey(detection.local_output_path || "", incidentBucket);
          if (localPath) {
            incidentBucketKeys.add(localPath);
          }

          if (detection.output_s3_uri) {
            const parsed = parseS3Uri(detection.output_s3_uri);
            if (parsed?.bucket && parsed.key) {
              if (!externalBucketTargets.has(parsed.bucket)) {
                externalBucketTargets.set(parsed.bucket, new Set<string>());
              }
              externalBucketTargets.get(parsed.bucket)?.add(parsed.key);
            }
          }
        });

        aiData?.processed_images?.forEach((image) => {
          image.local_output_paths?.forEach((path) => {
            if (typeof path !== "string") {
              return;
            }
            const normalized = normalizeKey(path, incidentBucket);
            if (normalized) {
              incidentBucketKeys.add(normalized);
            }
          });

          image.output_s3_uris?.forEach((uri) => {
            if (typeof uri !== "string") {
              return;
            }
            const parsed = parseS3Uri(uri);
            if (parsed?.bucket && parsed.key) {
              if (!externalBucketTargets.has(parsed.bucket)) {
                externalBucketTargets.set(parsed.bucket, new Set<string>());
              }
              externalBucketTargets.get(parsed.bucket)?.add(parsed.key);
            }
          });
        });

        const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
        const prefixKeys = await listKeysForPrefix(s3Client, incidentBucket, reportScopedPrefix);
        prefixKeys.forEach((key) => incidentBucketKeys.add(key));

        await deleteBucketObjects(s3Client, incidentBucket, Array.from(incidentBucketKeys));

        for (const [bucket, keys] of externalBucketTargets.entries()) {
          await deleteBucketObjects(s3Client, bucket, Array.from(keys));
        }

        const { errors } = await client.models.IncidentReport.delete(contextSpec, { id }, { selectionSet: ["id"] });

        if (errors) {
          console.error("Errors deleting incident report:", errors);
          return NextResponse.json(
            { error: "Failed to delete incident report", details: errors },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message: "Incident report and associated files deleted successfully",
          deleted: {
            incidentBucket,
            incidentObjectCount: incidentBucketKeys.size,
            externalBucketCount: externalBucketTargets.size,
          },
        });
      } catch (error: any) {
        console.error("Error deleting incident report:", error);
        return NextResponse.json(
          { error: "Failed to fully delete incident report", details: error.message },
          { status: 500 }
        );
      }
    },
  });
}
