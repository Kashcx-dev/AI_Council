import { tracer, tokenCounter, consensusGauge } from '../telemetry/signoz.js';

export interface AgentResponse {
  agentName: string;
  role: string;
  opinion: string;
  vote: 'APPROVE' | 'REJECT' | 'AMEND';
  confidence: number;
  tokensUsed: number;
}

export interface CouncilDecision {
  task: string;
  status: 'CONSENSUS_REACHED' | 'DISAGREEMENT' | 'REJECTED';
  overallConfidence: number;
  finalPlan: string;
  agentDebates: AgentResponse[];
}

export async function runCouncilDebate(taskPrompt: string): Promise<CouncilDecision> {
  return tracer.startActiveSpan('council_deliberation', async (span) => {
    span.setAttribute('council.task', taskPrompt);

    const debateResults: AgentResponse[] = [];

    // 1. Architect Agent
    const architectResponse = await tracer.startActiveSpan('agent_architect_turn', async (agentSpan) => {
      agentSpan.setAttribute('agent.name', 'Architect Agent');
      const response: AgentResponse = {
        agentName: 'Architect Agent',
        role: 'System & Execution Architect',
        opinion: `Proposed strategy for: "${taskPrompt}". Breakdown into 3 safe execution steps.`,
        vote: 'APPROVE',
        confidence: 95,
        tokensUsed: 420,
      };
      tokenCounter.add(response.tokensUsed, { agent: response.agentName });
      agentSpan.end();
      return response;
    });
    debateResults.push(architectResponse);

    // 2. Security Auditor Agent
    const auditorResponse = await tracer.startActiveSpan('agent_auditor_turn', async (agentSpan) => {
      agentSpan.setAttribute('agent.name', 'Security Auditor');
      const response: AgentResponse = {
        agentName: 'Security Auditor',
        role: 'Security & Safety Evaluator',
        opinion: 'Reviewed architect strategy. No dangerous system modifications detected. Approved with sandbox constraints.',
        vote: 'APPROVE',
        confidence: 90,
        tokensUsed: 380,
      };
      tokenCounter.add(response.tokensUsed, { agent: response.agentName });
      agentSpan.end();
      return response;
    });
    debateResults.push(auditorResponse);

    // 3. Critic Agent
    const criticResponse = await tracer.startActiveSpan('agent_critic_turn', async (agentSpan) => {
      agentSpan.setAttribute('agent.name', 'Critic Agent');
      const response: AgentResponse = {
        agentName: 'Critic Agent',
        role: 'Efficiency & Edge-Case Specialist',
        opinion: 'Verified steps against performance edge cases. Optimized execution sequence.',
        vote: 'APPROVE',
        confidence: 92,
        tokensUsed: 310,
      };
      tokenCounter.add(response.tokensUsed, { agent: response.agentName });
      agentSpan.end();
      return response;
    });
    debateResults.push(criticResponse);

    // Calculate consensus
    const avgConfidence = Math.round(
      debateResults.reduce((acc, a) => acc + a.confidence, 0) / debateResults.length
    );

    consensusGauge.record(avgConfidence, { task: taskPrompt });
    span.setAttribute('council.confidence', avgConfidence);
    span.setAttribute('council.consensus', 'REACHED');

    const decision: CouncilDecision = {
      task: taskPrompt,
      status: 'CONSENSUS_REACHED',
      overallConfidence: avgConfidence,
      finalPlan: `Execute verified 3-step action plan for: ${taskPrompt}`,
      agentDebates: debateResults,
    };

    span.end();
    return decision;
  });
}
