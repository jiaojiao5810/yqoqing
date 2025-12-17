
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

    // 获取所有成员（分页）
    const members: any[] = [];
    let page = 1;
    while (true) {
      const res = await octokit.request("GET /orgs/{org}/members", {
        org,
        per_page: 100,
        page,
        headers: {
          'If-None-Match': '',  // 禁用 ETag 缓存
        }
      });
      members.push(...res.data);
      if (res.data.length < 100) break;
      page++;
    }

    // 获取每个成员的加入时间（并行请求）
    const membersWithJoinDate = await Promise.all(
      members.map(async (member) => {
        try {
          const membership = await octokit.request("GET /orgs/{org}/memberships/{username}", {
            org,
            username: member.login,
            headers: {
              'If-None-Match': '',
            }
          });
          // membership API 返回中的角色和状态信息
          const data = membership.data as any;
          return {
            ...member,
            joined_at: data.created_at || null,
            role: data.role,
          };
        } catch {
          // 如果获取失败，返回原始数据
          return member;
        }
      })
    );

    // 添加响应头禁用缓存
    return new Response(JSON.stringify({ count: membersWithJoinDate.length, members: membersWithJoinDate }), {
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
