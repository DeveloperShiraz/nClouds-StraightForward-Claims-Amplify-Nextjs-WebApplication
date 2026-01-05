import {
  CognitoIdentityProviderClient,
  AddCustomAttributesCommand,
  CreateGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { readFileSync } from "fs";
import { join } from "path";

// Read user pool ID from amplify_outputs.json
function getUserPoolId(): string {
  try {
    const amplifyOutputsPath = join(process.cwd(), "amplify_outputs.json");
    const amplifyOutputs = JSON.parse(readFileSync(amplifyOutputsPath, "utf-8"));
    return amplifyOutputs.auth.user_pool_id;
  } catch (error) {
    console.error("❌ Error: Could not read amplify_outputs.json");
    console.log("\nPlease ensure your Amplify backend is deployed:");
    console.log("  npx amplify sandbox");
    process.exit(1);
  }
}

const userPoolId = getUserPoolId();
const region = process.env.AWS_REGION || "us-east-1";

const client = new CognitoIdentityProviderClient({ region });

async function setupCognito() {
  if (!userPoolId) {
    console.error("❌ Error: User Pool ID not found in amplify_outputs.json");
    process.exit(1);
  }

  console.log("🚀 Setting up Cognito user pool...");
  console.log(`📋 User Pool ID: ${userPoolId}\n`);

  try {
    // Add custom attributes
    console.log("📝 Adding custom attributes (companyId, companyName)...");
    await client.send(
      new AddCustomAttributesCommand({
        UserPoolId: userPoolId,
        CustomAttributes: [
          {
            Name: "companyId",
            AttributeDataType: "String",
            Mutable: true,
          },
          {
            Name: "companyName",
            AttributeDataType: "String",
            Mutable: true,
          },
        ],
      })
    );
    console.log("✅ Custom attributes added successfully\n");
  } catch (error: any) {
    if (error.name === "InvalidParameterException" && error.message?.includes("not unique")) {
      console.log("ℹ️  Custom attributes already exist, skipping...\n");
    } else {
      console.error("❌ Error adding custom attributes:", error.message);
      throw error;
    }
  }

  try {
    // Create SuperAdmin group
    console.log("👑 Creating SuperAdmin group...");
    await client.send(
      new CreateGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "SuperAdmin",
        Description: "StraightForward company administrators with global access to all companies",
        Precedence: 0, // Highest priority
      })
    );
    console.log("✅ SuperAdmin group created successfully\n");
  } catch (error: any) {
    if (error.name === "GroupExistsException") {
      console.log("ℹ️  SuperAdmin group already exists, skipping...\n");
    } else {
      console.error("❌ Error creating SuperAdmin group:", error.message);
      throw error;
    }
  }

  console.log("✅ Cognito setup complete!\n");
  console.log("📝 Next steps:");
  console.log("1. Deploy your Amplify backend: npx amplify sandbox");
  console.log("2. Run the migration script: tsx scripts/migrate-existing-data.ts");
  console.log("3. Promote a user to SuperAdmin:");
  console.log(`   aws cognito-idp admin-add-user-to-group \\`);
  console.log(`     --user-pool-id ${userPoolId} \\`);
  console.log(`     --username <admin-email> \\`);
  console.log(`     --group-name SuperAdmin\n`);
}

setupCognito().catch((error) => {
  console.error("❌ Setup failed:", error);
  process.exit(1);
});
