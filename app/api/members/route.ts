
import { NextRequest } from "next/server";
import { Octokit } from "octokit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // 优先从 headers 获取 token（更安全），兼容 query 参数
    const token = req.headers.get('x-github-token') || searchParams.get('token');
    const org = searchParams.get('org');

    if (!token || !org) {
      return Response.json({ error: "token and org are required" }, { status: 400 });
    }

    const octokit = new Octokit({ auth: token });

    const res = await octokit.request("GET /orgs/{org}/members", {
      org, per_page: 100
    });

    return Response.json({ count: res.data.length, members: res.data }, { status: 200 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
