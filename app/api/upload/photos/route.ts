import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getS3ClientConfig, getAWSRegion } from "@/lib/aws-config";
import outputs from "@/amplify_outputs.json";

const BUCKET_NAME = outputs.storage.bucket_name;

export async function POST(request: NextRequest) {
  const s3Client = new S3Client(getS3ClientConfig());
  try {
    // Debug instrumentation for credentials
    console.log("=== S3 UPLOAD DEBUG START ===");
    console.log("Region:", getAWSRegion());
    console.log("Bucket:", BUCKET_NAME);
    console.log("Creds Source:", process.env.AWS_ACCESS_KEY_ID ? "Environment Vars Found" : "No Environment Vars");
    if (process.env.AWS_ACCESS_KEY_ID) {
      console.log("Access Key:", process.env.AWS_ACCESS_KEY_ID.substring(0, 5) + "...");
    }
    console.log("==============================");

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const path = formData.get("path") as string;

    if (!file || !path) {
      return NextResponse.json(
        { error: "File and path are required" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to S3
    console.log(`Uploading to bucket: ${BUCKET_NAME}, path: ${path}`);
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: path,
      Body: buffer,
      ContentType: file.type,
    });

    await s3Client.send(command);
    console.log(`Successfully uploaded: ${path}`);

    return NextResponse.json({
      success: true,
      path: path,
      url: `https://${BUCKET_NAME}.s3.${getAWSRegion()}.amazonaws.com/${path}`,
    });
  } catch (error: any) {
    console.error("Error uploading photo to S3:", error);
    return NextResponse.json(
      {
        error: "Failed to upload photo",
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
