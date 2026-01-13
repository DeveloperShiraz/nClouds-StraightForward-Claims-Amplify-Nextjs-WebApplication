import {
    CognitoIdentityProviderClient,
    ListUsersCommand,
    AdminCreateUserCommand,
    AdminAddUserToGroupCommand,
    AdminSetUserPasswordCommand,
    AdminListGroupsForUserCommand,
    AdminDeleteUserCommand,
    MessageActionType,
} from "@aws-sdk/client-cognito-identity-provider";

interface AdminActionEvent {
    action: "listUsers" | "createUser" | "deleteUser";
    payload: any;
}

const client = new CognitoIdentityProviderClient({});

export const handler = async (event: any) => {
    const userPoolId = process.env.AMPLIFY_AUTH_USERPOOL_ID;

    if (!userPoolId) {
        throw new Error("AMPLIFY_AUTH_USERPOOL_ID is not set");
    }

    // Determine the action (Direct Lambda call uses 'action', AppSync uses 'fieldName')
    const action = event.action || event.fieldName;
    // AppSync passes arguments in 'arguments', direct call uses 'payload'
    const payload = event.payload || event.arguments || {};

    const identity = event.identity;
    const claims = identity?.claims || {};

    // Helper to get custom claims which might be prefixed or not depending on the provider
    const getClaim = (name: string) => claims[`custom:${name}`] || claims[name];

    console.log(`Executing admin action: ${action}`, {
        username: identity?.username,
        groups: identity?.groups,
        hasCompanyId: !!getClaim("companyId")
    });

    switch (action) {
        case "listUsers": {
            const callerGroups = identity?.groups || [];
            const isSuperAdmin = callerGroups.includes("SuperAdmin");
            const callerCompanyId = getClaim("companyId");

            const command = new ListUsersCommand({
                UserPoolId: userPoolId,
            });
            const response = await client.send(command);

            const allUsers = await Promise.all((response.Users || []).map(async (user: any) => {
                const getAttr = (name: string) => user.Attributes?.find((a: any) => a.Name === name)?.Value;

                // Fetch groups for this user
                let groups: string[] = [];
                try {
                    const groupResponse = await client.send(new AdminListGroupsForUserCommand({
                        UserPoolId: userPoolId,
                        Username: user.Username
                    }));
                    groups = groupResponse.Groups?.map(g => g.GroupName!).filter(Boolean) || [];
                } catch (groupError) {
                    console.error(`Error fetching groups for user ${user.Username}:`, groupError);
                }

                return {
                    username: user.Username,
                    email: getAttr("email"),
                    emailVerified: getAttr("email_verified") === "true",
                    status: user.UserStatus,
                    enabled: user.Enabled,
                    createdAt: user.UserCreateDate?.toISOString(),
                    groups: groups,
                    companyId: getAttr("custom:companyId"),
                    companyName: getAttr("custom:companyName"),
                };
            }));

            // Filter users based on organizational boundaries
            let filteredUsers = allUsers;

            if (!isSuperAdmin) {
                // If not a SuperAdmin, strictly filter by companyId
                // If callerCompanyId is missing, Admin sees nothing (safety first)
                if (!callerCompanyId) {
                    console.warn(`Admin user ${identity?.username} has no companyId. Returning empty list.`);
                    filteredUsers = [];
                } else {
                    filteredUsers = allUsers.filter(u => u.companyId === callerCompanyId);
                }
            }

            return event.fieldName ? filteredUsers : { users: filteredUsers };
        }

        case "createUser": {
            const {
                email,
                tempPassword,
                group,
                companyId: providedCompanyId,
                companyName: providedCompanyName
            } = payload;

            const callerGroups = identity?.groups || [];
            const isSuperAdmin = callerGroups.includes("SuperAdmin");
            const callerCompanyId = getClaim("companyId");
            const callerCompanyName = getClaim("companyName");

            // Enforce companyId for Admins
            let finalCompanyId = providedCompanyId;
            let finalCompanyName = providedCompanyName;

            if (!isSuperAdmin) {
                if (!callerCompanyId) throw new Error("Unauthorized: Admin has no associated company");
                finalCompanyId = callerCompanyId;
                finalCompanyName = callerCompanyName || providedCompanyName;
            }

            const userAttributes = [
                { Name: "email", Value: email },
                { Name: "email_verified", Value: "true" },
            ];

            if (finalCompanyId) userAttributes.push({ Name: "custom:companyId", Value: finalCompanyId });
            if (finalCompanyName) userAttributes.push({ Name: "custom:companyName", Value: finalCompanyName });

            // Ensure we have a temporary password
            const actualTempPassword = tempPassword || `Temp${Math.random().toString(36).slice(-8)}!`;

            const createCommand = new AdminCreateUserCommand({
                UserPoolId: userPoolId,
                Username: email,
                UserAttributes: userAttributes,
                MessageAction: MessageActionType.SUPPRESS,
                TemporaryPassword: actualTempPassword,
            });

            const response = await client.send(createCommand);

            if (actualTempPassword) {
                await client.send(new AdminSetUserPasswordCommand({
                    UserPoolId: userPoolId,
                    Username: email,
                    Password: actualTempPassword,
                    Permanent: false,
                }));
            }

            if (group) {
                await client.send(new AdminAddUserToGroupCommand({
                    UserPoolId: userPoolId,
                    Username: email,
                    GroupName: group,
                }));
            }

            const resultUser = {
                username: response.User?.Username,
                email: email,
                emailVerified: true,
                status: response.User?.UserStatus,
                enabled: response.User?.Enabled,
                createdAt: new Date().toISOString(),
                groups: group ? [group] : [],
                companyId: finalCompanyId,
                companyName: finalCompanyName
            };

            return event.fieldName ? resultUser : { success: true, user: resultUser };
        }

        case "deleteUser": {
            const { username } = payload;
            if (!username) throw new Error("Username is required for deleteUser");

            // Multi-tenancy check: Admins can only delete users in their company
            const callerGroups = identity?.groups || [];
            const isSuperAdmin = callerGroups.includes("SuperAdmin");
            const isAdmin = callerGroups.includes("Admin");

            if (!isSuperAdmin && isAdmin) {
                const callerCompanyId = getClaim("companyId");
                if (!callerCompanyId) throw new Error("Unauthorized: Admin has no associated company");

                // Fetch target user to check companyId
                const { AdminGetUserCommand } = await import("@aws-sdk/client-cognito-identity-provider");
                const targetUser = await client.send(new AdminGetUserCommand({
                    UserPoolId: userPoolId,
                    Username: username,
                }));

                const targetCompanyId = targetUser.UserAttributes?.find(a => a.Name === "custom:companyId")?.Value;
                if (targetCompanyId !== callerCompanyId) {
                    throw new Error("Unauthorized: Cannot delete user from a different company");
                }
            } else if (!isSuperAdmin) {
                throw new Error("Unauthorized: Insufficient permissions to delete users");
            }

            console.log(`Deleting user ${username} from User Pool ${userPoolId}`);

            await client.send(new AdminDeleteUserCommand({
                UserPoolId: userPoolId,
                Username: username,
            }));

            return { username };
        }

        default:
            throw new Error(`Unknown action: ${action}`);
    }
};
