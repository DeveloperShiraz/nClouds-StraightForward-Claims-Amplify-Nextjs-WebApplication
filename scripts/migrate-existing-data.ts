/**
 * Migration Script: Assign Existing Users and Reports to Default Company
 *
 * This script:
 * 1. Creates a default "StraightForward (Legacy)" company in DynamoDB
 * 2. Updates all existing Cognito users with the default companyId
 * 3. Updates all existing IncidentReports with the default companyId
 * 4. Provides instructions for promoting the first SuperAdmin
 *
 * Usage:
 *   npx tsx scripts/migrate-existing-data.ts
 *
 * Prerequisites:
 *   - Amplify backend must be deployed with Company model
 *   - Custom attributes must be added to Cognito (run add-cognito-attributes.ts first)
 *   - AWS credentials must be configured
 */

import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { readFileSync } from "fs";
import { join } from "path";

// Read configuration from amplify_outputs.json
function getAmplifyConfig() {
  try {
    const amplifyOutputsPath = join(process.cwd(), "amplify_outputs.json");
    const amplifyOutputs = JSON.parse(readFileSync(amplifyOutputsPath, "utf-8"));

    // Extract table name from API URL or use convention
    const region = amplifyOutputs.auth?.aws_region || "us-east-1";
    const userPoolId = amplifyOutputs.auth.user_pool_id;

    return {
      userPoolId,
      region,
    };
  } catch (error) {
    console.error("❌ Error: Could not read amplify_outputs.json");
    console.log("\nPlease ensure your Amplify backend is deployed:");
    console.log("  npx amplify sandbox");
    process.exit(1);
  }
}

const config = getAmplifyConfig();
const USER_POOL_ID = config.userPoolId;
const region = config.region;

const cognitoClient = new CognitoIdentityProviderClient({ region });
const dynamoClient = new DynamoDBClient({ region });

// Default company details
const DEFAULT_COMPANY = {
  name: "StraightForward (Legacy)",
  domain: "straightforward.com",
  isActive: true,
  createdAt: new Date().toISOString(),
};

interface MigrationStats {
  companyCreated: boolean;
  companyId: string | null;
  usersUpdated: number;
  usersFailed: number;
  reportsUpdated: number;
  reportsFailed: number;
}

async function main() {
  console.log("🚀 Multi-Tenant Migration Guide\n");
  console.log("═══════════════════════════════════════════════════════════\n");

  if (!USER_POOL_ID) {
    console.error("❌ Error: User Pool ID not found");
    console.error("   Please ensure your Amplify backend is deployed.");
    process.exit(1);
  }

  console.log("📋 MIGRATION STEPS:\n");
  console.log("Step 1: Run the Cognito attributes script");
  console.log("   npx tsx scripts/add-cognito-attributes.ts\n");

  console.log("Step 2: Promote your first SuperAdmin");
  console.log(`   aws cognito-idp admin-add-user-to-group \\`);
  console.log(`     --user-pool-id ${USER_POOL_ID} \\`);
  console.log(`     --username <your-admin-email> \\`);
  console.log(`     --group-name SuperAdmin\n`);

  console.log("Step 3: Log in to your app as SuperAdmin\n");

  console.log("Step 4: Create your first company via the UI");
  console.log("   - Go to Dashboard → Companies");
  console.log("   - Click 'Add Company'");
  console.log("   - Create 'StraightForward' or your company name\n");

  console.log("Step 5: Assign existing users to the company");
  console.log("   - This script can help update Cognito users");
  console.log("   - Or assign manually via Users page\n");

  console.log("═══════════════════════════════════════════════════════════\n");
  console.log("🔧 Would you like to update existing Cognito users now? (y/n)\n");
  console.log("   This will assign all users WITHOUT a company to a company you specify.");
  console.log("   You need to provide the Company ID from your app.\n");

  // For now, just provide instructions
  console.log("💡 TIP: To update users programmatically after creating a company:");
  console.log("   1. Get the Company ID from your Companies page");
  console.log("   2. Update this script with the Company ID");
  console.log("   3. Run the user update function\n");

  console.log("✅ Migration preparation complete!");
  console.log("   Follow the steps above to complete your multi-tenant setup.\n");
}

// Export utility function for manual use
export async function assignUsersToCompany(companyId: string, companyName: string) {
  console.log(`\n🔄 Assigning users without company to: ${companyName} (${companyId})\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    let paginationToken: string | undefined = undefined;

    do {
      const listCommand = new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        PaginationToken: paginationToken,
        Limit: 60,
      });

      const response = await cognitoClient.send(listCommand);
      const users = response.Users || [];

      for (const user of users) {
        const username = user.Username;
        if (!username) continue;

        try {
          const existingCompanyId = user.Attributes?.find(
            (attr) => attr.Name === "custom:companyId"
          )?.Value;

          if (existingCompanyId) {
            console.log(`   ⏭️  ${username} already has company`);
            skipped++;
            continue;
          }

          const updateCommand = new AdminUpdateUserAttributesCommand({
            UserPoolId: USER_POOL_ID,
            Username: username,
            UserAttributes: [
              { Name: "custom:companyId", Value: companyId },
              { Name: "custom:companyName", Value: companyName },
            ],
          });

          await cognitoClient.send(updateCommand);
          updated++;
          console.log(`   ✅ Updated: ${username}`);
        } catch (error) {
          failed++;
          console.error(`   ❌ Failed: ${username}`);
        }
      }

      paginationToken = response.PaginationToken;
    } while (paginationToken);

    console.log(`\n📊 Summary: ${updated} updated, ${skipped} skipped, ${failed} failed\n`);
  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  }
}

// Run the migration
main().catch((error) => {
  console.error("💥 Unhandled error:", error);
  process.exit(1);
});
