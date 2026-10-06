import React, { useState, useMemo, useRef } from 'react';
import { Person, RelationshipRecord } from '../../types/genealogy';
import { formatFullName, describeKinship } from '../../utils/kinship';
import { ZoomIn, ZoomOut, RotateCcw, Users, Heart, Share2, Sparkles } from 'lucide-react';

interface NetworkGraphViewProps {
  persons: Person[];
  relationships: RelationshipRecord[];
  onSelectPerson: (personId: string) => void;
  focusedPersonId?: string | null;
  onAddFirstPerson?: () => void;
}

export const NetworkGraphView: React.FC<NetworkGraphViewProps> = ({
  persons,
  relationships,
  onSelectPerson,
  focusedPersonId,
  onAddFirstPerson
}) => {
  const [activePersonId, setActivePersonId] = useState<string | null>(
    focusedPersonId || (persons[0]?.id ?? null)
  );

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Filter relationship types
  const [filterType, setFilterType] = useState<'all' | 'blood' | 'spouses'>('all');

  // Compute node coordinates radially or force-distributed around active person
  const { nodes, edges } = useMemo(() => {
    const centerPerson = persons.find(p => p.id === activePersonId) || persons[0];
    if (!centerPerson) return { nodes: [], edges: [] };

    // Layout configuration
    const CENTER_X = 600;
    const CENTER_Y = 400;

    // Find 1st degree connections
    const firstDegreeMap = new Map<string, string>(); // personId -> relation label
    const activeEdges: { from: string; to: string; label: string; type: string }[] = [];

    relationships.forEach(rel => {
      let otherId: string | null = null;
      if (rel.person1Id === centerPerson.id) otherId = rel.person2Id;
      else if (rel.person2Id === centerPerson.id) otherId = rel.person1Id;

      if (otherId) {
        const otherPerson = persons.find(p => p.id === otherId);
        if (otherPerson) {
          const label = describeKinship(otherPerson, centerPerson, persons, relationships);
          firstDegreeMap.set(otherId, label);
          activeEdges.push({
            from: centerPerson.id,
            to: otherId,
            label,
            type: rel.type
          });
        }
      }
    });

    const firstDegreeIds = Array.from(firstDegreeMap.keys());
    const nodeCoords: {
      person: Person;
      x: number;
      y: number;
      isCenter: boolean;
      relationToCenter?: string;
    }[] = [];

    // Center node
    nodeCoords.push({
      person: centerPerson,
      x: CENTER_X,
      y: CENTER_Y,
      isCenter: true,
      relationToCenter: 'Центральная персона'
    });

    // Ring 1: 1st Degree Relatives (radius ~ 230)
    const ring1Radius = 240;
    const ring1Count = firstDegreeIds.length;

    firstDegreeIds.forEach((id, idx) => {
      const p = persons.find(item => item.id === id);
      if (!p) return;
      const angle = (idx / (ring1Count || 1)) * 2 * Math.PI - Math.PI / 2;
      nodeCoords.push({
        person: p,
        x: CENTER_X + ring1Radius * Math.cos(angle),
        y: CENTER_Y + ring1Radius * Math.sin(angle),
        isCenter: false,
        relationToCenter: firstDegreeMap.get(id)
      });
    });

    // Ring 2: Other family members (radius ~ 420)
    const otherPersons = persons.filter(
      p => p.id !== centerPerson.id && !firstDegreeMap.has(p.id)
    );
    const ring2Radius = 430;
    const ring2Count = otherPersons.length;

    otherPersons.forEach((p, idx) => {
      const angle = (idx / (ring2Count || 1)) * 2 * Math.PI;
      nodeCoords.push({
        person: p,
        x: CENTER_X + ring2Radius * Math.cos(angle),
        y: CENTER_Y + ring2Radius * Math.sin(angle),
        isCenter: false,
        relationToCenter: describeKinship(p, centerPerson, persons, relationships)
      });
    });

    // Connect existing relationships between visible nodes
    const edgeCoords: {
      id: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      label: string;
      isPrimary: boolean;
      type: string;
    }[] = [];

    const coordMap = new Map(nodeCoords.map(n => [n.person.id, n]));

    relationships.forEach(rel => {
      const n1 = coordMap.get(rel.person1Id);
      const n2 = coordMap.get(rel.person2Id);
      if (n1 && n2) {
        const isPrimary = n1.isCenter || n2.isCenter;
        if (filterType === 'spouses' && rel.type !== 'spouse') return;
        if (filterType === 'blood' && (rel.type === 'spouse' || rel.type === 'custom')) return;

        edgeCoords.push({
          id: rel.id,
          x1: n1.x,
          y1: n1.y,
          x2: n2.x,
          y2: n2.y,
          label: rel.type === 'spouse' 
            ? 'Супруги' 
            : (rel.type === 'parent' || rel.type === 'child' || rel.type === 'adoptive-parent' || rel.type === 'adoptive-child') 
            ? 'Родитель / Ребенок' 
            : 'Родство',
          isPrimary,
          type: rel.type
        });
      }
    });

    return { nodes: nodeCoords, edges: edgeCoords };
  }, [persons, relationships, activePersonId, filterType]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.network-node')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const activePerson = persons.find(p => p.id === activePersonId);

  return (
    <div className="relative w-full h-full flex flex-col bg-stone-100 overflow-hidden select-none">
      {/* Top Filter and Info Bar */}
      <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur-md p-2 rounded-2xl shadow-sm border border-stone-200">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
              filterType === 'all'
                ? 'bg-stone-900 text-stone-100'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            Все связи
          </button>
          <button
            onClick={() => setFilterType('blood')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
              filterType === 'blood'
                ? 'bg-stone-900 text-stone-100'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            Кровные ветви
          </button>
          <button
            onClick={() => setFilterType('spouses')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
              filterType === 'spouses'
                ? 'bg-stone-900 text-stone-100'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            Брачные союзы
          </button>
        </div>

        {activePerson && (
          <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-stone-200 text-xs text-stone-600">
            <span>Центр карты:</span>
            <strong className="text-stone-900">{formatFullName(activePerson, { format: 'short' })}</strong>
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-lg border border-stone-200">
        <button
          onClick={() => setZoom(z => Math.min(z + 0.15, 2.0))}
          className="p-2 text-stone-700 hover:bg-stone-100 rounded-xl"
          title="Приблизить"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom(z => Math.max(z - 0.15, 0.4))}
          className="p-2 text-stone-700 hover:bg-stone-100 rounded-xl"
          title="Отдалить"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="w-full h-px bg-stone-200 my-0.5" />
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="p-2 text-stone-700 hover:bg-stone-100 rounded-xl"
          title="Сбросить"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas */}
      <div
        className="flex-1 w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {persons.length === 0 && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-4 pointer-events-none">
            <div className="max-w-md w-full p-6 sm:p-8 rounded-2xl bg-white/95 backdrop-blur-md border border-stone-200 shadow-2xl text-center pointer-events-auto animate-in fade-in">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
                <Share2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-serif font-bold text-stone-900">
                Карта связей пока пуста
              </h2>
              <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                Добавьте членов семьи, чтобы увидеть интерактивный радиальный граф родственных связей.
              </p>
              {onAddFirstPerson && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={onAddFirstPerson}
                    className="px-5 py-2.5 rounded-xl bg-stone-900 text-stone-100 hover:bg-stone-800 text-xs font-semibold shadow-md transition"
                  >
                    + Добавить персоналию
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div
          className="absolute origin-center will-change-transform"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            width: '1200px',
            height: '800px',
            left: 'calc(50% - 600px)',
            top: 'calc(50% - 400px)'
          }}
        >
          {/* Radial orbit guides */}
          <div className="absolute top-[400px] left-[600px] -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full border border-stone-300/40 pointer-events-none" />
          <div className="absolute top-[400px] left-[600px] -translate-x-1/2 -translate-y-1/2 w-[860px] h-[860px] rounded-full border border-stone-300/30 pointer-events-none" />

          {/* SVG Connection Lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {edges.map(edge => (
              <g key={edge.id}>
                <line
                  x1={edge.x1}
                  y1={edge.y1}
                  x2={edge.x2}
                  y2={edge.y2}
                  stroke={
                    edge.type === 'spouse'
                      ? '#f43f5e'
                      : edge.isPrimary
                      ? '#b45309'
                      : '#d6d3d1'
                  }
                  strokeWidth={edge.isPrimary ? 2.5 : 1.2}
                  strokeDasharray={edge.type === 'spouse' ? '4 3' : undefined}
                  strokeOpacity={edge.isPrimary ? 0.9 : 0.4}
                />
              </g>
            ))}
          </svg>

          {/* Person Nodes */}
          {nodes.map(({ person, x, y, isCenter, relationToCenter }) => {
            const fullName = formatFullName(person, { format: 'natural' });

            return (
              <div
                key={person.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePersonId(person.id);
                  onSelectPerson(person.id);
                }}
                className={`network-node absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer transition-all duration-200 group ${
                  isCenter ? 'z-30 scale-110' : 'z-10 hover:z-20 hover:scale-105'
                }`}
                style={{ left: `${x}px`, top: `${y}px` }}
              >
                {/* Avatar Circle */}
                <div
                  className={`w-14 h-14 rounded-2xl p-0.5 overflow-hidden shadow-md transition ${
                    isCenter
                      ? 'ring-4 ring-amber-500 bg-amber-500 shadow-xl'
                      : 'bg-white group-hover:ring-2 group-hover:ring-stone-400'
                  }`}
                >
                  <div className="w-full h-full rounded-[14px] overflow-hidden bg-stone-200 flex items-center justify-center">
                    {person.avatarUrl ? (
                      <img src={person.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-stone-800 text-amber-200 flex items-center justify-center font-serif text-xs font-bold">
                        {person.firstName[0]}
                        {person.lastName[0]}
                      </div>
                    )}
                  </div>
                </div>

                {/* Name Badge */}
                <div className="mt-1 text-center max-w-[130px]">
                  <p className="text-[11px] font-bold font-serif text-stone-900 leading-tight truncate px-1 rounded bg-white/80 shadow-2xs">
                    {formatFullName(person, { format: 'short' })}
                  </p>
                  {relationToCenter && (
                    <span className="text-[10px] text-amber-800 font-semibold block truncate">
                      {relationToCenter}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
