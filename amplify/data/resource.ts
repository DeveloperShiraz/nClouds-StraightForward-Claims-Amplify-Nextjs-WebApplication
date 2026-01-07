import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

/*=================================================================

//! Modeling relationships: https://docs.amplify.aws/nextjs/build-a-backend/data/data-modeling/relationships/

=========================================================================*/


/*== STEP 1 ===============================================================
The section below creates a Todo database table with a "content" field. Try
adding a new "isDone" field as a boolean. The authorization rule below
specifies that any user authenticated via an API key can "create", "read",
"update", and "delete" any "Todo" records.
=========================================================================*/
const schema = a.schema({
  Todo: a
    .model({
      content: a.string(),
    })
    .authorization((allow) => [allow.authenticated()]),

  Company: a
    .model({
      name: a.string().required(),
      domain: a.string(),
      logoUrl: a.string(),
      settings: a.json(),
      isActive: a.boolean().default(true),
      createdAt: a.datetime(),
      maxUsers: a.integer(),
      updatedAt: a.datetime(),
      // Removed hasMany relationship to allow optional companyId in IncidentReport
    })
    .authorization((allow) => [
      // SuperAdmins can do everything with companies
      allow.group("SuperAdmin"),
      // Company Admins can only read their own company
      allow.groups(["Admin", "IncidentReporter", "Customer"]).to(["read"]),
      // Temporary: allow any authenticated user to read (for debugging)
      allow.authenticated().to(["read"]),
      // Allow public access for the public form (unauthenticated users)
      allow.guest().to(["read"]), // Guests need to read company details to validate the form
    ]),

  IncidentReport: a
    .model({
      claimNumber: a.string().required(),
      companyId: a.id(), // Optional - allows standalone reports not tied to a company
      // Removed belongsTo relationship to allow null companyId
      companyName: a.string(),
      firstName: a.string().required(),
      lastName: a.string().required(),
      phone: a.string().required(),
      email: a.email().required(),
      address: a.string().required(),
      apartment: a.string(),
      city: a.string().required(),
      state: a.string().required(),
      zip: a.string().required(),
      incidentDate: a.date().required(),
      description: a.string().required(),
      shingleExposure: a.float(), // Shingle exposure in inches
      photoUrls: a.string().array(), // Store S3 URLs of uploaded photos
      status: a.enum(["submitted", "in_review", "resolved"]),
      submittedAt: a.datetime(),
      submittedBy: a.string(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
    })
    .authorization((allow) => [
      // SuperAdmins can do everything across all companies
      allow.group("SuperAdmin"),
      // Admins can do everything within their company
      allow.group("Admin"),
      // IncidentReporters can create and manage their own reports
      allow.group("IncidentReporter").to(["create", "read", "update"]),
      allow.owner().to(["read", "update", "delete"]),
      // Customers can only read reports
      allow.group("Customer").to(["read"]),
      // Allow public submission (unauthenticated users)
      allow.guest().to(["create"]),
    ]),

  // User Type for the custom queries
  User: a.customType({
    username: a.string().required(),
    email: a.string(),
    emailVerified: a.boolean(),
    status: a.string(),
    enabled: a.boolean(),
    createdAt: a.datetime(),
    groups: a.string().array(),
    companyId: a.string(),
    companyName: a.string(),
  }),

  // Custom queries to list and create users using the adminActions function
  listUsers: a
    .query()
    .returns(a.ref("User").array())
    .handler(a.handler.function("adminActions"))
    .authorization((allow) => [allow.group("SuperAdmin")]),

  createUser: a
    .mutation()
    .arguments({
      email: a.string().required(),
      tempPassword: a.string().required(),
      group: a.string().required(),
      companyId: a.string(),
      companyName: a.string(),
    })
    .returns(a.ref("User"))
    .handler(a.handler.function("adminActions"))
    .authorization((allow) => [allow.group("SuperAdmin")]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
    // API Key is used for a.allow.public() rules
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
  },
});


/*== STEP 2 ===============================================================
Go to your frontend source code. From your client-side code, generate a
Data client to make CRUDL requests to your table. (THIS SNIPPET WILL ONLY
WORK IN THE FRONTEND CODE FILE.)

Using JavaScript or Next.js React Server Components, Middleware, Server
Actions or Pages Router? Review how to generate Data clients for those use
cases: https://docs.amplify.aws/gen2/build-a-backend/data/connect-to-API/
=========================================================================*/

/*
"use client"
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>() // use this Data client for CRUDL requests
*/

/*== STEP 3 ===============================================================
Fetch records from the database and use them in your frontend component.
(THIS SNIPPET WILL ONLY WORK IN THE FRONTEND CODE FILE.)
=========================================================================*/

/* For example, in a React component, you can use this snippet in your
  function's RETURN statement */
// const { data: todos } = await client.models.Todo.list()

// return <ul>{todos.map(todo => <li key={todo.id}>{todo.content}</li>)}</ul>