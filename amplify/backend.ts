import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource.js";
import { data } from "./data/resource.js";
import { storage } from "./storage/resource.js";

const backend = defineBackend({
  auth,
  data,
  storage,
});

const { cfnUserPool } = backend.auth.resources.cfnResources;

// Grant permissions to the Next.js Compute resource (Lambda)
// This enables the API routes to call Cognito Admin APIs
const iam = await import("aws-cdk-lib/aws-iam");
const statement = new iam.PolicyStatement({
  sid: "AllowAdminUserActions",
  actions: [
    "cognito-idp:ListUsers",
    "cognito-idp:AdminGetUser",
    "cognito-idp:AdminListGroupsForUser",
    "cognito-idp:AdminCreateUser",
    "cognito-idp:AdminDisableUser",
    "cognito-idp:AdminEnableUser",
    "cognito-idp:AdminDeleteUser",
    "cognito-idp:AdminAddUserToGroup",
    "cognito-idp:AdminRemoveUserFromGroup",
    "cognito-idp:GlobalSignOut"
  ],
  resources: [cfnUserPool.attrArn],
});

// Attach the policy to the Lambda execution role.
// Note: We cast to any because the 'compute' property is dynamically added for Next.js apps
// but might not be in the static type definition yet.
(backend as any).compute?.resources?.lambda?.addToRolePolicy(statement);
