import {
    CognitoIdentityProviderClient,
    ListUsersInGroupCommand,
    AdminAddUserToGroupCommand,
    AdminRemoveUserFromGroupCommand,
    GetGroupCommand,
    CreateGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { readFileSync } from "fs";
import { join } from "path";

// Load amplify_outputs.json
const amplifyOutputsPath = join(process.cwd(), "amplify_outputs.json");
const amplifyOutputs = JSON.parse(readFileSync(amplifyOutputsPath, "utf-8"));

const userPoolId = amplifyOutputs.auth?.user_pool_id;
const region = amplifyOutputs.auth?.aws_region;

if (!userPoolId || !region) {
    console.error("❌ user_pool_id or aws_region not found in amplify_outputs.json");
    console.error("   ensure you have deployed the backend!");
    process.exit(1);
}

const client = new CognitoIdentityProviderClient({ region });

async function migrateUsers() {
    console.log("🚀 Starting migration from 'Customer' to 'HomeOwner'...");
    console.log(`   User Pool ID: ${userPoolId}`);
    console.log(`   Region: ${region}\n`);

    try {
        // 1. Ensure HomeOwner group exists
        try {
            await client.send(
                new GetGroupCommand({
                    UserPoolId: userPoolId,
                    GroupName: "HomeOwner",
                })
            );
            console.log("✅ 'HomeOwner' group exists.");
        } catch (error: any) {
            if (error.name === "ResourceNotFoundException") {
                console.log("⚠️ 'HomeOwner' group not found. Attempting to create it...");
                try {
                    // Create if missing (though deployment should handle this)
                    await client.send(new CreateGroupCommand({
                        UserPoolId: userPoolId,
                        GroupName: "HomeOwner",
                        Description: "Read-only access",
                        Precedence: 3
                    }));
                    console.log("✅ 'HomeOwner' group created.");
                } catch (createError) {
                    console.error("❌ Failed to create 'HomeOwner' group:", createError);
                    return;
                }
            } else {
                throw error;
            }
        }

        // 2. List users in 'Customer' group
        console.log("🔍 Finding users in 'Customer' group...");

        // Pagination support could be added, but assuming manageable list for now
        // Actually, ListUsersInGroup paginates. For simplicity, let's grab the first batch (up to 60) and loop if needed.
        let nextToken: string | undefined;
        const users toMigrate: any[] = [];

        do {
            const command = new ListUsersInGroupCommand({
                UserPoolId: userPoolId,
                GroupName: "Customer",
                NextToken: nextToken
            });

            try {
                const response = await client.send(command);
                users.push(...(response.Users || []));
                nextToken = response.NextToken;
            } catch (err: any) {
                if (err.name === 'ResourceNotFoundException') {
                    console.log("ℹ️ 'Customer' group not found. No users to migrate.");
                    return;
                }
                throw err;
            }
        } while (nextToken);

        if (users.length === 0) {
            console.log("✅ No users found in 'Customer' group. Implementation complete!");
            return;
        }

        console.log(`📋 Found ${users.length} users to migrate.\n`);

        // 3. Migrate each user
        for (const user of users) {
            const username = user.Username; // Using Username is safer than email alias for Admin operations
            if (!username) continue;

            console.log(`🔄 Migrating user: ${username}...`);

            try {
                // Add to HomeOwner
                await client.send(
                    new AdminAddUserToGroupCommand({
                        UserPoolId: userPoolId,
                        Username: username,
                        GroupName: "HomeOwner",
                    })
                );
                console.log(`   ✅ Added to 'HomeOwner'`);

                // Remove from Customer
                await client.send(
                    new AdminRemoveUserFromGroupCommand({
                        UserPoolId: userPoolId,
                        Username: username,
                        GroupName: "Customer",
                    })
                );
                console.log(`   ✅ Removed from 'Customer'`);
            } catch (err: any) {
                console.error(`   ❌ Failed to migrate ${username}:`, err.message);
            }
        }

        console.log("\n🎉 Migration complete!");

    } catch (error: any) {
        console.error("\n❌ Migration failed:", error);
    }
}

migrateUsers();
