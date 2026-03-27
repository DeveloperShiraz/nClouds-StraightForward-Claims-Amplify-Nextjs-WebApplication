import rawOutputs from "@/amplify_outputs.json";

type AmplifyOutputs = typeof rawOutputs;

function cloneOutputs(): AmplifyOutputs {
  return JSON.parse(JSON.stringify(rawOutputs)) as AmplifyOutputs;
}

function getEnvValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

export function getAmplifyRuntimeConfig(): AmplifyOutputs {
  const config = cloneOutputs();

  const region = getEnvValue(
    "NEXT_PUBLIC_AWS_REGION",
    "AWS_REGION",
    "AWS_DEFAULT_REGION",
  );
  const bucketName = getEnvValue(
    "NEXT_PUBLIC_S3_BUCKET_NAME",
    "S3_BUCKET_NAME",
    "AMPLIFY_STORAGE_BUCKET_NAME",
  );
  const dataUrl = getEnvValue(
    "NEXT_PUBLIC_AMPLIFY_DATA_URL",
    "AMPLIFY_DATA_URL",
  );
  const dataApiKey = getEnvValue(
    "NEXT_PUBLIC_AMPLIFY_DATA_API_KEY",
    "AMPLIFY_DATA_API_KEY",
  );
  const analyzeReportFunctionName = getEnvValue(
    "NEXT_PUBLIC_ANALYZE_REPORT_FUNCTION_NAME",
    "ANALYZE_REPORT_FUNCTION_NAME",
  );

  if (region) {
    if (config.auth) {
      config.auth.aws_region = region;
    }
    if (config.data) {
      config.data.aws_region = region;
    }
    if (config.storage) {
      config.storage.aws_region = region;
      config.storage.buckets?.forEach((bucket) => {
        bucket.aws_region = region;
      });
    }
  }

  if (bucketName && config.storage) {
    config.storage.bucket_name = bucketName;
    config.storage.buckets?.forEach((bucket) => {
      bucket.bucket_name = bucketName;
    });

    if (config.custom && typeof config.custom === "object") {
      (config.custom as Record<string, string>).storageBucketArn = `arn:aws:s3:::${bucketName}`;
    }
  }

  if (dataUrl && config.data) {
    config.data.url = dataUrl;
  }

  if (dataApiKey && config.data) {
    config.data.api_key = dataApiKey;
  }

  if (analyzeReportFunctionName && config.custom && typeof config.custom === "object") {
    (config.custom as Record<string, string>).analyzeReportFunctionName = analyzeReportFunctionName;
  }

  return config;
}

export function getIncidentStorageBucketName() {
  return (
    getEnvValue(
      "NEXT_PUBLIC_S3_BUCKET_NAME",
      "S3_BUCKET_NAME",
      "AMPLIFY_STORAGE_BUCKET_NAME",
    ) ||
    getAmplifyRuntimeConfig().storage?.bucket_name ||
    ""
  );
}

export function getAmplifyDataEndpoint() {
  return (
    getEnvValue(
      "NEXT_PUBLIC_AMPLIFY_DATA_URL",
      "AMPLIFY_DATA_URL",
    ) ||
    getAmplifyRuntimeConfig().data?.url ||
    ""
  );
}

export function getAmplifyDataApiKey() {
  return (
    getEnvValue(
      "NEXT_PUBLIC_AMPLIFY_DATA_API_KEY",
      "AMPLIFY_DATA_API_KEY",
    ) ||
    getAmplifyRuntimeConfig().data?.api_key ||
    ""
  );
}

export function getAnalyzeReportFunctionName() {
  return (
    getEnvValue(
      "NEXT_PUBLIC_ANALYZE_REPORT_FUNCTION_NAME",
      "ANALYZE_REPORT_FUNCTION_NAME",
    ) ||
    (getAmplifyRuntimeConfig().custom as Record<string, string> | undefined)?.analyzeReportFunctionName ||
    ""
  );
}
