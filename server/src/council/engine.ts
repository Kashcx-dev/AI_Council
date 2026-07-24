import { tracer, tokenCounter, consensusGauge } from '../telemetry/signoz';
import { OpenAI } from 'openai';
import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

export async function runCouncilDebate(taskPrompt: string, cwd?: string, user?: any): Promise<CouncilDecision> {
  return tracer.startActiveSpan('council_deliberation', async (span) => {
    span.setAttribute('council.task', taskPrompt);
    span.setAttribute('council.cwd', cwd || 'unknown');
    if (user) {
      span.setAttribute('user.id', user.userId);
      span.setAttribute('user.username', user.username);
    }

    const debateResults: AgentResponse[] = [];

    // 1. Architect Agent (OpenAI - gpt-4o-mini)
    const architectResponse = await tracer.startActiveSpan('agent_architect_turn', async (agentSpan) => {
      agentSpan.setAttribute('agent.name', 'Architect Agent');
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are the Architect Agent. Your job is to create a shell execution plan to accomplish the user's task. Output exactly a JSON object with: { \"opinion\": \"your analysis and the bash commands to run\", \"vote\": \"APPROVE\", \"confidence\": 95 }" },
          { role: "user", content: `Task: ${taskPrompt}\nWorking Directory: ${cwd}` }
        ],
        response_format: { type: "json_object" }
      });
      
      const tokens = completion.usage?.total_tokens || 0;
      const resData = JSON.parse(completion.choices[0].message.content || '{}');
      
      const response: AgentResponse = {
        agentName: 'Architect Agent',
        role: 'System & Execution Architect',
        opinion: resData.opinion || 'No opinion generated',
        vote: resData.vote || 'APPROVE',
        confidence: resData.confidence || 90,
        tokensUsed: tokens,
      };
      tokenCounter.add(response.tokensUsed, { agent: response.agentName });
      agentSpan.end();
      return response;
    });
    debateResults.push(architectResponse);

    // 2. Security Auditor Agent (OpenAI - gpt-4o-mini)
    const auditorResponse = await tracer.startActiveSpan('agent_auditor_turn', async (agentSpan) => {
      agentSpan.setAttribute('agent.name', 'Security Auditor');
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are the Security Auditor. Review the Architect's plan. If it's safe (e.g. no rm -rf /), APPROVE. Output exactly a JSON object with: { \"opinion\": \"your security analysis\", \"vote\": \"APPROVE\" or \"REJECT\", \"confidence\": 90 }" },
          { role: "user", content: `Task: ${taskPrompt}\nArchitect Plan: ${architectResponse.opinion}` }
        ],
        response_format: { type: "json_object" }
      });
      
      const tokens = completion.usage?.total_tokens || 0;
      const resData = JSON.parse(completion.choices[0].message.content || '{}');

      const response: AgentResponse = {
        agentName: 'Security Auditor',
        role: 'Security & Safety Evaluator',
        opinion: resData.opinion || 'Safe',
        vote: resData.vote || 'APPROVE',
        confidence: resData.confidence || 90,
        tokensUsed: tokens,
      };
      tokenCounter.add(response.tokensUsed, { agent: response.agentName });
      agentSpan.end();
      return response;
    });
    debateResults.push(auditorResponse);

    // 3. Critic Agent (Groq - llama-3.3-70b-versatile)
    const criticResponse = await tracer.startActiveSpan('agent_critic_turn', async (agentSpan) => {
      agentSpan.setAttribute('agent.name', 'Critic Agent');
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You are the Critic Agent. Review the plan for efficiency. Output strictly valid JSON like: {\"opinion\":\"your analysis\",\"vote\":\"APPROVE\",\"confidence\":92}" },
          { role: "user", content: `Task: ${taskPrompt}\nArchitect Plan: ${architectResponse.opinion}` }
        ],
        response_format: { type: "json_object" }
      });

      const tokens = completion.usage?.total_tokens || 0;
      const resData = JSON.parse(completion.choices[0].message.content || '{}');

      const response: AgentResponse = {
        agentName: 'Critic Agent',
        role: 'Efficiency & Edge-Case Specialist',
        opinion: resData.opinion || 'Efficient',
        vote: resData.vote || 'APPROVE',
        confidence: resData.confidence || 90,
        tokensUsed: tokens,
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

    const hasReject = debateResults.some(r => r.vote === 'REJECT');
    const status = hasReject ? 'DISAGREEMENT' : 'CONSENSUS_REACHED';

    consensusGauge.record(avgConfidence, { task: taskPrompt });
    span.setAttribute('council.confidence', avgConfidence);
    span.setAttribute('council.consensus', status);

    const decision: CouncilDecision = {
      task: taskPrompt,
      status,
      overallConfidence: avgConfidence,
      finalPlan: architectResponse.opinion, // OpenClaw will execute the architect's plan
      agentDebates: debateResults,
    };

    span.end();
    return decision;
  });
}
