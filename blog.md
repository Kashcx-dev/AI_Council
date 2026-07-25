# Taming the Chaos: Building a Multi-Agent AI Council with SigNoz Observability

If you have ever tried to get a single Large Language Model to write, test, and execute complex code autonomously, you know it is like rolling dice. Sometimes it works perfectly; other times it hallucinates a library that does not exist and deletes your configuration files. 

For the Agents of SigNoz Hackathon, we decided to raise the stakes. Instead of relying on one AI, what if we forced three highly specialized AIs to argue with each other until they reached a consensus? 

We built the **AI Council**: a platform where a System Architect (Llama-3.3-70B), a Security Evaluator (Llama-3.1-8B), and an Edge-Case Specialist (Qwen-27B) deliberate on a user prompt, debate the execution plan, and only execute the shell commands if they achieve unanimous approval. 

It sounded brilliant on paper. In reality, coordinating three distinct models turned into a chaotic black box. Without a way to see inside the deliberation loop, we had no idea why they were arguing, how much latency each model was introducing, or how many tokens we were burning. 

Here is how we built the AI Council, the challenges we faced coordinating the models, the UI bugs that almost broke the project, and how we used OpenTelemetry and SigNoz to make the entire system completely transparent.

## The Architecture

The system consists of three main pieces:
1. **The Backend Engine:** An Express Node.js server that manages the debate loop and interfaces with the Groq inference API.
2. **The OpenClaw Executor:** A secure subsystem that actually runs the code on the filesystem once the agents agree.
3. **The React Dashboard:** A Vite-based frontend that visualizes the AI deliberations and telemetry in real-time.

All of this is fully instrumented using the OpenTelemetry Node.js SDK and exported directly to SigNoz.

## The Hard Part: Coordinating Three Distinct AIs

The biggest technical challenge was the deliberation loop itself. We assumed that if we gave the models a prompt, they would quickly agree or disagree. We were very wrong.

Initially, if the System Architect proposed a command and the Security Evaluator found a flaw, the Evaluator would reject it. The problem was that in the next round, the Architect had no memory of the rejection and would just propose the exact same flawed command again. We accidentally created an infinite loop of AI stubbornness. 

To solve this, we had to rethink the state management of the debate. We implemented a shared context window. When a disagreement is detected, the backend engine compiles the previous round's votes, confidence scores, and rationales, and injects that entire debate history into the prompt for the next round. 

This allowed the models to "see" why they were rejected. The Architect could read the Auditor's security concerns, adjust its proposed code, and submit an amended command in round two. We also had to implement a hard limit of five rounds to prevent them from burning through our token limits if they entered a philosophical deadlock.

## The Blind Spot: Why We Needed SigNoz

Even with the context sharing fixed, the system was incredibly opaque. We would submit a prompt and then wait 15 seconds for a response. Was Groq lagging? Was Llama-3.3-70B taking too long? Were they stuck in a five-round debate? We had no idea.

If you cannot observe your AI agents, you do not own them. 

We integrated OpenTelemetry to solve this. Instead of just relying on the default auto-instrumentation for the Express routes, we built custom tracing for the deliberation loop. 

```javascript
// Example of how we wrapped the agent calls in custom spans
const tracer = opentelemetry.trace.getTracer('ai-council-engine');

function queryAgent(agentName, prompt) {
  return tracer.startActiveSpan(`query_${agentName}`, async (span) => {
    const startTime = Date.now();
    const response = await callGroqAPI(prompt);
    
    span.setAttribute('agent.vote', response.vote);
    span.setAttribute('agent.confidence', response.confidence);
    span.setAttribute('agent.tokens_used', response.tokens);
    span.setAttribute('agent.latency_ms', Date.now() - startTime);
    
    span.end();
    return response;
  });
}
```

By wrapping every single agent call in its own span and attaching custom attributes, we could suddenly see exactly what was happening in SigNoz. We could look at a trace and instantly see that a request took 12 seconds because it went through three rounds of debate, and that Qwen-27B was consistently taking 400ms longer to reply than Llama-3.1-8B. 

We also used the OpenTelemetry Metrics API (`meter.createCounter` and `meter.createHistogram`) to track the total tokens burned and the historical latency distribution of the models.

## The UI Nightmare: Port Mismatches and Silent Failures

With the backend engine finally humming along and exporting beautiful traces to SigNoz, we moved on to building the React frontend to visualize all this telemetry data. We wanted an exhaustive dashboard with latency heatmaps, token burn charts, and a real-time debate viewer.

This is where we hit our most frustrating roadblock. 

We set up the Vite React app and the Express backend. We started both servers, opened the browser, and... nothing. The dashboard was completely blank. The loading spinners just spun infinitely. 

We checked the backend logs: no errors. We checked the frontend console: no errors. It was a complete silent failure. 

After hours of debugging, we finally realized what happened. Both Vite (by default in some older configs or when deeply nested) and our Express backend were trying to bind to the same default ports, or the Vite proxy was misconfigured. The frontend was sending API requests to `http://localhost:5173/api/telemetry`, but our Express server was running on port 3000. 

Because we had not set up the Vite proxy correctly, the frontend requests were just hitting the Vite dev server, which returned an empty HTML page instead of the JSON data. Since it returned a 200 OK status, the frontend fetch calls did not throw an error, they just failed to parse the HTML as JSON, resulting in a silent failure state in our React components.

We fixed this by strictly enforcing the port mappings and adding a proper proxy configuration in `vite.config.ts`:

```typescript
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
});
```

Once the proxy was correctly routing traffic to port 3000, the data flooded in, and our exhaustive SigNoz telemetry dashboard lit up with metrics.

## What We Learned

Building the AI Council taught us that multi-agent systems are incredibly powerful, but their non-deterministic nature makes them exceptionally difficult to debug. 

1. **Context is everything:** You cannot just have AIs vote in a vacuum. They need the historical context of the debate to reach a consensus.
2. **Network configurations will always get you:** No matter how complex your AI logic is, a simple port mismatch between your frontend and backend can cost you hours of debugging.
3. **Observability is mandatory:** Without SigNoz and OpenTelemetry, we would have been completely blind. Custom spans and attributes allowed us to measure the consensus efficiency and token burn, transforming a chaotic black box into a manageable, debuggable system.

If you are building agentic workflows, do not wait until production to think about telemetry. Instrument your agents from day one. You will thank yourself later.
