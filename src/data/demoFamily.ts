import { FamilyTreeData, Person, RelationshipRecord } from '../types/genealogy';

// High-quality SVG avatars for historical and modern persons
const createSvgAvatar = (initials: string, bgGradient: [string, string], iconType: 'man' | 'woman' | 'older_man' | 'older_woman' | 'child'): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
    <defs>
      <linearGradient id="g_${initials}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgGradient[0]}" />
        <stop offset="100%" stop-color="${bgGradient[1]}" />
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="32" fill="url(#g_${initials})" />
    <circle cx="80" cy="80" r="68" fill="none" stroke="#fef3c7" stroke-width="2" stroke-opacity="0.25" />
    <circle cx="80" cy="58" r="28" fill="#ffffff" fill-opacity="0.18" stroke="#ffffff" stroke-width="2" stroke-opacity="0.4" />
    <path d="M38 128 C38 98 60 92 80 92 C100 92 122 98 122 128" fill="#ffffff" fill-opacity="0.18" stroke="#ffffff" stroke-width="2" stroke-opacity="0.4" />
    <text x="80" y="66" text-anchor="middle" font-family="Georgia, serif" font-size="20" font-weight="bold" fill="#ffffff" fill-opacity="0.95">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// Archival document preview placeholder
const createDocumentScan = (title: string, date: string, type: 'metric' | 'diploma' | 'military' | 'award'): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500">
    <rect width="400" height="500" fill="#fcf9f2" rx="8" />
    <rect x="15" y="15" width="370" height="470" fill="none" stroke="#78350f" stroke-width="2" stroke-opacity="0.3" stroke-dasharray="2 4" />
    <rect x="25" y="25" width="350" height="450" fill="none" stroke="#78350f" stroke-width="1" stroke-opacity="0.4" />
    <path d="M200 45 L200 70 M180 57 L220 57" stroke="#78350f" stroke-width="2" stroke-opacity="0.5" />
    <circle cx="200" cy="95" r="20" fill="none" stroke="#b45309" stroke-width="1.5" />
    <text x="200" y="135" text-anchor="middle" font-family="Georgia, serif" font-size="14" font-weight="bold" fill="#451a03" letter-spacing="2">АРХИВНАЯ СПРАВКА</text>
    <text x="200" y="160" text-anchor="middle" font-family="Georgia, serif" font-size="16" font-style="italic" fill="#78350f">${title}</text>
    <line x1="60" y1="180" x2="340" y2="180" stroke="#d6d3d1" stroke-width="1" />
    <line x1="60" y1="210" x2="340" y2="210" stroke="#e7e5e4" stroke-width="1" />
    <line x1="60" y1="240" x2="340" y2="240" stroke="#e7e5e4" stroke-width="1" />
    <line x1="60" y1="270" x2="340" y2="270" stroke="#e7e5e4" stroke-width="1" />
    <line x1="60" y1="300" x2="340" y2="300" stroke="#e7e5e4" stroke-width="1" />
    <line x1="60" y1="330" x2="340" y2="330" stroke="#e7e5e4" stroke-width="1" />
    <rect x="60" y="380" width="100" height="40" fill="#fef3c7" stroke="#b45309" stroke-width="1" stroke-dasharray="3 3" />
    <text x="110" y="405" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="#78350f">Печать Архива</text>
    <text x="340" y="415" text-anchor="end" font-family="monospace" font-size="12" fill="#78350f">${date}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const EMPTY_TREE_DATA: FamilyTreeData = {
  treeName: "Моё семейное древо",
  description: "Семейное древо и архив",
  version: 1,
  lastModified: Date.now(),
  persons: [],
  relationships: [],
  mediaArchive: []
};

export const INITIAL_DEMO_DATA: FamilyTreeData = {
  treeName: "Династия Морозовых и Соколовых",
  description: "Семейная история с архивными выписками, вехами жизни и фотографиями с 1892 года по настоящее время.",
  version: 1,
  lastModified: Date.now(),
  persons: [
    // ПОКОЛЕНИЕ I: Прадедушки и прабабушки
    {
      id: "p-101",
      firstName: "Николай",
      lastName: "Морозов",
      patronymic: "Александрович",
      gender: "male",
      birthDate: "1892-05-14",
      birthPlace: "г. Нижний Новгород",
      isDeceased: true,
      deathDate: "1965-11-20",
      deathPlace: "г. Ленинград",
      avatarUrl: createSvgAvatar("НМ", ["#44403c", "#1c1917"], "older_man"),
      occupation: "Инженер путей сообщения, мостостроитель",
      socialStatus: "Потомственный почётный гражданин",
      tags: ["Основатель ветви", "Инженеры", "Транссиб"],
      bio: "Окончил Санкт-Петербургский институт инженеров путей сообщения Императора Александра I в 1915 году с отличием. Участвовал в проектировании железнодорожных мостов через Волгу и Енисей. Во время Великой Отечественной войны руководил восстановлением переправ на Октябрьской железной дороге.",
      significantDates: [
        { id: "sd-101-1", date: "1915-06-10", title: "Окончание Института инженеров путей сообщения", location: "Петроград", description: "Присвоено звание инженера 1-го разряда." },
        { id: "sd-101-2", date: "1918-09-22", title: "Венчание с Софьей Дмитриевной Воронцовой", location: "Нижний Новгород, Спасская церковь", description: "Таинство венчания совершил протоиерей Иоанн." },
        { id: "sd-101-3", date: "1944-04-12", title: "Награждение Орденом Трудового Красного Знамени", location: "Москва", description: "За досрочный ввод в строй мостового перехода через р. Волхов." }
      ],
      mediaFiles: [
        {
          id: "m-101-1",
          type: "document",
          name: "Выписка из метрической книги о рождении (1892 г.)",
          caption: "Архивная запись Нижегородской духовной консистории.",
          date: "1892-05-14",
          dataUrl: createDocumentScan("Метрическое свидетельство о рождении", "1892 г.", "metric")
        },
        {
          id: "m-101-2",
          type: "photo",
          name: "Портрет с чертежами моста (1938 г.)",
          caption: "Николай Александрович в кабинете мостостроительного бюро.",
          date: "1938",
          dataUrl: createSvgAvatar("НМ", ["#57534e", "#292524"], "older_man")
        }
      ],
      createdAt: Date.now() - 1000000,
      updatedAt: Date.now() - 500000,
    },
    {
      id: "p-102",
      firstName: "Софья",
      lastName: "Морозова",
      maidenName: "Воронцова",
      patronymic: "Дмитриевна",
      gender: "female",
      birthDate: "1896-10-03",
      birthPlace: "г. Ярославль",
      isDeceased: true,
      deathDate: "1978-02-14",
      deathPlace: "г. Ленинград",
      avatarUrl: createSvgAvatar("СВ", ["#78350f", "#451a03"], "older_woman"),
      occupation: "Преподаватель французского языка и музыки",
      socialStatus: "Дворянка",
      tags: ["Педагоги", "Музыканты", "Петербург"],
      bio: "Родилась в семье ярославского земского врача Дмитрия Васильевича Воронцова. Окончила Мариинскую женскую гимназию с золотой медалью и консерваторию по классу фортепиано. Преподавала в школах Петрограда и Ленинграда более 40 лет.",
      significantDates: [
        { id: "sd-102-1", date: "1914-05-25", title: "Окончание гимназии с золотой медалью", location: "Ярославль" },
        { id: "sd-102-2", date: "1918-09-22", title: "Брак с Николаем Александровичем Морозовым", location: "Нижний Новгород" },
        { id: "sd-102-3", date: "1922-03-15", title: "Рождение сына Алексея", location: "Нижний Новгород" }
      ],
      mediaFiles: [
        {
          id: "m-102-1",
          type: "document",
          name: "Аттестат Мариинской гимназии (1914 г.)",
          caption: "Золотая медаль за выдающиеся успехи в науках и благонравие.",
          date: "1914",
          dataUrl: createDocumentScan("Аттестат гимназии", "1914 г.", "diploma")
        }
      ],
      createdAt: Date.now() - 950000,
      updatedAt: Date.now() - 480000,
    },
    {
      id: "p-103",
      firstName: "Владимир",
      lastName: "Соколов",
      patronymic: "Ильич",
      gender: "male",
      birthDate: "1900-08-19",
      birthPlace: "г. Тверь",
      isDeceased: true,
      deathDate: "1972-04-05",
      deathPlace: "г. Москва",
      avatarUrl: createSvgAvatar("ВС", ["#1e3a8a", "#0f172a"], "older_man"),
      occupation: "Профессор лесоводства, биолог",
      socialStatus: "Служащий",
      tags: ["Ученые", "МГУ", "Биологи"],
      bio: "Доктор биологических наук, исследователь реликтовых лесов европейской части страны. Заведовал кафедрой лесоведения Московского государственного университета. Автор фундаментального труда 'Дубравы Средней полосы'.",
      significantDates: [
        { id: "sd-103-1", date: "1925-06-30", title: "Окончание Лесного института", location: "Ленинград" },
        { id: "sd-103-2", date: "1951-11-12", title: "Защита докторской диссертации", location: "Москва, МГУ" }
      ],
      mediaFiles: [],
      createdAt: Date.now() - 920000,
      updatedAt: Date.now() - 400000,
    },
    {
      id: "p-104",
      firstName: "Мария",
      lastName: "Соколова",
      maidenName: "Орлова",
      patronymic: "Павловна",
      gender: "female",
      birthDate: "1903-12-07",
      birthPlace: "г. Кострома",
      isDeceased: true,
      deathDate: "1989-09-18",
      deathPlace: "г. Москва",
      avatarUrl: createSvgAvatar("МО", ["#065f46", "#022c22"], "older_woman"),
      occupation: "Библиотековед, библиограф Государственной библиотеки им. Ленина",
      socialStatus: "Служащая",
      tags: ["Архивисты", "Книголюбы"],
      bio: "Хранитель редких рукописей XVII–XVIII веков в Ленинской библиотеке. В годы эвакуации спасала фонды библиотеки в Сибири.",
      significantDates: [],
      mediaFiles: [],
      createdAt: Date.now() - 900000,
      updatedAt: Date.now() - 390000,
    },

    // ПОКОЛЕНИЕ II: Дедушки и бабушки
    {
      id: "p-201",
      firstName: "Алексей",
      lastName: "Морозов",
      patronymic: "Николаевич",
      gender: "male",
      birthDate: "1922-03-15",
      birthPlace: "г. Нижний Новгород",
      isDeceased: true,
      deathDate: "1998-10-11",
      deathPlace: "г. Санкт-Петербург",
      avatarUrl: createSvgAvatar("АМ", ["#b45309", "#78350f"], "man"),
      occupation: "Архитектор, главный архитектор проектов ЛенНИИпроект",
      socialStatus: "Член Союза архитекторов СССР",
      tags: ["Ветеран ВОВ", "Архитекторы", "Орденоносец"],
      bio: "Участник Великой Отечественной войны. Ушел на фронт добровольцем в июле 1941 года в составе 3-й Фрунзенской дивизии народного ополчения. Награжден двумя Орденами Красной Звезды и медалью 'За оборону Ленинграда'. После войны окончил Академию художеств им. И. Е. Репина. Автор проектов жилых кварталов на Васильевском острове и в Автово.",
      significantDates: [
        { id: "sd-201-1", date: "1941-07-08", title: "Призыв в действующую армию", location: "Ленинградский фронт", description: "Народное ополчение, командир сапёрного взвода." },
        { id: "sd-201-2", date: "1944-01-27", title: "Участие в полном снятии блокады Ленинграда", location: "Ленинград", description: "Награжден Орденом Красной Звезды." },
        { id: "sd-201-3", date: "1951-05-18", title: "Регистрация брака с Еленой Владимировной Соколовой", location: "Ленинград, Дворец бракосочетаний на Красной ул." },
        { id: "sd-201-4", date: "1952-09-04", title: "Рождение сына Дмитрия", location: "Ленинград" }
      ],
      mediaFiles: [
        {
          id: "m-201-1",
          type: "document",
          name: "Наградной лист на Орден Красной Звезды (1944 г.)",
          caption: "За мужество и отвагу при форсировании реки Невы.",
          date: "1944",
          dataUrl: createDocumentScan("Наградной лист ВОВ", "1944 г.", "military")
        },
        {
          id: "m-201-2",
          type: "photo",
          name: "Фотография в военной форме (май 1945 г., Берлин)",
          caption: "Гвардии капитан Алексей Морозов у Бранденбургских ворот.",
          date: "1945-05",
          dataUrl: createSvgAvatar("АМ", ["#854d0e", "#533306"], "man")
        }
      ],
      createdAt: Date.now() - 800000,
      updatedAt: Date.now() - 300000,
    },
    {
      id: "p-202",
      firstName: "Владимир",
      lastName: "Морозов",
      patronymic: "Николаевич",
      gender: "male",
      birthDate: "1924-06-11",
      birthPlace: "г. Нижний Новгород",
      isDeceased: true,
      deathDate: "1943-07-12",
      deathPlace: "Курская дуга, у д. Прохоровка",
      avatarUrl: createSvgAvatar("ВМ", ["#991b1b", "#7f1d1d"], "man"),
      occupation: "Младший лейтенант танковых войск",
      socialStatus: "Офицер",
      tags: ["Ветеран ВОВ", "Герои семьи", "Курская битва"],
      bio: "Младший брат Алексея. Окончил танковое училище в 1942 г. Командир танка Т-34 181-й танковой бригады. Героически погиб в ходе танкового сражения под Прохоровкой на Курской дуге. Похоронен в братской могиле с. Прохоровка.",
      significantDates: [
        { id: "sd-202-1", date: "1942-08-10", title: "Выпуск из Саратовского танкового училища", location: "Саратов" },
        { id: "sd-202-2", date: "1943-07-12", title: "Гибель в танковом бою на Курской дуге", location: "Прохоровка", description: "Награжден Орденом Отечественной войны I степени посмертно." }
      ],
      mediaFiles: [],
      createdAt: Date.now() - 790000,
      updatedAt: Date.now() - 290000,
    },
    {
      id: "p-203",
      firstName: "Елена",
      lastName: "Морозова",
      maidenName: "Соколова",
      patronymic: "Владимировна",
      gender: "female",
      birthDate: "1926-04-18",
      birthPlace: "г. Москва",
      isDeceased: true,
      deathDate: "2014-12-03",
      deathPlace: "г. Санкт-Петербург",
      avatarUrl: createSvgAvatar("ЕС", ["#831843", "#500724"], "older_woman"),
      occupation: "Врач-кардиолог, профессор Первого ЛМИ им. Павлова",
      socialStatus: "Заслуженный врач РСФСР",
      tags: ["Врачи", "Профессора", "Медицина"],
      bio: "Поступила в медицинский институт в тяжелые военные годы. Спасла тысячи пациентов кардиологического отделения. Автор монографии по диагностике нарушений ритма сердца. До 80 лет вела клинические обходы и читала лекции молодым хирургам и терапевтам.",
      significantDates: [
        { id: "sd-203-1", date: "1949-06-25", title: "Диплом с отличием 1-го Ленинградского медицинского института", location: "Ленинград" },
        { id: "sd-203-2", date: "1974-03-20", title: "Присвоение почетного звания 'Заслуженный врач РСФСР'", location: "Москва, Кремль" }
      ],
      mediaFiles: [
        {
          id: "m-203-1",
          type: "document",
          name: "Диплом доктора медицинских наук (1968 г.)",
          caption: "Высшая аттестационная комиссия при Совете Министров СССР.",
          date: "1968",
          dataUrl: createDocumentScan("Диплом доктора медицинских наук", "1968 г.", "diploma")
        }
      ],
      createdAt: Date.now() - 780000,
      updatedAt: Date.now() - 280000,
    },

    // ПОКОЛЕНИЕ III: Родители и дяди/тети
    {
      id: "p-301",
      firstName: "Дмитрий",
      lastName: "Морозов",
      patronymic: "Алексеевич",
      gender: "male",
      birthDate: "1952-09-04",
      birthPlace: "г. Ленинград",
      isDeceased: false,
      avatarUrl: createSvgAvatar("ДМ", ["#0369a1", "#075985"], "man"),
      occupation: "Главный инженер-конструктор авиационного КБ",
      socialStatus: "Почетный авиастроитель",
      tags: ["Авиация", "Инженеры", "Санкт-Петербург"],
      bio: "Окончил Ленинградский механический институт (Военмех) по специальности ракето- и самолетостроение. Принимал участие в разработке систем гражданских авиалайнеров. Увлекается парусным спортом и коллекционированием старинных карт.",
      significantDates: [
        { id: "sd-301-1", date: "1975-06-28", title: "Окончание Военмеха", location: "Ленинград" },
        { id: "sd-301-2", date: "1984-07-14", title: "Свадьба с Татьяной Сергеевной Лебедевой", location: "Ленинград" },
        { id: "sd-301-3", date: "1986-11-20", title: "Рождение сына Михаила", location: "Ленинград" }
      ],
      mediaFiles: [],
      createdAt: Date.now() - 600000,
      updatedAt: Date.now() - 150000,
    },
    {
      id: "p-302",
      firstName: "Татьяна",
      lastName: "Морозова",
      maidenName: "Лебедева",
      patronymic: "Сергеевна",
      gender: "female",
      birthDate: "1955-01-27",
      birthPlace: "г. Ленинград",
      isDeceased: false,
      avatarUrl: createSvgAvatar("ТЛ", ["#4338ca", "#312e81"], "woman"),
      occupation: "Учитель русского языка и литературы, филолог",
      socialStatus: "Заслуженный учитель школы",
      tags: ["Филологи", "Педагоги"],
      bio: "Выпускница филологического факультета ЛГУ им. Жданова. Преподавала русскую классическую литературу в гимназии № 24 Санкт-Петербурга. Создала школьный музей пушкинской поры.",
      significantDates: [
        { id: "sd-302-1", date: "1978-06-20", title: "Окончание ЛГУ", location: "Ленинград" },
        { id: "sd-302-2", date: "2005-10-05", title: "Награда 'Учитель года'", location: "Санкт-Петербург" }
      ],
      mediaFiles: [],
      createdAt: Date.now() - 590000,
      updatedAt: Date.now() - 140000,
    },
    {
      id: "p-303",
      firstName: "Ольга",
      lastName: "Морозова",
      patronymic: "Алексеевна",
      gender: "female",
      birthDate: "1958-03-30",
      birthPlace: "г. Ленинград",
      isDeceased: false,
      avatarUrl: createSvgAvatar("ОМ", ["#0f766e", "#115e59"], "woman"),
      occupation: "Искусствовед, ведущий научный сотрудник Эрмитажа",
      socialStatus: "Член ИКОМ",
      tags: ["Искусствоведы", "Музеи", "Эрмитаж"],
      bio: "Специалист по западноевропейской живописи эпохи Возрождения. Организатор международных выставок старых мастеров.",
      significantDates: [],
      mediaFiles: [],
      createdAt: Date.now() - 580000,
      updatedAt: Date.now() - 130000,
    },

    // ПОКОЛЕНИЕ IV: Настоящее поколение и дети
    {
      id: "p-401",
      firstName: "Михаил",
      lastName: "Морозов",
      patronymic: "Дмитриевич",
      gender: "male",
      birthDate: "1986-11-20",
      birthPlace: "г. Ленинград (Санкт-Петербург)",
      isDeceased: false,
      avatarUrl: createSvgAvatar("ММ", ["#15803d", "#166534"], "man"),
      occupation: "Инженер-программист, краевед-исследователь",
      socialStatus: "Составитель родословной",
      tags: ["Составитель архива", "IT", "Петербуржцы"],
      bio: "Инициатор оцифровки семейного архива, поиска документов в Российском государственном историческом архиве (РГИА) и составления настоящего родословного древа. Живет в Санкт-Петербурге.",
      significantDates: [
        { id: "sd-401-1", date: "2008-06-25", title: "Окончание СПбГУ (Математико-механический факультет)", location: "Санкт-Петербург" },
        { id: "sd-401-2", date: "2014-08-16", title: "Регистрация брака с Екатериной Андреевной Смирновой", location: "Санкт-Петербург, Дворец на Английской набережной" },
        { id: "sd-401-3", date: "2016-05-10", title: "Рождение дочери Анны", location: "Санкт-Петербург" },
        { id: "sd-401-4", date: "2020-10-18", title: "Рождение сына Льва", location: "Санкт-Петербург" }
      ],
      mediaFiles: [],
      createdAt: Date.now() - 400000,
      updatedAt: Date.now() - 50000,
    },
    {
      id: "p-402",
      firstName: "Екатерина",
      lastName: "Морозова",
      maidenName: "Смирнова",
      patronymic: "Андреевна",
      gender: "female",
      birthDate: "1989-02-14",
      birthPlace: "г. Псков",
      isDeceased: false,
      avatarUrl: createSvgAvatar("ЕС", ["#be185d", "#9d174d"], "woman"),
      occupation: "Ландшафтный архитектор, реставратор парковых ансамблей",
      socialStatus: "Архитектор",
      tags: ["Ландшафтный дизайн", "Парки"],
      bio: "Занимается проектами восстановления исторических усадебных парков Северо-Запада России (Пушкинские Горы, Павловск).",
      significantDates: [
        { id: "sd-402-1", date: "2014-08-16", title: "Свадьба с Михаилом Дмитриевичем Морозовым", location: "Санкт-Петербург" }
      ],
      mediaFiles: [],
      createdAt: Date.now() - 390000,
      updatedAt: Date.now() - 40000,
    },
    {
      id: "p-403",
      firstName: "Анна",
      lastName: "Морозова",
      patronymic: "Михайловна",
      gender: "female",
      birthDate: "2016-05-10",
      birthPlace: "г. Санкт-Петербург",
      isDeceased: false,
      avatarUrl: createSvgAvatar("АМ", ["#7c3aed", "#6d28d9"], "child"),
      occupation: "Школьница, ученица музыкальной школы по классу скрипки",
      tags: ["Правнуки", "Музыканты", "Школа"],
      bio: "Учится в гимназии и музыкальной школе им. Римского-Корсакова. Участвует в детских скрипичных конкурсах.",
      significantDates: [
        { id: "sd-403-1", date: "2016-05-10", title: "День рождения", location: "Санкт-Петербург" },
        { id: "sd-403-2", date: "2023-09-01", title: "Первый звонок в гимназии", location: "Санкт-Петербург" }
      ],
      mediaFiles: [],
      createdAt: Date.now() - 200000,
      updatedAt: Date.now() - 30000,
    },
    {
      id: "p-404",
      firstName: "Лев",
      lastName: "Морозов",
      patronymic: "Михайлович",
      gender: "male",
      birthDate: "2020-10-18",
      birthPlace: "г. Санкт-Петербург",
      isDeceased: false,
      avatarUrl: createSvgAvatar("ЛМ", ["#d97706", "#b45309"], "child"),
      occupation: "Дошкольник",
      tags: ["Правнуки", "Младшее поколение"],
      bio: "Любит рисование, сборку конструкторов и слушать рассказы дедушки про самолеты.",
      significantDates: [
        { id: "sd-404-1", date: "2020-10-18", title: "День рождения", location: "Санкт-Петербург" }
      ],
      mediaFiles: [],
      createdAt: Date.now() - 100000,
      updatedAt: Date.now() - 20000,
    }
  ],
  relationships: [
    // Николай Александрович + Софья Дмитриевна (Супруги)
    { id: "r-1", person1Id: "p-101", person2Id: "p-102", type: "marriage", startDate: "1918-09-22" },
    // Дети Николая и Софьи: Алексей и Владимир
    { id: "r-2", person1Id: "p-101", person2Id: "p-201", type: "parent" },
    { id: "r-3", person1Id: "p-102", person2Id: "p-201", type: "parent" },
    { id: "r-4", person1Id: "p-101", person2Id: "p-202", type: "parent" },
    { id: "r-5", person1Id: "p-102", person2Id: "p-202", type: "parent" },

    // Владимир Ильич + Мария Павловна (Супруги Соколовы)
    { id: "r-6", person1Id: "p-103", person2Id: "p-104", type: "marriage", startDate: "1924-05-10" },
    // Дочь Соколовых: Елена
    { id: "r-7", person1Id: "p-103", person2Id: "p-203", type: "parent" },
    { id: "r-8", person1Id: "p-104", person2Id: "p-203", type: "parent" },

    // Алексей Морозов + Елена Соколова (Супруги)
    { id: "r-9", person1Id: "p-201", person2Id: "p-203", type: "marriage", startDate: "1951-05-18" },
    // Братья Алексей и Владимир Морозовы
    { id: "r-10", person1Id: "p-201", person2Id: "p-202", type: "sibling" },

    // Дети Алексея и Елены: Дмитрий и Ольга
    { id: "r-11", person1Id: "p-201", person2Id: "p-301", type: "parent" },
    { id: "r-12", person1Id: "p-203", person2Id: "p-301", type: "parent" },
    { id: "r-13", person1Id: "p-201", person2Id: "p-303", type: "parent" },
    { id: "r-14", person1Id: "p-203", person2Id: "p-303", type: "parent" },
    { id: "r-15", person1Id: "p-301", person2Id: "p-303", type: "sibling" },

    // Дмитрий Морозов + Татьяна Лебедева (Супруги)
    { id: "r-16", person1Id: "p-301", person2Id: "p-302", type: "marriage", startDate: "1984-07-14" },
    // Сын Дмитрия и Татьяны: Михаил
    { id: "r-17", person1Id: "p-301", person2Id: "p-401", type: "parent" },
    { id: "r-18", person1Id: "p-302", person2Id: "p-401", type: "parent" },

    // Михаил Морозов + Екатерина Смирнова (Супруги)
    { id: "r-19", person1Id: "p-401", person2Id: "p-402", type: "marriage", startDate: "2014-08-16" },
    // Дети Михаила и Екатерины: Анна и Лев
    { id: "r-20", person1Id: "p-401", person2Id: "p-403", type: "parent" },
    { id: "r-21", person1Id: "p-402", person2Id: "p-403", type: "parent" },
    { id: "r-22", person1Id: "p-401", person2Id: "p-404", type: "parent" },
    { id: "r-23", person1Id: "p-402", person2Id: "p-404", type: "parent" },
    { id: "r-24", person1Id: "p-403", person2Id: "p-404", type: "sibling" }
  ]
};
