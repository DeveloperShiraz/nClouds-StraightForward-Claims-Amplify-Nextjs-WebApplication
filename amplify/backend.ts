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
const computeLambda = (backend as any).compute?.resources?.lambda;
if (computeLambda) {
  backend.adminActions.resources.lambda.grantInvoke(computeLambda);

  // Pass the function name to the API routes
  computeLambda.addEnvironment(
    "ADMIN_ACTIONS_FUNCTION_NAME",
    backend.adminActions.resources.lambda.functionName
  );
}
