import React from 'react';

const SvgFilter = () => (
  <svg width="0" height="0" className="absolute hidden">
    <filter id="roughpaper">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
);

const DrawBox = ({ x, y, width, height, text, subtext = '', rx = 10, stroke = 'var(--color-fd-primary)', fill = 'var(--color-fd-card)', textColor = 'currentColor' }: any) => (
  <g>
    <rect 
      x={x} y={y} width={width} height={height} rx={rx} ry={rx}
      fill={fill} stroke={stroke} strokeWidth="2.5" 
      filter="url(#roughpaper)" 
    />
    <text x={x + width / 2} y={y + height / 2 + (subtext ? -5 : 5)} 
          fill={textColor} fontSize="20" style={{ fontFamily: 'var(--font-caveat)' }}
          textAnchor="middle" dominantBaseline="middle">
      {text}
    </text>
    {subtext && (
      <text x={x + width / 2} y={y + height / 2 + 15} 
            fill={textColor} fontSize="14" style={{ fontFamily: 'var(--font-caveat)', opacity: 0.7 }}
            textAnchor="middle" dominantBaseline="middle">
        {subtext}
      </text>
    )}
  </g>
);

const DrawArrow = ({ start, end, label = '', curve = false }: any) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const path = curve 
    ? `M ${start.x} ${start.y} Q ${start.x + dx/2} ${end.y} ${end.x} ${end.y}`
    : `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  
  return (
    <g>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" filter="url(#roughpaper)" markerEnd="url(#arrowhead)" />
      {label && (
        <text x={start.x + dx / 2} y={start.y + dy / 2 - 10} 
              fill="currentColor" fontSize="16" style={{ fontFamily: 'var(--font-caveat)' }}
              textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
};

const ArrowDefs = () => (
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" filter="url(#roughpaper)" />
    </marker>
  </defs>
);

export const ArchitectureDiagram = () => (
  <div className="my-8 overflow-x-auto p-4 border border-fd-border/50 rounded-xl bg-fd-background">
    <SvgFilter />
    <svg width="700" height="400" viewBox="0 0 700 400" xmlns="http://www.w3.org/2000/svg" className="min-w-[700px]">
      <ArrowDefs />
      
      {/* Title */}
      <text x="20" y="30" fill="currentColor" fontSize="28" style={{ fontFamily: 'var(--font-caveat)' }} fontWeight="bold">
        FoxBlaze Architecture
      </text>

      {/* Nodes */}
      <DrawBox x="50" y="80" width="160" height="50" text="Telegram App" />
      <DrawBox x="280" y="80" width="180" height="50" text="GrammY Bot" stroke="#8B5CF6" fill="var(--color-fd-background)" />
      
      <DrawBox x="280" y="170" width="180" height="50" text="Trade Service" />
      <DrawBox x="280" y="260" width="180" height="50" text="Wallet Service" />
      
      <DrawBox x="520" y="170" width="160" height="50" text="BullMQ Queue" stroke="#EF4444" fill="var(--color-fd-background)" />
      <DrawBox x="520" y="260" width="160" height="50" text="Prisma DB" stroke="#3B82F6" fill="var(--color-fd-background)" />
      
      <DrawBox x="520" y="340" width="160" height="50" text="Deposit Scanner" />
      <DrawBox x="280" y="340" width="180" height="50" text="Hyperliquid L1" stroke="#10B981" />

      {/* Edges */}
      <DrawArrow start={{x: 210, y: 105}} end={{x: 280, y: 105}} label="/commands" />
      <DrawArrow start={{x: 370, y: 130}} end={{x: 370, y: 170}} />
      <DrawArrow start={{x: 370, y: 220}} end={{x: 370, y: 260}} />
      
      <DrawArrow start={{x: 460, y: 195}} end={{x: 520, y: 195}} label="add jobs" />
      <DrawArrow start={{x: 460, y: 285}} end={{x: 520, y: 285}} />
      
      <DrawArrow start={{x: 600, y: 340}} end={{x: 600, y: 220}} label="detect deposit" />
      <DrawArrow start={{x: 460, y: 365}} end={{x: 520, y: 365}} curve={true} />
      
      <DrawArrow start={{x: 520, y: 180}} end={{x: 460, y: 180}} curve={true} label="worker" />
      <DrawArrow start={{x: 370, y: 220}} end={{x: 370, y: 340}} />

    </svg>
  </div>
);

export const DepositDiagram = () => (
  <div className="my-8 overflow-x-auto p-4 border border-fd-border/50 rounded-xl bg-fd-background">
    <SvgFilter />
    <svg width="600" height="250" viewBox="0 0 600 250" xmlns="http://www.w3.org/2000/svg" className="min-w-[600px]">
      <ArrowDefs />
      <text x="20" y="30" fill="currentColor" fontSize="28" style={{ fontFamily: 'var(--font-caveat)' }} fontWeight="bold">
        Gasless Deposit Flow
      </text>

      <DrawBox x="50" y="100" width="140" height="60" text="User Wallet" subtext="(Arbitrum L1)" stroke="#3B82F6" />
      <DrawBox x="240" y="100" width="160" height="60" text="DepositService" />
      <DrawBox x="450" y="60" width="130" height="50" text="BullMQ" fill="var(--color-fd-background)" stroke="#EF4444" />
      <DrawBox x="450" y="150" width="130" height="50" text="Hyperliquid" stroke="#10B981" />

      <DrawArrow start={{x: 190, y: 130}} end={{x: 240, y: 130}} label="send USDC" />
      <DrawArrow start={{x: 400, y: 110}} end={{x: 450, y: 85}} label="queue event" />
      <DrawArrow start={{x: 400, y: 140}} end={{x: 450, y: 165}} label="bridge funds" />
    </svg>
  </div>
);

export const TradeDiagram = () => (
  <div className="my-8 overflow-x-auto p-4 border border-fd-border/50 rounded-xl bg-fd-background">
    <SvgFilter />
    <svg width="700" height="150" viewBox="0 0 700 150" xmlns="http://www.w3.org/2000/svg" className="min-w-[700px]">
      <ArrowDefs />
      
      <DrawBox x="20" y="50" width="120" height="50" text="Command" subtext="/long BTC" />
      <DrawBox x="190" y="50" width="140" height="50" text="FSM Panel" subtext="adjust size" />
      <DrawBox x="380" y="50" width="120" height="50" text="RiskService" stroke="#F59E0B" />
      <DrawBox x="550" y="50" width="130" height="50" text="Market Order" stroke="#10B981" />

      <DrawArrow start={{x: 140, y: 75}} end={{x: 190, y: 75}} />
      <DrawArrow start={{x: 330, y: 75}} end={{x: 380, y: 75}} label="confirm" />
      <DrawArrow start={{x: 500, y: 75}} end={{x: 550, y: 75}} label="execute hl" />
    </svg>
  </div>
);
