import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { fetchAuthSession } from "aws-amplify/auth/server";
import { runWithAmplifyServerContext } from "@/lib/amplify-server-utils";
import outputs from "@/amplify_outputs.json";

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  return await runWithAmplifyServerContext({
    nextServerContext: { request, response },
    operation: async (contextSpec) => {
      try {
        console.log("=== PHOTO UPLOAD START (S3 + AMPLIFY CONTEXT) ===");

        // 1. Get credentials from Amplify Server Context
        const session = await fetchAuthSession(contextSpec);
        const credentials = session.credentials;

        if (!credentials) {
          console.error("❌ No credentials returned from fetchAuthSession");
          return NextResponse.json(
            { error: "Internal Server Error", details: "Failed to load authentication context" },
            { status: 500 }
          );
        }

        console.log("✅ Credentials obtained from session");

        // 2. Initialize S3 client with these credentials
        const bucket = outputs.storage.bucket_name;
        const region = outputs.storage.aws_region;

        const s3Client = new S3Client({
          region,
          credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken || "",
          },
        });

        // 3. Process form data
        const formData = await request.formData();
        const file = formData.get("file") as File;
        const path = formData.get("path") as string;

        if (!file || !path) {
          return NextResponse.json(
            { error: "File and path are required" },
            { status: 400 }
          );
        }

        console.log(`Uploading file: ${file.name} to bucket: ${bucket}, path: ${path}`);
        const bytes = await file.arrayBuffer();

        // 4. Upload to S3
        const command = new PutObjectCommand({
          Bucket: bucket,
          Key: path,
          Body: Buffer.from(bytes),
          ContentType: file.type,
        });

        await s3Client.send(command);
        console.log("✅ Successfully uploaded to S3");

        return NextResponse.json({
          success: true,
          path: path,
          url: `https://${bucket}.s3.${region}.amazonaws.com/${path}`,
        });
      } catch (error: any) {
        console.error("❌ Error uploading photo to S3:", error);
        return NextResponse.json(
          { error: "Failed to upload photo", details: error.message },
          { status: 500 }
        );
      } finally {
        console.log("=== PHOTO UPLOAD END ===");
      }
    },
  });
}
