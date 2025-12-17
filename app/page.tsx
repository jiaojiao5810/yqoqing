
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';

type Member = { 
  id: number; 
  login: string; 
  avatar_url?: string;
  joined_at?: string;  // 加入时间
  role?: string;       // 角色 (admin/member)
};
type Invitation = { 
  id: number; 
  email?: string; 
  login?: string; 
  invitee?: { login: string };
  created_at?: string;  // 邀请时间
};

type InviteResult = {
  identifier: string;
  ok: boolean;
  error?: string;
  message?: string;
};

type OrgConfig = {
  id: string;
  name: string;
  token: string;
  org: string;
};

type CopilotStatus = {
  status: 'normal' | 'disabled' | 'selected' | 'unknown';
  statusText: string;
  seats?: {
    total: number;
    active: number;
    pending: number;
  };
  error?: string;
};

type OrgInfo = {
  name?: string;
  login?: string;
  plan?: {
    name: string;
    seats?: number;
    filledSeats?: number;
  };
  isEnterprise?: boolean;
  trialEndsAt?: string;
  trialDaysRemaining?: number;
};

type OrgData = {
  loading: boolean;
  error?: string;
  membersCount: number;
  members: Member[];
  invitesCount: number;
  invitations: Invitation[];
  copilot?: CopilotStatus;
  orgInfo?: OrgInfo;
};

const STORAGE_KEY = 'gh-org-configs';

// 格式化时间
function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function Page() {
  // 组织配置列表
  const [orgConfigs, setOrgConfigs] = useState<OrgConfig[]>([]);
  // 每个组织的数据
  const [orgDataMap, setOrgDataMap] = useState<Record<string, OrgData>>({});
  // 当前选中的组织ID
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  // 新增组织表单
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newToken, setNewToken] = useState('');
  const [newOrg, setNewOrg] = useState('');
  // 邀请相关
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [inviteResults, setInviteResults] = useState<InviteResult[]>([]);
  // 展开的成员列表
  const [expandedMembers, setExpandedMembers] = useState<Record<string, boolean>>({});
  const [expandedInvites, setExpandedInvites] = useState<Record<string, boolean>>({});
  const [expandedFailed, setExpandedFailed] = useState<Record<string, boolean>>({});
  // 刷新状态
  const [refreshing, setRefreshing] = useState(false);

  // 从localStorage加载配置
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const configs = JSON.parse(saved) as OrgConfig[];
        setOrgConfigs(configs);
        if (configs.length > 0) {
          setActiveOrgId(configs[0].id);
        }
      } catch (e) {
        console.error('Failed to parse saved configs', e);
      }
    }
  }, []);

  // 保存配置到localStorage
  useEffect(() => {
    if (orgConfigs.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orgConfigs));
    }
  }, [orgConfigs]);

  // 刷新单个组织数据
  const refreshOrg = useCallback(async (config: OrgConfig) => {
    setOrgDataMap(prev => ({
      ...prev,
      [config.id]: { ...prev[config.id], loading: true, error: undefined, membersCount: 0, members: [], invitesCount: 0, invitations: [], copilot: undefined, orgInfo: undefined }
    }));

    try {
      // 添加时间戳强制绕过缓存
      const timestamp = Date.now();
      const params = new URLSearchParams({ org: config.org, _t: timestamp.toString() });
      const headers: HeadersInit = { 
        'x-github-token': config.token,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      };
      const [membersRes, invitesRes, copilotRes, orgInfoRes] = await Promise.all([
        fetch(`/api/members?${params}`, { cache: 'no-store', headers }),
        fetch(`/api/invitations?${params}`, { cache: 'no-store', headers }),
        fetch(`/api/copilot?${params}`, { cache: 'no-store', headers }),
        fetch(`/api/org-info?${params}`, { cache: 'no-store', headers }),
      ]);

      const membersData = await membersRes.json();
      const invitesData = await invitesRes.json();
      const copilotData = await copilotRes.json();
      const orgInfoData = await orgInfoRes.json();

      if (membersData.error) throw new Error(membersData.error);
      if (invitesData.error) throw new Error(invitesData.error);

      setOrgDataMap(prev => ({
        ...prev,
        [config.id]: {
          loading: false,
          membersCount: membersData.count ?? 0,
          members: membersData.members ?? [],
          invitesCount: invitesData.count ?? 0,
          invitations: invitesData.invitations ?? [],
          copilot: copilotData.error ? { status: 'unknown', statusText: copilotData.error } : copilotData,
          orgInfo: orgInfoData.error ? undefined : orgInfoData,
        }
      }));
    } catch (e: any) {
      setOrgDataMap(prev => ({
        ...prev,
        [config.id]: {
          loading: false,
          error: e.message,
          membersCount: 0,
          members: [],
          invitesCount: 0,
          invitations: [],
        }
      }));
    }
  }, []);

  // 刷新所有组织数据
  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    console.log('🔄 开始刷新所有组织数据...');
    await Promise.all(orgConfigs.map(config => refreshOrg(config)));
    console.log('✅ 刷新完成');
    setRefreshing(false);
  }, [orgConfigs, refreshOrg]);

  // 组织配置变化时刷新数据
  useEffect(() => {
    if (orgConfigs.length > 0) {
      refreshAll();
    }
  }, [orgConfigs.length]);

  // 添加新组织
  const addOrg = () => {
    if (!newName.trim() || !newToken.trim() || !newOrg.trim()) return;
    
    const newConfig: OrgConfig = {
      id: Date.now().toString(),
      name: newName.trim(),
      token: newToken.trim(),
      org: newOrg.trim(),
    };
    
    setOrgConfigs(prev => [...prev, newConfig]);
    setActiveOrgId(newConfig.id);
    setNewName('');
    setNewToken('');
    setNewOrg('');
    setShowAddForm(false);
    
    // 立即刷新新组织数据
    setTimeout(() => refreshOrg(newConfig), 100);
  };

  // 删除组织
  const removeOrg = (id: string) => {
    setOrgConfigs(prev => prev.filter(c => c.id !== id));
    setOrgDataMap(prev => {
      const newMap = { ...prev };
      delete newMap[id];
      return newMap;
    });
    if (activeOrgId === id) {
      const remaining = orgConfigs.filter(c => c.id !== id);
      setActiveOrgId(remaining.length > 0 ? remaining[0].id : null);
    }
    // 更新localStorage
    const remaining = orgConfigs.filter(c => c.id !== id);
    if (remaining.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const activeConfig = orgConfigs.find(c => c.id === activeOrgId);
  const activeData = activeOrgId ? orgDataMap[activeOrgId] : null;

  const toInvite = useMemo(() => {
    return input.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
  }, [input]);

  // 发送邀请
  async function sendInvites() {
    if (!activeConfig) return;
    
    setSending(true);
    setInviteResults([]);
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: activeConfig.token,
          org: activeConfig.org,
          identifiers: toInvite
        })
      });
      const data = await res.json();
      if (data?.results) {
        setInviteResults(data.results);
      }
      // 延迟 1 秒后刷新，确保 GitHub API 数据已更新
      setTimeout(() => refreshOrg(activeConfig), 1000);
      // 清空输入框
      if (data?.okCount > 0) {
        setInput('');
      }
    } catch (e: any) {
      setInviteResults([{ identifier: '请求', ok: false, error: e.message }]);
    } finally {
      setSending(false);
    }
  }

  // 成功和失败的邀请结果
  const successResults = inviteResults.filter(r => r.ok);
  const failedResults = inviteResults.filter(r => !r.ok);

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-6xl grid gap-6">
        <header className="flex items-end justify-between">
          <h1 className="text-2xl md:text-3xl font-semibold">GitHub 多组织邀请管理</h1>
          <button
            onClick={refreshAll}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-sm transition"
          >
            {refreshing ? '⏳ 刷新中...' : '🔄 刷新全部'}
          </button>
        </header>

        {/* 组织配置区域 */}
        <section className="rounded-2xl bg-[var(--card)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">组织配置</h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm transition"
            >
              {showAddForm ? '取消' : '➕ 添加组织'}
            </button>
          </div>

          {/* 添加组织表单 */}
          {showAddForm && (
            <div className="mb-4 p-4 rounded-xl bg-gray-100 border border-gray-300">
              <div className="grid gap-3">
                <div>
                  <label className="text-sm text-[var(--muted)] block mb-1">显示名称</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="例如：我的公司"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-gray-300 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--muted)] block mb-1">GitHub Token</label>
                  <input
                    type="password"
                    value={newToken}
                    onChange={e => setNewToken(e.target.value)}
                    placeholder="ghp_xxxx... (需要 admin:org 权限)"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-gray-300 outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--muted)] block mb-1">组织名称 (Organization Name)</label>
                  <input
                    type="text"
                    value={newOrg}
                    onChange={e => setNewOrg(e.target.value)}
                    placeholder="例如：my-company"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-gray-300 outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <button
                  onClick={addOrg}
                  disabled={!newName.trim() || !newToken.trim() || !newOrg.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition"
                >
                  保存组织配置
                </button>
              </div>
            </div>
          )}

          {/* 组织列表/选项卡 */}
          {orgConfigs.length === 0 ? (
            <div className="text-center py-8 text-[var(--muted)]">
              <p>暂无组织配置</p>
              <p className="text-sm mt-2">点击上方「添加组织」按钮开始配置</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {orgConfigs.map(config => {
                const data = orgDataMap[config.id];
                const isActive = config.id === activeOrgId;
                const copilotStatus = data?.copilot?.status;
                return (
                  <div
                    key={config.id}
                    className={`relative group rounded-xl px-4 py-3 cursor-pointer transition border-2 ${
                      isActive 
                        ? 'bg-blue-100 border-blue-500' 
                        : 'bg-gray-100 border-gray-200 hover:bg-gray-200'
                    }`}
                    onClick={() => setActiveOrgId(config.id)}
                  >
                    <div className="font-medium">{config.name}</div>
                    <div className="text-xs text-[var(--muted)] font-mono">{config.org}</div>
                    {data && !data.loading && !data.error && (
                      <div className="text-xs mt-1 flex flex-col gap-1">
                        <div className="flex gap-2">
                          <span className="text-green-600">👥 {data.membersCount}</span>
                          <span className="text-yellow-600">⏳ {data.invitesCount}</span>
                        </div>
                        {copilotStatus && (
                          <span className={`${
                            copilotStatus === 'normal' ? 'text-green-600' : 
                            copilotStatus === 'disabled' ? 'text-red-600' : 'text-yellow-600'
                          }`}>
                            {copilotStatus === 'normal' ? '✅ Copilot' : 
                             copilotStatus === 'disabled' ? '❌ Copilot' : '⚠️ Copilot'}
                          </span>
                        )}
                      </div>
                    )}
                    {data?.loading && (
                      <div className="text-xs mt-1 text-[var(--muted)]">加载中...</div>
                    )}
                    {data?.error && (
                      <div className="text-xs mt-1 text-red-400">错误</div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeOrg(config.id); }}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-600 text-white text-xs opacity-0 group-hover:opacity-100 transition"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 当前选中组织的详情 */}
        {activeConfig && activeData && (
          <>
            {activeData.error ? (
              <section className="rounded-2xl bg-red-900/30 border border-red-500/50 p-5">
                <h2 className="text-lg font-medium text-red-400 mb-2">❌ 加载失败</h2>
                <p className="text-sm">{activeData.error}</p>
                <p className="text-xs text-[var(--muted)] mt-2">请检查 Token 权限或组织名称是否正确</p>
              </section>
            ) : (
              <>
                {/* 统计卡片 */}
                {/* Copilot 状态卡片 */}
                <section className={`rounded-2xl p-5 border-2 ${
                  activeData.copilot?.status === 'normal' 
                    ? 'bg-green-50 border-green-500' 
                    : activeData.copilot?.status === 'disabled'
                    ? 'bg-red-50 border-red-500'
                    : 'bg-yellow-50 border-yellow-500'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-[var(--muted)]">GitHub Copilot 状态</div>
                      <div className={`text-xl font-bold mt-1 ${
                        activeData.copilot?.status === 'normal' 
                          ? 'text-green-600' 
                          : activeData.copilot?.status === 'disabled'
                          ? 'text-red-600'
                          : 'text-yellow-600'
                      }`}>
                        {activeData.loading ? '检测中...' : (
                          activeData.copilot?.status === 'normal' ? '✅ 正常 (All members)' :
                          activeData.copilot?.status === 'disabled' ? '❌ 已禁用 (Disabled)' :
                          activeData.copilot?.status === 'selected' ? '⚠️ 部分成员 (Selected)' :
                          '❓ 未知状态'
                        )}
                      </div>
                      {activeData.copilot?.statusText && (
                        <div className="text-sm text-[var(--muted)] mt-1">
                          {activeData.copilot.statusText}
                        </div>
                      )}
                    </div>
                    {activeData.copilot?.seats && (
                      <div className="text-right">
                        <div className="text-2xl font-bold">{activeData.copilot.seats.total}</div>
                        <div className="text-xs text-[var(--muted)]">Copilot 席位</div>
                        <div className="text-xs text-[var(--muted)]">
                          活跃: {activeData.copilot.seats.active} | 待处理: {activeData.copilot.seats.pending}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* 企业版试用状态卡片 */}
                {activeData.orgInfo?.trialDaysRemaining !== undefined && activeData.orgInfo?.trialDaysRemaining !== null && (
                  <section className={`rounded-2xl p-5 border-2 ${
                    activeData.orgInfo.trialDaysRemaining > 14 
                      ? 'bg-blue-50 border-blue-500' 
                      : activeData.orgInfo.trialDaysRemaining > 7
                      ? 'bg-yellow-50 border-yellow-500'
                      : 'bg-red-50 border-red-500'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-[var(--muted)]">GitHub Enterprise 试用</div>
                        <div className={`text-xl font-bold mt-1 ${
                          activeData.orgInfo.trialDaysRemaining > 14 
                            ? 'text-blue-600' 
                            : activeData.orgInfo.trialDaysRemaining > 7
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        }`}>
                          {activeData.orgInfo.trialDaysRemaining > 0 
                            ? `⏰ 剩余 ${activeData.orgInfo.trialDaysRemaining} 天`
                            : '❌ 试用已过期'
                          }
                        </div>
                        {activeData.orgInfo.trialEndsAt && (
                          <div className="text-sm text-[var(--muted)] mt-1">
                            到期时间: {formatDate(activeData.orgInfo.trialEndsAt)}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-4xl">🏢</div>
                        <div className="text-xs text-[var(--muted)]">
                          {activeData.orgInfo.plan?.name || 'Enterprise'}
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* 统计卡片 */}
                <section className="grid sm:grid-cols-3 gap-4">
                  <div className="rounded-2xl bg-[var(--card)] p-5">
                    <div className="text-sm text-[var(--muted)]">组织成员</div>
                    <div className="text-4xl font-bold mt-1">
                      {activeData.loading ? '...' : activeData.membersCount}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[var(--card)] p-5">
                    <div className="text-sm text-[var(--muted)]">待邀请人数</div>
                    <div className="text-4xl font-bold mt-1">{toInvite.length}</div>
                  </div>
                  <div className="rounded-2xl bg-[var(--card)] p-5">
                    <div className="text-sm text-[var(--muted)]">未接受邀请</div>
                    <div className="text-4xl font-bold mt-1">
                      {activeData.loading ? '...' : activeData.invitesCount}
                    </div>
                  </div>
                </section>

                {/* 成员列表 */}
                <section className="rounded-2xl bg-[var(--card)] p-5">
                  <div 
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedMembers(prev => ({ ...prev, [activeOrgId!]: !prev[activeOrgId!] }))}
                  >
                    <h2 className="text-lg font-medium">
                      👥 组织成员列表 ({activeData.membersCount})
                    </h2>
                    <span className="text-[var(--muted)]">
                      {expandedMembers[activeOrgId!] ? '收起 ▲' : '展开 ▼'}
                    </span>
                  </div>
                  {expandedMembers[activeOrgId!] && (
                    <div className="mt-4 grid gap-2 max-h-80 overflow-y-auto">
                      {activeData.members.length === 0 ? (
                        <div className="text-[var(--muted)]">暂无成员</div>
                      ) : (
                        activeData.members.map((member) => (
                          <div key={member.id} className="flex items-center justify-between bg-gray-100 rounded-xl p-3">
                            <div className="flex items-center gap-3">
                              {member.avatar_url && (
                                <img src={member.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                              )}
                              <div>
                                <a
                                  href={`https://github.com/${member.login}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-blue-600 hover:underline"
                                >
                                  {member.login}
                                </a>
                                {member.role === 'admin' && (
                                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-purple-100 text-purple-600 rounded">
                                    管理员
                                  </span>
                                )}
                              </div>
                            </div>
                            {member.joined_at && (
                              <div className="text-right text-xs text-[var(--muted)]">
                                📅 {formatDate(member.joined_at)}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </section>

                {/* 未接受邀请列表 */}
                <section className="rounded-2xl bg-[var(--card)] p-5">
                  <div 
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedInvites(prev => ({ ...prev, [activeOrgId!]: !prev[activeOrgId!] }))}
                  >
                    <h2 className="text-lg font-medium">
                      ⏳ 未接受的邀请 ({activeData.invitesCount})
                    </h2>
                    <span className="text-[var(--muted)]">
                      {expandedInvites[activeOrgId!] ? '收起 ▲' : '展开 ▼'}
                    </span>
                  </div>
                  {expandedInvites[activeOrgId!] && (
                    <div className="mt-4 grid gap-2 max-h-80 overflow-y-auto">
                      {activeData.invitations.length === 0 ? (
                        <div className="text-[var(--muted)]">暂无待处理邀请</div>
                      ) : (
                        activeData.invitations.map((inv) => (
                          <div key={inv.id} className="flex items-center justify-between bg-gray-100 rounded-xl p-3">
                            <div className="font-mono">
                              {inv.login || inv.email || inv.invitee?.login || '(unknown)'}
                            </div>
                            <div className="text-right">
                              <span className="text-xs text-[var(--muted)]">ID: {inv.id}</span>
                              {inv.created_at && (
                                <div className="text-xs text-[var(--muted)]">
                                  📅 {formatDate(inv.created_at)}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </section>

                {/* 失败的邀请 */}
                {failedResults.length > 0 && (
                  <section className="rounded-2xl bg-red-50 border border-red-200 p-5">
                    <div 
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedFailed(prev => ({ ...prev, [activeOrgId!]: !prev[activeOrgId!] }))}
                    >
                      <h2 className="text-lg font-medium text-red-600">
                        ❌ 失败的邀请 ({failedResults.length})
                      </h2>
                      <span className="text-red-400">
                        {expandedFailed[activeOrgId!] ? '收起 ▲' : '展开 ▼'}
                      </span>
                    </div>
                    {expandedFailed[activeOrgId!] && (
                      <div className="mt-4 grid gap-2 max-h-60 overflow-y-auto">
                        {failedResults.map((result, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-red-100 rounded-xl p-3">
                            <div className="font-mono text-red-700">{result.identifier}</div>
                            <div className="text-sm text-red-600">{result.error}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {/* 邀请表单 */}
                <section className="rounded-2xl bg-[var(--card)] p-5">
                  <h2 className="text-lg font-medium mb-3">📨 发送邀请到 {activeConfig.name}</h2>
                  <p className="text-sm text-[var(--muted)] mb-3">输入 GitHub 用户名或邮箱，支持批量（空格、逗号、分号分隔）</p>
                  <textarea
                    className="w-full h-28 rounded-xl bg-white border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例如：octocat alice@example.com bob"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                  />
                  <div className="flex items-center justify-between mt-3">
                    <div className="text-sm text-[var(--muted)] truncate max-w-md">
                      待邀请：{toInvite.join(', ') || '（无）'}
                    </div>
                    <button
                      onClick={sendInvites}
                      disabled={sending || toInvite.length === 0}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition"
                    >
                      {sending ? '发送中…' : `发送邀请 (${toInvite.length})`}
                    </button>
                  </div>
                  
                  {/* 邀请结果显示 */}
                  {inviteResults.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {/* 成功的邀请 */}
                      {successResults.length > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                          <div className="text-sm font-medium text-green-700 mb-2">
                            ✅ 成功邀请 ({successResults.length})
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {successResults.map((r, i) => (
                              <span key={i} className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm">
                                {r.identifier}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* 失败的邀请摘要 */}
                      {failedResults.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                          <div className="text-sm font-medium text-red-700 mb-2">
                            ❌ 邀请失败 ({failedResults.length})
                          </div>
                          <div className="space-y-1">
                            {failedResults.map((r, i) => (
                              <div key={i} className="text-sm text-red-600">
                                <span className="font-mono">{r.identifier}</span>: {r.error}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* 清除结果按钮 */}
                      <button
                        onClick={() => setInviteResults([])}
                        className="text-sm text-gray-500 hover:text-gray-700"
                      >
                        清除结果
                      </button>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}

        {/* 所有组织总览 */}
        {orgConfigs.length > 1 && (
          <section className="rounded-2xl bg-[var(--card)] p-5">
            <h2 className="text-lg font-medium mb-4">📊 所有组织总览</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left py-2 px-3">组织</th>
                    <th className="text-center py-2 px-3">成员数</th>
                    <th className="text-center py-2 px-3">待接受</th>
                    <th className="text-center py-2 px-3">Copilot</th>
                    <th className="text-center py-2 px-3">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {orgConfigs.map(config => {
                    const data = orgDataMap[config.id];
                    return (
                      <tr 
                        key={config.id} 
                        className="border-b border-gray-200 hover:bg-gray-100 cursor-pointer"
                        onClick={() => setActiveOrgId(config.id)}
                      >
                        <td className="py-2 px-3">
                          <div className="font-medium">{config.name}</div>
                          <div className="text-xs text-[var(--muted)] font-mono">{config.org}</div>
                        </td>
                        <td className="text-center py-2 px-3">
                          {data?.loading ? '...' : data?.membersCount ?? '-'}
                        </td>
                        <td className="text-center py-2 px-3">
                          {data?.loading ? '...' : data?.invitesCount ?? '-'}
                        </td>
                        <td className="text-center py-2 px-3">
                          {data?.loading ? (
                            <span className="text-yellow-600">⏳</span>
                          ) : data?.copilot?.status === 'normal' ? (
                            <span className="text-green-600">✅ 正常</span>
                          ) : data?.copilot?.status === 'disabled' ? (
                            <span className="text-red-600">❌ 禁用</span>
                          ) : data?.copilot?.status === 'selected' ? (
                            <span className="text-yellow-600">⚠️ 部分</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="text-center py-2 px-3">
                          {data?.loading ? (
                            <span className="text-yellow-600">⏳</span>
                          ) : data?.error ? (
                            <span className="text-red-600">❌</span>
                          ) : (
                            <span className="text-green-600">✅</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
