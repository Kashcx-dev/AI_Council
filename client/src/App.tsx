import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Cpu, Send, CheckCircle, Play, LogOut, FileCode2, Terminal as TerminalIcon, Code, FolderOpen, Save, Folder as FolderIcon, File as FileIcon } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'verify'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');

  const [prompt, setPrompt] = useState('');
  const [cwd, setCwd] = useState('');
  const cwdRef = useRef(cwd);
  useEffect(() => { cwdRef.current = cwd; }, [cwd]);
  
  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState<any>(null);
  const [executing, setExecuting] = useState(false);

  // IDE State
  const [files, setFiles] = useState<any[]>([]);
  const [activeFile, setActiveFile] = useState<any>(null);
  const [fileContent, setFileContent] = useState('');
  
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  
  // Resizing state
  const [terminalHeight, setTerminalHeight] = useState(250);
  const [isDragging, setIsDragging] = useState(false);
  
  // Editor fallback state
  const [useBasicEditor, setUseBasicEditor] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const backendHost = import.meta.env.VITE_BACKEND_HOST || 'http://localhost:4000';

  // Terminal Initialization
  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const windowHeight = window.innerHeight;
      const newHeight = windowHeight - e.clientY;
      setTerminalHeight(Math.max(100, Math.min(newHeight, windowHeight - 150)));
      fitAddonRef.current?.fit();
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (token && terminalRef.current && !xtermRef.current) {
      xtermRef.current = new Terminal({
        theme: { background: '#08090b', foreground: '#d1d5db', cursor: '#ff5e36' },
        fontFamily: 'monospace',
        cursorBlink: true,
      });
      fitAddonRef.current = new FitAddon();
      xtermRef.current.loadAddon(fitAddonRef.current);
      xtermRef.current.open(terminalRef.current);
      fitAddonRef.current.fit();

      xtermRef.current.writeln('Welcome to OpenClaw Agentic Terminal ⚡');
      xtermRef.current.writeln('Select a workspace directory to begin executing commands.\n');

      let currentCommand = '';
      xtermRef.current.onData((data) => {
        if (data === '\r') {
          xtermRef.current?.writeln('');
          handleTerminalCommand(currentCommand);
          currentCommand = '';
        } else if (data === '\u007F') { // Backspace
          if (currentCommand.length > 0) {
            currentCommand = currentCommand.slice(0, -1);
            xtermRef.current?.write('\b \b');
          }
        } else if (data === '\x03') { // Ctrl+C
          currentCommand = '';
          xtermRef.current?.writeln('^C');
          xtermRef.current?.write(`${cwd || '~'} > `);
        } else {
          currentCommand += data;
          xtermRef.current?.write(data);
        }
      });
    }

    const handleResize = () => fitAddonRef.current?.fit();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [token, cwd]);

  const handleTerminalCommand = async (command: string) => {
    const trimmed = command.trim();
    if (!trimmed) {
      xtermRef.current?.write(`${cwdRef.current || '~'} > `);
      return;
    }
    
    // Built-in terminal commands
    if (trimmed.toLowerCase() === 'clear' || trimmed.toLowerCase() === 'cls') {
      xtermRef.current?.clear();
      xtermRef.current?.write(`${cwdRef.current || '~'} > `);
      return;
    }
    
    if (trimmed.startsWith('cd ') || trimmed === 'cd..') {
      const target = trimmed.startsWith('cd ') ? trimmed.substring(3).trim() : '..';
      let newCwd = cwdRef.current;
      if (window.require) {
        const path = window.require('path');
        const fs = window.require('fs');
        newCwd = path.resolve(cwdRef.current, target);
        
        try {
          if (fs.existsSync(newCwd) && fs.statSync(newCwd).isDirectory()) {
            setCwd(newCwd);
            loadDirectory(newCwd);
            xtermRef.current?.write(`\r\n\x1b[32mSwitched to: ${newCwd}\x1b[0m\r\n${newCwd} > `);
          } else {
            xtermRef.current?.write(`\r\n\x1b[31mDirectory not found: ${newCwd}\x1b[0m\r\n${cwdRef.current} > `);
          }
        } catch (e: any) {
          xtermRef.current?.write(`\r\n\x1b[31mError: ${e.message}\x1b[0m\r\n${cwdRef.current} > `);
        }
      }
      return;
    }

    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      // Execute via IPC
      const res = await ipcRenderer.invoke('cmd:exec', trimmed, cwdRef.current);
      
      // If error exists but it's just stderr output (like some CLI tools do), we don't need to treat it as a fatal red error if stdout exists, but we'll print it.
      if (res.error) xtermRef.current?.writeln(`\x1b[31m${res.error}\x1b[0m`);
      if (res.stdout) {
        // Fix newlines for xterm
        const formattedStdout = res.stdout.replace(/\n/g, '\r\n');
        xtermRef.current?.write(formattedStdout);
      }
      if (res.stderr) {
        const formattedStderr = res.stderr.replace(/\n/g, '\r\n');
        xtermRef.current?.writeln(`\x1b[33m${formattedStderr}\x1b[0m`);
      }
    } else {
      xtermRef.current?.writeln(`\x1b[31mElectron IPC not available. Cannot execute command.\x1b[0m`);
    }
    
    // Ensure we drop to a new line and print prompt
    xtermRef.current?.write(`\r\n${cwdRef.current || '~'} > `);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === 'verify') {
      try {
        const res = await fetch(`${backendHost}/api/auth/verify-2fa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: authUsername, code: verifyCode }),
        });
        const data = await res.json();
        if (res.ok) {
          setToken(data.token);
          setUsername(data.username);
          localStorage.setItem('token', data.token);
          localStorage.setItem('username', data.username);
        } else alert(data.error);
      } catch (err: any) { 
        console.error(err);
        alert(`Network Error: Ensure backend server is running on port 4000. Details: ${err.message}`);
      }
      return;
    }

    try {
      const res = await fetch(`${backendHost}/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        if (authMode === 'register') {
          alert(data.message);
          setAuthMode('verify');
        } else {
          setToken(data.token);
          setUsername(data.username);
          localStorage.setItem('token', data.token);
          localStorage.setItem('username', data.username);
        }
      } else alert(data.error);
    } catch (err: any) { 
      console.error(err); 
      alert(`Network Error: Ensure backend server is running on port 4000. Details: ${err.message}`);
    }
  };

  const handleLogout = () => {
    setToken('');
    setUsername('');
    localStorage.removeItem('token');
    localStorage.removeItem('username');
  };

  const loadDirectory = async (folderPath: string) => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const items = await ipcRenderer.invoke('fs:listDirectory', folderPath);
      setFiles(items);
    }
  };

  const handleSelectFolder = async () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const folder = await ipcRenderer.invoke('dialog:openDirectory');
        if (folder) {
          setCwd(folder);
          loadDirectory(folder);
          xtermRef.current?.write(`\r\n\x1b[32mSwitched workspace to: ${folder}\x1b[0m\r\n${folder} > `);
        }
      } else {
        alert("Electron is not running.");
      }
    } catch (err) { console.error(err); }
  };

  const handleFileClick = async (file: any) => {
    if (file.isDirectory) {
      setCwd(file.path);
      loadDirectory(file.path);
      xtermRef.current?.write(`\r\n\x1b[32mNavigated to: ${file.path}\x1b[0m\r\n${file.path} > `);
      return;
    }
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const content = await ipcRenderer.invoke('fs:readFile', file.path);
      setActiveFile(file);
      setFileContent(content);
    }
  };

  const goUpDirectory = () => {
    if (!cwd) return;
    
    // Normalize slashes
    const normalized = cwd.replace(/\//g, '\\');
    
    let parent = normalized.substring(0, normalized.lastIndexOf('\\'));
    
    // If the parent is just a drive letter like "D:", append a backslash to make it "D:\"
    // otherwise Node's fs will treat it as a relative path to the current working directory!
    if (parent.length === 2 && parent[1] === ':') {
      parent += '\\';
    }
    
    // Don't navigate up if we're already at the root
    if (parent && parent !== cwd) {
      setCwd(parent);
      loadDirectory(parent);
      xtermRef.current?.write(`\r\n\x1b[32mNavigated to: ${parent}\x1b[0m\r\n${parent} > `);
    } else {
      xtermRef.current?.write(`\r\n\x1b[33mAlready at root directory.\x1b[0m\r\n${cwd} > `);
    }
  };

  const saveFile = async () => {
    if (!activeFile || !window.require) return;
    const { ipcRenderer } = window.require('electron');
    const success = await ipcRenderer.invoke('fs:writeFile', activeFile.path, fileContent);
    if (success) {
      xtermRef.current?.writeln(`\r\n\x1b[32mSaved: ${activeFile.name}\x1b[0m\r\n${cwd} > `);
    }
  };

  const handleDeliberate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    xtermRef.current?.writeln(`\r\n\x1b[36m[AI Council] Deliberating task: "${prompt}"...\x1b[0m`);
    try {
      const res = await fetch(`${backendHost}/api/council/deliberate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ prompt, cwd }),
      });
      const data = await res.json();
      if (!res.ok) {
        xtermRef.current?.writeln(`\x1b[31m[AI Council Error] ${data.error || 'Failed to deliberate'}\x1b[0m\r\n${cwd} > `);
        alert(`Council Error: ${data.error || 'Failed to deliberate'}`);
        return;
      }
      setDecision(data);
      xtermRef.current?.writeln(`\x1b[36m[AI Council] Consensus reached! Confidence: ${data.overallConfidence}%\x1b[0m\r\n${cwd} > `);
    } catch (err: any) { 
      console.error(err);
      xtermRef.current?.writeln(`\x1b[31m[System Error] ${err.message}\x1b[0m\r\n${cwd} > `);
    } finally { setLoading(false); }
  };

  const handleExecute = async () => {
    if (!decision) return;
    setExecuting(true);
    xtermRef.current?.writeln(`\r\n\x1b[33m[OpenClaw] Executing approved plan...\x1b[0m`);
    try {
      const res = await fetch(`${backendHost}/api/council/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ plan: decision.finalCommand || decision.finalPlan, cwd }),
      });
      const data = await res.json();
      let hasError = '';
      data.results.forEach((r: any) => {
        if (r.status === 'SUCCESS') xtermRef.current?.writeln(`\x1b[32m✓ ${r.step} (${r.durationMs}ms)\x1b[0m\r\n${r.output}`);
        else {
          xtermRef.current?.writeln(`\x1b[31m✗ ${r.step} (${r.durationMs}ms)\x1b[0m\r\n${r.output}`);
          hasError = r.output;
        }
      });
      loadDirectory(cwd); // Refresh files in case AI created some
      xtermRef.current?.write(`\r\n${cwd} > `);
      
      if (hasError) {
        setPrompt(`The previous command failed with error:\n${hasError}\n\nPlease check the issue and provide the strictly corrected command to fix it.`);
      }
    } catch (err) { console.error(err); } finally { setExecuting(false); }
  };

  if (!token) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#030406' }}>
        <div className="glass-panel" style={{ padding: '2rem', width: '350px' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--accent-orange)' }}>AI COUNCIL IDE</h2>
          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {authMode !== 'verify' ? (
              <>
                <input type="email" placeholder="Email Address" value={authUsername} onChange={e => setAuthUsername(e.target.value)} style={{ padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'white' }} required />
                <input type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} style={{ padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'white' }} required />
              </>
            ) : (
              <input type="text" placeholder="6-Digit 2FA Code" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} style={{ padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'white' }} required />
            )}
            <button type="submit" style={{ padding: '0.8rem', borderRadius: '6px', background: 'var(--accent-orange)', color: 'white', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>
              {authMode === 'login' ? 'Login' : authMode === 'register' ? 'Register' : 'Verify'}
            </button>
            {authMode !== 'verify' && (
              <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
                <span style={{ color: 'var(--accent-blue)', cursor: 'pointer' }} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
                  {authMode === 'login' ? 'Register' : 'Login'}
                </span>
              </p>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#030406', color: '#fff' }}>
      {/* IDE Top Nav */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', background: '#090a0d', borderBottom: '1px solid #1f2937' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-orange)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Cpu size={18} /> AGENTIC IDE
          </h1>
          <button onClick={handleSelectFolder} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'transparent', border: '1px solid #1f2937', color: '#d1d5db', padding: '0.3rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
            <FolderOpen size={14} /> Open Workspace
          </button>
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{cwd || 'No workspace selected'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.85rem' }}>
          <span style={{ color: '#d1d5db', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
            👤 {username}
            <LogOut size={14} style={{ cursor: 'pointer', color: 'var(--accent-orange)' }} onClick={handleLogout} />
          </span>
        </div>
      </header>

      {/* Main IDE Layout */}
      <main style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Left Sidebar: File Explorer & AI Council */}
        <aside style={{ width: '380px', display: 'flex', flexDirection: 'column', borderRight: '1px solid #1f2937', background: '#050608' }}>
          
          {/* File Explorer */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', borderBottom: '1px solid #1f2937' }}>
            <div style={{ padding: '0.8rem', color: '#6b7280', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              EXPLORER
              {cwd && <button onClick={goUpDirectory} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1rem', padding: '0 4px' }} title="Go Up Directory">↑</button>}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {files.map((f, i) => (
                <div key={i} onClick={() => handleFileClick(f)} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', color: f.isDirectory ? '#60a5fa' : '#d1d5db', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onMouseEnter={e => e.currentTarget.style.background = '#1f2937'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {f.isDirectory ? <FolderIcon size={14} /> : <FileIcon size={14} />}
                  {f.name}
                </div>
              ))}
            </div>
          </div>

          {/* AI Council Panel (Antigravity Chat) */}
          <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', padding: '1rem', background: '#08090b', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-orange)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem', textTransform: 'uppercase' }}>
              <ShieldCheck size={14} /> AI Council Chat
            </h3>
            
            <form onSubmit={handleDeliberate} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Ask the council to code..."
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', border: '1px solid #1f2937', background: '#000', color: '#fff', fontSize: '0.85rem' }}
              />
              <button type="submit" disabled={loading} style={{ background: 'var(--accent-orange)', color: '#fff', border: 'none', borderRadius: '6px', padding: '0 0.8rem', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
                <Send size={14} />
              </button>
            </form>

            {decision && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-green)', fontWeight: 600 }}>
                  <span>Consensus Reached</span>
                  <span>{decision.overallConfidence || 0}% Conf</span>
                </div>
                
                {decision.agentDebates && decision.agentDebates.map((agent: any, idx: number) => (
                  <div key={idx} onClick={() => setSelectedAgent(agent)} style={{ background: '#111318', padding: '0.6rem', borderRadius: '6px', borderLeft: '2px solid var(--accent-blue)', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--accent-blue)', fontSize: '0.8rem' }}>{agent.agentName}</span>
                      <span style={{ color: 'var(--accent-green)', fontSize: '0.75rem' }}>{agent.vote}</span>
                    </div>
                    <p style={{ color: '#9ca3af', fontSize: '0.75rem', lineHeight: 1.4, margin: 0 }}>{agent.opinion.slice(0, 100)}...</p>
                    {agent.command && <p style={{ color: '#eab308', fontSize: '0.7rem', marginTop: '0.3rem', fontFamily: 'monospace' }}>Command included</p>}
                  </div>
                ))}

                <button onClick={handleExecute} disabled={executing} style={{ background: 'var(--accent-green)', color: '#000', border: 'none', borderRadius: '6px', padding: '0.6rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginTop: '0.5rem' }}>
                  <Play size={14} /> {executing ? 'Executing Plan...' : 'Approve & Execute Plan'}
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Right Section: Editor (Top) & Terminal (Bottom) */}
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          
          {/* Editor Area */}
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', background: '#1e1e1e' }}>
            <div style={{ display: 'flex', background: '#090a0d', padding: '0.4rem 1rem', alignItems: 'center', borderBottom: '1px solid #1f2937', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '0.5rem', color: '#d1d5db', fontSize: '0.85rem', alignItems: 'center' }}>
                <Code size={14} color="#60a5fa" />
                <span style={{ fontSize: '0.85rem', color: '#d1d5db', fontFamily: 'var(--font-mono)' }}>{activeFile ? activeFile.name : 'Welcome to Agentic IDE'}</span>
              </div>
              {activeFile && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <button onClick={() => setUseBasicEditor(!useBasicEditor)} style={{ background: '#1f2937', border: '1px solid #374151', color: '#9ca3af', padding: '0.2rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}>
                    {useBasicEditor ? 'Switch to Monaco' : 'Stuck Loading? Use Basic Editor'}
                  </button>
                  <button onClick={saveFile} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'transparent', border: 'none', color: '#34d399', cursor: 'pointer', fontSize: '0.75rem' }}><Save size={14} /> Save (Ctrl+S)</button>
                </div>
              )}
            </div>
            <div style={{ flex: 1, background: '#1e1e1e', position: 'relative' }}>
              {activeFile ? (
                useBasicEditor ? (
                  <textarea
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    style={{ width: '100%', height: '100%', background: '#1e1e1e', color: '#d4d4d4', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', padding: '1rem', border: 'none', outline: 'none', resize: 'none' }}
                  />
                ) : (
                  <Editor
                    height="100%"
                    theme="vs-dark"
                    path={activeFile.name}
                    value={fileContent}
                    onChange={(val) => setFileContent(val || '')}
                    loading={<div style={{ padding: '2rem', color: '#9ca3af', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <span>Loading Monaco Editor... (Waiting on jsdelivr CDN)</span>
                      <button onClick={() => setUseBasicEditor(true)} style={{ background: '#374151', padding: '0.5rem 1rem', borderRadius: '4px', color: '#fff', border: 'none', cursor: 'pointer', width: 'fit-content' }}>Force Basic Editor</button>
                    </div>}
                  />
                )
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563', flexDirection: 'column', gap: '1rem' }}>
                  <Cpu size={48} color="#1f2937" />
                  <p>Select a file from the explorer to edit</p>
                </div>
              )}
            </div>
          </div>

          {/* Draggable Resizer */}
          <div 
            onMouseDown={() => setIsDragging(true)}
            style={{ height: '5px', background: isDragging ? '#60a5fa' : '#1f2937', cursor: 'row-resize', transition: 'background 0.2s' }}
          />

          {/* Integrated Terminal */}
          <div style={{ height: `${terminalHeight}px`, borderTop: '1px solid #1f2937', display: 'flex', flexDirection: 'column', background: '#08090b' }}>
            <div style={{ background: '#090a0d', padding: '0.3rem 1rem', borderBottom: '1px solid #1f2937', color: '#d1d5db', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase', fontWeight: 600 }}>
              <TerminalIcon size={14} /> OpenClaw Terminal
            </div>
            <div ref={terminalRef} style={{ flex: 1, padding: '0.5rem', overflow: 'hidden' }} />
          </div>

        </section>
      </main>

      {/* Agent Modal Popup */}
      {selectedAgent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }} onClick={() => setSelectedAgent(null)}>
          <div style={{ background: '#0f1115', border: '1px solid #1f2937', borderRadius: '8px', padding: '2rem', width: '500px', maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, color: 'var(--accent-blue)', fontSize: '1.2rem', fontWeight: 700 }}>{selectedAgent.agentName}</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {selectedAgent.confidence !== undefined && <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Conf: {selectedAgent.confidence}%</span>}
                <span style={{ background: 'var(--accent-green)', color: '#000', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700 }}>{selectedAgent.vote}</span>
              </div>
            </div>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '1.5rem', fontStyle: 'italic' }}>{selectedAgent.role}</p>
            <h4 style={{ color: '#d1d5db', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Opinion:</h4>
            <p style={{ color: '#e5e7eb', fontSize: '0.9rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selectedAgent.opinion}</p>
            
            {selectedAgent.command && (
              <>
                <h4 style={{ color: '#d1d5db', fontSize: '0.9rem', marginTop: '1.5rem', marginBottom: '0.5rem' }}>Proposed Command:</h4>
                <pre style={{ background: '#000', padding: '1rem', borderRadius: '6px', color: '#60a5fa', overflowX: 'auto', fontSize: '0.85rem' }}>{selectedAgent.command}</pre>
              </>
            )}

            {selectedAgent.highlights && selectedAgent.highlights.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h4 style={{ color: '#d1d5db', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Key Takeaways:</h4>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {selectedAgent.highlights.map((highlight: string, i: number) => (
                    <span key={i} style={{ background: '#1e293b', color: '#93c5fd', border: '1px solid #3b82f6', padding: '0.3rem 0.8rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600 }}>
                      {highlight}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            <button onClick={() => setSelectedAgent(null)} style={{ marginTop: '2rem', width: '100%', background: '#1f2937', color: '#fff', border: 'none', padding: '0.8rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Close</button>
          </div>
        </div>
      )}

    </div>
  );
}
