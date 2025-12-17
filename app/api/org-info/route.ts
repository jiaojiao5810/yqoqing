
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

    // 尝试获取企业账单信息来判断试用状态
    let billingInfo = null;
    try {
      // 获取 Actions 计费信息（包含计划类型）
      const billingRes = await octokit.request("GET /orgs/{org}/settings/billing/actions", {
        org,
        headers: { 'If-None-Match': '' }
      });
      billingInfo = billingRes.data;
    } catch {
      // 可能没有权限
    }

    // 尝试获取企业试用信息（通过 GraphQL）
    let enterpriseTrial = null;
    try {
      const graphqlRes = await octokit.graphql(`
        query($org: String!) {
          organization(login: $org) {
            name
            login
            viewerCanAdminister
            enterprise {
              slug
              name
            }
            plan {
              name
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

    // 计算试用剩余天数（如果有 trial_ends_at 字段）
    let trialDaysRemaining = null;
    if (orgData.trial_ends_at) {
      const trialEnd = new Date(orgData.trial_ends_at);
      const now = new Date();
      const diffTime = trialEnd.getTime() - now.getTime();
      trialDaysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return new Response(JSON.stringify({
      name: orgData.name || orgData.login,
      login: orgData.login,
      description: orgData.description,
      type: orgData.type,
      plan: trialInfo,
      billing: billingInfo,
      enterprise: enterpriseTrial,
      trialEndsAt: orgData.trial_ends_at || null,
      trialDaysRemaining,
      isEnterprise: orgData.plan?.name === 'enterprise' || !!enterpriseTrial?.hasEnterprise,
      createdAt: orgData.created_at,
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
