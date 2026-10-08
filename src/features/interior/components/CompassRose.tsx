const LABELS = [
  { text: '北', deg: 0, north: true },
  { text: '东', deg: 90, north: false },
  { text: '南', deg: 180, north: false },
  { text: '西', deg: 270, north: false },
] as const;

/** 指北针：整体按北方角度顺时针旋转，方位文字保持正向；北向用主色高亮。 */
export function CompassRose({ angle, className = 'plan-compass' }: { angle: number; className?: string }) {
  return <div className={className} role="img" aria-label={`指北针：北偏 ${angle}°`}>
    <svg viewBox="-50 -50 100 100" aria-hidden="true">
      <circle className="compass-ring" r="27" />
      <g transform={`rotate(${angle})`}>
        {[0, 90, 180, 270].map(deg => <line key={deg} className="compass-tick" x1="0" y1="-27" x2="0" y2="-22" transform={`rotate(${deg})`} />)}
        <path className="compass-needle-south" d="M0 20 L6 0 L-6 0 Z" />
        <path className="compass-needle-north" d="M0 -20 L6 0 L-6 0 Z" />
        <circle className="compass-hub" r="2.5" />
        {LABELS.map(l => <text key={l.text} className={l.north ? 'compass-label compass-label-north' : 'compass-label'}
          transform={`rotate(${l.deg}) translate(0 -38) rotate(${-l.deg - angle})`}
          textAnchor="middle" dominantBaseline="central">{l.text}</text>)}
      </g>
    </svg>
  </div>;
}
