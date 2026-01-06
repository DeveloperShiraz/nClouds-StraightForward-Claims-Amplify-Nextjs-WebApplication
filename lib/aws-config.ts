/**
 * AWS Configuration Helper
 *
 * This module provides AWS configuration that works in both local development
 * and production (Amplify) environments.
 *
 * In production, Amplify automatically provides AWS credentials via IAM roles.
 * In local development, credentials are read from environment variables.
 */

export const getAWSRegion = () => {
  return process.env.NEXT_PUBLIC_AWS_REGION || process.env.AWS_REGION || "us-east-1";
};

export const getUserPoolId = () => {
  return process.env.AMPLIFY_AUTH_USERPOOL_ID || "";
};

export const getAWSCredentials = () => {
  // In production (Amplify), credentials are provided automatically via IAM roles
  // Only use explicit credentials for local development
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }
  // Return undefined to use default credential provider chain (IAM roles in production)
  return undefined;
};

export const getCognitoClientConfig = () => {
  return {
    region: getAWSRegion(),
    credentials: getAWSCredentials(),
  };
};

export const getDynamoDBClientConfig = () => {
  return {
    region: getAWSRegion(),
    credentials: getAWSCredentials(),
  };
};

export const getS3ClientConfig = () => {
  return {
    region: getAWSRegion(),
    credentials: getAWSCredentials(),
  };
};

/**
 * Get DynamoDB table name for Companies
 */
export const getCompanyTableName = () => {
  return process.env.DYNAMODB_COMPANY_TABLE || "";
};

/**
 * Get DynamoDB table name for Incident Reports
 */
export const getIncidentReportTableName = () => {
  return process.env.DYNAMODB_INCIDENT_REPORT_TABLE || "";
};

/**
 * Get S3 bucket name for photo uploads
 */
export const getS3BucketName = () => {
  return process.env.S3_BUCKET_NAME || "";
};
