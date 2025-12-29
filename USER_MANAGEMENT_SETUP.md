# User Management Setup Guide

This guide explains how to configure the environment variables needed for the user management functionality.

## Required Environment Variables

The user management API requires the following environment variables to be set:

### 1. `AMPLIFY_AUTH_USERPOOL_ID`

This is the ID of your AWS Cognito User Pool. You can find this in the AWS Console or from your Amplify configuration.

**How to find it:**
- Go to AWS Console → Cognito → User Pools
- Select your user pool
- Copy the "User pool ID" (e.g., `us-east-1_abc123xyz`)

**OR**

After deploying your Amplify backend, you can find it in:
- The Amplify outputs (check your terminal after `npx ampx sandbox`)
- Or in `amplify_outputs.json` (if it exists) under `aws_user_pools_id`

### 2. `AWS_REGION` (Optional)

The AWS region where your Cognito User Pool is deployed. Defaults to `us-east-1` if not specified.

**Example:** `us-east-1`, `us-west-2`, `eu-west-1`, etc.

### 3. AWS Credentials (Required for Local Development)

The API needs AWS credentials to perform Cognito operations. Choose one of these methods:

**Method 1: AWS CLI Credentials (Recommended)**
- Install AWS CLI: https://aws.amazon.com/cli/
- Run `aws configure` and enter your credentials
- The SDK will automatically use these credentials

**Method 2: Environment Variables**
Add these to your `.env.local`:
```env
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

**How to get AWS credentials:**
1. Go to AWS Console → IAM → Users
2. Select your user or create a new one
3. Go to "Security credentials" tab
4. Click "Create access key"
5. Choose "Application running outside AWS"
6. Copy the Access Key ID and Secret Access Key

## Setup Instructions

1. Create a `.env.local` file in the root of your project if it doesn't exist:

```bash
touch .env.local
```

2. Add the following environment variables:

```env
# AWS Cognito Configuration
AMPLIFY_AUTH_USERPOOL_ID=your-user-pool-id-here
AWS_REGION=us-east-1
```

3. Replace `your-user-pool-id-here` with your actual Cognito User Pool ID.

4. Restart your development server:

```bash
pnpm dev
```

## Features

Once configured, admins can:

- ✅ **View all users** in the system with their roles and status
- ✅ **Filter users by role** - Click on the role cards to filter (Admins, Reporters, Customers)
- ✅ **Create new users** and assign them roles (Admin, Incident Reporter, or Customer)
- ✅ **Edit user roles** - Click on any role badge to change a user's role
- ✅ **Delete users** from the system
- ✅ **Send email invitations** to new users automatically
- ✅ **See user statistics** by role

## User Roles

The system supports three user roles:

1. **Admin**
   - Full access to all features
   - Can create and manage users
   - Can view all incident reports
   - Can create incident reports

2. **Incident Reporter**
   - Can create and manage incident reports
   - Can view their own reports
   - Cannot access user management

3. **Customer**
   - Read-only access to reports
   - Cannot create or edit reports
   - Cannot access user management

## Troubleshooting

### Error: "User pool ID not configured"

This means the `AMPLIFY_AUTH_USERPOOL_ID` environment variable is not set or is empty.

**Solution:** Add the environment variable to your `.env.local` file and restart the dev server.

### Error: "Failed to list users"

This could be due to:
1. Invalid User Pool ID
2. Incorrect AWS region
3. Missing AWS credentials or permissions

**Solution:**
- Verify your User Pool ID is correct
- Ensure your AWS region matches where your User Pool is deployed
- Check that your AWS credentials have the necessary Cognito permissions

### Permission Denied Errors

The API routes need appropriate IAM permissions to manage Cognito users. When running locally, ensure your AWS credentials have permissions for:
- `cognito-idp:ListUsers`
- `cognito-idp:AdminCreateUser`
- `cognito-idp:AdminDeleteUser`
- `cognito-idp:AdminListGroupsForUser`
- `cognito-idp:AdminAddUserToGroup`

## Security Notes

- Only users with the **Admin** role can access the user management page
- Users cannot delete their own accounts
- All user management operations are logged for audit purposes
- Email invitations are sent automatically when creating users (can be disabled)

## Next Steps

After setting up user management, you can:

1. Navigate to `/Dashboard/users` as an admin
2. Click "Add User" to create new user accounts
3. Assign appropriate roles based on user responsibilities
4. Users will receive email invitations to set their passwords
