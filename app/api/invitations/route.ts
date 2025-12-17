
import { NextRequest } from "next/server";
import { Octokit } from "octokit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

    // 获取所有邀请（分页）
    const invitations: any[] = [];
    let page = 1;
    while (true) {
      const res = await octokit.request("GET /orgs/{org}/invitations", {
        org,
        per_page: 100,
        page,
        headers: {
          'If-None-Match': '',  // 禁用 ETag 缓存
        }
      });
      invitations.push(...res.data);
      if (res.data.length < 100) break;
      page++;
    }

    // 添加响应头禁用缓存
    return new Response(JSON.stringify({ count: invitations.length, invitations }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
