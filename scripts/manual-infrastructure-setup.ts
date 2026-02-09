import {
  CognitoIdentityProviderClient,
  CreateUserPoolCommand,
  CreateUserPoolClientCommand,
  CreateGroupCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoIdentityClient, CreateIdentityPoolCommand } from "@aws-sdk/client-cognito-identity";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { writeFileSync } from "fs";
import { join } from "path";

const region = "us-east-1";
const cognitoClient = new CognitoIdentityProviderClient({ region });
const identityClient = new CognitoIdentityClient({ region });
const dynamoClient = new DynamoDBClient({ region });

async function setupInfrastructure() {
  console.log("🚀 Starting manual infrastructure setup...\n");

  // Step 1: Create User Pool
  console.log("1️⃣  Creating Cognito User Pool...");
  const userPoolResponse = await cognitoClient.send(
    new CreateUserPoolCommand({
      PoolName: "predictif-manual-userpool",
      Policies: {
        PasswordPolicy: {
          MinimumLength: 8,
          RequireUppercase: true,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
        },
      },
      UsernameAttributes: ["email"],
      AutoVerifiedAttributes: ["email"],
      Schema: [
        {
          Name: "email",
          Required: true,
          Mutable: false,
          AttributeDataType: "String",
        },
        {
          Name: "companyId",
          Mutable: true,
          AttributeDataType: "String",
        },
        {
          Name: "companyName",
          Mutable: true,
          AttributeDataType: "String",
        },
      ],
    })
  );

  const userPoolId = userPoolResponse.UserPool!.Id!;
  console.log(`✅ User Pool created: ${userPoolId}\n`);

  // Step 2: Create User Pool Client
  console.log("2️⃣  Creating User Pool Client...");
  const clientResponse = await cognitoClient.send(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: "predictif-web-client",
      GenerateSecret: false,
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    })
  );

  const clientId = clientResponse.UserPoolClient!.ClientId!;
  console.log(`✅ Client created: ${clientId}\n`);

  // Step 3: Create User Groups
  console.log("3️⃣  Creating user groups...");
  const groups = [
    { name: "SuperAdmin", precedence: 0, description: "Global administrators" },
    { name: "Admin", precedence: 1, description: "Company administrators" },
    { name: "IncidentReporter", precedence: 2, description: "Can report incidents" },
    { name: "HomeOwner", precedence: 3, description: "Read-only access" },
  ];

  for (const group of groups) {
    await cognitoClient.send(
      new CreateGroupCommand({
        UserPoolId: userPoolId,
        GroupName: group.name,
        Description: group.description,
        Precedence: group.precedence,
      })
    );
    console.log(`   ✅ Created group: ${group.name}`);
  }
  console.log();

  // Step 4: Create Admin User
  console.log("4️⃣  Creating admin user...");
  await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: "admin@aws.com",
      UserAttributes: [
        { Name: "email", Value: "admin@aws.com" },
        { Name: "email_verified", Value: "true" },
      ],
      MessageAction: "SUPPRESS",
    })
  );

  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: "admin@aws.com",
      Password: "TempPassword123!",
      Permanent: true,
    })
  );

  await cognitoClient.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: "admin@aws.com",
      GroupName: "SuperAdmin",
    })
  );
  console.log(`✅ Admin user created: admin@aws.com\n`);

  // Step 5: Create Identity Pool
  console.log("5️⃣  Creating Identity Pool...");
  const identityPoolResponse = await identityClient.send(
    new CreateIdentityPoolCommand({
      IdentityPoolName: "predictif_manual_identitypool",
      AllowUnauthenticatedIdentities: false,
      CognitoIdentityProviders: [
        {
          ProviderName: `cognito-idp.${region}.amazonaws.com/${userPoolId}`,
          ClientId: clientId,
        },
      ],
    })
  );

  const identityPoolId = identityPoolResponse.IdentityPoolId!;
  console.log(`✅ Identity Pool created: ${identityPoolId}\n`);

  // Step 6: Create DynamoDB Tables
  console.log("6️⃣  Creating DynamoDB tables...");

  // Company Table
  await dynamoClient.send(
    new CreateTableCommand({
      TableName: "Company-manual",
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    })
  );
  console.log(`   ✅ Created table: Company-manual`);

  // IncidentReport Table
  await dynamoClient.send(
    new CreateTableCommand({
      TableName: "IncidentReport-manual",
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "companyId", AttributeType: "S" },
      ],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      GlobalSecondaryIndexes: [
        {
          IndexName: "byCompanyId",
          KeySchema: [{ AttributeName: "companyId", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
    })
  );
  console.log(`   ✅ Created table: IncidentReport-manual\n`);

  // Step 7: Generate amplify_outputs.json
  console.log("7️⃣  Generating amplify_outputs.json...");
  const amplifyOutputs = {
    auth: {
      user_pool_id: userPoolId,
      aws_region: region,
      user_pool_client_id: clientId,
      identity_pool_id: identityPoolId,
      mfa_methods: [],
      standard_required_attributes: ["email"],
      username_attributes: ["email"],
      user_verification_types: ["email"],
      password_policy: {
        min_length: 8,
        require_lowercase: true,
        require_uppercase: true,
        require_numbers: true,
        require_symbols: true,
      },
      groups: [
        { SuperAdmin: { precedence: 0 } },
        { Admin: { precedence: 1 } },
        { IncidentReporter: { precedence: 2 } },
        { HomeOwner: { precedence: 3 } },
      ],
    },
    data: {
      url: `https://dynamodb.${region}.amazonaws.com`,
      aws_region: region,
      default_authorization_type: "AMAZON_COGNITO_USER_POOLS",
      authorization_types: ["AMAZON_COGNITO_USER_POOLS"],
      model_introspection: {
        version: 1,
        models: {
          Company: {
            name: "Company",
            fields: {
              id: { name: "id", isArray: false, type: "ID", isRequired: true },
              name: { name: "name", isArray: false, type: "String", isRequired: true },
              domain: { name: "domain", isArray: false, type: "String", isRequired: false },
              logoUrl: { name: "logoUrl", isArray: false, type: "String", isRequired: false },
              isActive: { name: "isActive", isArray: false, type: "Boolean", isRequired: false },
              createdAt: { name: "createdAt", isArray: false, type: "AWSDateTime", isRequired: false },
              maxUsers: { name: "maxUsers", isArray: false, type: "Int", isRequired: false },
            },
            primaryKeyInfo: { isCustomPrimaryKey: false, primaryKeyFieldName: "id", sortKeyFieldNames: [] },
          },
        },
      },
    },
    version: "1.3",
  };

  const outputPath = join(process.cwd(), "amplify_outputs.json");
  writeFileSync(outputPath, JSON.stringify(amplifyOutputs, null, 2));
  console.log(`✅ amplify_outputs.json created\n`);

  // Summary
  console.log("=".repeat(60));
  console.log("🎉 Infrastructure setup complete!\n");
  console.log("📋 Summary:");
  console.log(`   User Pool ID: ${userPoolId}`);
  console.log(`   Client ID: ${clientId}`);
  console.log(`   Identity Pool ID: ${identityPoolId}`);
  console.log(`   DynamoDB Tables: Company-manual, IncidentReport-manual\n`);
  console.log("🔐 Login Credentials:");
  console.log(`   Email: admin@aws.com`);
  console.log(`   Password: TempPassword123!\n`);
  console.log("▶️  Next Steps:");
  console.log(`   1. Update your API routes to use table name "Company-manual"`);
  console.log(`   2. Run: npm run dev`);
  console.log(`   3. Login and test the Companies page\n`);
  console.log("=".repeat(60));
}

setupInfrastructure().catch((error) => {
  console.error("❌ Setup failed:", error);
  process.exit(1);
});
