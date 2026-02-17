import React, { useState, useEffect, useRef } from 'react';
import * as Neutralino from '@neutralinojs/lib';

const Terminal: React.FC = () => {
  const [output, setOutput] = useState<string[]>(['> Ready.']);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const executeCommand = async (cmd: string) => {
    if (!cmd.trim()) return;
    
    setOutput(prev => [...prev, `$ ${cmd}`]);
    try {
        // @ts-ignore
      const result = await Neutralino.os.execCommand(cmd);
      const lines = result.stdOut.split('\n').filter(Boolean);
      const errors = result.stdErr.split('\n').filter(Boolean);
      setOutput(prev => [...prev, ...lines, ...errors]);
    } catch (e) {
      setOutput(prev => [...prev, `Error: ${JSON.stringify(e)}`]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand(input);
      setInput('');
    }
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  return (
    <div 
      className="h-full font-mono text-xs p-3 overflow-hidden flex flex-col"
      style={{ backgroundColor: 'transparent', color: '#22c55e' }}
    >
      <div className="flex-1 overflow-y-auto mb-2 space-y-0.5 custom-scrollbar">
        {output.map((line, i) => (
          <div 
            key={i} 
            className="break-words whitespace-pre-wrap"
            style={{ color: line.startsWith('$') ? '#60a5fa' : line.startsWith('Error') ? '#f87171' : '#22c55e' }}
          >
            {line}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex items-center pt-1 shrink-0" style={{ borderTop: '1px solid var(--border-color)' }}>
        <span className="mr-2 font-bold" style={{ color: 'var(--accent-primary)' }}>{'>'}</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent outline-none placeholder-slate-600"
          style={{ color: 'var(--text-main)' }}
          placeholder="Type command..."
          autoFocus
        />
      </div>
    </div>
  );
};

export default Terminal;
