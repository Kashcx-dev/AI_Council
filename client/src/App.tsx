import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Cpu, Send, CheckCircle, Play, LogOut, FileCode2, Terminal as TerminalIcon, Code, FolderOpen, Save, Folder as FolderIcon, File as FileIcon, X } from 'lucide-react';
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
  const [executing, setExecuting] = useState(false);
  
  // Antigravity Council Turns State Array & Panel Toggle
  const [councilTurns, setCouncilTurns] = useState<any[]>([]);
  const [showCouncilPanel, setShowCouncilPanel] = useState<boolean>(true);
  const [expandedTurnId, setExpandedTurnId] = useState<string | null>(null);

  // IDE State
  const [files, setFiles] = useState<any[]>([]);
  const [activeFile, setActiveFile] = useState<any>(null);
  const [fileContent, setFileContent] = useState('');
  const [originalFileContent, setOriginalFileContent] = useState('');
  
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [councilWidth, setCouncilWidth] = useState(380);
  const [terminalHeight, setTerminalHeight] = useState(240);
  const [showTerminal, setShowTerminal] = useState(true);
  const [activeDrag, setActiveDrag] = useState<'sidebar' | 'council' | 'terminal' | null>(null);
  
  const [useBasicEditor, setUseBasicEditor] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const backendHost = import.meta.env.VITE_BACKEND_HOST || 'http://localhost:4000';

  useEffect(() => {
    if (!activeDrag) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (activeDrag === 'sidebar') {
        setSidebarWidth(Math.max(180, Math.min(e.clientX, 450)));
      } else if (activeDrag === 'council') {
        const newWidth = window.innerWidth - e.clientX;
        setCouncilWidth(Math.max(280, Math.min(newWidth, 550)));
      } else if (activeDrag === 'terminal') {
        const windowHeight = window.innerHeight;
        const newHeight = windowHeight - e.clientY;
        setTerminalHeight(Math.max(100, Math.min(newHeight, windowHeight - 150)));
        fitAddonRef.current?.fit();
      }
    };
    const handleMouseUp = () => setActiveDrag(null);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeDrag]);

  useEffect(() => {
    if (token && terminalRef.current && !xtermRef.current) {
      xtermRef.current = new Terminal({
        theme: { background: '#08090b', foreground: '#d1d5db', cursor: '#ff5e36' },
        fontFamily: 'var(--font-mono)',
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
        } else if (data === '\u007F') { 
          if (currentCommand.length > 0) {
            currentCommand = currentCommand.slice(0, -1);
            xtermRef.current?.write('\b \b');
          }
        } else if (data === '\x03') {
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

  useEffect(() => {
    if (showTerminal) {
      setTimeout(() => fitAddonRef.current?.fit(), 50);
    }
  }, [showTerminal]);

  const getIpcRenderer = () => {
    if ((window as any).ipcRenderer) return (window as any).ipcRenderer;
    if ((window as any).electron?.ipcRenderer) return (window as any).electron.ipcRenderer;
    if (typeof window !== 'undefined' && (window as any).require) {
      try {
        const req = eval("window.require");
        const el = req('electron');
        return el?.ipcRenderer || el;
      } catch (e) {
        console.warn('IPC resolution fallback failed:', e);
      }
    }
    return null;
  };

  const handleTerminalCommand = async (command: string) => {
    const trimmed = command.trim();
    if (!trimmed) {
      xtermRef.current?.write(`${cwdRef.current || '~'} > `);
      return;
    }
    
    if (trimmed.toLowerCase() === 'clear' || trimmed.toLowerCase() === 'cls') {
      xtermRef.current?.clear();
      xtermRef.current?.write(`${cwdRef.current || '~'} > `);
      return;
    }

    if (trimmed.toLowerCase().startsWith('cd ')) {
      const targetDir = trimmed.substring(3).trim();
      const ipcRenderer = getIpcRenderer();
      if (ipcRenderer) {
        try {
          const newCwd = await ipcRenderer.invoke('fs:resolvePath', cwdRef.current, targetDir);
          const files = await ipcRenderer.invoke('fs:listDirectory', newCwd);
          if (files) {
            setCwd(newCwd);
            setFiles(files);
            xtermRef.current?.write(`\r\n\x1b[32mSwitched directory to: ${newCwd}\x1b[0m\r\n${newCwd} > `);
          } else {
            xtermRef.current?.write(`\r\n\x1b[31mDirectory not found: ${newCwd}\x1b[0m\r\n${cwdRef.current} > `);
          }
        } catch (e: any) {
          xtermRef.current?.write(`\r\n\x1b[31mError: ${e.message}\x1b[0m\r\n${cwdRef.current} > `);
        }
      }
      return;
    }

    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
      const res = await ipcRenderer.invoke('cmd:exec', trimmed, cwdRef.current);
      
      if (res.error) xtermRef.current?.writeln(`\x1b[31m${res.error}\x1b[0m`);
      if (res.stdout) {
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
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
      const items = await ipcRenderer.invoke('fs:listDirectory', folderPath);
      setFiles(items);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const ipcRenderer = getIpcRenderer();
      if (ipcRenderer) {
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
    if (activeFile && fileContent !== originalFileContent) {
      const confirmSwitch = window.confirm(`File "${activeFile.name}" has unsaved changes. Discard changes and open "${file.name}"?`);
      if (!confirmSwitch) return;
    }
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
      try {
        const content = await ipcRenderer.invoke('fs:readFile', file.path);
        setActiveFile(file);
        setFileContent(content);
        setOriginalFileContent(content);
      } catch (err: any) {
        console.error('[fs:readFile Error]', err);
        xtermRef.current?.writeln(`\r\n\x1b[31mError reading file ${file.name}: ${err.message || err}\x1b[0m\r\n${cwd} > `);
      }
    }
  };

  const handleCloseFile = () => {
    if (activeFile && fileContent !== originalFileContent) {
      const confirmClose = window.confirm(`File "${activeFile.name}" has unsaved changes. Discard changes and close file?`);
      if (!confirmClose) return;
    }
    setActiveFile(null);
    setFileContent('');
    setOriginalFileContent('');
  };

  const goUpDirectory = () => {
    if (!cwd) return;
    const normalized = cwd.replace(/\//g, '\\');
    let parent = normalized.substring(0, normalized.lastIndexOf('\\'));
    if (parent.length === 2 && parent[1] === ':') parent += '\\';
    if (parent && parent !== cwd) {
      setCwd(parent);
      loadDirectory(parent);
      xtermRef.current?.write(`\r\n\x1b[32mNavigated to: ${parent}\x1b[0m\r\n${parent} > `);
    } else {
      xtermRef.current?.write(`\r\n\x1b[33mAlready at root directory.\x1b[0m\r\n${cwd} > `);
    }
  };

  const saveFile = async () => {
    const ipcRenderer = getIpcRenderer();
    if (!activeFile || !ipcRenderer) return;
    const success = await ipcRenderer.invoke('fs:writeFile', activeFile.path, fileContent);
    if (success) {
      setOriginalFileContent(fileContent);
      xtermRef.current?.writeln(`\r\n\x1b[32mSaved: ${activeFile.name}\x1b[0m\r\n${cwd} > `);
    }
  };

  const handleDeliberate = async (e: React.FormEvent) => {
    e.preventDefault();
    const userPrompt = prompt.trim();
    if (!userPrompt) return;

    setPrompt('');
    setLoading(true);

    const turnId = `turn-${Date.now()}`;
    const newTurn = {
      id: turnId,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      prompt: userPrompt,
      status: 'IN_PROGRESS',
      overallConfidence: 0,
      agentDebates: []
    };

    setCouncilTurns(prev => [...prev, newTurn]);
    setExpandedTurnId(turnId);

    xtermRef.current?.writeln(`\r\n\x1b[36m[AI Council] Deliberating task: "${userPrompt}"...\x1b[0m`);
    
    try {
      const res = await fetch(`${backendHost}/api/council/deliberate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
          prompt: userPrompt, 
          cwd, 
          activeFile: activeFile ? { name: activeFile.name, content: fileContent } : undefined 
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        xtermRef.current?.writeln(`\x1b[31m[AI Council Error] ${data.error || 'Failed to deliberate'}\x1b[0m\r\n${cwd} > `);
        alert(`Council Error: ${data.error || 'Failed to deliberate'}`);
        setCouncilTurns(prev => prev.map(t => t.id === turnId ? { ...t, status: 'DISAGREEMENT', errorDetails: data.error } : t));
        return;
      }

      setCouncilTurns(prev => prev.map(t => t.id === turnId ? {
        ...t,
        status: (data.overallConfidence || 0) >= 80 ? 'CONSENSUS_REACHED' : 'DISAGREEMENT',
        overallConfidence: data.overallConfidence || 0,
        finalCommand: data.finalCommand,
        finalPlan: data.finalPlan,
        agentDebates: data.agentDebates || []
      } : t));

      xtermRef.current?.writeln(`\x1b[36m[AI Council] Consensus reached! Confidence: ${data.overallConfidence}%\x1b[0m\r\n${cwd} > `);
    } catch (err: any) { 
      console.error(err);
      xtermRef.current?.writeln(`\x1b[31m[System Error] ${err.message}\x1b[0m\r\n${cwd} > `);
      setCouncilTurns(prev => prev.map(t => t.id === turnId ? { ...t, status: 'DISAGREEMENT', errorDetails: err.message } : t));
    } finally { setLoading(false); }
  };

  const handleExecuteTurn = async (turn: any) => {
    if (!turn) return;
    setExecuting(true);
    xtermRef.current?.writeln(`\r\n\x1b[33m[OpenClaw] Executing approved plan for: "${turn.prompt}"...\x1b[0m`);
    
    try {
      const res = await fetch(`${backendHost}/api/council/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ plan: turn.finalCommand || turn.finalPlan, cwd }),
      });
      const data = await res.json();
      let hasError = '';
      data.results?.forEach((r: any) => {
        if (r.status === 'SUCCESS') xtermRef.current?.writeln(`\x1b[32m✓ ${r.step} (${r.durationMs}ms)\x1b[0m\r\n${r.output}`);
        else {
          xtermRef.current?.writeln(`\x1b[31m✗ ${r.step} (${r.durationMs}ms)\x1b[0m\r\n${r.output}`);
          hasError = r.output;
        }
      });
      
      loadDirectory(cwd);
      xtermRef.current?.write(`\r\n${cwd} > `);
      
      setCouncilTurns(prev => prev.map(t => t.id === turn.id ? {
        ...t,
        status: hasError ? 'EXECUTION_FAILED' : 'EXECUTION_SUCCESS',
        executionResults: data.results,
        errorDetails: hasError || undefined
      } : t));

    } catch (err: any) {
      console.error(err);
    } finally { setExecuting(false); }
  };

  if (!token) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-darkest)', fontFamily: 'var(--font-sans)' }}>
        <div className="glass-panel" style={{ padding: '2.2rem 2rem', width: '360px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.8rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', letterSpacing: '0.04em', fontFamily: 'var(--font-sans)' }}>
              <Cpu size={22} color="var(--accent-orange)" /> AGENTIC IDE
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)' }}>
              AI Council Command Center
            </p>
          </div>
          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {authMode !== 'verify' ? (
              <>
                <input
                  type="email"
                  placeholder="Email Address"
                  value={authUsername}
                  onChange={e => setAuthUsername(e.target.value)}
                  style={{ padding: '0.7rem 0.9rem', borderRadius: '5px', border: '1px solid var(--border-subtle)', background: 'var(--bg-panel)', color: 'var(--text-main)', fontSize: '0.85rem', outline: 'none', fontFamily: 'var(--font-sans)' }}
                  onFocus={e => e.target.style.borderColor = 'var(--border-focus)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  style={{ padding: '0.7rem 0.9rem', borderRadius: '5px', border: '1px solid var(--border-subtle)', background: 'var(--bg-panel)', color: 'var(--text-main)', fontSize: '0.85rem', outline: 'none', fontFamily: 'var(--font-sans)' }}
                  onFocus={e => e.target.style.borderColor = 'var(--border-focus)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
                  required
                />
              </>
            ) : (
              <input
                type="text"
                placeholder="6-Digit 2FA Code"
                value={verifyCode}
                onChange={e => setVerifyCode(e.target.value)}
                style={{ padding: '0.7rem 0.9rem', borderRadius: '5px', border: '1px solid var(--border-subtle)', background: 'var(--bg-panel)', color: 'var(--text-main)', fontSize: '0.85rem', outline: 'none', letterSpacing: '0.1em', textAlign: 'center', fontFamily: 'var(--font-mono)' }}
                onFocus={e => e.target.style.borderColor = 'var(--border-focus)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
                required
              />
            )}
            <button
              type="submit"
              style={{ padding: '0.75rem', borderRadius: '5px', background: 'var(--accent-orange)', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer', fontSize: '0.85rem', marginTop: '0.4rem', transition: 'filter 0.15s', fontFamily: 'var(--font-sans)' }}
              onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'}
              onMouseLeave={e => e.currentTarget.style.filter = 'none'}
            >
              {authMode === 'login' ? 'Login to IDE' : authMode === 'register' ? 'Register Account' : 'Verify 2FA Code'}
            </button>
            {authMode !== 'verify' && (
              <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem', fontFamily: 'var(--font-sans)' }}>
                {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
                <span
                  style={{ color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                >
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-darkest)', color: 'var(--text-main)', fontFamily: 'var(--font-sans)' }}>
      {/* IDE Top Nav */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 1rem', background: 'var(--bg-header)', borderBottom: '1px solid var(--border-subtle)', height: '40px', userSelect: 'none', fontFamily: 'var(--font-sans)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <h1 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem', letterSpacing: '0.04em', fontFamily: 'var(--font-sans)' }}>
            <Cpu size={15} color="var(--accent-orange)" /> AGENTIC IDE
          </h1>
          <div style={{ height: '16px', width: '1px', background: 'var(--border-subtle)' }} />
          <button
            onClick={handleSelectFolder}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', padding: '0.25rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, transition: 'all 0.15s', fontFamily: 'var(--font-sans)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card-hover)'; e.currentTarget.style.borderColor = 'var(--text-dim)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-panel)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
          >
            <FolderOpen size={13} color="var(--text-muted)" /> Open Workspace
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }} title={cwd}>
            {cwd || 'No workspace selected'}
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.8rem' }}>
          <button
            onClick={() => setShowCouncilPanel(!showCouncilPanel)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: showCouncilPanel ? 'var(--accent-orange-muted)' : 'var(--bg-panel)',
              border: `1px solid ${showCouncilPanel ? 'var(--accent-orange)' : 'var(--border-subtle)'}`,
              color: showCouncilPanel ? 'var(--accent-orange)' : 'var(--text-muted)',
              padding: '0.25rem 0.6rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 700,
              transition: 'all 0.15s',
              fontFamily: 'var(--font-sans)'
            }}
            title="Toggle AI Council Panel"
          >
            <ShieldCheck size={13} color={showCouncilPanel ? 'var(--accent-orange)' : 'var(--text-muted)'} /> AI Council Panel
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-panel)', padding: '0.2rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-sans)' }}>USER:</span>
            <span style={{ color: 'var(--text-main)', fontWeight: 600, fontSize: '0.75rem', fontFamily: 'var(--font-sans)' }}>{username}</span>
            <span
              title="Logout"
              onClick={handleLogout}
              style={{ cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', marginLeft: '0.4rem', transition: 'transform 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-red)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <LogOut size={13} />
            </span>
          </div>
        </div>
      </header>

      {/* Main 3-Pane Resizable Layout */}
      <main style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* PANE 1: Left Sidebar (Full-Height File Explorer) */}
        <aside style={{ width: `${sidebarWidth}px`, display: 'flex', flexDirection: 'column', background: 'var(--bg-sidebar)', userSelect: 'none' }}>
          <div style={{ padding: '0.5rem 0.8rem', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-sans)' }}>
            <span>EXPLORER</span>
            {cwd && (
              <button
                onClick={goUpDirectory}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem', padding: '0 4px', borderRadius: '3px', transition: 'color 0.15s, background 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.background = 'var(--bg-panel)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                title="Go Up Directory"
              >
                ↑
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.3rem 0' }}>
            {files.length === 0 ? (
              <div style={{ padding: '0.8rem 1rem', fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic', fontFamily: 'var(--font-sans)' }}>
                No workspace files. Open a folder to view contents.
              </div>
            ) : (
              files.map((f, i) => {
                const isActive = activeFile?.path === f.path;
                return (
                  <div
                    key={i}
                    onClick={() => handleFileClick(f)}
                    style={{
                      padding: '0.35rem 0.8rem',
                      fontSize: '0.8rem',
                      fontFamily: 'var(--font-mono)',
                      color: isActive ? 'var(--text-main)' : f.isDirectory ? 'var(--text-muted)' : 'var(--text-dim)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      background: isActive ? 'var(--bg-card-hover)' : 'transparent',
                      borderLeft: isActive ? '2px solid var(--accent-orange)' : '2px solid transparent',
                      transition: 'background 0.1s'
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {f.isDirectory ? <FolderIcon size={14} color="var(--text-muted)" /> : <FileIcon size={14} color={isActive ? 'var(--accent-orange)' : 'var(--text-dim)'} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* RESIZER 1: Between File Explorer and Center Workspace */}
        <div
          onMouseDown={() => setActiveDrag('sidebar')}
          style={{ width: '4px', background: activeDrag === 'sidebar' ? 'var(--accent-orange)' : 'var(--border-subtle)', cursor: 'col-resize', transition: 'background 0.15s', zIndex: 10 }}
        />

        {/* PANE 2: Center Workspace (Monaco Editor Top + Terminal Bottom) */}
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* Editor Area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-editor)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', background: 'var(--bg-header)', padding: '0 0.8rem', height: '35px', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', justifyContent: 'space-between', userSelect: 'none', fontFamily: 'var(--font-sans)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: activeFile ? 'var(--bg-editor)' : 'transparent', padding: '0.35rem 0.8rem', height: '35px', borderTop: activeFile ? '2px solid var(--accent-orange)' : '2px solid transparent', borderRight: '1px solid var(--border-subtle)', maxWidth: '280px' }}>
                <Code size={13} color="var(--text-muted)" />
                <span style={{ fontSize: '0.78rem', color: activeFile ? 'var(--text-main)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeFile ? activeFile.name : 'Welcome to Agentic IDE'}
                </span>
                {activeFile && (
                  <span
                    onClick={(e) => { e.stopPropagation(); handleCloseFile(); }}
                    style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', marginLeft: '0.3rem', color: 'var(--text-muted)', transition: 'color 0.15s' }}
                    title="Close File"
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-red)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <X size={13} />
                  </span>
                )}
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <button
                  onClick={() => setShowTerminal(!showTerminal)}
                  style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', padding: '0.2rem 0.5rem', borderRadius: '3px', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem', transition: 'all 0.15s', fontFamily: 'var(--font-sans)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.borderColor = 'var(--text-dim)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                  title="Toggle OpenClaw Terminal"
                >
                  <TerminalIcon size={12} /> {showTerminal ? 'Hide Terminal' : 'Show Terminal'}
                </button>
                {activeFile && (
                  <>
                    <button
                      onClick={() => setUseBasicEditor(!useBasicEditor)}
                      style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', padding: '0.2rem 0.5rem', borderRadius: '3px', cursor: 'pointer', fontSize: '0.7rem', transition: 'all 0.15s', fontFamily: 'var(--font-sans)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.borderColor = 'var(--text-dim)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                    >
                      {useBasicEditor ? 'Switch to Monaco' : 'Stuck Loading? Use Basic Editor'}
                    </button>
                    <button
                      onClick={saveFile}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', color: 'var(--accent-green)', padding: '0.2rem 0.6rem', borderRadius: '3px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, transition: 'all 0.15s', fontFamily: 'var(--font-sans)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-green-muted)'; e.currentTarget.style.borderColor = 'var(--accent-green)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-panel)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                    >
                      <Save size={13} color="var(--accent-green)" /> Save (Ctrl+S)
                    </button>
                  </>
                )}
              </div>
            </div>
            <div style={{ flex: 1, background: 'var(--bg-editor)', position: 'relative' }}>
              {activeFile ? (
                useBasicEditor ? (
                  <textarea
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    style={{ width: '100%', height: '100%', background: 'var(--bg-editor)', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', lineHeight: '1.5', padding: '1rem', border: 'none', outline: 'none', resize: 'none' }}
                  />
                ) : (
                  <Editor
                    height="100%"
                    theme="vs-dark"
                    path={activeFile.path}
                    value={fileContent}
                    onChange={(val) => setFileContent(val || '')}
                    loading={
                      <div style={{ padding: '2rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'var(--bg-editor)', height: '100%', justifyContent: 'center', alignItems: 'center', fontFamily: 'var(--font-sans)' }}>
                        <span style={{ fontSize: '0.85rem' }}>Loading Monaco Editor... (Waiting on jsdelivr CDN)</span>
                        <button
                          onClick={() => setUseBasicEditor(true)}
                          style={{ background: 'var(--bg-panel)', padding: '0.5rem 1rem', borderRadius: '4px', color: 'var(--text-main)', border: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-sans)' }}
                        >
                          Force Basic Editor
                        </button>
                      </div>
                    }
                  />
                )
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', flexDirection: 'column', gap: '0.8rem', userSelect: 'none', fontFamily: 'var(--font-sans)' }}>
                  <Cpu size={42} color="var(--text-dim)" />
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Select a file from the explorer to edit</p>
                </div>
              )}
            </div>
          </div>

          {/* RESIZER 2: Between Editor and OpenClaw Terminal */}
          <div 
            onMouseDown={() => setActiveDrag('terminal')}
            style={{ height: '4px', background: activeDrag === 'terminal' ? 'var(--accent-orange)' : 'var(--border-subtle)', cursor: 'row-resize', transition: 'background 0.15s', zIndex: 10, display: showTerminal ? 'block' : 'none' }}
          />

          {/* OpenClaw Terminal */}
          <div style={{ height: `${terminalHeight}px`, borderTop: '1px solid var(--border-subtle)', display: showTerminal ? 'flex' : 'none', flexDirection: 'column', background: 'var(--bg-darkest)' }}>
            <div style={{ background: 'var(--bg-header)', padding: '0 0.8rem', height: '30px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.06em', userSelect: 'none', fontFamily: 'var(--font-sans)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <TerminalIcon size={13} color="var(--text-muted)" /> OpenClaw Terminal
              </div>
              <button
                onClick={() => setShowTerminal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem', transition: 'color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-main)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                title="Hide Terminal"
              >
                <TerminalIcon size={12} /> Hide Terminal
              </button>
            </div>
            <div ref={terminalRef} style={{ flex: 1, padding: '0.4rem', overflow: 'hidden', background: 'var(--bg-darkest)' }} />
          </div>

        </section>

        {/* RESIZER 3: Between Center Workspace and Right AI Council Panel */}
        {showCouncilPanel && (
          <div
            onMouseDown={() => setActiveDrag('council')}
            style={{ width: '4px', background: activeDrag === 'council' ? 'var(--accent-orange)' : 'var(--border-subtle)', cursor: 'col-resize', transition: 'background 0.15s', zIndex: 10 }}
          />
        )}

        {/* PANE 3: Dedicated Right Sidebar (AI Council Thread Panel) */}
        {showCouncilPanel && (
          <aside style={{ width: `${councilWidth}px`, display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', overflow: 'hidden' }}>
            
            {/* Panel Header */}
            <div style={{ padding: '0.6rem 0.8rem', background: 'var(--bg-header)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none', fontFamily: 'var(--font-sans)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <ShieldCheck size={15} color="var(--text-muted)" />
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>AI COUNCIL MANAGER</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                {councilTurns.length} Turn{councilTurns.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Scrollable Conversation Thread Area */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              
              {councilTurns.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', textAlign: 'center', gap: '0.6rem', padding: '2rem 1rem', fontFamily: 'var(--font-sans)' }}>
                  <ShieldCheck size={36} color="var(--border-subtle)" />
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No deliberations in this workspace yet.</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Submit a prompt below to initiate the multi-agent AI Council debate.</p>
                </div>
              ) : (
                councilTurns.map((turn, tIdx) => {
                  const isExpanded = expandedTurnId === turn.id;
                  const isPassed = turn.status === 'CONSENSUS_REACHED';
                  const isFailed = turn.status === 'EXECUTION_FAILED';
                  const isSuccess = turn.status === 'EXECUTION_SUCCESS';
                  const isInProgress = turn.status === 'IN_PROGRESS';

                  return (
                    <div
                      key={turn.id}
                      style={{
                        background: 'var(--bg-card)',
                        borderRadius: '6px',
                        border: `1px solid ${isExpanded ? 'var(--border-subtle)' : 'transparent'}`,
                        overflow: 'hidden',
                        transition: 'border 0.15s'
                      }}
                    >
                      {/* Turn Summary Header (Always Visible) */}
                      <div
                        onClick={() => setExpandedTurnId(isExpanded ? null : turn.id)}
                        style={{
                          padding: '0.6rem 0.8rem',
                          background: 'var(--bg-card)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.3rem',
                          borderBottom: isExpanded ? '1px solid var(--border-subtle)' : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                            Round #{tIdx + 1} • {turn.timestamp}
                          </span>
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 800,
                              padding: '0.1rem 0.45rem',
                              borderRadius: '3px',
                              textTransform: 'uppercase',
                              fontFamily: 'var(--font-sans)',
                              background: isInProgress ? 'var(--accent-yellow-muted)' : isSuccess ? 'var(--accent-green-muted)' : isFailed ? 'var(--accent-red-muted)' : isPassed ? 'var(--accent-green-muted)' : 'var(--accent-yellow-muted)',
                              color: isInProgress ? 'var(--accent-yellow)' : isSuccess ? 'var(--accent-green)' : isFailed ? 'var(--accent-red)' : isPassed ? 'var(--accent-green)' : 'var(--accent-yellow)'
                            }}
                          >
                            {isInProgress ? '● Deliberating' : isSuccess ? '✓ Executed' : isFailed ? '✕ Exec Error' : isPassed ? '✓ Passed' : '✕ Blocked'}
                          </span>
                        </div>
                        
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.4, fontFamily: 'var(--font-sans)' }}>
                          "{turn.prompt}"
                        </div>
                      </div>

                      {/* Expanded Details Body */}
                      {isExpanded && (
                        <div style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                          
                          {/* Consensus Threshold Bar */}
                          <div style={{ background: 'var(--bg-panel)', padding: '0.5rem 0.7rem', borderRadius: '5px', border: '1px solid var(--border-subtle)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '0.3rem', fontFamily: 'var(--font-sans)' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Confidence Metric</span>
                              <span style={{ color: 'var(--text-main)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{turn.overallConfidence}%</span>
                            </div>
                            <div style={{ position: 'relative', width: '100%', height: '4px', background: 'var(--bg-darkest)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(100, turn.overallConfidence)}%`, background: turn.overallConfidence >= 80 ? 'var(--accent-green)' : 'var(--accent-yellow)' }} />
                            </div>
                          </div>

                          {/* Agent Cards */}
                          {turn.agentDebates && turn.agentDebates.map((agent: any, aIdx: number) => {
                            const isArchitect = agent.agentName?.toLowerCase().includes('llama-3.3') || agent.agentName?.toLowerCase().includes('architect');
                            const isAuditor = agent.agentName?.toLowerCase().includes('llama-3.1') || agent.agentName?.toLowerCase().includes('auditor');
                            const agentColor = isArchitect ? 'var(--accent-architect)' : isAuditor ? 'var(--accent-auditor)' : 'var(--accent-critic)';
                            const AgentIcon = isArchitect ? Cpu : isAuditor ? ShieldCheck : Code;

                            return (
                              <div
                                key={aIdx}
                                onClick={() => setSelectedAgent(agent)}
                                style={{ background: 'var(--bg-panel)', padding: '0.6rem 0.75rem', borderRadius: '5px', borderLeft: `3px solid ${agentColor}`, border: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <AgentIcon size={14} color={agentColor} />
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                      <span style={{ fontWeight: 700, color: agentColor, fontSize: '0.78rem', fontFamily: 'var(--font-sans)' }}>{agent.agentName}</span>
                                      {agent.role && (
                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', fontWeight: 500, lineHeight: 1.1 }}>
                                          {agent.role}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: agent.vote === 'APPROVE' ? 'var(--accent-green)' : 'var(--accent-red)', fontFamily: 'var(--font-sans)' }}>{agent.vote}</span>
                                </div>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.73rem', margin: 0, lineHeight: 1.4, fontFamily: 'var(--font-sans)' }}>{agent.opinion.slice(0, 85)}...</p>
                                {agent.command && (
                                  <div style={{ background: 'var(--bg-darkest)', padding: '0.35rem 0.5rem', borderRadius: '3px', marginTop: '0.3rem', border: '1px solid var(--border-subtle)', fontSize: '0.68rem', color: 'var(--accent-architect)', fontFamily: 'var(--font-mono)' }}>
                                    {agent.command}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Error Action / Retry Badge if execution failed */}
                          {isFailed && turn.errorDetails && (
                            <div style={{ background: 'var(--accent-red-muted)', border: '1px solid var(--accent-red)', padding: '0.6rem', borderRadius: '5px' }}>
                              <div style={{ fontSize: '0.72rem', color: 'var(--accent-red)', fontWeight: 700, marginBottom: '0.3rem', fontFamily: 'var(--font-sans)' }}>Execution Failed</div>
                              <pre style={{ fontSize: '0.68rem', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', margin: 0, whiteSpace: 'pre-wrap' }}>{turn.errorDetails}</pre>
                              <button
                                onClick={() => setPrompt(`Fix error from previous execution:\n${turn.errorDetails}`)}
                                style={{ marginTop: '0.5rem', background: 'var(--bg-panel)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', padding: '0.3rem 0.6rem', borderRadius: '3px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font-sans)' }}
                              >
                                ↵ Copy Error Rationale to Prompt
                              </button>
                            </div>
                          )}

                          {/* Execute Button */}
                          {!isSuccess && turn.finalCommand && (
                            <button
                              onClick={() => handleExecuteTurn(turn)}
                              disabled={executing}
                              style={{
                                background: executing ? 'var(--bg-card-hover)' : 'var(--accent-orange)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '5px',
                                padding: '0.65rem',
                                fontWeight: 800,
                                fontSize: '0.8rem',
                                cursor: executing ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.4rem',
                                marginTop: '0.2rem',
                                fontFamily: 'var(--font-sans)'
                              }}
                            >
                              <Play size={14} fill="#fff" />
                              {executing ? 'PROCEEDING WITH PLAN...' : 'PROCEED & EXECUTE PLAN'}
                            </button>
                          )}

                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Fixed Bottom Input Bar */}
            <div style={{ padding: '0.8rem', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-header)' }}>
              <form onSubmit={handleDeliberate} style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  type="text"
                  placeholder="Ask the council to code..."
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  style={{ flex: 1, padding: '0.6rem 0.75rem', borderRadius: '4px', border: '1px solid var(--border-subtle)', background: 'var(--bg-panel)', color: 'var(--text-main)', fontSize: '0.8rem', outline: 'none', fontFamily: 'var(--font-sans)' }}
                  onFocus={e => e.target.style.borderColor = 'var(--border-focus)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
                />
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: loading ? 'var(--bg-card-hover)' : 'var(--accent-orange)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0 0.85rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-sans)'
                  }}
                >
                  {loading ? <Cpu size={14} color="#fff" /> : <Send size={14} />}
                </button>
              </form>
            </div>

          </aside>
        )}

      </main>

      {selectedAgent && (() => {
        const isArchitect = selectedAgent.agentName?.toLowerCase().includes('llama-3.3') || selectedAgent.agentName?.toLowerCase().includes('architect');
        const isAuditor = selectedAgent.agentName?.toLowerCase().includes('llama-3.1') || selectedAgent.agentName?.toLowerCase().includes('auditor');
        const agentColor = isArchitect ? 'var(--accent-blue)' : isAuditor ? 'var(--accent-orange)' : 'var(--accent-purple)';
        const AgentIcon = isArchitect ? Cpu : isAuditor ? ShieldCheck : Code;
        const voteColor = selectedAgent.vote === 'APPROVE' ? 'var(--accent-green)' : selectedAgent.vote === 'REJECT' ? 'var(--accent-red)' : 'var(--accent-blue)';

        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(8px)' }} onClick={() => setSelectedAgent(null)}>
            <div style={{ background: 'var(--bg-panel)', border: `1px solid ${agentColor}`, borderRadius: '8px', padding: '1.8rem', width: '560px', maxWidth: '90%', maxHeight: '85vh', overflowY: 'auto', boxShadow: `0 20px 50px rgba(0, 0, 0, 0.8), 0 0 20px ${agentColor}33` }} onClick={e => e.stopPropagation()}>
              
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AgentIcon size={18} color={agentColor} />
                  <div>
                    <h2 style={{ margin: 0, color: agentColor, fontSize: '1.1rem', fontWeight: 800 }}>{selectedAgent.agentName}</h2>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>{selectedAgent.role}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  {selectedAgent.confidence !== undefined && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>Conf: {selectedAgent.confidence}%</span>}
                  <span style={{ background: voteColor, color: '#000', padding: '0.2rem 0.65rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {selectedAgent.vote}
                  </span>
                </div>
              </div>

              {/* PRIMARY VISUAL FOCUS: Proposed Execution Artifact Block */}
              {selectedAgent.command ? (
                <div style={{ marginTop: '1rem', background: 'var(--bg-darkest)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-focus)', boxShadow: '0 0 15px rgba(59, 130, 246, 0.15)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--accent-yellow)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      PROPOSED EXECUTION ARTIFACT
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Shell Execution</span>
                  </div>
                  <pre style={{ background: '#000', padding: '0.9rem', borderRadius: '4px', color: 'var(--accent-blue)', overflowX: 'auto', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-subtle)', margin: 0 }}>
                    {selectedAgent.command}
                  </pre>
                </div>
              ) : (
                <div style={{ marginTop: '1rem', background: 'var(--bg-darkest)', padding: '0.8rem 1rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', color: 'var(--text-dim)', fontSize: '0.75rem', fontStyle: 'italic' }}>
                  No standalone CLI artifact proposed. Deliberation opinion only.
                </div>
              )}

              {/* SECONDARY: Deliberation Opinion & Rationale */}
              <div style={{ marginTop: '1.2rem' }}>
                <h4 style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deliberation Rationale:</h4>
                <div style={{ background: 'var(--bg-darkest)', padding: '0.9rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', fontSize: '0.82rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {selectedAgent.opinion}
                </div>
              </div>

              {/* SECONDARY: Key Takeaways */}
              {selectedAgent.highlights && selectedAgent.highlights.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <h4 style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Key Takeaways:</h4>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {selectedAgent.highlights.map((highlight: string, i: number) => (
                      <span key={i} style={{ background: 'var(--bg-card-hover)', color: 'var(--accent-blue)', border: '1px solid var(--border-subtle)', padding: '0.25rem 0.7rem', borderRadius: '15px', fontSize: '0.72rem', fontWeight: 600 }}>
                        {highlight}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Close Button */}
              <button
                onClick={() => setSelectedAgent(null)}
                style={{ marginTop: '1.5rem', width: '100%', background: 'var(--bg-header)', color: 'var(--text-main)', border: '1px solid var(--border-subtle)', padding: '0.65rem', borderRadius: '5px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', transition: 'all 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-header)'}
              >
                Close Artifact Review
              </button>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
