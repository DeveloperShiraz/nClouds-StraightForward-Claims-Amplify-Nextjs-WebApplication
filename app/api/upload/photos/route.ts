import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getS3ClientConfig, getAWSRegion } from "@/lib/aws-config";
import outputs from "@/amplify_outputs.json";

const BUCKET_NAME = outputs.storage.bucket_name;

const s3Client = new S3Client(getS3ClientConfig());

export async function POST(request: NextRequest) {
  try {
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
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: path,
      Body: buffer,
      ContentType: file.type,
    });

    await s3Client.send(command);

    return NextResponse.json({
      success: true,
      path: path,
      url: `https://${BUCKET_NAME}.s3.${getAWSRegion()}.amazonaws.com/${path}`,
    });
  } catch (error: any) {
    console.error("Error uploading photo to S3:", error);
    return NextResponse.json(
      { error: "Failed to upload photo", details: error.message },
      { status: 500 }
    );
  }
}
