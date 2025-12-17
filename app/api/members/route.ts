
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

    // 尝试获取审计日志获取成员加入时间（仅企业版支持）
    let auditLogMap: Record<string, string> = {};
    try {
      // 使用审计日志 API 获取 org.add_member 事件
      const auditRes = await octokit.request("GET /orgs/{org}/audit-log", {
        org,
        phrase: "action:org.add_member",
        per_page: 100,
        headers: {
          'If-None-Match': '',
        }
      });
      // 构建用户名到加入时间的映射（取最早的记录）
      for (const entry of (auditRes.data as any[])) {
        const username = entry.user;
        const timestamp = entry.created_at || entry['@timestamp'];
        if (username && timestamp && !auditLogMap[username]) {
          auditLogMap[username] = new Date(typeof timestamp === 'number' ? timestamp : timestamp).toISOString();
        }
      }
    } catch {
      // 审计日志 API 可能不可用（需要企业版），忽略错误
    }

    // 获取每个成员的角色信息
    const membersWithDetails = await Promise.all(
      members.map(async (member) => {
        try {
          const membership = await octokit.request("GET /orgs/{org}/memberships/{username}", {
            org,
            username: member.login,
            headers: {
              'If-None-Match': '',
            }
          });
          return {
            ...member,
            joined_at: auditLogMap[member.login] || null,
            role: membership.data.role,
          };
        } catch {
          return {
            ...member,
            joined_at: auditLogMap[member.login] || null,
          };
        }
      })
    );

    // 添加响应头禁用缓存
    return new Response(JSON.stringify({ count: membersWithDetails.length, members: membersWithDetails }), {
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
