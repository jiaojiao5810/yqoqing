
import { NextRequest } from "next/server";
import { Octokit } from "octokit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = req.headers.get('x-github-token') || searchParams.get('token');
    const org = searchParams.get('org');

    if (!token || !org) {
      return Response.json({ error: "token and org are required" }, { status: 400 });
    }

    const octokit = new Octokit({ auth: token });

    // 获取组织信息
    const orgRes = await octokit.request("GET /orgs/{org}", {
      org,
      headers: {
        'If-None-Match': '',
      }
    });

    const orgData = orgRes.data as any;

    // 获取企业版/试用相关信息
    let trialInfo = null;
    
    // 检查组织计划信息
    if (orgData.plan) {
      trialInfo = {
        plan: orgData.plan.name,
        seats: orgData.plan.seats,
        filledSeats: orgData.plan.filled_seats,
      };
    }

    // 尝试通过 GraphQL 获取企业试用信息
    let enterpriseTrial = null;
    let trialDaysRemaining: number | null = null;
    let trialEndsAt: string | null = null;
    
    try {
      // 使用 GraphQL 查询组织的企业信息和试用状态
      const graphqlRes = await octokit.graphql(`
        query($org: String!) {
          organization(login: $org) {
            name
            login
            viewerCanAdminister
            isVerified
            enterprise {
              slug
              name
              billingInfo {
                allLicensableUsersCount
              }
            }
          }
        }
      `, { org }) as any;
      
      if (graphqlRes.organization?.enterprise) {
        enterpriseTrial = {
          hasEnterprise: true,
          enterpriseName: graphqlRes.organization.enterprise.name,
          enterpriseSlug: graphqlRes.organization.enterprise.slug,
        };
      }
    } catch {
      // GraphQL 查询失败
    }

    // 尝试通过 Copilot API 获取试用信息
    try {
      const copilotRes = await octokit.request("GET /orgs/{org}/copilot/billing", {
        org,
        headers: { 'If-None-Match': '' }
      });
      const copilotData = copilotRes.data as any;
      
      // Copilot billing 可能包含企业试用信息
      if (copilotData.plan_type === 'business' || copilotData.plan_type === 'enterprise') {
        // 检查是否有 next_billing_date 来推断试用状态
        if (copilotData.next_billing_date) {
          const billingDate = new Date(copilotData.next_billing_date);
          const now = new Date();
          // 如果计费日期在未来很远，可能是试用
          const diffDays = Math.ceil((billingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 0 && diffDays <= 60) {
            // 可能是试用期
            trialEndsAt = copilotData.next_billing_date;
            trialDaysRemaining = diffDays;
          }
        }
      }
    } catch {
      // Copilot API 不可用
    }

    // 检查 orgData 中的 trial_ends_at（如果存在）
    if (orgData.trial_ends_at) {
      const trialEnd = new Date(orgData.trial_ends_at);
      const now = new Date();
      const diffTime = trialEnd.getTime() - now.getTime();
      trialDaysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      trialEndsAt = orgData.trial_ends_at;
    }

    // 从组织名称推断试用状态（用户在名称中标注了"试用"）
    const orgName = orgData.name || orgData.login || '';
    const configName = searchParams.get('configName') || '';
    const isTrial = orgName.includes('试用') || orgName.includes('trial') || 
                    configName.includes('试用') || orgData.plan?.name === 'enterprise';

    return new Response(JSON.stringify({
      name: orgData.name || orgData.login,
      login: orgData.login,
      description: orgData.description,
      type: orgData.type,
      plan: trialInfo,
      enterprise: enterpriseTrial,
      trialEndsAt,
      trialDaysRemaining,
      isEnterprise: orgData.plan?.name === 'enterprise' || !!enterpriseTrial?.hasEnterprise,
      isTrial,
      createdAt: orgData.created_at,
      // 返回原始数据供调试
      _raw: {
        plan: orgData.plan,
        trial_ends_at: orgData.trial_ends_at,
        two_factor_requirement_enabled: orgData.two_factor_requirement_enabled,
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
