import { tracer, tokenCounter, consensusGauge } from '../telemetry/signoz';
import { OpenAI } from 'openai';
import { Groq } from 'groq-sdk';
import * as fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface AgentResponse {
  agentName: string;
  role: string;
  opinion: string;
  command?: string;
  vote: 'APPROVE' | 'REJECT' | 'AMEND';
  confidence: number;
  highlights?: string[];
  tokensUsed: number;
}

export interface CouncilDecision {
  task: string;
  status: 'CONSENSUS_REACHED' | 'DISAGREEMENT' | 'REJECTED';
  overallConfidence: number;
  finalPlan: string;
  finalCommand: string;
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
    
    let dirContext = 'Unknown';
    if (cwd && fs.existsSync(cwd)) {
      try {
        const items = fs.readdirSync(cwd, { withFileTypes: true });
        dirContext = items.map(f => f.isDirectory() ? `📁 ${f.name}` : `📄 ${f.name}`).join('\n');
      } catch (e) {
        dirContext = 'Failed to read directory.';
      }
    }

    const debateResults: AgentResponse[] = [];

    // 1. Architect Agent (Groq - llama-3.3-70b-versatile)
    const architectResponse = await tracer.startActiveSpan('agent_architect_turn', async (agentSpan) => {
      agentSpan.setAttribute('agent.name', 'Llama-3.3-70B');
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You are the primary Model in an AI Council. Your job is to create a holistic shell execution plan. Output exactly a JSON object with: { \"opinion\": \"your conversational analysis\", \"command\": \"exact bash commands\", \"vote\": \"APPROVE\", \"confidence\": 95, \"highlights\": [\"3 short tags\", \"like 'Security Focus'\"] }. CRITICAL: For the 'command', ALWAYS use double quotes (\") instead of single quotes (') because the system runs on Windows cmd.exe." },
          { role: "user", content: `Task: ${taskPrompt}\nWorking Directory: ${cwd}\nLocal Directory Contents:\n${dirContext}` }
        ],
        response_format: { type: "json_object" }
      });
      
      const tokens = completion.usage?.total_tokens || 0;
      const resData = JSON.parse(completion.choices[0].message.content || '{}');
      
      const response: AgentResponse = {
        agentName: 'Llama-3.3-70B',
        role: 'System & Execution Architect',
        opinion: resData.opinion || 'No opinion generated',
        command: resData.command || '',
        vote: resData.vote || 'APPROVE',
        confidence: resData.confidence || 90,
        highlights: resData.highlights || [],
        tokensUsed: tokens,
      };
      tokenCounter.add(response.tokensUsed, { agent: response.agentName });
      agentSpan.end();
      return response;
    });
    debateResults.push(architectResponse);

    // 2. Security Auditor Agent (Groq - llama-3.1-8b-instant)
    const auditorResponse = await tracer.startActiveSpan('agent_auditor_turn', async (agentSpan) => {
      agentSpan.setAttribute('agent.name', 'Llama-3.1-8B');
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "You are an Evaluator Model in a council. Holistically review the primary model's plan, debating its merits and flaws. Output exactly a JSON object with: { \"opinion\": \"your analysis\", \"vote\": \"APPROVE\" or \"REJECT\", \"confidence\": 90, \"highlights\": [\"3 short tags\"] }" },
          { role: "user", content: `Task: ${taskPrompt}\nPrimary Plan: ${architectResponse.opinion}\nProposed Command: ${architectResponse.command}\nLocal Directory Contents:\n${dirContext}` }
        ],
        response_format: { type: "json_object" }
      });
      
      const tokens = completion.usage?.total_tokens || 0;
      const resData = JSON.parse(completion.choices[0].message.content || '{}');

      const response: AgentResponse = {
        agentName: 'Llama-3.1-8B',
        role: 'Security & Safety Evaluator',
        opinion: resData.opinion || 'Safe',
        vote: resData.vote || 'APPROVE',
        confidence: resData.confidence || 90,
        highlights: resData.highlights || [],
        tokensUsed: tokens,
      };
      tokenCounter.add(response.tokensUsed, { agent: response.agentName });
      agentSpan.end();
      return response;
    });
    debateResults.push(auditorResponse);

    // 3. Critic Agent (Groq - qwen/qwen3.6-27b)
    const criticResponse = await tracer.startActiveSpan('agent_critic_turn', async (agentSpan) => {
      agentSpan.setAttribute('agent.name', 'Qwen-27B');
      const completion = await groq.chat.completions.create({
        model: "qwen/qwen3.6-27b",
        messages: [
          { role: "system", content: "You are an Evaluator Model in a council. Holistically review the entire debate so far. Output strictly valid JSON like: {\"opinion\":\"your final verdict\",\"vote\":\"APPROVE\",\"confidence\":92, \"highlights\": [\"3 short tags\"]}" },
          { role: "user", content: `Task: ${taskPrompt}\nLocal Directory Contents:\n${dirContext}\n\nPrimary Plan: ${architectResponse.opinion}\n\nFellow Model (Llama-3.1) Feedback: ${auditorResponse.opinion}` }
        ],
        response_format: { type: "json_object" }
      });

      const tokens = completion.usage?.total_tokens || 0;
      const resData = JSON.parse(completion.choices[0].message.content || '{}');

      const response: AgentResponse = {
        agentName: 'Qwen-27B',
        role: 'Efficiency & Edge-Case Specialist',
        opinion: resData.opinion || 'Efficient',
        vote: resData.vote || 'APPROVE',
        confidence: resData.confidence || 90,
        highlights: resData.highlights || [],
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
      finalPlan: architectResponse.opinion,
      finalCommand: architectResponse.command || '',
      agentDebates: debateResults,
    };

    span.end();
    return decision;
  });
}
