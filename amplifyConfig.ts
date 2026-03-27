import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito";
import { CookieStorage } from "aws-amplify/utils";
import type { Schema } from "@/amplify/data/resource";
import { getAmplifyRuntimeConfig } from "@/lib/amplify-runtime-config";

export function configureAmplify() {
  Amplify.configure(getAmplifyRuntimeConfig(), {
    ssr: true,
  });

  // Configure cookie storage for SSR
  if (typeof window !== 'undefined') {
    cognitoUserPoolsTokenProvider.setKeyValueStorage(
      new CookieStorage({
        domain: window.location.hostname,
        path: '/',
        secure: window.location.protocol === 'https:',
        sameSite: 'lax'
      })
    );
  }
}

export function getClient() {
  return generateClient<Schema>();
}
