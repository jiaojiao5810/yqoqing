
import { NextRequest } from "next/server";
import { Octokit } from "octokit";

export const dynamic = "force-dynamic";

type InviteBody = {
  token: string;
  org: string;
  identifiers: string[]; // usernames or emails
  role?: "admin" | "direct_member";
};

// 解析 GitHub API 错误
function parseGitHubError(err: any, identifier: string): string {
  const status = err.status;
  const message = err.message || '';
  
  // 用户不存在
  if (status === 404) {
    return `用户 "${identifier}" 不存在`;
  }
  
  // 用户已被邀请或已是成员
  if (status === 422) {
    if (message.includes('already a member')) {
      return `"${identifier}" 已经是组织成员`;
    }
    if (message.includes('already been invited') || message.includes('pending invitation')) {
      return `"${identifier}" 已有待处理的邀请`;
    }
    if (message.includes('suspended') || message.includes('flagged')) {
      return `"${identifier}" 账号已被标记或暂停`;
    }
    if (message.includes('blocked')) {
      return `"${identifier}" 已被组织屏蔽`;
    }
    return `无法邀请 "${identifier}": ${message}`;
  }
  
  // 权限不足
  if (status === 403) {
    return `权限不足，无法邀请 "${identifier}"`;
  }
  
  // 速率限制
  if (status === 429) {
    return `请求过于频繁，请稍后再试`;
  }
  
  // 其他错误
  return message || `邀请 "${identifier}" 失败`;
}

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
          // 邮箱邀请
          const res = await octokit.request("POST /orgs/{org}/invitations", {
            org,
            email: id,
            role
          });
          results.push({ identifier: id, ok: true, status: res.status, message: '邀请已发送' });
        } else {
          // 用户名邀请 - 先检查用户是否存在
          try {
            const user = await octokit.request("GET /users/{username}", { username: id });
            
            // 发送邀请
            const invite = await octokit.request("POST /orgs/{org}/invitations", {
              org,
              invitee_id: user.data.id,
              role
            });
            results.push({ identifier: id, ok: true, status: invite.status, message: '邀请已发送' });
          } catch (userErr: any) {
            if (userErr.status === 404) {
              results.push({ identifier: id, ok: false, error: `用户 "${id}" 不存在` });
            } else {
              results.push({ identifier: id, ok: false, error: parseGitHubError(userErr, id) });
            }
          }
        }
      } catch (err: any) {
        results.push({ identifier: id, ok: false, error: parseGitHubError(err, id) });
      }
    }

    const okCount = results.filter(r => r.ok).length;
    return Response.json({ okCount, results }, { status: 200 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
