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
// 1. Grant to the standard Amplify roles (most likely targets)
try {
  backend.adminActions.resources.lambda.grantInvoke(backend.auth.resources.authenticatedUserIamRole);
  backend.adminActions.resources.lambda.grantInvoke(backend.auth.resources.unauthenticatedUserIamRole);
} catch (e) {
  // Silent
}

// 2. Search for ANY node that looks like a Role or Compute resource
const allNodes = backend.stack.node.root.node.findAll();
let computeLambda: any = (backend as any).compute?.resources?.lambda;

allNodes.forEach((node) => {
  const id = node.node.id;
  // Grant to any "ServiceRole" found in the tree
  if (id === "ServiceRole" || id.includes("ServiceRole")) {
    try {
      backend.adminActions.resources.lambda.grantInvoke(node as any);
    } catch (e) { }
  }
  // Try to find the elusive Compute Lambda
  if (!computeLambda && (id === "Compute" || id.includes("Compute"))) {
    computeLambda = (node as any).resources?.lambda || (node as any).lambda;
  }
});

const computeLambdaFound = !!computeLambda;

if (computeLambda) {
  try {
    backend.adminActions.resources.lambda.grantInvoke(computeLambda);
    if (process.env.APP_AWS_ACCESS_KEY_ID) {
      computeLambda.addEnvironment("APP_AWS_ACCESS_KEY_ID", process.env.APP_AWS_ACCESS_KEY_ID);
    }
  } catch (e) { }
}

// Expose full diagnostic ID list (joined with | to save space)
backend.addOutput({
  custom: {
    adminActionsFunctionName: backend.adminActions.resources.lambda.functionName,
    debug_computeLambdaFound: computeLambdaFound,
    debug_allIds: allNodes.map(n => n.node.id).join("|").slice(0, 1000),
  },
});
