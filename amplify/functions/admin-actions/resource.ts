import { defineFunction } from "@aws-amplify/backend";

export const adminActions = defineFunction({
    entry: "./handler.ts",
    timeoutSeconds: 30, // Cognito admin actions can be slow
});
