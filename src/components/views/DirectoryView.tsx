import React, { useState, useMemo } from 'react';
import { Person, RelationshipRecord } from '../../types/genealogy';
import { formatFullName, calculateAge, getParents, getChildren, getSpouses, compareGenealogyDates, getGenderPresentation, parseGenealogyDate } from '../../utils/kinship';
import { 
  Search, 
  Filter, 
  Users, 
  Calendar, 
  Image as ImageIcon, 
  FileText, 
  MapPin, 
  Plus, 
  ChevronRight,
  ArrowUpDown
} from 'lucide-react';

interface DirectoryViewProps {
  persons: Person[];
  relationships: RelationshipRecord[];
  onSelectPerson: (personId: string) => void;
  onAddPerson: () => void;
}

export const DirectoryView: React.FC<DirectoryViewProps> = ({
  persons,
  relationships,
  onSelectPerson,
  onAddPerson
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'alive' | 'deceased'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'birthAsc' | 'birthDesc'>('birthAsc');

  const filteredPersons = useMemo(() => {
    return persons
      .filter(p => {
        if (genderFilter !== 'all' && p.gender !== genderFilter) return false;
        if (statusFilter === 'alive' && p.isDeceased) return false;
        if (statusFilter === 'deceased' && !p.isDeceased) return false;

        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const fullName = formatFullName(p).toLowerCase();
          const maiden = p.maidenName?.toLowerCase() || '';
          const occ = p.occupation?.toLowerCase() || '';
          const place = p.birthPlace?.toLowerCase() || '';
          const tags = p.tags?.join(' ').toLowerCase() || '';
          if (!fullName.includes(q) && !maiden.includes(q) && !occ.includes(q) && !place.includes(q) && !tags.includes(q)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return a.lastName.localeCompare(b.lastName, 'ru');
        }
        const aDate = parseGenealogyDate(a.birthDate);
        const bDate = parseGenealogyDate(b.birthDate);
        if (!aDate || !bDate) return aDate ? -1 : bDate ? 1 : 0;
        const comparison = compareGenealogyDates(a.birthDate, b.birthDate);
        return sortBy === 'birthAsc' ? comparison : -comparison;
      });
  }, [persons, genderFilter, statusFilter, sortBy, searchQuery]);

  return (
    <div className="w-full h-full flex flex-col bg-stone-100 overflow-hidden">
      {/* Top Filter and Controls */}
      <div className="p-4 sm:p-5 bg-white border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[240px] max-w-md relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Поиск по ФИО, профессии, месту или тегам..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-stone-50 border border-stone-200 text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Gender */}
          <select
            value={genderFilter}
            onChange={e => setGenderFilter(e.target.value as any)}
            className="py-2 px-3 text-xs rounded-xl bg-stone-50 border border-stone-200 text-stone-800"
          >
            <option value="all">Любой пол</option>
            <option value="male">Мужчины</option>
            <option value="female">Женщины</option>
          </select>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="py-2 px-3 text-xs rounded-xl bg-stone-50 border border-stone-200 text-stone-800"
          >
            <option value="all">Все статусы</option>
            <option value="alive">Ныне живущие</option>
            <option value="deceased">Ушедшие предки</option>
          </select>

          {/* Sorting */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="py-2 px-3 text-xs rounded-xl bg-stone-50 border border-stone-200 text-stone-800"
          >
            <option value="birthAsc">По году рождения (раньше → позже)</option>
            <option value="birthDesc">По году рождения (позже → раньше)</option>
            <option value="name">По фамилии (А—Я)</option>
          </select>

          <button
            onClick={onAddPerson}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl bg-stone-900 text-stone-100 hover:bg-stone-800 shadow-xs transition ml-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить персоналию</span>
          </button>
        </div>
      </div>

      {/* Directory Table / Cards Grid */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-3">
          <div className="flex items-center justify-between px-1 text-xs text-stone-500 font-sans">
            <span>Найдено персоналий: <strong className="text-stone-900">{filteredPersons.length}</strong></span>
          </div>

          {filteredPersons.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-stone-200 p-8 max-w-md mx-auto">
              <Users className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <h3 className="text-base font-serif font-bold text-stone-900">В картотеке пока нет персоналий</h3>
              <p className="text-xs text-stone-500 mt-1.5">
                Добавьте первого члена семьи, указав ФИО, даты жизни, биографию и прикрепив документы.
              </p>
              <button
                onClick={onAddPerson}
                className="mt-5 px-5 py-2.5 rounded-xl bg-stone-900 text-stone-100 hover:bg-stone-800 text-xs font-semibold shadow-xs transition"
              >
                + Добавить персоналию
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredPersons.map(person => {
              const parents = getParents(person.id, persons, relationships);
              const children = getChildren(person.id, persons, relationships);
              const spouses = getSpouses(person.id, persons, relationships);
              const ageInfo = calculateAge(person.birthDate, person.deathDate, person.isDeceased);

              return (
                <div
                  key={person.id}
                  onClick={() => onSelectPerson(person.id)}
                  className="p-4 rounded-2xl bg-white border border-stone-200 shadow-2xs hover:shadow-md hover:border-amber-400 cursor-pointer transition flex items-start gap-4 group"
                >
                  {/* Portrait */}
                  <div className="w-14 h-14 rounded-xl bg-stone-200 overflow-hidden flex-shrink-0 border border-stone-200 flex items-center justify-center">
                    {person.avatarUrl ? (
                      <img src={person.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-stone-800 text-amber-200 flex items-center justify-center font-serif text-sm font-bold">
                        {person.firstName[0]}
                        {person.lastName[0]}
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-serif font-bold text-stone-900 group-hover:text-amber-900 truncate">
                        {formatFullName(person, { format: 'formal' })}
                      </h3>
                      {(() => {
                        const gender = getGenderPresentation(person.gender);
                        return <span aria-label={gender.label} title={gender.label} className={`text-xs font-bold ${person.gender === 'female' ? 'text-rose-500' : person.gender === 'male' ? 'text-sky-600' : 'text-violet-600'}`}>{gender.symbol}</span>;
                      })()}
                    </div>

                    <p className="text-xs font-mono text-amber-900 mt-0.5">
                      {ageInfo.text}
                    </p>

                    {person.occupation && (
                      <p className="text-xs text-stone-600 truncate mt-1">
                        {person.occupation}
                      </p>
                    )}

                    {person.birthPlace && (
                      <div className="flex items-center gap-1 text-[11px] text-stone-400 mt-1">
                        <MapPin className="w-3 h-3 text-stone-400" />
                        <span className="truncate">{person.birthPlace}</span>
                      </div>
                    )}

                    {/* Stats badges */}
                    <div className="flex items-center gap-3 mt-3 pt-2 border-t border-stone-100 text-[11px] text-stone-500">
                      <span>Семья: <strong>{parents.length + children.length + spouses.length}</strong></span>
                      <span aria-hidden="true">·</span>
                      <span>Вех: <strong>{person.significantDates?.length || 0}</strong></span>
                      <span aria-hidden="true">·</span>
                      <span>Файлов: <strong>{person.mediaFiles?.length || 0}</strong></span>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-600 shrink-0 self-center" />
                </div>
              );
            })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
