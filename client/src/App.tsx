import React, { useState } from 'react';
import { ShieldCheck, Cpu, Activity, Send, CheckCircle, Flame } from 'lucide-react';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState<any>(null);

  const handleDeliberate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    try {
      const backendHost = import.meta.env.VITE_BACKEND_HOST || 'http://localhost:4000';
      const res = await fetch(`${backendHost}/api/council/deliberate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      setDecision(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-orange)' }}>
            AI COUNCIL 🏛️
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Multi-Agent Deliberation & OpenTelemetry Observability (SigNoz)
          </p>
        </div>
        <div className="glass-panel" style={{ padding: '0.5rem 1rem', display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Activity size={14} /> Telemetry: Active
          </span>
          <span style={{ color: 'var(--accent-blue)' }}>SigNoz Port: 4317</span>
        </div>
      </header>

      <main style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem' }}>
        <section>
          <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <form onSubmit={handleDeliberate}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.95rem' }}>
                Council Goal / Task Proposal
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="e.g. Audit server API endpoints for high memory leaks and optimize queries..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid var(--bg-card-border)',
                    background: '#08090b',
                    color: '#fff',
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: 'var(--accent-orange)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0 1.5rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <Send size={16} /> {loading ? 'Debating...' : 'Convene Council'}
                </button>
              </div>
            </form>
          </div>

          {decision && (
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Council Deliberation Output</h3>
                <span style={{ background: 'rgba(43, 227, 139, 0.15)', color: 'var(--accent-green)', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700 }}>
                  Confidence: {decision.overallConfidence}%
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {decision.agentDebates.map((agent: any, idx: number) => (
                  <div key={idx} style={{ background: '#090a0d', padding: '1rem', borderRadius: '8px', borderLeft: '3px solid var(--accent-blue)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <span style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>{agent.agentName} ({agent.role})</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{agent.tokensUsed} tokens burned</span>
                    </div>
                    <p style={{ fontSize: '0.9rem', color: '#d1d5db' }}>{agent.opinion}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass-panel" style={{ padding: '1.2rem' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Cpu size={16} color="var(--accent-orange)" /> Council Personas
            </h4>
            <ul style={{ listStyle: 'none', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', color: 'var(--text-muted)' }}>
              <li>🔹 <strong>Architect:</strong> Strategy & Execution</li>
              <li>🔹 <strong>Security Auditor:</strong> Risk Mitigation</li>
              <li>🔹 <strong>Critic:</strong> Edge Cases & Efficiency</li>
            </ul>
          </div>

          <div className="glass-panel" style={{ padding: '1.2rem' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Flame size={16} color="var(--accent-green)" /> Telemetry Spans
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              OpenTelemetry spans are being exported live to your SigNoz instance. Check your SigNoz dashboard for trace graphs.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
