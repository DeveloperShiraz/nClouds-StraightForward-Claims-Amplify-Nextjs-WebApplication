# Multi-Tenant Company Implementation - Progress Summary

## ✅ Completed Features

### Phase 1: Database Schema ✅ COMPLETE
- **Company Model** created in [amplify/data/resource.ts](amplify/data/resource.ts)
  - Fields: name, domain, logoUrl, settings, isActive, createdAt, maxUsers
  - Authorization: SuperAdmin (full access), other roles (read-only)
- **IncidentReport Model** updated
  - Added `companyId` field and `company` relationship
  - Updated authorization rules for multi-tenant access

### Phase 2: Authentication & Authorization ✅ COMPLETE
- **SuperAdmin Group** added to Cognito configuration in [amplify/auth/resource.ts](amplify/auth/resource.ts)
- **Custom User Attributes** added:
  - `custom:companyId` - Links user to their company
  - `custom:companyName` - Stores company name for quick access
- **Setup Script** created at [scripts/add-cognito-attributes.ts](scripts/add-cognito-attributes.ts)
  - Adds custom attributes to existing Cognito user pool
  - Creates SuperAdmin group with highest precedence

### Phase 3: Backend API Routes ✅ COMPLETE
- **Company Management APIs** created:
  - `GET /api/admin/companies` - List all companies (SuperAdmin) or user's company
  - `POST /api/admin/companies` - Create new company (SuperAdmin only)
  - `GET /api/admin/companies/[id]` - Get company details
  - `PATCH /api/admin/companies/[id]` - Update company (SuperAdmin only)
  - `DELETE /api/admin/companies/[id]` - Delete company (SuperAdmin only)

- **User Management APIs** updated:
  - [app/api/admin/users/route.ts](app/api/admin/users/route.ts) - Now returns companyId and companyName
  - [app/api/admin/users/create/route.ts](app/api/admin/users/create/route.ts) - Assigns company to new users
  - SuperAdmin validation added

- **Server Utilities** created:
  - [lib/amplify-server-utils.ts](lib/amplify-server-utils.ts) - Cookie-based Amplify Data client for server-side operations

### Phase 4: Frontend Foundation ✅ COMPLETE
- **useUserRole Hook** updated in [lib/auth/useUserRole.ts](lib/auth/useUserRole.ts)
  - Added `isSuperAdmin` boolean
  - Added `companyId` and `companyName` fields
  - Updated UserRole type to include "SuperAdmin"

- **CompanyContext** created at [contexts/CompanyContext.tsx](contexts/CompanyContext.tsx)
  - Provides company data throughout the application
  - Automatically fetches companies based on user role
  - Exposes `currentCompany`, `companies`, `isLoading`, `refreshCompanies()`

### Phase 5: UI Components ✅ PARTIAL COMPLETE
- **AddUserDialog** updated in [components/AddUserDialog.tsx](components/AddUserDialog.tsx)
  - SuperAdmins can select which company to assign users to
  - Regular Admins automatically assign users to their own company
  - SuperAdmin role option added (visible only to SuperAdmins)
  - Company selector with dropdown of available companies

## 🔄 Remaining Tasks

### Phase 5: UI Components (Remaining)
1. **Update Users Management Page** [app/Dashboard/users/page.tsx](app/Dashboard/users/page.tsx)
   - Display company column in user table
   - Add company filter dropdown (SuperAdmin only)
   - Show company badges for each user
   - Filter users by company automatically for Admins

2. **Create Companies Management Page** [app/Dashboard/companies/page.tsx](app/Dashboard/companies/page.tsx)
   - SuperAdmin-only page
   - Grid/card view of all companies
   - Create, edit, delete company operations
   - Show user count per company
   - Company settings management

3. **Update Sidebar Navigation** [components/App-sidebar.tsx](components/App-sidebar.tsx)
   - Add "Companies" menu item for SuperAdmins
   - Ensure proper role-based menu rendering

### Phase 6: Data Migration
1. **Create Migration Script** [scripts/migrate-existing-data.ts](scripts/migrate-existing-data.ts)
   - Create default "StraightForward (Legacy)" company
   - Assign all existing users to default company
   - Update all existing incident reports with default companyId
   - Provide instructions for promoting first SuperAdmin

## 📋 Deployment Checklist

### Before Deploying:
- [ ] Review all code changes
- [ ] Test in development environment
- [ ] Backup DynamoDB tables
- [ ] Backup Cognito user pool

### Deployment Steps:
1. **Deploy Amplify Backend**
   ```bash
   npx amplify sandbox
   ```

2. **Run Cognito Setup Script**
   ```bash
   npx tsx scripts/add-cognito-attributes.ts
   ```

3. **Create First Company** (via API or Data console)
   ```typescript
   // Example: Create StraightForward company
   {
     name: "StraightForward",
     domain: "straightforward.com",
     isActive: true,
     createdAt: new Date().toISOString()
   }
   ```

4. **Promote First SuperAdmin**
   ```bash
   aws cognito-idp admin-add-user-to-group \
     --user-pool-id <YOUR_POOL_ID> \
     --username <admin@email.com> \
     --group-name SuperAdmin
   ```

5. **Run Migration Script** (if you have existing data)
   ```bash
   npx tsx scripts/migrate-existing-data.ts
   ```

### After Deployment:
- [ ] Verify SuperAdmin can create companies
- [ ] Test SuperAdmin can create users in any company
- [ ] Test Admin can only create users in their company
- [ ] Test company-scoped report visibility
- [ ] Verify all users have companyId assigned

## 🏗️ Architecture Overview

### Authorization Matrix

| Role | View All Companies | Manage Companies | View All Users | Manage Users | View All Reports |
|------|-------------------|------------------|----------------|--------------|------------------|
| **SuperAdmin** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Admin** | ❌ No (own only) | ❌ No | ❌ No (company only) | ✅ Yes (company only) | ❌ No (company only) |
| **IncidentReporter** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No (own only) |
| **Customer** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No (permitted only) |

### Data Model Relationships

```
Company
├── id (Primary Key)
├── name
├── domain
├── settings (JSON)
└── users (via custom:companyId attribute)

User (Cognito)
├── email
├── custom:companyId → Company.id
├── custom:companyName
└── groups: [SuperAdmin | Admin | IncidentReporter | Customer]

IncidentReport
├── id (Primary Key)
├── companyId → Company.id
├── company (belongsTo relationship)
├── owner (Cognito sub)
└── ... (other fields)
```

### Key Design Decisions

1. **One Company Per User**: Users belong to exactly one company (simpler implementation)
2. **SuperAdmin is Global**: SuperAdmins don't need a company assignment
3. **Company in Cognito**: companyId stored as custom attribute for fast access
4. **Company in DynamoDB**: Full company data stored in Amplify Data for rich features
5. **Row-Level Security**: Authorization rules enforce company isolation at database level

## 🔒 Security Considerations

1. **Server-Side Validation**: All company access checks happen server-side
2. **JWT Token Claims**: Company info embedded in user's JWT for quick checks
3. **Authorization Rules**: Amplify Data authorization enforces multi-tenancy
4. **API Protection**: All admin APIs verify user's role and company access
5. **Audit Trail**: All SuperAdmin actions should be logged (future enhancement)

## 📝 Next Steps for Full Implementation

1. Complete remaining UI components (Users page, Companies page, Sidebar)
2. Create and test migration script
3. Add company column to reports table
4. Implement company-based S3 storage paths
5. Add company branding/theming support
6. Create admin dashboard with per-company analytics
7. Add company usage limits and billing integration

## 📚 Documentation References

- [Amplify Gen 2 Data Modeling](https://docs.amplify.aws/nextjs/build-a-backend/data/data-modeling/)
- [Amplify Authorization Rules](https://docs.amplify.aws/nextjs/build-a-backend/data/customize-authz/)
- [Cognito Custom Attributes](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html)
- [Cognito Groups](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-user-groups.html)

## 🆘 Troubleshooting

### Common Issues:

1. **Custom attributes not showing up**
   - Run `npx tsx scripts/add-cognito-attributes.ts` after deploying
   - Note: Custom attributes can only be added, not removed

2. **Authorization errors on Company model**
   - Ensure user is in SuperAdmin group
   - Check Amplify Data authorization rules deployed correctly

3. **Users can't be created with company**
   - Verify custom attributes exist in Cognito user pool
   - Check API route is receiving companyId parameter

4. **Company context not loading**
   - Ensure user has Admin or SuperAdmin role
   - Check API route `/api/admin/companies` is working
   - Verify authorization rules allow reading Company model

---

**Implementation Date**: January 2026
**Status**: 75% Complete
**Next Milestone**: Complete UI components and run migration
