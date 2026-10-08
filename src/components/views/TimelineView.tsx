import React, { useState, useMemo } from 'react';
import { Person, SignificantDate } from '../../types/genealogy';
import { formatFullName, formatDisplayDate, compareGenealogyDates, extractYear } from '../../utils/kinship';
import { Calendar, MapPin, Search, Filter, User, ChevronRight } from 'lucide-react';

interface TimelineViewProps {
  persons: Person[];
  onSelectPerson: (personId: string) => void;
}

interface TimelineEntry {
  id: string;
  dateStr: string;
      year: number;
  person: Person;
  title: string;
  location?: string;
  description?: string;
  type: 'milestone' | 'birth' | 'death';
}

export const TimelineView: React.FC<TimelineViewProps> = ({ persons, onSelectPerson }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string>('all');
  const [selectedCentury, setSelectedCentury] = useState<string>('all');

  // Flatten all historical milestones, births, and deaths
  const allEvents = useMemo(() => {
    const list: TimelineEntry[] = [];

    const parseYear = (str?: string): number => extractYear(str) ?? 0;

    persons.forEach(person => {
      // Birth event
      if (person.birthDate) {
        list.push({
          id: `birth-${person.id}`,
          dateStr: person.birthDate,
          year: parseYear(person.birthDate),
          person,
          title: `Рождение: ${formatFullName(person, { format: 'natural' })}`,
          location: person.birthPlace,
          type: 'birth'
        });
      }

      // Significant dates
      if (person.significantDates) {
        person.significantDates.forEach(sd => {
          list.push({
            id: `sd-${sd.id}`,
            dateStr: sd.date,
            year: parseYear(sd.date),
            person,
            title: sd.title,
            location: sd.location,
            description: sd.description,
            type: 'milestone'
          });
        });
      }

      // Death event
      if (person.isDeceased && person.deathDate) {
        list.push({
          id: `death-${person.id}`,
          dateStr: person.deathDate,
          year: parseYear(person.deathDate),
          person,
          title: `Кончина: ${formatFullName(person, { format: 'natural' })}`,
          location: person.deathPlace,
          type: 'death'
        });
      }
    });

    // Sort chronologically ascending
    list.sort((a, b) => compareGenealogyDates(a.dateStr, b.dateStr));
    return list;
  }, [persons]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return allEvents.filter(event => {
      if (selectedPersonId !== 'all' && event.person.id !== selectedPersonId) return false;
      if (selectedCentury === '19' && (event.year < 1800 || event.year >= 1900)) return false;
      if (selectedCentury === '20' && (event.year < 1900 || event.year >= 2000)) return false;
      if (selectedCentury === '21' && event.year < 2000) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = event.title.toLowerCase().includes(q);
        const matchesDesc = event.description?.toLowerCase().includes(q);
        const matchesLoc = event.location?.toLowerCase().includes(q);
        const matchesName = formatFullName(event.person).toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesLoc && !matchesName) return false;
      }

      return true;
    });
  }, [allEvents, selectedPersonId, selectedCentury, searchQuery]);

  return (
    <div className="w-full h-full flex flex-col bg-stone-100 overflow-hidden">
      {/* Top Filter Bar */}
      <div className="p-4 sm:p-5 bg-white border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[240px] max-w-md relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Поиск по событиям, местам, именам..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-stone-50 border border-stone-200 text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Person filter */}
          <select
            value={selectedPersonId}
            onChange={e => setSelectedPersonId(e.target.value)}
            className="py-2 px-3 text-xs rounded-xl bg-stone-50 border border-stone-200 text-stone-800"
          >
            <option value="all">Все члены семьи</option>
            {persons.map(p => (
              <option key={p.id} value={p.id}>
                {formatFullName(p, { format: 'short' })}
              </option>
            ))}
          </select>

          {/* Century filter */}
          <select
            value={selectedCentury}
            onChange={e => setSelectedCentury(e.target.value)}
            className="py-2 px-3 text-xs rounded-xl bg-stone-50 border border-stone-200 text-stone-800"
          >
            <option value="all">Все эпохи</option>
            <option value="19">XIX век (до 1900 г.)</option>
            <option value="20">XX век (1900—1999 гг.)</option>
            <option value="21">XXI век (с 2000 г.)</option>
          </select>
        </div>
      </div>

      {/* Timeline Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-3xl mx-auto relative pl-6 sm:pl-8 before:absolute before:left-3 sm:before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-300">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-stone-200 p-6">
              <Calendar className="w-10 h-10 text-stone-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-stone-700">События не найдены</p>
              <p className="text-xs text-stone-400 mt-1">Попробуйте изменить параметры поиска или фильтрации.</p>
            </div>
          ) : (
            filteredEvents.map((item, index) => {
              const showYearBreak = index === 0 || item.year !== filteredEvents[index - 1].year;

              return (
                <div key={item.id} className="mb-6 relative group">
                  {/* Timeline node */}
                  <div
                    className={`absolute -left-[30px] sm:-left-[35px] top-4 w-4 h-4 rounded-full border-2 border-white shadow-xs ${
                      item.type === 'birth'
                        ? 'bg-emerald-600'
                        : item.type === 'death'
                        ? 'bg-stone-600'
                        : 'bg-amber-600'
                    }`}
                  />

                  {/* Year marker if changed */}
                  {showYearBreak && (
                    <div className="mb-2">
                      <span className="text-xs font-mono font-bold text-amber-900 bg-amber-100/70 px-2 py-0.5 rounded-md">
                        {item.year || 'Дата не указана'} год
                      </span>
                    </div>
                  )}

                  {/* Event card */}
                  <div
                    onClick={() => onSelectPerson(item.person.id)}
                    className="p-4 rounded-xl bg-white border border-stone-200 shadow-2xs hover:shadow-md hover:border-amber-400 cursor-pointer transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-xs font-mono text-stone-500 block mb-1">
                          {formatDisplayDate(item.dateStr)}
                        </span>
                        <h4 className="text-sm font-semibold text-stone-900 group-hover:text-amber-900 transition">
                          {item.title}
                        </h4>
                        {item.description && (
                          <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">
                            {item.description}
                          </p>
                        )}
                        {item.location && (
                          <div className="flex items-center gap-1 text-[11px] text-stone-400 mt-2">
                            <MapPin className="w-3 h-3 text-stone-400" />
                            <span>{item.location}</span>
                          </div>
                        )}
                      </div>

                      {/* Person mini avatar pill */}
                      <div className="flex items-center gap-2 pl-3 border-l border-stone-100 flex-shrink-0">
                        <div className="w-8 h-8 rounded-lg bg-stone-200 overflow-hidden text-xs font-bold flex items-center justify-center font-serif text-stone-700">
                          {item.person.avatarUrl ? (
                            <img src={item.person.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            item.person.firstName[0]
                          )}
                        </div>
                        <div className="hidden sm:block text-right">
                          <p className="text-xs font-medium text-stone-800 leading-tight">
                            {formatFullName(item.person, { format: 'short' })}
                          </p>
                          <span className="text-[10px] text-stone-400">Открыть</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
