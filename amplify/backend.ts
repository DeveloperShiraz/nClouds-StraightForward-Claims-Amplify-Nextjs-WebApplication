import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource.js";
import { data } from "./data/resource.js";
import { storage } from "./storage/resource.js";
import { adminActions } from "./functions/admin-actions/resource.js";
import { analyzeReport } from "./functions/analyze-report/resource.js";

const backend = defineBackend({
  auth,
  data,
  storage,
  adminActions,
  analyzeReport,
});

const { cfnUserPool } = backend.auth.resources.cfnResources;

// Pass the User Pool ID to the admin actions function
(backend.adminActions.resources.lambda as any).addEnvironment(
  "AMPLIFY_AUTH_USERPOOL_ID",
  cfnUserPool.ref
);

// Grant the adminActions function permissions to manage the Cognito User Pool
backend.adminActions.resources.lambda.addToRolePolicy(
  new (await import("aws-cdk-lib/aws-iam")).PolicyStatement({
    sid: "AllowAdminUserActions",
    actions: [
      "cognito-idp:ListUsers",
      "cognito-idp:AdminGetUser",
      "cognito-idp:AdminListGroupsForUser",
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminSetUserPassword",
      "cognito-idp:AdminAddUserToGroup",
      "cognito-idp:AdminRemoveUserFromGroup",
      "cognito-idp:AdminDisableUser",
      "cognito-idp:AdminEnableUser",
      "cognito-idp:AdminDeleteUser",
      "cognito-idp:GlobalSignOut"
    ],
    resources: [cfnUserPool.attrArn],
  })
);

// Grant the server-side (Compute) role permission to upload to S3
// This is required for the public-to-server-to-S3 proxy in /api/upload/photos
const allNodes = backend.auth.resources.userPool.stack.node.root.node.findAll();
const computeRole = allNodes.find((n: any) => {
  const id = n.node?.id;
  if (!id || typeof id !== 'string') return false;
  const lowerId = id.toLowerCase();
  return lowerId.includes('compute') || lowerId.includes('amplifyhosting') || lowerId.includes('ssrfunction');
});

if (computeRole) {
  // If the found construct has a 'role' property, use that; otherwise use the construct itself
  const grantable = (computeRole as any).role || computeRole;
  // Grant the server-side (Compute) role permission to upload to OUR storage bucket via Resource Policy
  const { PolicyStatement, ArnPrincipal } = await import("aws-cdk-lib/aws-iam");
  backend.storage.resources.bucket.addToResourcePolicy(
    new PolicyStatement({
      actions: ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      resources: [
        backend.storage.resources.bucket.bucketArn,
        backend.storage.resources.bucket.arnForObjects("*"),
      ],
      principals: [new ArnPrincipal(grantable.roleArn)],
    })
  );

  // Grant permission to read from the AI output bucket
  grantable.addToPrincipalPolicy(
    new (await import("aws-cdk-lib/aws-iam")).PolicyStatement({
      sid: "AllowReadAIOutput",
      actions: ["s3:GetObject"],
      resources: ["arn:aws:s3:::roof-inspection-poc-output", "arn:aws:s3:::roof-inspection-poc-output/*"],
    })
  );

  console.log("✅ Successfully granted S3 write access and AI output read access to Compute role");
} else {
  console.warn("⚠️ Could not find Compute role to grant S3 permissions. Available nodes:");
  allNodes.forEach((n: any) => {
    if (n.node?.id) console.log(` - ${n.node.id}`);
  });
}

// Grant the Authenticated User Role permission to read from the external AI output bucket
// This is necessary because the backend API may run with the authenticated user's credentials
const authenticatedUserRole = backend.auth.resources.authenticatedUserIamRole;
authenticatedUserRole.addToPrincipalPolicy(
  new (await import("aws-cdk-lib/aws-iam")).PolicyStatement({
    sid: "AllowReadAIOutputForUser",
    actions: ["s3:GetObject"],
    resources: ["arn:aws:s3:::roof-inspection-poc-output", "arn:aws:s3:::roof-inspection-poc-output/*"],
  })
);

// Grant permissions to specific Group Roles
// Users in groups assume specific roles, so we need to grant access to those as well
const groups = ["SuperAdmin", "Admin", "IncidentReporter", "Customer"];
for (const groupName of groups) {
  const roleId = `${groupName}GroupRole`;
  const roleNode = allNodes.find((n: any) => n.node?.id === roleId);
  if (roleNode) {
    // The node found is likely the CDK Role construct
    const role = (roleNode as any).role || roleNode;
    role.addToPrincipalPolicy(
      new (await import("aws-cdk-lib/aws-iam")).PolicyStatement({
        sid: `AllowReadAIOutputFor${groupName}`,
        actions: ["s3:GetObject"],
        resources: ["arn:aws:s3:::roof-inspection-poc-output", "arn:aws:s3:::roof-inspection-poc-output/*"],
      })
    );
    console.log(`✅ Granted S3 read access to group role: ${groupName}`);
  } else {
    console.warn(`⚠️ Could not find IAM Role for group: ${groupName}`);
  }
}

// NOTE: We do NOT grant Lambda invoke permission to group roles here because it creates circular dependencies.
// Instead, we use a resource-based policy on the Lambda function itself (see below).

// Grant the analyzeReport function permissions
// 1. Read from AI Output bucket
backend.analyzeReport.resources.lambda.addToRolePolicy(
  new (await import("aws-cdk-lib/aws-iam")).PolicyStatement({
    sid: "AllowAnalyzeReadAIOutput",
    actions: ["s3:GetObject"],
    resources: ["arn:aws:s3:::roof-inspection-poc-output", "arn:aws:s3:::roof-inspection-poc-output/*"],
  })
);

// 2. Read/Write to our own storage bucket
// We use a Resource Policy on the bucket to avoid 'data' -> 'storage' dependency.
// Instead, 'storage' will depend on 'data' (Lambda Role ARN).
const { PolicyStatement } = await import("aws-cdk-lib/aws-iam");
backend.storage.resources.bucket.addToResourcePolicy(
  new PolicyStatement({
    actions: ["s3:PutObject", "s3:GetObject", "s3:ListBucket", "s3:DeleteObject"],
    resources: [
      backend.storage.resources.bucket.bucketArn,
      backend.storage.resources.bucket.arnForObjects("*"),
    ],
    principals: [backend.analyzeReport.resources.lambda.grantPrincipal],
  })
);

// 3. Grant invoke permission to SSR (Compute role)
// The API route runs in the SSR context, so the compute role needs to invoke the Lambda.
// We use grantInvoke which adds a resource-based permission to the Lambda (Data), referring to the Principal (Auth).
// This creates 'data' -> 'auth', which is fine.
if (computeRole) {
  const grantable = (computeRole as any).role || computeRole;
  backend.analyzeReport.resources.lambda.grantInvoke(grantable);
  console.log("✅ Granted Lambda invoke permission to Compute role");
}

// 4. Grant invoke permission to authenticated user role
// Again, 'data' -> 'auth'. Safe.
backend.analyzeReport.resources.lambda.grantInvoke(authenticatedUserRole);
console.log("✅ Granted Lambda invoke permission to Authenticated User role");

// 5. Add resource-based policy to allow group roles to invoke the function
// 'data' -> 'auth'. Safe.
const { CfnPermission } = await import("aws-cdk-lib/aws-lambda");
const analysisGroups = ["SuperAdmin", "Admin", "IncidentReporter"];
for (const groupName of analysisGroups) {
  const roleId = `${groupName}GroupRole`;
  const roleNode = allNodes.find((n: any) => n.node?.id === roleId);
  if (roleNode) {
    const role = (roleNode as any).role || roleNode;
    new CfnPermission(backend.analyzeReport.resources.lambda as any, `InvokePermission${groupName}`, {
      action: "lambda:InvokeFunction",
      functionName: backend.analyzeReport.resources.lambda.functionName,
      principal: role.roleArn,
    });
    console.log(`✅ Added resource-based permission for group role: ${groupName}`);
  }
}

// Pass AppSync API details to the function
const analyzeLambda = backend.analyzeReport.resources.lambda as any;
analyzeLambda.addEnvironment(
  "AWS_APPSYNC_API_KEY",
  backend.data.resources.cfnResources.cfnApiKey?.attrApiKey || ""
);
analyzeLambda.addEnvironment(
  "AWS_APPSYNC_GRAPHQL_URL",
  backend.data.resources.cfnResources.cfnGraphqlApi.attrGraphQlUrl || ""
);

// Expose the function names and bucket ARN to the application via amplify_outputs.json
backend.addOutput({
  custom: {
    adminActionsFunctionName: backend.adminActions.resources.lambda.functionName,
    analyzeReportFunctionName: backend.analyzeReport.resources.lambda.functionName,
    storageBucketArn: backend.storage.resources.bucket.bucketArn,
  },
});
