import React, { useEffect, useState } from 'react';
import { LogOut, Activity, Database, CheckCircle, Zap, Clock, BarChart3 } from 'lucide-react';

interface LogEntry {
  id: number;
  timestamp: string;
  token_burn: number;
  confidence_score: number;
  status: string;
  task_prompt: string;
  rounds_taken?: number;
}

interface AgentBreakdown {
  name: string;
  totalTokens: number;
  avgConfidence: number;
  avgLatency: number;
  totalCalls: number;
  approveCount: number;
  rejectCount: number;
}

interface AgentHistoryLog {
  agent_name: string;
  latency_ms: number;
  tokens_used: number;
  vote: string;
  timestamp: string;
}

interface StatsData {
  history: LogEntry[];
  agentHistory: AgentHistoryLog[];
  totalTokens: number;
  avgConfidence: number;
  totalDeliberations: number;
  approveRate: number;
  rejectRate: number;
  amendRate: number;
  efficiencyStats: { one_round_consensus: number, multi_round_struggle: number };
  totalRounds: number;
  agentBreakdown: AgentBreakdown[];
}

export default function Dashboard({ setToken }: { setToken: (t: string | null) => void }) {
  const [stats, setStats] = useState<StatsData>({
    history: [],
    agentHistory: [],
    totalTokens: 0,
    avgConfidence: 0,
    totalDeliberations: 0,
    approveRate: 0,
    rejectRate: 0,
    amendRate: 0,
    efficiencyStats: { one_round_consensus: 0, multi_round_struggle: 0 },
    totalRounds: 0,
    agentBreakdown: []
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const host = import.meta.env.VITE_BACKEND_HOST || 'http://localhost:4000';
        const res = await fetch(`${host}/api/telemetry/stats`);
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error("Failed to fetch telemetry", err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('dashboard_token');
    setToken(null);
  };

  const agentColors: Record<string, { bg: string; text: string; border: string; glow: string }> = {
    'Llama-3.3-70B': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', glow: 'bg-blue-500/5' },
    'Llama-3.1-8B': { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', glow: 'bg-purple-500/5' },
    'Qwen-27B': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20', glow: 'bg-cyan-500/5' },
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] p-6 selection:bg-amber-500 selection:text-black font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-10 pb-6 border-b border-zinc-800">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-black shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <Activity size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                SigNoz <span className="text-zinc-500 font-normal">Telemetry</span>
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <p className="text-xs text-emerald-500 font-mono tracking-widest uppercase">Live Connection Active</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-xl hover:text-white hover:border-zinc-600 transition-all duration-200"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>

        {/* Stats Grid — Top Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
          <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-6 relative overflow-hidden group hover:border-zinc-700 transition-colors">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition-colors"></div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <Database size={16} className="text-zinc-400" />
              </div>
              <h3 className="text-sm font-medium text-zinc-400">Deliberations</h3>
            </div>
            <p className="text-white font-bold text-3xl">{stats.totalDeliberations}</p>
          </div>

          <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-6 relative overflow-hidden group hover:border-zinc-700 transition-colors">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl group-hover:bg-amber-500/20 transition-colors"></div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Zap size={16} className="text-amber-400" />
              </div>
              <h3 className="text-sm font-medium text-zinc-400">Tokens Burned</h3>
            </div>
            <p className="font-bold text-3xl text-white">{stats.totalTokens.toLocaleString()}</p>
          </div>

          <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-6 relative overflow-hidden group hover:border-zinc-700 transition-colors">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-colors"></div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle size={16} className="text-emerald-400" />
              </div>
              <h3 className="text-sm font-medium text-zinc-400">Avg Confidence</h3>
            </div>
            <p className="text-emerald-400 font-bold text-3xl">{stats.avgConfidence}%</p>
          </div>

          <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-6 relative overflow-hidden group hover:border-zinc-700 transition-colors">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl group-hover:bg-violet-500/10 transition-colors"></div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <BarChart3 size={16} className="text-violet-400" />
              </div>
              <h3 className="text-sm font-medium text-zinc-400">Debate Rounds</h3>
            </div>
            <p className="text-violet-400 font-bold text-3xl">{stats.totalRounds}</p>
          </div>
        </div>

        {/* Football Possession Bar */}
        <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-6 mb-8">
          <h3 className="text-lg font-semibold text-white mb-4">Council Consensus — Possession</h3>
          <div className="flex items-center gap-4 mb-3">
            <div className="text-right w-20">
              <p className="text-emerald-400 font-bold text-2xl">{stats.approveRate}%</p>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Approve</p>
            </div>
            <div className="flex-1 h-8 rounded-full overflow-hidden bg-zinc-900 flex">
              <div 
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000 ease-out flex items-center justify-center"
                style={{ width: `${stats.approveRate}%` }}
              >
                {stats.approveRate > 10 && <span className="text-[10px] font-bold text-white/80">{stats.approveRate}%</span>}
              </div>
              <div 
                className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-1000 ease-out border-x border-zinc-800/50 flex items-center justify-center"
                style={{ width: `${stats.amendRate}%` }}
              >
                {stats.amendRate > 10 && <span className="text-[10px] font-bold text-white/80">{stats.amendRate}%</span>}
              </div>
              <div 
                className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-1000 ease-out flex items-center justify-center"
                style={{ width: `${stats.rejectRate}%` }}
              >
                {stats.rejectRate > 10 && <span className="text-[10px] font-bold text-white/80">{stats.rejectRate}%</span>}
              </div>
            </div>
            <div className="w-20">
              <p className="text-red-400 font-bold text-2xl">{stats.rejectRate}%</p>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Reject</p>
            </div>
          </div>
          <div className="flex justify-center mt-2">
             <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span className="text-xs text-zinc-500 uppercase tracking-wider">AMEND ({stats.amendRate}%)</span>
             </div>
          </div>
        </div>

        {/* Extended Telemetry Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6">Consensus Efficiency</h3>
            <div className="flex items-center justify-around">
               <div className="text-center">
                  <div className="w-24 h-24 rounded-full border-4 border-emerald-500/20 flex items-center justify-center mb-3 relative">
                     <div className="absolute inset-0 rounded-full border-4 border-emerald-500" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 50%)' }}></div>
                     <span className="text-2xl font-bold text-white">{stats.efficiencyStats?.one_round_consensus || 0}</span>
                  </div>
                  <span className="text-xs text-zinc-400">1-Round Consensus</span>
               </div>
               <div className="text-center">
                  <div className="w-24 h-24 rounded-full border-4 border-violet-500/20 flex items-center justify-center mb-3 relative">
                     <div className="absolute inset-0 rounded-full border-4 border-violet-500" style={{ clipPath: 'polygon(0 0, 50% 0, 50% 100%, 0 100%)' }}></div>
                     <span className="text-2xl font-bold text-white">{stats.efficiencyStats?.multi_round_struggle || 0}</span>
                  </div>
                  <span className="text-xs text-zinc-400">Multi-Round Struggles</span>
               </div>
            </div>
          </div>
          
          <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Confidence Trend</h3>
            <div className="h-32 w-full flex items-end gap-1">
               {stats.history.slice(0, 30).reverse().map((log, i) => (
                 <div key={log.id} className="flex-1 flex flex-col justify-end h-full group relative">
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap border border-zinc-700 pointer-events-none">
                      {log.confidence_score}%
                    </div>
                    <div 
                      className={`w-full rounded-t-sm transition-all duration-500 hover:bg-emerald-400 ${log.confidence_score === 0 ? 'bg-red-500/20' : 'bg-emerald-500/40'}`} 
                      style={{ height: `${Math.max(log.confidence_score, 2)}%` }}
                    ></div>
                 </div>
               ))}
            </div>
            <div className="flex justify-between text-[10px] text-zinc-600 mt-2 uppercase">
              <span>Older Tasks</span>
              <span>Recent Tasks</span>
            </div>
          </div>
        </div>

        {/* Per-Model Breakdown */}
        {stats.agentBreakdown.length > 0 && (
          <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-6 mb-8">
            <h3 className="text-lg font-semibold text-white mb-6">Model Telemetry Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {stats.agentBreakdown.map((agent) => {
                const colors = agentColors[agent.name] || agentColors['Llama-3.3-70B'];
                const agentApproveRate = agent.totalCalls > 0 ? Math.round((agent.approveCount / agent.totalCalls) * 100) : 0;
                
                return (
                  <div key={agent.name} className={`bg-black/30 border ${colors.border} rounded-xl p-5 relative overflow-hidden hover:bg-black/50 transition-colors`}>
                    <div className={`absolute top-0 right-0 w-24 h-24 ${colors.glow} rounded-full blur-3xl`}></div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className={`w-2.5 h-2.5 rounded-full ${colors.bg} ${colors.text} shadow-[0_0_8px_currentColor]`}></div>
                      <h4 className={`text-sm font-semibold ${colors.text}`}>{agent.name}</h4>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-500">Tokens</span>
                        <span className="text-sm font-mono text-amber-400 font-semibold">{agent.totalTokens.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-500">Avg Confidence</span>
                        <span className="text-sm font-mono text-white">{agent.avgConfidence}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-500">Avg Latency</span>
                        <span className="text-sm font-mono text-zinc-300">{agent.avgLatency}ms</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-500">Total Calls</span>
                        <span className="text-sm font-mono text-zinc-300">{agent.totalCalls}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-500">Approve Rate</span>
                        <span className={`text-sm font-mono font-semibold ${agentApproveRate >= 70 ? 'text-emerald-400' : agentApproveRate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                          {agentApproveRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Agent Vote Distribution & Latency Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {/* Agent Latency Scatter/Timeline */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">Agent Latency (ms)</h3>
            <p className="text-[10px] text-zinc-500 mb-6">Historical response times across all deliberations</p>
            <div className="h-40 w-full flex items-end gap-[2px] relative overflow-hidden border-b border-zinc-800">
               {stats.agentHistory.slice(-50).map((log, i) => {
                 const colors = agentColors[log.agent_name] || agentColors['Llama-3.3-70B'];
                 const maxLat = Math.max(...stats.agentHistory.map(l => l.latency_ms), 5000);
                 const h = Math.max((log.latency_ms / maxLat) * 100, 2);
                 return (
                   <div key={i} className="flex-1 flex flex-col justify-end h-full group relative z-10">
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-zinc-800 text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-zinc-700 pointer-events-none z-50">
                        <span className={colors.text}>{log.agent_name}</span><br/>
                        {log.latency_ms} ms
                      </div>
                      <div 
                        className={`w-full rounded-t-sm transition-all duration-300 hover:brightness-150 ${colors.bg}`} 
                        style={{ height: `${h}%` }}
                      ></div>
                   </div>
                 );
               })}
               <div className="absolute top-1/2 left-0 w-full border-t border-zinc-800/50 border-dashed z-0 pointer-events-none"></div>
            </div>
            <div className="flex justify-between items-center mt-3">
              <div className="flex gap-3">
                {['Llama-3.3-70B', 'Llama-3.1-8B', 'Qwen-27B'].map(name => (
                  <div key={name} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${agentColors[name]?.bg} ${agentColors[name]?.text} shadow-[0_0_5px_currentColor]`}></div>
                    <span className="text-[10px] text-zinc-500">{name.split('-')[0]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Vote Distribution Heatmap */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">Vote Distribution</h3>
            <p className="text-[10px] text-zinc-500 mb-6">Aggregate voting patterns per agent</p>
            <div className="flex flex-col gap-3 h-40 justify-center">
              {['Llama-3.3-70B', 'Llama-3.1-8B', 'Qwen-27B'].map(name => {
                const logs = stats.agentHistory.filter(l => l.agent_name === name);
                const total = logs.length || 1;
                const approves = logs.filter(l => l.vote === 'APPROVE').length;
                const amends = logs.filter(l => l.vote === 'AMEND').length;
                const rejects = logs.filter(l => l.vote === 'REJECT').length;
                
                return (
                  <div key={name} className="flex items-center gap-4">
                    <span className="text-[11px] text-zinc-400 w-24 truncate">{name}</span>
                    <div className="flex-1 h-5 rounded-full overflow-hidden bg-zinc-900 flex shadow-inner">
                      {approves > 0 && <div className="h-full bg-emerald-500/80 transition-all" style={{ width: `${(approves/total)*100}%` }}></div>}
                      {amends > 0 && <div className="h-full bg-amber-500/80 transition-all border-l border-black/20" style={{ width: `${(amends/total)*100}%` }}></div>}
                      {rejects > 0 && <div className="h-full bg-red-500/80 transition-all border-l border-black/20" style={{ width: `${(rejects/total)*100}%` }}></div>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center gap-5 mt-4 border-t border-zinc-800/50 pt-3">
               <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500/80"></span><span className="text-[10px] text-zinc-500">Approve</span></div>
               <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-500/80"></span><span className="text-[10px] text-zinc-500">Amend</span></div>
               <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-red-500/80"></span><span className="text-[10px] text-zinc-500">Reject</span></div>
            </div>
          </div>
        </div>

        {/* Token Analytics Graph */}
        <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-8 mb-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-semibold text-white">Recent Task Traces</h3>
              <p className="text-sm text-zinc-500 mt-1">Live token burn per task via OpenTelemetry</p>
            </div>
          </div>

          <div className="h-56 w-full flex items-end justify-between gap-3 pt-4">
            {stats.history.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500">
                <Activity size={32} className="mb-3 opacity-20" />
                <p className="italic text-sm">Waiting for council telemetry...</p>
              </div>
            ) : (
              stats.history.slice(-10).map((log) => {
                const maxTokens = Math.max(...stats.history.map(l => l.token_burn), 100);
                const heightPercent = Math.max((log.token_burn / maxTokens) * 100, 4);

                return (
                  <div key={log.id} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div className="absolute -top-14 bg-zinc-800 text-white text-[11px] py-2 px-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap text-center shadow-xl border border-zinc-700 pointer-events-none">
                      {log.task_prompt.substring(0, 30)}...<br/>
                      <span className="text-amber-400 font-bold">{log.token_burn} tks</span>
                      {log.rounds_taken && log.rounds_taken > 1 && <span className="text-violet-400 ml-1">({log.rounds_taken} rounds)</span>}
                    </div>
                    
                    <div 
                      className={`w-full max-w-[40px] rounded-t-md transition-all duration-700 ease-out shadow-[0_0_15px_rgba(0,0,0,0.5)] ${
                        log.status === 'CONSENSUS_REACHED' 
                          ? 'bg-gradient-to-t from-emerald-900 to-emerald-400 group-hover:from-emerald-800 group-hover:to-emerald-300' 
                          : 'bg-gradient-to-t from-red-900 to-red-500 group-hover:from-red-800 group-hover:to-red-400'
                      }`}
                      style={{ height: `${heightPercent}%` }}
                    ></div>
                    
                    <div className="text-[10px] text-zinc-500 mt-3 font-mono">
                      #{log.id}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Audit Log */}
        <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Council Audit Log</h3>
          <div className="space-y-3">
            {stats.history.slice(-5).reverse().map(log => (
              <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-zinc-800/50 bg-black/20 hover:bg-black/40 transition-colors">
                <div className="flex items-center gap-4 mb-2 sm:mb-0">
                  <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_currentColor] ${log.status === 'CONSENSUS_REACHED' ? 'bg-emerald-500 text-emerald-500' : 'bg-red-500 text-red-500'}`}></div>
                  <div>
                    <p className="text-sm text-zinc-200 font-medium line-clamp-1 sm:max-w-md">{log.task_prompt}</p>
                    <p className="text-[11px] text-zinc-500 mt-1">{new Date(log.timestamp).toLocaleString()}</p>
                  </div>
                </div>
                <div className="text-left sm:text-right ml-6 sm:ml-0 flex items-center gap-4">
                  {log.rounds_taken && log.rounds_taken > 1 && (
                    <span className="text-[10px] font-mono text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">{log.rounds_taken} rounds</span>
                  )}
                  <div>
                    <p className="text-xs font-mono text-amber-400 font-semibold">{log.token_burn.toLocaleString()} tks</p>
                    <p className="text-[11px] text-zinc-500 mt-1">Confidence: <span className="text-white">{log.confidence_score}%</span></p>
                  </div>
                </div>
              </div>
            ))}
            {stats.history.length === 0 && <p className="text-sm text-zinc-500 text-center py-8">No recent activity found.</p>}
          </div>
        </div>
        
      </div>
    </div>
  );
}
