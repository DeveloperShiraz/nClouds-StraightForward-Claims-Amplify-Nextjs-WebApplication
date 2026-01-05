import { generateServerClientUsingCookies } from "@aws-amplify/adapter-nextjs/data";
import { cookies } from "next/headers";
import type { Schema } from "@/amplify/data/resource";
import outputs from "@/amplify_outputs.json";

export function createServerClient() {
  return generateServerClientUsingCookies<Schema>({
    config: outputs,
    cookies,
  });
}

// Legacy export for backwards compatibility
export const cookieBasedClient = createServerClient();
