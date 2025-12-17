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

    // 获取组织 Copilot 计费/设置信息
    const res = await octokit.request("GET /orgs/{org}/copilot/billing", {
      org,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
        'If-None-Match': '',  // 禁用 ETag 缓存
      }
    });

    // seat_management_setting 的值:
    // - "assign_all" = All members of the organization (正常)
    // - "disabled" = Disabled (异常)
    // - "assign_selected" = Selected members
    const setting = res.data.seat_management_setting;
    const seatBreakdown = res.data.seat_breakdown;

    let status: 'normal' | 'disabled' | 'selected' = 'disabled';
    let statusText = 'Disabled';

    if (setting === 'assign_all') {
      status = 'normal';
      statusText = 'All members of the organization';
    } else if (setting === 'assign_selected') {
      status = 'selected';
      statusText = 'Selected members';
    } else {
      status = 'disabled';
      statusText = 'Disabled';
    }

    // 添加响应头禁用缓存
    return new Response(JSON.stringify({
      status,
      statusText,
      setting,
      seats: {
        total: seatBreakdown?.total ?? 0,
        active: seatBreakdown?.active_this_cycle ?? 0,
        pending: seatBreakdown?.pending_invitation ?? 0,
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (e: any) {
    // 如果是 404，可能是组织没有启用 Copilot
    if (e.status === 404) {
      return new Response(JSON.stringify({
        status: 'disabled',
        statusText: 'Copilot not enabled',
        error: 'Copilot is not enabled for this organization'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      });
    }
    return Response.json({ error: e.message }, { status: 500 });
  }
}
