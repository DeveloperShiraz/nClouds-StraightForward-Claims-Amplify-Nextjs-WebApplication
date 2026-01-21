import { defineFunction } from "@aws-amplify/backend";

export const analyzeReport = defineFunction({
    name: "analyzeReport",
    entry: "./handler.ts",
    timeoutSeconds: 300, // 5 minutes for heavy AI analysis and image copying
    resourceGroupName: "data", // Assign to data stack to avoid circular dependency
});
