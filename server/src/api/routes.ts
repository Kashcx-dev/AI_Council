import { Router, Request, Response } from 'express';
import { runCouncilDebate } from '../council/engine';
import { executeCouncilPlan } from '../executor/openclaw';
import { rateLimiter } from '../Middlewares/MiddlewareMaster';
import { authRouter, authenticateToken } from './auth';
import { getDb } from '../db/sqlite';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);

// Tier 2: Council Deliberation (High-frequency AI chat endpoint)
apiRouter.post('/council/deliberate', authenticateToken, rateLimiter(2), async (req: any, res: Response) => {
  try {
    const { prompt, cwd, activeFile } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    const decision = await runCouncilDebate(prompt, cwd, req.user, activeFile);
    res.json(decision);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Tier 2: Council Action Execution
apiRouter.post('/council/execute', authenticateToken, rateLimiter(2), async (req: any, res: Response) => {
  try {
    const { plan, cwd } = req.body;
    if (!plan) {
      res.status(400).json({ error: 'Confirmed plan is required' });
      return;
    }

    const executionResults = await executeCouncilPlan(plan, cwd, req.user);
    res.json({ status: 'COMPLETED', results: executionResults });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Tier 3: Telemetry Dashboard Data
apiRouter.get('/telemetry/stats', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM telemetry_logs ORDER BY timestamp DESC LIMIT 100');
    
    let totalTokens = 0;
    let avgConfidence = 0;
    
    if (rows.length > 0) {
      totalTokens = rows.reduce((acc: number, r: any) => acc + (r.token_burn || 0), 0);
      
      // Calculate avgConfidence only from rounds where consensus was reached (> 0) to avoid REJECT votes pulling down historical average
      const validConfidenceRows = rows.filter((r: any) => r.confidence_score > 0);
      avgConfidence = validConfidenceRows.length > 0 
        ? validConfidenceRows.reduce((acc: number, r: any) => acc + r.confidence_score, 0) / validConfidenceRows.length
        : 0;
    }

    // Per-model breakdown from telemetry_agent_logs
    const agentRows = await db.all(`
      SELECT 
        agent_name,
        COUNT(*) as total_calls,
        SUM(tokens_used) as total_tokens,
        AVG(confidence) as avg_confidence,
        AVG(latency_ms) as avg_latency,
        SUM(CASE WHEN vote = 'APPROVE' THEN 1 ELSE 0 END) as approve_count,
        SUM(CASE WHEN vote = 'REJECT' THEN 1 ELSE 0 END) as reject_count
      FROM telemetry_agent_logs
      GROUP BY agent_name
    `);

    // Global approve/reject/amend rates across all agent votes
    const voteStats = await db.get(`
      SELECT 
        COUNT(*) as total_votes,
        SUM(CASE WHEN vote = 'APPROVE' THEN 1 ELSE 0 END) as approves,
        SUM(CASE WHEN vote = 'REJECT' THEN 1 ELSE 0 END) as rejects,
        SUM(CASE WHEN vote = 'AMEND' THEN 1 ELSE 0 END) as amends
      FROM telemetry_agent_logs
    `);

    const totalVotes = voteStats?.total_votes || 0;
    const approveRate = totalVotes > 0 ? Math.round((voteStats.approves / totalVotes) * 100) : 50;
    const rejectRate = totalVotes > 0 ? Math.round((voteStats.rejects / totalVotes) * 100) : 50;
    const amendRate = totalVotes > 0 ? Math.round((voteStats.amends / totalVotes) * 100) : 0;

    // Efficiency Metrics
    const efficiencyStats = await db.get(`
      SELECT 
        COUNT(CASE WHEN rounds_taken = 1 THEN 1 END) as one_round_consensus,
        COUNT(CASE WHEN rounds_taken > 1 THEN 1 END) as multi_round_struggle
      FROM telemetry_logs
    `);

    // Total rounds taken
    const roundStats = await db.get(`SELECT SUM(rounds_taken) as total_rounds FROM telemetry_logs`);

    // Granular agent history for line/scatter charts
    const agentHistory = await db.all(`
      SELECT agent_name, latency_ms, tokens_used, timestamp, vote
      FROM telemetry_agent_logs
      ORDER BY timestamp DESC
      LIMIT 150
    `);

    res.json({
      history: rows.reverse(),
      agentHistory: agentHistory.reverse(),
      totalTokens,
      avgConfidence: Math.round(avgConfidence),
      totalDeliberations: rows.length,
      approveRate,
      rejectRate,
      amendRate,
      efficiencyStats,
      totalRounds: roundStats?.total_rounds || 0,
      agentBreakdown: agentRows.map((a: any) => ({
        name: a.agent_name,
        totalTokens: a.total_tokens || 0,
        avgConfidence: Math.round(a.avg_confidence || 0),
        avgLatency: Math.round(a.avg_latency || 0),
        totalCalls: a.total_calls || 0,
        approveCount: a.approve_count || 0,
        rejectCount: a.reject_count || 0,
      }))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
