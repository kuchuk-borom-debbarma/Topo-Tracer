import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export function ContainerNode({ data }: NodeProps) {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      border: '1px dashed var(--glass-border)',
      background: 'rgba(255, 255, 255, 0.02)',
      borderRadius: 'var(--border-radius-md)',
      padding: '1rem',
      position: 'relative'
    }}>
      <div style={{ 
        position: 'absolute', 
        top: '-10px', 
        left: '20px', 
        background: 'var(--bg-base)', 
        padding: '0 10px', 
        color: 'var(--text-secondary)',
        fontSize: '0.8rem',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-green)' }}></div>
        {data.label as string}
      </div>
    </div>
  );
}

export function ExecutionNode({ data }: NodeProps) {
  // Determine color based on node type
  const nodeType = data.nodeType as string;
  let color = 'var(--text-primary)';
  let borderColor = 'var(--glass-border)';
  
  if (nodeType.includes('http') || nodeType.includes('api')) {
    color = 'var(--accent-green)';
    borderColor = 'rgba(78, 201, 176, 0.3)';
  } else if (nodeType.includes('db')) {
    color = 'var(--accent-cyan)';
    borderColor = 'rgba(86, 156, 214, 0.3)';
  } else if (nodeType.includes('rpc') || nodeType.includes('grpc')) {
    color = 'var(--accent-purple)';
    borderColor = 'rgba(197, 134, 192, 0.3)';
  } else if (nodeType.includes('event') || nodeType.includes('queue') || nodeType.includes('kafka')) {
    color = 'var(--accent-yellow)';
    borderColor = 'rgba(220, 220, 170, 0.3)';
  } else {
    color = 'var(--accent-pink)';
  }

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${borderColor}`,
      borderRadius: 'var(--border-radius-sm)',
      padding: '0.5rem 0.75rem',
      minWidth: '150px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      position: 'relative'
    }}>
      <Handle type="target" position={Position.Top} style={{ background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
        <div style={{ fontSize: '0.7rem', color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {nodeType}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {data.durationMs as number}ms
        </div>
      </div>
      <div style={{ fontFamily: 'Fira Code, monospace', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
        {data.label as string}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </div>
  );
}
