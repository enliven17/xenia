import { useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";

const REQUEST_EVENT = "XENIA_REQUEST_AUTH_TOKEN";
const RESPONSE_EVENT = "XENIA_AUTH_TOKEN";

interface RequestPayload {
  type: typeof REQUEST_EVENT;
  requestId?: string;
}

function isRequest(data: unknown): data is RequestPayload {
  return (
    !!data &&
    typeof data === "object" &&
    "type" in data &&
    (data as { type: unknown }).type === REQUEST_EVENT
  );
}

export function ExtensionAuthBridge() {
  const { authenticated, getAccessToken, user } = usePrivy();

  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (event.source !== window) return;
      if (!isRequest(event.data)) return;

      try {
        const token = authenticated ? await getAccessToken() : null;
        window.postMessage(
          {
            type: RESPONSE_EVENT,
            requestId: event.data.requestId,
            token,
            authenticated,
            privyId: user?.id ?? null,
          },
          window.location.origin,
        );
      } catch (error) {
        window.postMessage(
          {
            type: RESPONSE_EVENT,
            requestId: event.data.requestId,
            token: null,
            authenticated: false,
            error: error instanceof Error ? error.message : "Failed to get token",
          },
          window.location.origin,
        );
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [authenticated, getAccessToken, user?.id]);

  return null;
}
