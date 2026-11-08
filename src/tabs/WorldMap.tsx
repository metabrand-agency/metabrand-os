// HQ locations on a world map (Natural Earth projection, 110m land outline). Loaded on demand.
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import land from 'world-atlas/land-110m.json';

export type MapPoint = { id: string; name: string; lat: number; lng: number; client?: boolean };

const W = 960, H = 470;
const landShape = feature(land as any, (land as any).objects.land) as any;

export default function WorldMap({ points }: { points: MapPoint[] }) {
  // zoom to where the companies are (with room for labels); world view if they are spread out
  const projection = geoNaturalEarth1();
  const coords = points.map((p) => [p.lng, p.lat] as [number, number]);
  projection.fitExtent([[90, 70], [W - 200, H - 60]], { type: 'MultiPoint', coordinates: coords } as any);
  const MAX = 1100, MIN = 175;
  if (projection.scale() > MAX || coords.length < 2) {
    const c = coords[0] || [0, 20];
    projection.scale(coords.length < 2 ? 600 : MAX).center([0, 0]).rotate([0, 0]).translate([W / 2, H / 2]);
    const xy = projection(c)!;
    projection.translate([W / 2 - (xy[0] - W / 2), H / 2 - (xy[1] - H / 2)]);
  } else if (projection.scale() < MIN) {
    projection.scale(MIN).translate([W / 2, H / 2 + 20]);
  }
  const path = geoPath(projection);
  // companies in the same city share one dot
  const groups: { x: number; y: number; names: string[]; client: boolean }[] = [];
  for (const p of points) {
    const xy = projection([p.lng, p.lat]);
    if (!xy) continue;
    const g = groups.find((q) => Math.hypot(q.x - xy[0], q.y - xy[1]) < 10);
    if (g) { g.names.push(p.name); g.client ||= !!p.client; } else groups.push({ x: xy[0], y: xy[1], names: [p.name], client: !!p.client });
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full overflow-hidden" role="img" aria-label="Headquarters on a map">
      <defs><clipPath id="mapclip"><rect width={W} height={H} /></clipPath></defs>
      <path d={path(landShape) || ''} fill="var(--mb-panel-2)" stroke="var(--mb-line)" strokeWidth={0.6} clipPath="url(#mapclip)" />
      {groups.map((g, i) => (
        <g key={i}>
          <circle cx={g.x} cy={g.y} r={g.client ? 7 : 5} fill={g.client ? 'var(--mb-brand)' : 'var(--mb-text)'} stroke={g.client ? 'var(--mb-text)' : 'var(--mb-panel)'} strokeWidth={g.client ? 1.5 : 2} />
          {g.names.map((n, j) => (
            <text key={n} x={g.x + 10} y={g.y + 4 + j * 15} fontSize={12.5} fill="var(--mb-text)" style={{ paintOrder: 'stroke', stroke: 'var(--mb-panel)', strokeWidth: 4 }}>{n}</text>
          ))}
        </g>
      ))}
    </svg>
  );
}
