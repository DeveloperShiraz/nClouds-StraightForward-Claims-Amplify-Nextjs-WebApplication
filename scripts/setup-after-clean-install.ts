import {
  CognitoIdentityProviderClient,
  AddCustomAttributesCommand,
  CreateGroupCommand,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminSetUserPasswordCommand,
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
    console.log("  npx ampx sandbox");
    process.exit(1);
  }
}

const userPoolId = getUserPoolId();
const region = process.env.AWS_REGION || "us-east-1";

const client = new CognitoIdentityProviderClient({ region });

async function setupAfterCleanInstall() {
  if (!userPoolId) {
    console.error("❌ Error: User Pool ID not found in amplify_outputs.json");
    process.exit(1);
  }

  console.log("🚀 Setting up Cognito after clean install...");
  console.log(`📋 User Pool ID: ${userPoolId}\n`);

  // Step 1: Add custom attributes
  try {
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

  // Step 2: Create SuperAdmin group
  try {
    console.log("👑 Creating SuperAdmin group...");
    await client.send(
      new CreateGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "SuperAdmin",
        Description: "StraightForward company administrators with global access",
        Precedence: 0,
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

  // Step 3: Create other groups
  const otherGroups = ["Admin", "IncidentReporter", "Customer"];
  for (const groupName of otherGroups) {
    try {
      console.log(`📋 Creating ${groupName} group...`);
      await client.send(
        new CreateGroupCommand({
          UserPoolId: userPoolId,
          GroupName: groupName,
          Description: `${groupName} role`,
          Precedence: groupName === "Admin" ? 1 : groupName === "IncidentReporter" ? 2 : 3,
        })
      );
      console.log(`✅ ${groupName} group created successfully\n`);
    } catch (error: any) {
      if (error.name === "GroupExistsException") {
        console.log(`ℹ️  ${groupName} group already exists, skipping...\n`);
      } else {
        console.error(`❌ Error creating ${groupName} group:`, error.message);
      }
    }
  }

  // Step 4: Create admin user
  const adminEmail = "admin@aws.com";
  const adminPassword = "TempPassword123!";

  try {
    console.log(`👤 Creating admin user (${adminEmail})...`);
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: adminEmail,
        UserAttributes: [
          {
            Name: "email",
            Value: adminEmail,
          },
          {
            Name: "email_verified",
            Value: "true",
          },
        ],
        MessageAction: "SUPPRESS", // Don't send email
      })
    );
    console.log("✅ Admin user created successfully\n");

    // Set permanent password
    console.log("🔑 Setting permanent password...");
    await client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: adminEmail,
        Password: adminPassword,
        Permanent: true,
      })
    );
    console.log("✅ Password set successfully\n");
  } catch (error: any) {
    if (error.name === "UsernameExistsException") {
      console.log("ℹ️  Admin user already exists, skipping creation...\n");
    } else {
      console.error("❌ Error creating admin user:", error.message);
      throw error;
    }
  }

  // Step 5: Add admin to SuperAdmin group
  try {
    console.log(`👑 Adding ${adminEmail} to SuperAdmin group...`);
    await client.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: adminEmail,
        GroupName: "SuperAdmin",
      })
    );
    console.log("✅ User added to SuperAdmin group successfully\n");
  } catch (error: any) {
    console.error("❌ Error adding user to group:", error.message);
  }

  console.log("✅ Setup complete!\n");
  console.log("📝 Login credentials:");
  console.log(`   Email: ${adminEmail}`);
  console.log(`   Password: ${adminPassword}\n`);
  console.log("⚠️  Please change this password after first login!\n");
}

setupAfterCleanInstall().catch((error) => {
  console.error("❌ Setup failed:", error);
  process.exit(1);
});
