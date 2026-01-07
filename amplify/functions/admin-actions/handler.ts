import {
    CognitoIdentityProviderClient,
    ListUsersCommand,
    AdminCreateUserCommand,
    AdminAddUserToGroupCommand,
    AdminSetUserPasswordCommand,
    MessageActionType,
} from "@aws-sdk/client-cognito-identity-provider";

interface AdminActionEvent {
    action: "listUsers" | "createUser";
    payload: any;
}

const client = new CognitoIdentityProviderClient({});

export const handler = async (event: AdminActionEvent) => {
    const userPoolId = process.env.AMPLIFY_AUTH_USERPOOL_ID;

    if (!userPoolId) {
        throw new Error("AMPLIFY_AUTH_USERPOOL_ID is not set");
    }

    const { action, payload } = event;

    switch (action) {
        case "listUsers": {
            const command = new ListUsersCommand({
                UserPoolId: userPoolId,
            });
            const response = await client.send(command);
            return { users: response.Users || [] };
        }

        case "createUser": {
            const {
                email,
                userAttributes,
                sendInvite,
                temporaryPassword,
                groups
            } = payload;

            const createCommand = new AdminCreateUserCommand({
                UserPoolId: userPoolId,
                Username: email,
                UserAttributes: userAttributes,
                DesiredDeliveryMediums: sendInvite ? ["EMAIL"] : undefined,
                MessageAction: sendInvite ? undefined : MessageActionType.SUPPRESS,
                TemporaryPassword: temporaryPassword,
            });

            const response = await client.send(createCommand);

            if (temporaryPassword) {
                await client.send(new AdminSetUserPasswordCommand({
                    UserPoolId: userPoolId,
                    Username: email,
                    Password: temporaryPassword,
                    Permanent: true,
                }));
            }

            for (const group of (groups || [])) {
                await client.send(new AdminAddUserToGroupCommand({
                    UserPoolId: userPoolId,
                    Username: email,
                    GroupName: group,
                }));
            }

            return { success: true, user: response.User };
        }

        default:
            throw new Error(`Unknown action: ${action}`);
    }
};
