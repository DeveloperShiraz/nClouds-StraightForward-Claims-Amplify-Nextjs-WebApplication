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

// Grant the Next.js Compute Role permission to invoke this function
// Grant the Next.js Compute Role permission to invoke this function
let computeLambda: any = (backend as any).compute?.resources?.lambda;

const findNodeByIdRecursive = (node: any, targetId: string): any => {
  if (node?.node?.id === targetId) return node;
  for (const child of node?.node?.children || []) {
    const found = findNodeByIdRecursive(child, targetId);
    if (found) return found;
  }
  return null;
};

if (!computeLambda) {
  try {
    // Exhaustive search: look for ANY node in the entire app tree with ID "Compute"
    const allNodes = backend.stack.node.root.node.findAll();
    const computeNode = allNodes.find(node => node.node.id === "Compute") as any;
    computeLambda = computeNode?.resources?.lambda;
  } catch (e) {
    // Silent
  }
}

const computeLambdaFound = !!computeLambda;

if (computeLambda) {
  backend.adminActions.resources.lambda.grantInvoke(computeLambda);

  // Explicitly pass manual keys if they exist in the build environment
  if (process.env.APP_AWS_ACCESS_KEY_ID) {
    computeLambda.addEnvironment("APP_AWS_ACCESS_KEY_ID", process.env.APP_AWS_ACCESS_KEY_ID);
  }
  if (process.env.APP_AWS_SECRET_ACCESS_KEY) {
    computeLambda.addEnvironment("APP_AWS_SECRET_ACCESS_KEY", process.env.APP_AWS_SECRET_ACCESS_KEY);
  }
  if (process.env.APP_AWS_SESSION_TOKEN) {
    computeLambda.addEnvironment("APP_AWS_SESSION_TOKEN", process.env.APP_AWS_SESSION_TOKEN);
  }
}

// Expose debug info to the application
backend.addOutput({
  custom: {
    adminActionsFunctionName: backend.adminActions.resources.lambda.functionName,
    debug_computeLambdaFound: computeLambdaFound,
    debug_allIdsSnippet: backend.stack.node.root.node.findAll().map(n => n.node.id).slice(0, 50).join(", "),
  },
});
