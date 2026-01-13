import { defineStorage } from "@aws-amplify/backend";

export const storage = defineStorage({
  name: "incidentReportStorage",
  access: (allow) => ({
    "incident-photos/*": [
      // All authenticated users can read, write, and delete
      allow.authenticated.to(["read", "write", "delete"]),
      // Explicitly grant access to all groups including SuperAdmin
      allow.groups(["SuperAdmin", "Admin", "IncidentReporter", "Customer"]).to(["read", "write", "delete"]),
      // Allow guests (unauthenticated users) to upload public photos
      allow.guest.to(["write"]),
    ],
  }),
});