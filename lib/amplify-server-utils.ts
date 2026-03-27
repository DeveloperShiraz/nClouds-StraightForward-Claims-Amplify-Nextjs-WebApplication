import { createServerRunner } from "@aws-amplify/adapter-nextjs";
import { generateServerClientUsingCookies, generateServerClientUsingReqRes } from "@aws-amplify/adapter-nextjs/data";
import { cookies } from "next/headers";
import type { Schema } from "@/amplify/data/resource";
import { getAmplifyRuntimeConfig } from "@/lib/amplify-runtime-config";

const runtimeConfig = getAmplifyRuntimeConfig();

export const { runWithAmplifyServerContext } = createServerRunner({
  config: runtimeConfig,
});

// For use in Server Components - uses cookies-based authentication
export async function createServerClient() {
  return generateServerClientUsingCookies<Schema>({
    config: runtimeConfig,
    cookies,
  });
}

// For use in API Routes - uses request/response based authentication
// Added optional authMode parameter to support public/guest access
export function createApiClient(contextSpec: any, authMode?: 'userPool' | 'identityPool' | 'apiKey' | 'oidc' | 'iam') {
  return generateServerClientUsingReqRes<Schema>({
    config: runtimeConfig,
    authMode: authMode,
    ...contextSpec,
  });
}
