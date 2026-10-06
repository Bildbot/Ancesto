import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Person, RelationshipRecord, Gender, RelativeRole } from '../../types/genealogy';
import { formatFullName, calculateAge, getParents, getChildren, getSpouses, getSiblings, formatDisplayDate } from '../../utils/kinship';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCcw, 
  Search, 
  Plus, 
  Heart, 
  FileText, 
  Image as ImageIcon, 
  Calendar, 
  Sparkles,
  ChevronDown,
  Layers,
  Filter,
  Crosshair
} from 'lucide-react';

interface FamilyTreeViewProps {
  persons: Person[];
  relationships: RelationshipRecord[];
  onSelectPerson: (personId: string) => void;
  onAddRelative?: (targetPersonId: string, role: RelativeRole) => void;
  focusedPersonId?: string | null;
  onAddFirstPerson?: () => void;
  onLoadDemo?: () => void;
}

interface LayoutNode {
  person: Person;
  x: number;
  y: number;
  width: number;
  height: number;
  generation: number;
}

export const FamilyTreeView: React.FC<FamilyTreeViewProps> = ({
  persons,
  relationships,
  onSelectPerson,
  onAddRelative,
  focusedPersonId,
  onAddFirstPerson,
  onLoadDemo
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Transform states (pan and zoom)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 80, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Touch tracking for pinch-to-zoom on mobile
  const [touchDistance, setTouchDistance] = useState<number | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');

  // Collect all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    persons.forEach(p => p.tags?.forEach(t => tags.add(t)));
    return Array.from(tags);
  }, [persons]);

  // Compute generation levels for persons
  const personGenerations = useMemo(() => {
    const genMap = new Map<string, number>();
    if (persons.length === 0) return genMap;

    // Build bidirectional relationship graph:
    // Parent -> Child: child = parent + 1
    // Spouse <-> Spouse: spouse1 = spouse2 (delta 0)
    // Sibling <-> Sibling: sibling1 = sibling2 (delta 0)
    const adj = new Map<string, { targetId: string; delta: number }[]>();
    persons.forEach(p => adj.set(p.id, []));

    relationships.forEach(rel => {
      if (!adj.has(rel.person1Id) || !adj.has(rel.person2Id)) return;
      if (rel.type === 'parent' || rel.type === 'adoptive-parent') {
        // person1 is parent, person2 is child
        adj.get(rel.person1Id)!.push({ targetId: rel.person2Id, delta: 1 });
        adj.get(rel.person2Id)!.push({ targetId: rel.person1Id, delta: -1 });
      } else if (rel.type === 'child' || rel.type === 'adoptive-child') {
        adj.get(rel.person1Id)!.push({ targetId: rel.person2Id, delta: -1 });
        adj.get(rel.person2Id)!.push({ targetId: rel.person1Id, delta: 1 });
      } else if (rel.type === 'spouse' || rel.type === 'former-spouse') {
        adj.get(rel.person1Id)!.push({ targetId: rel.person2Id, delta: 0 });
        adj.get(rel.person2Id)!.push({ targetId: rel.person1Id, delta: 0 });
      } else if (rel.type === 'sibling') {
        adj.get(rel.person1Id)!.push({ targetId: rel.person2Id, delta: 0 });
        adj.get(rel.person2Id)!.push({ targetId: rel.person1Id, delta: 0 });
      }
    });

    // Find connected components
    const visited = new Set<string>();

    persons.forEach(startPerson => {
      if (visited.has(startPerson.id)) return;

      const component: string[] = [];
      const queue = [startPerson.id];
      visited.add(startPerson.id);

      while (queue.length > 0) {
        const u = queue.shift()!;
        component.push(u);
        const neighbors = adj.get(u) || [];
        for (const edge of neighbors) {
          if (!visited.has(edge.targetId)) {
            visited.add(edge.targetId);
            queue.push(edge.targetId);
          }
        }
      }

      // Check which members have parents in this component
      const hasParentsInComp = new Set<string>();
      component.forEach(id => {
        const edges = adj.get(id) || [];
        for (const e of edges) {
          if (e.delta === -1) {
            // id has an edge with delta -1 pointing to their parent, so id has parents!
            hasParentsInComp.add(id);
          }
        }
      });

      // True roots are people without parents in this component
      let roots = component.filter(id => !hasParentsInComp.has(id));

      // Filter out in-laws who have no parents registered but are married to someone who DOES have parents
      // e.g. Sofia is married to Ilya (who has parent Sergey). Sofia should NOT be considered a generation 0 root ancestor.
      const bloodRoots = roots.filter(id => {
        const edges = adj.get(id) || [];
        const marriedToChild = edges.some(e => e.delta === 0 && hasParentsInComp.has(e.targetId));
        return !marriedToChild;
      });

      if (bloodRoots.length > 0) {
        roots = bloodRoots;
      }

      // Pick the primary root (oldest birth year if known)
      const primaryRootId = roots.sort((a, b) => {
        const pa = persons.find(p => p.id === a);
        const pb = persons.find(p => p.id === b);
        const ya = pa?.birthDate ? parseInt(pa.birthDate.match(/\d{4}/)?.[0] || '9999', 10) : 9999;
        const yb = pb?.birthDate ? parseInt(pb.birthDate.match(/\d{4}/)?.[0] || '9999', 10) : 9999;
        return ya - yb;
      })[0] || component[0];

      // Assign generations relative to primaryRootId
      const tempGen = new Map<string, number>();
      tempGen.set(primaryRootId, 0);

      const q = [primaryRootId];
      while (q.length > 0) {
        const u = q.shift()!;
        const currentGen = tempGen.get(u)!;
        const edges = adj.get(u) || [];

        for (const edge of edges) {
          const targetGen = currentGen + edge.delta;
          if (!tempGen.has(edge.targetId)) {
            tempGen.set(edge.targetId, targetGen);
            q.push(edge.targetId);
          } else {
            // If already visited, enforce spouse equality and parent-child order
            if (edge.delta === 1 && tempGen.get(edge.targetId)! < currentGen + 1) {
              tempGen.set(edge.targetId, currentGen + 1);
              q.push(edge.targetId);
            } else if (edge.delta === 0 && tempGen.get(edge.targetId) !== currentGen) {
              const maxG = Math.max(tempGen.get(edge.targetId)!, currentGen);
              tempGen.set(edge.targetId, maxG);
              tempGen.set(u, maxG);
            }
          }
        }
      }

      // Find minimum generation in this component to normalize to 0
      let minG = 0;
      component.forEach(id => {
        const g = tempGen.get(id) ?? 0;
        if (g < minG) minG = g;
      });

      component.forEach(id => {
        const g = tempGen.get(id) ?? 0;
        genMap.set(id, g - minG);
      });
    });

    // Default any remaining disconnected persons
    persons.forEach(p => {
      if (!genMap.has(p.id)) {
        genMap.set(p.id, 0);
      }
    });

    // Global iterative relaxation to strictly guarantee:
    // 1. Spouses MUST be at the exact same generation level (gen1 === gen2)
    // 2. Children MUST be strictly at a lower generation than their parents (childGen >= parentGen + 1)
    let hasChanges = true;
    let safeguard = 0;
    while (hasChanges && safeguard < 60) {
      hasChanges = false;
      safeguard++;

      // Invariant A: Spouses match exactly
      for (const rel of relationships) {
        if (rel.type === 'spouse' || rel.type === 'former-spouse') {
          const g1 = genMap.get(rel.person1Id);
          const g2 = genMap.get(rel.person2Id);
          if (g1 !== undefined && g2 !== undefined && g1 !== g2) {
            const maxG = Math.max(g1, g2);
            genMap.set(rel.person1Id, maxG);
            genMap.set(rel.person2Id, maxG);
            hasChanges = true;
          } else if (g1 !== undefined && g2 === undefined) {
            genMap.set(rel.person2Id, g1);
            hasChanges = true;
          } else if (g2 !== undefined && g1 === undefined) {
            genMap.set(rel.person1Id, g2);
            hasChanges = true;
          }
        }
      }

      // Invariant B: Children are strictly below parents
      for (const rel of relationships) {
        if (rel.type === 'parent' || rel.type === 'adoptive-parent') {
          const pGen = genMap.get(rel.person1Id);
          const cGen = genMap.get(rel.person2Id);
          if (pGen !== undefined && cGen !== undefined && cGen <= pGen) {
            genMap.set(rel.person2Id, pGen + 1);
            hasChanges = true;
          }
        } else if (rel.type === 'child' || rel.type === 'adoptive-child') {
          const cGen = genMap.get(rel.person1Id);
          const pGen = genMap.get(rel.person2Id);
          if (pGen !== undefined && cGen !== undefined && cGen <= pGen) {
            genMap.set(rel.person1Id, pGen + 1);
            hasChanges = true;
          }
        }
      }
    }

    // Normalize so minimum generation starts at 0
    let globalMin = Infinity;
    persons.forEach(p => {
      const g = genMap.get(p.id);
      if (g !== undefined && g < globalMin) globalMin = g;
    });
    if (globalMin !== Infinity && globalMin !== 0) {
      persons.forEach(p => {
        const g = genMap.get(p.id);
        if (g !== undefined) genMap.set(p.id, g - globalMin);
      });
    }

    return genMap;
  }, [persons, relationships]);

  // Arrange nodes onto 2D layout grid
  const { layoutNodes, connections, generationBands } = useMemo(() => {
    const CARD_WIDTH = 220;
    const CARD_HEIGHT = 100;
    const SPOUSE_GAP = 36;
    const UNIT_GAP = 56;
    const VERTICAL_GAP = 140;

    // Group persons by generation
    const byGen = new Map<number, Person[]>();
    persons.forEach(p => {
      const gen = personGenerations.get(p.id) || 0;
      if (!byGen.has(gen)) byGen.set(gen, []);
      byGen.get(gen)!.push(p);
    });

    const nodes: LayoutNode[] = [];
    const nodeMap = new Map<string, LayoutNode>();

    const sortedGenerations = Array.from(byGen.keys()).sort((a, b) => a - b);

    // Group into family units: couples and single individuals
    interface FamilyUnit {
      type: 'couple' | 'single';
      members: Person[];
      primaryYear: number;
      parentKey: string;
      width: number;
    }

    const genUnitsMap = new Map<number, FamilyUnit[]>();
    const genWidthsMap = new Map<number, number>();

    sortedGenerations.forEach(gen => {
      const genPersons = byGen.get(gen) || [];
      const placedInGen = new Set<string>();

      const units: FamilyUnit[] = [];

      genPersons.forEach(person => {
        if (placedInGen.has(person.id)) return;

        // Check if person has a spouse in this exact generation
        const spouses = getSpouses(person.id, genPersons, relationships);
        const spouseInGen = spouses.find(s => !placedInGen.has(s.person.id));

        const getYear = (p: Person) => {
          return p.birthDate ? parseInt(p.birthDate.match(/\d{4}/)?.[0] || '9999', 10) : 9999;
        };

        const getParentKey = (p: Person) => {
          const parents = getParents(p.id, persons, relationships);
          return parents.map(par => par.id).sort().join('_') || 'no_parent';
        };

        if (spouseInGen) {
          placedInGen.add(person.id);
          placedInGen.add(spouseInGen.person.id);

          // Standard genealogical convention: put male on left, female on right
          let coupleMembers = [person, spouseInGen.person];
          if (person.gender === 'female' && spouseInGen.person.gender === 'male') {
            coupleMembers = [spouseInGen.person, person];
          }

          units.push({
            type: 'couple',
            members: coupleMembers,
            primaryYear: Math.min(getYear(person), getYear(spouseInGen.person)),
            parentKey: getParentKey(person) !== 'no_parent' ? getParentKey(person) : getParentKey(spouseInGen.person),
            width: CARD_WIDTH * 2 + SPOUSE_GAP
          });
        } else {
          placedInGen.add(person.id);
          units.push({
            type: 'single',
            members: [person],
            primaryYear: getYear(person),
            parentKey: getParentKey(person),
            width: CARD_WIDTH
          });
        }
      });

      // Sort units within generation: group siblings together by parents, then by birth year
      units.sort((a, b) => {
        if (a.parentKey !== 'no_parent' && b.parentKey !== 'no_parent' && a.parentKey === b.parentKey) {
          return a.primaryYear - b.primaryYear;
        }
        return a.primaryYear - b.primaryYear;
      });

      genUnitsMap.set(gen, units);

      // Pre-calculate generation row width for symmetrical centering
      let rowW = 0;
      units.forEach((u, idx) => {
        rowW += u.width;
        if (idx < units.length - 1) rowW += UNIT_GAP;
      });
      genWidthsMap.set(gen, rowW);
    });

    // Determine the tree's central horizontal axis
    let maxRowWidth = 0;
    genWidthsMap.forEach(w => {
      if (w > maxRowWidth) maxRowWidth = w;
    });
    const treeCenterX = Math.max(Math.round(maxRowWidth / 2) + 120, 700);

    // Position units per generation, centered around treeCenterX
    sortedGenerations.forEach(gen => {
      const units = genUnitsMap.get(gen) || [];
      const rowWidth = genWidthsMap.get(gen) || 0;
      let currentX = Math.round(treeCenterX - rowWidth / 2);
      const y = 80 + gen * (CARD_HEIGHT + VERTICAL_GAP);

      units.forEach(unit => {
        if (unit.type === 'couple') {
          const [first, second] = unit.members;

          const node1: LayoutNode = {
            person: first,
            x: currentX,
            y,
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            generation: gen
          };
          nodes.push(node1);
          nodeMap.set(first.id, node1);

          currentX += CARD_WIDTH + SPOUSE_GAP;

          const node2: LayoutNode = {
            person: second,
            x: currentX,
            y,
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            generation: gen
          };
          nodes.push(node2);
          nodeMap.set(second.id, node2);

          currentX += CARD_WIDTH + UNIT_GAP;
        } else {
          const person = unit.members[0];
          const node: LayoutNode = {
            person,
            x: currentX,
            y,
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            generation: gen
          };
          nodes.push(node);
          nodeMap.set(person.id, node);

          currentX += CARD_WIDTH + UNIT_GAP;
        }
      });
    });

    // Fine-tune single parents above their children if needed
    sortedGenerations.forEach(gen => {
      const genPersons = byGen.get(gen) || [];
      genPersons.forEach(person => {
        const parentNode = nodeMap.get(person.id);
        if (!parentNode) return;

        const children = getChildren(person.id, persons, relationships);
        const childNodes = children.map(c => nodeMap.get(c.id)).filter(Boolean) as LayoutNode[];

        // Only center if children exist on next row and parent is single alone in gen
        if (childNodes.length > 0) {
          const minChildX = Math.min(...childNodes.map(cn => cn.x));
          const maxChildX = Math.max(...childNodes.map(cn => cn.x + cn.width));
          const targetCenter = (minChildX + maxChildX) / 2 - parentNode.width / 2;

          const spouses = getSpouses(person.id, persons, relationships);
          const spouse = spouses[0]?.person ? nodeMap.get(spouses[0].person.id) : null;

          if (!spouse && genPersons.length === 1) {
            parentNode.x = Math.round(targetCenter);
          }
        }
      });
    });

    // Compute lines / paths for relationships
    interface ConnectionPath {
      id: string;
      path: string;
      type: 'parent-child' | 'spouse' | 'other';
      label?: string;
      color?: string;
      isSameGeneration?: boolean;
      isFormer?: boolean;
      x1?: number;
      x2?: number;
      y?: number;
      midX?: number;
      midY?: number;
      spouse1Name?: string;
      spouse2Name?: string;
    }

    const conns: ConnectionPath[] = [];

    // 1. Spouses (specific horizontal link between couple cards on the same generation)
    const handledSpouses = new Set<string>();
    relationships.forEach(rel => {
      if (rel.type === 'spouse' || rel.type === 'former-spouse') {
        const key = [rel.person1Id, rel.person2Id].sort().join('__');
        if (handledSpouses.has(key)) return;
        handledSpouses.add(key);

        const node1 = nodeMap.get(rel.person1Id);
        const node2 = nodeMap.get(rel.person2Id);
        if (node1 && node2) {
          const leftNode = node1.x < node2.x ? node1 : node2;
          const rightNode = node1.x < node2.x ? node2 : node1;

          const isSameGen = leftNode.generation === rightNode.generation;
          const isFormer = rel.type === 'former-spouse';

          const x1 = leftNode.x + leftNode.width;
          const x2 = rightNode.x;
          const y1 = leftNode.y + leftNode.height / 2;
          const y2 = rightNode.y + rightNode.height / 2;

          let path = '';
          if (isSameGen) {
            // Precise horizontal connector line between spouse cards
            path = `M ${x1} ${y1} L ${x2} ${y2}`;
          } else {
            // Smooth curve fallback if across generations
            const midX = x1 + (x2 - x1) / 2;
            path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
          }

          conns.push({
            id: `spouse-${key}`,
            path,
            type: 'spouse',
            isSameGeneration: isSameGen,
            isFormer,
            x1,
            x2,
            y: y1,
            midX: (x1 + x2) / 2,
            midY: (y1 + y2) / 2,
            label: isFormer ? 'Бывшие супруги' : 'Супружеский союз',
            spouse1Name: `${leftNode.person.firstName} ${leftNode.person.lastName}`,
            spouse2Name: `${rightNode.person.firstName} ${rightNode.person.lastName}`
          });
        }
      }
    });

    // 2. Parent -> Child branching
    // Ensure 100% consistency with getParents (which populates the drawer and kinship cards)
    // and draw connections for every child and every parent.
    const handledPC = new Set<string>();

    persons.forEach(child => {
      const childNode = nodeMap.get(child.id);
      if (!childNode) return;

      const parents = getParents(child.id, persons, relationships);
      parents.forEach(parent => {
        const parentNode = nodeMap.get(parent.id);
        if (!parentNode) return;

        let upperNode = parentNode;
        let lowerNode = childNode;
        if (upperNode.y > lowerNode.y) {
          upperNode = childNode;
          lowerNode = parentNode;
        }
        if (upperNode.person.id === lowerNode.person.id) return;

        const pcKey = `${upperNode.person.id}__${lowerNode.person.id}`;
        if (handledPC.has(pcKey)) return;
        handledPC.add(pcKey);

        const startX = upperNode.x + upperNode.width / 2;
        const startY = upperNode.y + upperNode.height;
        const endX = lowerNode.x + lowerNode.width / 2;
        const endY = lowerNode.y;

        let path = '';
        if (lowerNode.y > upperNode.y) {
          if (Math.abs(startX - endX) < 1) {
            path = `M ${startX} ${startY} L ${endX} ${endY}`;
          } else {
            const midY = startY + (endY - startY) / 2;
            path = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
          }
        } else {
          // Fallback if cards are on the same generation row
          const dipY = startY + 60;
          path = `M ${startX} ${startY} C ${startX} ${dipY}, ${endX} ${dipY}, ${endX} ${endY + lowerNode.height}`;
        }

        conns.push({
          id: `pc-${pcKey}`,
          path,
          type: 'parent-child',
          x1: startX,
          y: startY,
          x2: endX,
          midY: endY
        });
      });
    });

    // Also scan relationships directly for any explicit parent/child records
    relationships.forEach(rel => {
      let parentId: string | null = null;
      let childId: string | null = null;

      if (rel.type === 'parent' || rel.type === 'adoptive-parent') {
        parentId = rel.person1Id;
        childId = rel.person2Id;
      } else if (rel.type === 'child' || rel.type === 'adoptive-child') {
        parentId = rel.person2Id;
        childId = rel.person1Id;
      }

      if (!parentId || !childId) return;

      let parentNode = nodeMap.get(parentId);
      let childNode = nodeMap.get(childId);

      if (!parentNode || !childNode) return;

      let upperNode = parentNode;
      let lowerNode = childNode;
      if (upperNode.y > lowerNode.y) {
        upperNode = childNode;
        lowerNode = parentNode;
      }
      if (upperNode.person.id === lowerNode.person.id) return;

      const pcKey = `${upperNode.person.id}__${lowerNode.person.id}`;
      if (handledPC.has(pcKey)) return;
      handledPC.add(pcKey);

      const startX = upperNode.x + upperNode.width / 2;
      const startY = upperNode.y + upperNode.height;
      const endX = lowerNode.x + lowerNode.width / 2;
      const endY = lowerNode.y;

      let path = '';
      if (lowerNode.y > upperNode.y) {
        if (Math.abs(startX - endX) < 1) {
          path = `M ${startX} ${startY} L ${endX} ${endY}`;
        } else {
          const midY = startY + (endY - startY) / 2;
          path = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
        }
      } else {
        const dipY = startY + 60;
        path = `M ${startX} ${dipY} C ${startX} ${dipY}, ${endX} ${dipY}, ${endX} ${endY + lowerNode.height}`;
      }

      conns.push({
        id: `pc-${rel.id}-${pcKey}`,
        path,
        type: 'parent-child',
        x1: startX,
        y: startY,
        x2: endX,
        midY: endY
      });
    });

    // Generation bands information with accurate dynamic year ranges
    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

    const genBands = sortedGenerations.map(gen => {
      const genPersons = byGen.get(gen) || [];
      const years = genPersons
        .map(p => p.birthDate ? parseInt(p.birthDate.match(/\d{4}/)?.[0] || '0', 10) : 0)
        .filter(y => y > 1000 && y < 2100);

      let yearText = '';
      if (years.length > 0) {
        const minYear = Math.min(...years);
        const maxYear = Math.max(...years);
        yearText = minYear === maxYear ? `(${minYear} г.р.)` : `(${minYear} — ${maxYear} гг.)`;
      }

      const roman = romanNumerals[gen] || `${gen + 1}`;

      let roleText = 'Поколение древа';
      if (sortedGenerations.length === 1) {
        roleText = 'Первое поколение';
      } else if (gen === 0) {
        roleText = 'Родоначальники и старшие предки';
      } else if (gen === 1) {
        roleText = 'Дети и их супруги';
      } else if (gen === 2) {
        roleText = 'Внуки';
      } else if (gen === 3) {
        roleText = 'Правнуки';
      } else {
        roleText = `${gen + 1}-е поколение`;
      }

      const rowWidth = genWidthsMap.get(gen) || 0;
      const bandX = Math.round(treeCenterX - rowWidth / 2);

      return {
        gen,
        x: bandX,
        width: rowWidth,
        y: 80 + gen * (CARD_HEIGHT + VERTICAL_GAP) - 28,
        label: `${roman} Поколение · ${roleText} ${yearText}`.trim()
      };
    });

    return { layoutNodes: nodes, connections: conns, generationBands: genBands };
  }, [persons, relationships, personGenerations]);

  // Center on focused person when requested
  useEffect(() => {
    if (focusedPersonId && containerRef.current) {
      const node = layoutNodes.find(n => n.person.id === focusedPersonId);
      if (node) {
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        setPan({
          x: containerWidth / 2 - (node.x + node.width / 2) * zoom,
          y: containerHeight / 2 - (node.y + node.height / 2) * zoom
        });
      }
    }
  }, [focusedPersonId, layoutNodes, zoom]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.card-clickable')) return;
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

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(Math.max(0.35, prev * zoomFactor), 2.2));
  };

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      if ((e.target as HTMLElement).closest('.card-clickable')) return;
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setTouchDistance(dist);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      setPan({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y
      });
    } else if (e.touches.length === 2 && touchDistance !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / touchDistance;
      setZoom(prev => Math.min(Math.max(0.35, prev * ratio), 2.2));
      setTouchDistance(dist);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setTouchDistance(null);
  };

  // Center tree horizontally and comfortably in viewport
  const centerTree = useCallback(() => {
    if (!containerRef.current || layoutNodes.length === 0) {
      setPan({ x: 80, y: 80 });
      return;
    }
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    const minX = Math.min(...layoutNodes.map(n => n.x));
    const maxX = Math.max(...layoutNodes.map(n => n.x + n.width));
    const minY = Math.min(...layoutNodes.map(n => n.y));
    const maxY = Math.max(...layoutNodes.map(n => n.y + n.height));

    const treeCenterX = (minX + maxX) / 2;
    const treeCenterY = (minY + maxY) / 2;
    const treeWidth = maxX - minX;
    const treeHeight = maxY - minY;

    let targetZoom = 1;
    if (containerWidth > 0 && treeWidth + 140 > containerWidth) {
      targetZoom = Math.max(0.65, Math.min(1, (containerWidth - 140) / treeWidth));
    }

    setZoom(targetZoom);
    setPan({
      x: Math.round(containerWidth / 2 - treeCenterX * targetZoom),
      y: Math.round(Math.max(60, (containerHeight - treeHeight * targetZoom) / 2 - 20))
    });
  }, [layoutNodes]);

  // Automatically center from the center on initial load and when tree data structure changes
  const lastPersonsCountRef = useRef(persons.length);
  const hasAutoCentered = useRef(false);

  useEffect(() => {
    if (layoutNodes.length > 0 && containerRef.current) {
      if (!hasAutoCentered.current || lastPersonsCountRef.current !== persons.length) {
        hasAutoCentered.current = true;
        lastPersonsCountRef.current = persons.length;
        const timer = setTimeout(() => {
          centerTree();
        }, 50);
        return () => clearTimeout(timer);
      }
    }
  }, [layoutNodes, centerTree, persons.length]);

  // Also observe container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      // If user hasn't panned far away or on first ready size
      if (layoutNodes.length > 0 && !focusedPersonId) {
        centerTree();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [centerTree, layoutNodes.length, focusedPersonId]);

  // Zoom control buttons
  const handleZoomIn = () => setZoom(z => Math.min(z + 0.15, 2.2));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.15, 0.35));
  const handleReset = () => {
    centerTree();
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-stone-100 overflow-hidden select-none">
      {/* Search & Quick Controls Floating Bar */}
      <div className="absolute top-4 left-4 right-4 sm:right-auto z-20 flex flex-wrap items-center gap-2 max-w-xl pointer-events-auto">
        <div className="relative flex-1 sm:w-64">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="Найти по ФИО или году..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white/95 backdrop-blur-md border border-stone-200 text-stone-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-xs text-stone-400 hover:text-stone-700"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="relative hidden sm:block">
            <select
              value={selectedTag}
              onChange={e => setSelectedTag(e.target.value)}
              className="py-2 pl-3 pr-8 text-xs rounded-xl bg-white/95 backdrop-blur-md border border-stone-200 text-stone-800 shadow-sm focus:outline-none"
            >
              <option value="all">Все ветви и теги</option>
              {allTags.map(tag => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Zoom and Fit Floating Action Controls */}
      <div className="absolute bottom-6 right-4 sm:right-6 z-20 flex flex-col gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-lg border border-stone-200">
        <button
          onClick={handleZoomIn}
          className="p-2 text-stone-700 hover:bg-stone-100 rounded-xl transition"
          title="Приблизить"
          aria-label="Приблизить"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 text-stone-700 hover:bg-stone-100 rounded-xl transition"
          title="Отдалить"
          aria-label="Отдалить"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="w-full h-px bg-stone-200 my-0.5" />
        <button
          onClick={centerTree}
          className="p-2 text-stone-700 hover:bg-stone-100 rounded-xl transition"
          title="Центрировать древо (по центру экрана)"
          aria-label="Центрировать древо"
        >
          <Crosshair className="w-4 h-4" />
        </button>
        <button
          onClick={handleReset}
          className="p-2 text-stone-700 hover:bg-stone-100 rounded-xl transition"
          title="Сбросить масштаб и вернуть по центру"
          aria-label="Сбросить масштаб"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Main Canvas Area */}
      <div
        ref={containerRef}
        className="flex-1 w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden canvas-interactive"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Empty State Banner */}
        {persons.length === 0 && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-4 pointer-events-none">
            <div className="max-w-md w-full p-6 sm:p-8 rounded-2xl bg-white/95 backdrop-blur-md border border-stone-200 shadow-2xl text-center pointer-events-auto animate-in fade-in">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
                <Sparkles className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-serif font-bold text-stone-900">
                Древо готово к заполнению
              </h2>
              <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                База данных очищена. Добавьте первого человека (себя, родителя или родоначальника), чтобы начать строить генеалогическое древо своими руками.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                {onAddFirstPerson && (
                  <button
                    onClick={onAddFirstPerson}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-stone-900 text-stone-100 hover:bg-stone-800 text-xs font-semibold shadow-md transition flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4 text-amber-400" />
                    <span>Добавить первую персоналию</span>
                  </button>
                )}
                {onLoadDemo && (
                  <button
                    onClick={onLoadDemo}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-medium transition"
                  >
                    Загрузить пример
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Subtle grid pattern */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            backgroundImage: `radial-gradient(#a8a29e 1px, transparent 1px)`,
            backgroundSize: `${30 * zoom}px ${30 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`
          }}
        />

        {/* Scaled and translated world container */}
        <div
          className="absolute origin-top-left will-change-transform"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
          }}
        >
          {/* Generation header rails */}
          {generationBands.map(band => (
            <div
              key={band.gen}
              className="absolute pointer-events-none"
              style={{ top: `${band.y}px`, left: `${band.x}px`, width: `${Math.max(band.width, 360)}px` }}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-serif font-bold text-stone-400 tracking-wider uppercase shrink-0">
                  {band.label}
                </span>
                <div className="flex-1 h-px bg-stone-300/60" />
              </div>
            </div>
          ))}

          {/* SVG Connections between relatives */}
          <svg className="absolute top-0 left-0 w-[4000px] h-[3000px] pointer-events-none overflow-visible">
            <defs>
              <linearGradient id="parentChildGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#b45309" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#d97706" stopOpacity={0.6} />
              </linearGradient>

              {/* Specific gradient and shadow for spouse horizontal connector */}
              <linearGradient id="spouseLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#be123c" />
                <stop offset="50%" stopColor="#fb7185" />
                <stop offset="100%" stopColor="#be123c" />
              </linearGradient>

              <filter id="spouseBadgeShadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#881337" floodOpacity="0.16" />
              </filter>
            </defs>

            {connections.map(conn => {
              if (conn.type === 'spouse') {
                const isSameLevel = conn.isSameGeneration && conn.x1 !== undefined && conn.x2 !== undefined && conn.y !== undefined;
                const tooltipText = conn.spouse1Name && conn.spouse2Name 
                  ? `${conn.spouse1Name} и ${conn.spouse2Name} (${conn.label})` 
                  : (conn.label || 'Супружеский союз');

                if (isSameLevel) {
                  return (
                    <g key={conn.id} className="spouse-connector-group">
                      <title>{tooltipText}</title>

                      {/* 1. Soft glowing backdrop bridge between the two spouse cards */}
                      <line
                        x1={conn.x1}
                        y1={conn.y}
                        x2={conn.x2}
                        y2={conn.y}
                        stroke={conn.isFormer ? "#f1f5f9" : "#ffe4e6"}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeOpacity="0.7"
                      />

                      {/* 2. Specific primary horizontal connector bar */}
                      <line
                        x1={conn.x1}
                        y1={conn.y}
                        x2={conn.x2}
                        y2={conn.y}
                        stroke={conn.isFormer ? "#94a3b8" : "url(#spouseLineGrad)"}
                        strokeWidth={conn.isFormer ? "2" : "2.5"}
                        strokeDasharray={conn.isFormer ? "4 3" : undefined}
                        strokeLinecap="round"
                      />

                      {/* 3. Terminal connection anchor dots locking onto card borders */}
                      <circle
                        cx={conn.x1}
                        cy={conn.y}
                        r="3"
                        fill={conn.isFormer ? "#94a3b8" : "#be123c"}
                      />
                      <circle
                        cx={conn.x2}
                        cy={conn.y}
                        r="3"
                        fill={conn.isFormer ? "#94a3b8" : "#be123c"}
                      />

                      {/* 4. Central decorative marriage badge */}
                      {conn.midX !== undefined && conn.midY !== undefined && (
                        <g transform={`translate(${conn.midX}, ${conn.midY})`} className="pointer-events-auto cursor-help">
                          <circle
                            r="10.5"
                            fill="#ffffff"
                            stroke={conn.isFormer ? "#94a3b8" : "#f43f5e"}
                            strokeWidth="1.5"
                            filter="url(#spouseBadgeShadow)"
                          />
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill={conn.isFormer ? "#64748b" : "#e11d48"}
                            fontSize={conn.isFormer ? "9" : "10"}
                            fontWeight="bold"
                          >
                            {conn.isFormer ? '💔' : '♥'}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                }

                // Fallback rendering if spouses are offset across different generations
                return (
                  <g key={conn.id} className="spouse-connector-group">
                    <title>{tooltipText}</title>
                    <path
                      d={conn.path}
                      fill="none"
                      stroke={conn.isFormer ? "#94a3b8" : "#e11d48"}
                      strokeWidth="2"
                      strokeDasharray="4 3"
                      strokeOpacity="0.8"
                    />
                    {conn.midX !== undefined && conn.midY !== undefined && (
                      <g transform={`translate(${conn.midX}, ${conn.midY})`}>
                        <circle r="9" fill="#fff" stroke={conn.isFormer ? "#94a3b8" : "#f43f5e"} strokeWidth="1.5" />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill={conn.isFormer ? "#64748b" : "#e11d48"}
                          fontSize="9"
                          fontWeight="bold"
                        >
                          {conn.isFormer ? '💔' : '♥'}
                        </text>
                      </g>
                    )}
                  </g>
                );
              }
              return (
                <g key={conn.id} className="parent-child-connector-group">
                  {/* Clean soft backdrop line for contrast */}
                  <path
                    d={conn.path}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    strokeOpacity="0.75"
                  />
                  {/* Primary lineage connection line in heritage amber-brown */}
                  <path
                    d={conn.path}
                    fill="none"
                    stroke="#b45309"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeOpacity="0.9"
                  />
                  {/* Anchor dots locking onto parent and child cards */}
                  {conn.x1 !== undefined && conn.y !== undefined && (
                    <circle cx={conn.x1} cy={conn.y} r="3" fill="#92400e" />
                  )}
                  {conn.x2 !== undefined && conn.midY !== undefined && (
                    <circle cx={conn.x2} cy={conn.midY} r="3" fill="#92400e" />
                  )}
                </g>
              );
            })}
          </svg>

          {/* Persons Cards */}
          {layoutNodes.map(node => {
            const { person } = node;
            const fullName = formatFullName(person, { format: 'natural' });
            const ageInfo = calculateAge(person.birthDate, person.deathDate, person.isDeceased);

            const isMatchingSearch = searchQuery
              ? fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (person.birthDate && person.birthDate.includes(searchQuery)) ||
                (person.occupation && person.occupation.toLowerCase().includes(searchQuery.toLowerCase()))
              : true;

            const isMatchingTag = selectedTag === 'all'
              ? true
              : person.tags?.includes(selectedTag);

            const isHighlighted = isMatchingSearch && isMatchingTag;
            const isTargetFocused = focusedPersonId === person.id;

            return (
              <div
                key={person.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPerson(person.id);
                }}
                className={`card-clickable absolute rounded-xl transition-all duration-150 cursor-pointer select-none group ${
                  isTargetFocused
                    ? 'ring-3 ring-amber-500 shadow-xl scale-102 bg-white'
                    : isHighlighted
                    ? 'bg-white hover:bg-stone-50 hover:shadow-md border border-stone-200/90 shadow-2xs'
                    : 'bg-white/40 border border-stone-200/40 opacity-30 shadow-none'
                }`}
                style={{
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: `${node.width}px`,
                  height: `${node.height}px`
                }}
              >
                <div className="p-3 h-full flex items-center gap-3">
                  {/* Portrait / Monogram */}
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-xl bg-stone-200 overflow-hidden border border-stone-300 flex items-center justify-center">
                      {person.avatarUrl ? (
                        <img
                          src={person.avatarUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-stone-800 text-amber-200 flex items-center justify-center font-serif text-sm font-bold">
                          {person.firstName[0]}
                          {person.lastName[0]}
                        </div>
                      )}
                    </div>
                    {/* Gender badge */}
                    <span 
                      className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full text-white flex items-center justify-center text-[9px] font-bold shadow-2xs ${
                        person.gender === 'female' ? 'bg-rose-500' : 'bg-sky-600'
                      }`}
                    >
                      {person.gender === 'female' ? '♀' : '♂'}
                    </span>
                  </div>

                  {/* Text details */}
                  <div className="flex-1 min-w-0 pr-1">
                    <h3 className="text-xs font-serif font-bold text-stone-900 truncate leading-tight group-hover:text-amber-900">
                      {fullName}
                    </h3>
                    
                    {person.maidenName && (
                      <p className="text-[10px] text-stone-400 italic truncate">
                        урожд. {person.maidenName}
                      </p>
                    )}

                    <p className="text-[11px] font-mono font-medium text-amber-900 mt-0.5 truncate">
                      {person.birthDate ? formatDisplayDate(person.birthDate) : '—'} 
                      {person.isDeceased ? ` — ${person.deathDate ? formatDisplayDate(person.deathDate) : '†'}` : ''}
                    </p>

                    {person.occupation && (
                      <p className="text-[10px] text-stone-500 truncate mt-0.5">
                        {person.occupation}
                      </p>
                    )}

                    {/* Indicators */}
                    <div className="flex items-center gap-2 mt-1 text-stone-400">
                      {person.significantDates?.length > 0 && (
                        <span title={`Значимых дат: ${person.significantDates.length}`} className="flex items-center text-[9px] text-amber-700">
                          <Calendar className="w-2.5 h-2.5 mr-0.5" />
                          {person.significantDates.length}
                        </span>
                      )}
                      {person.mediaFiles?.length > 0 && (
                        <span title={`Медиафайлов: ${person.mediaFiles.length}`} className="flex items-center text-[9px] text-stone-600">
                          <ImageIcon className="w-2.5 h-2.5 mr-0.5" />
                          {person.mediaFiles.length}
                        </span>
                      )}
                      {person.bio && (
                        <span title="Есть биография" className="text-stone-400">
                          <FileText className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
