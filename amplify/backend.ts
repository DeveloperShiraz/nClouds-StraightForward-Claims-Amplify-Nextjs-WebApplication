import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource.js";
import { data } from "./data/resource.js";
import { storage } from "./storage/resource.js";
import { adminActions } from "./functions/admin-actions/resource.js";

const backend = defineBackend({
  auth,
  data,
  storage,
  adminActions,
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
const stack = (backend.storage.resources.bucket as any).stack;
const computeRole = stack.node.findAll().find((n: any) =>
  n.node?.id === 'Compute' ||
  n.node?.id === 'ComputeRole' ||
  n.node?.id?.includes('Compute')
);

if (computeRole) {
  backend.storage.resources.bucket.grantWrite(computeRole);
}

// Expose the function name and bucket ARN to the application via amplify_outputs.json
backend.addOutput({
  custom: {
    adminActionsFunctionName: backend.adminActions.resources.lambda.functionName,
    storageBucketArn: backend.storage.resources.bucket.bucketArn,
  },
});
