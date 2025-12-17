
import { NextRequest } from "next/server";
import { Octokit } from "octokit";

export const dynamic = "force-dynamic";

type InviteBody = {
  token: string;
  org: string;
  identifiers: string[]; // usernames or emails
  role?: "admin" | "direct_member";
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as InviteBody;
    
    if (!body.token || !body.org) {
      return Response.json({ error: "token and org are required" }, { status: 400 });
    }

    const octokit = new Octokit({ auth: body.token });
    const org = body.org;
    const role = (process.env.GITHUB_DEFAULT_ROLE as "admin" | "direct_member") || body.role || "direct_member";

    if (!body?.identifiers?.length) {
      return Response.json({ error: "identifiers is required" }, { status: 400 });
    }

    const results: any[] = [];
    for (const raw of body.identifiers) {
      const id = raw.trim();
      if (!id) continue;

      try {
        if (id.includes("@")) {
          // Treat as email invite
          const res = await octokit.request("POST /orgs/{org}/invitations", {
            org,
            email: id,
            role
          });
          results.push({ identifier: id, ok: true, status: res.status });
        } else {
          // Treat as username -> get user id, then invite
          const user = await octokit.request("GET /users/{username}", { username: id });
          const invite = await octokit.request("POST /orgs/{org}/invitations", {
            org,
            invitee_id: user.data.id,
            role
          });
          results.push({ identifier: id, ok: true, status: invite.status });
        }
      } catch (err: any) {
        results.push({ identifier: id, ok: false, error: err.message });
      }
    }

    const okCount = results.filter(r => r.ok).length;
    return Response.json({ okCount, results }, { status: 200 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
