import {
  downloadOfflinePublications,
  readOfflinePublications,
} from "@/server/recipes/offline-publications";
import {
  OFFLINE_LIMITS,
  PACKET_LIMIT,
  byteLength,
  readBoundedJson,
  syncRequestSchema,
} from "@/utils/offline-protocol";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
function json(value: unknown, status = 200) {
  const body = JSON.stringify(value);
  if (byteLength(body) > PACKET_LIMIT)
    return Response.json({ error: "Offline transfer limit exceeded." }, { status: 413, headers });
  return new Response(body, {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
export async function GET() {
  try {
    return json((await readOfflinePublications()).manifest);
  } catch {
    return json(
      {
        error:
          "Offline recipes could not be checked. The collection may be unavailable, invalid, or over the download limits. Try again later.",
      },
      503,
    );
  }
}
export async function POST(request: Request) {
  let input;
  try {
    input = syncRequestSchema.parse(await readBoundedJson(request, OFFLINE_LIMITS.request));
  } catch {
    return json({ error: "Invalid or oversized sync request." }, 400);
  }
  try {
    const result = await downloadOfflinePublications(input.revision, input.known);
    return result
      ? json(result)
      : json({ error: "Publications changed. Check for updates again." }, 409);
  } catch {
    return json(
      { error: "Offline recipes could not be downloaded. Your saved copy has not changed." },
      503,
    );
  }
}
