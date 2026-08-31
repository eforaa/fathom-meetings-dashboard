import Link from 'next/link';
import { cookies } from 'next/headers';
import { getMeetings, searchMeetingIds } from '@/lib/queries';
import { getAccount } from '@/lib/accounts';
import { readRange, filterByRange } from '@/lib/date-range';
import {
  formatDayMonth,
  formatDate,
  formatTime,
  formatDuration,
  meetingTypes,
  meetingTitle,
  meetingTitleSource,
  meetingSummary,
  typeLabel,
  MEETING_TYPES,
} from '@/lib/format';
import {
  applySlots,
  applyColumnFilters,
  collectFacets,
  readView,
  groupMeetingsTree,
  flattenTree,
} from '@/lib/tags';
import { peopleByMeeting } from '@/lib/people';
import { createClientForServer } from '@/lib/supabase-auth';
import { getLang } from '@/lib/i18n/server';
import { t, plural } from '@/lib/i18n';
import LangSwitch from './lang-switch';
import Avocado from './avocado';
import { listColumns } from '@/lib/columns';
import Outline from './outline';
import RowNav from './row-nav';
import ColumnResize from './column-resize';
import SelectionProvider from './selection';
import { RowCheck, SelectAllCheck } from './row-check';
import BulkBar from './bulk-bar';
import Stars from './stars';
import EditableTitle from './editable-title';
import TypePicker from './type-picker';
import CustomCell from './custom-cell';
import ColumnManager, { ColumnHeader } from './column-manager';
import Slot from './slot';
import SignOut from './signout';
import ThemeToggle from './toggle';
import SortableHeader from './sortable-header';
import ArchiveFilter from './archive-filter';
import ShortcutsHelp from './shortcuts-help';
import SyncAlert from './sync-alert';
import PreviewProvider from './preview';
import PreviewPanel from './preview-panel';
import GapsMenu from './gaps-menu';
import Shortcuts from './shortcuts';
import SearchBox from './search-box';
import DateFilter from './date-filter';
import ExportButton from './export-button';
import Stats from './stats';
import styles from './page.module.css';

//a meeting longer than a day is broken data, not a real call — leave it out of
//the totals so one bad row cannot skew the hours
const SANE_MINUTES = 24 * 60;

//the numbers the sidebar summary shows: how many meetings, how much time they
//took, how many fell in this week and this month, and how they split by type
function computeStats(meetings, lang) {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);

  let totalMinutes = 0;
  let counted = 0;
  let week = 0;
  let month = 0;
  const typeCount = new Map();
  let untyped = 0;

  for (const meeting of meetings) {
    const minutes = meeting.duration_minutes;
    if (minutes && minutes <= SANE_MINUTES) {
      totalMinutes += minutes;
      counted += 1;
    }

    if (meeting.date) {
      const d = new Date(meeting.date);
      if (d >= weekAgo && d <= now) week += 1;
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) month += 1;
    }

    const ts = meetingTypes(meeting);
    if (ts.length === 0) untyped += 1;
    for (const type of ts) typeCount.set(type, (typeCount.get(type) ?? 0) + 1);
  }

  const types = MEETING_TYPES
    .map((key) => ({ key, label: typeLabel(key, lang), count: typeCount.get(key) ?? 0 }))
    .filter((type) => type.count > 0)
    .sort((a, b) => b.count - a.count);
  //most calls have no type yet — show it, so the gap is visible
  if (untyped > 0) types.push({ key: '__untyped', label: t(lang, 'group.noType'), count: untyped });

  return {
    total: meetings.length,
    hours: Math.round(totalMinutes / 60),
    week,
    month,
    avg: counted ? Math.round(totalMinutes / counted) : 0,
    types,
  };
}

//a meeting "needs a name" when all it shows is a placeholder — the raw Fathom
//purpose line or nothing at all
const NEEDS_NAME = new Set(['fathom_title', 'none']);

export const dynamic = 'force-dynamic';

//the six built-in tracks; custom columns are appended after them
//Date first (Alexander's ask), then Meeting, Types, Duration, People, Priority
//The first and last tracks are 20px wider than the space their content needs:
//the row's side padding lives inside those two cells rather than on the row.
//That is what lets the date column stick to the left edge while the rest
//scrolls under it — a sticky cell has to reach the edge itself, and it cannot
//if the row holds the padding.
//Первая дорожка — ячейка отметки. Как и последняя, она на 20px шире своего
//содержимого: боковой отступ строки живёт внутри крайних ячеек, иначе
//примерзающая колонка не дотянулась бы до края.
const BUILTIN_GRID = '50px 124px minmax(230px, 2.2fr) 148px 126px minmax(150px, 1.1fr) 104px';

//track width by custom column type
function trackWidth(type) {
  if (type === 'checkbox') return '58px';
  if (type === 'number') return '84px';
  if (type === 'select') return '118px';
  if (type === 'multiselect') return '158px';
  return '128px';
}

//two names and a "+N more" tail. three made the people cell four lines tall,
//and that one cell was what set the height of every row in the table
const VISIBLE_AVATARS = 2;

//main meeting page
//reading the view from the url, loading meetings, applying it
export default async function MeetingsPage({ searchParams }) {
  const sp = await searchParams;
  const { slots, groups: groupTags } = readView(sp);
  const lang = await getLang();

  //who is signed in
  const supabase = createClientForServer(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  //all meetings of this person, the view is applied after
  const { meetings: all, participantsByMeeting } = await getMeetings({
    ownerEmail: user?.email,
  });

  //Fathom records the same human more than once — the calendar knows their
  //address, the transcript knows their name — so the raw rows show a person
  //twice in a meeting and count that meeting twice in the People filter.
  //Everything below works on people, not on raw rows, and uses the same
  //identity resolution as the /people directory.
  const peopleOf = peopleByMeeting(all, participantsByMeeting);

  //custom columns this person added, shown after the built-in ones
  const columns = await listColumns(user?.email);
  //состояние сбора: нужно ровно для предупреждения над списком, поэтому
  //спрашивается одной строкой и ничего больше не тянет
  const account = user?.email ? await getAccount(user.email) : null;
  const gridStyle = {
    '--grid': [BUILTIN_GRID, ...columns.map((column) => trackWidth(column.type))].join(' '),
  };

  //values for the filter chips are collected before filtering,
  //otherwise choosing one value would hide all the others
  const facetsBySlot = slots.map((slot) =>
    slot.tag ? collectFacets(all, peopleOf, slot.tag, lang) : [],
  );

  //per-column filters from the table header (multi-value, AND across columns)
  const FILTERABLE = ['type', 'people', 'importance'];
  const columnFilters = Object.fromEntries(
    FILTERABLE.map((tag) => [tag, String(sp[`c_${tag}`] ?? '').split('~').filter(Boolean)]),
  );
  const facetsByTag = Object.fromEntries(
    FILTERABLE.map((tag) => [tag, collectFacets(all, peopleOf, tag, lang)]),
  );

  //global search (?q=) over titles, summaries, transcripts and participants
  const query = String(sp.q ?? '').trim();
  const searchIds = query.length >= 2 ? await searchMeetingIds(user?.email, query) : null;
  const searched = searchIds ? all.filter((m) => searchIds.has(m.id)) : all;

  //отбор по датам (?from=&to=) — до всего остального: он самый дешёвый и
  //отсекает больше всех
  const range = readRange({ from: sp.from, to: sp.to });
  const inDates = filterByRange(searched, range);

  const filtered = applyColumnFilters(inDates, peopleOf, columnFilters, lang);
  const sorted = applySlots(filtered, peopleOf, slots, lang);

  //Показать ровно эти встречи (?only=id~id).
  //
  //Сюда ведёт ссылка «показать их» из плашки результата: пачку изменили, три
  //встречи остались как были, и человек хочет посмотреть — какие. Обычными
  //фильтрами такой список не выразить: у этих трёх нет ничего общего, кроме
  //того, что с ними только что произошло.
  const only = String(sp.only ?? '').split('~').filter(Boolean);

  //optional "needs a name" view (?nameless=1) plus its live count for the badge
  const namelessCount = all.filter((m) => NEEDS_NAME.has(meetingTitleSource(m))).length;
  //optional "no summary" view (?nosummary=1): calls Fathom hasn't written a
  //конспект for yet — the ones still waiting to be filled in
  const noSummaryCount = all.filter((m) => !meetingSummary(m)).length;
  //Архив: встречи владельцев без ключа Fathom. Они застыли — новых конспектов
  //и участников у них не будет, — поэтому в общем списке их нет, но по кнопке
  //открываются целиком. До применения db/archive-orphans.sql поля нет вовсе, и
  //тогда архив просто пуст: ни одна встреча не помечена
  const archivedCount = all.filter((m) => m.archived).length;
  const showArchived = sp.archived === '1';

  const onlyNameless = sp.nameless === '1';
  //ещё два пробела в данных, по которым ищут, когда садятся прибирать список:
  //встреча без типа и встреча без оценки важности
  const noTypeCount = all.filter((m) => !meetingTypes(m).length).length;
  const noRatingCount = all.filter((m) => !m.importance).length;
  const onlyNoType = sp.notype === '1';
  const onlyNoRating = sp.norating === '1';

  const onlyNoSummary = sp.nosummary === '1';
  const chosen = only.length ? sorted.filter((m) => only.includes(m.id)) : sorted;
  //архив либо показывается один, либо не показывается вовсе — смешивать их в
  //одном списке значит вернуть ту же путаницу, ради которой отметка и заведена
  let meetings = chosen.filter((m) => Boolean(m.archived) === showArchived);
  if (onlyNameless) meetings = meetings.filter((m) => NEEDS_NAME.has(meetingTitleSource(m)));
  if (onlyNoSummary) meetings = meetings.filter((m) => !meetingSummary(m));
  //фильтры складываются: «без типа» и «без оценки» вместе покажут те, у
  //которых нет ни того, ни другого
  if (onlyNoType) meetings = meetings.filter((m) => !meetingTypes(m).length);
  if (onlyNoRating) meetings = meetings.filter((m) => !m.importance);

  //the longest meeting on screen sets the scale of the duration bars.
  //ignore absurd values (a broken multi-day span would flatten every real bar)
  const SANE_MAX_MINUTES = 24 * 60;
  const longest = meetings.reduce(
    (max, meeting) => {
      const m = meeting.duration_minutes ?? 0;
      return m > SANE_MAX_MINUTES ? max : Math.max(max, m);
    },
    0,
  );

  //groups are built on the already sorted list, so their order follows the sort.
  //a nested tree when several grouping levels are chosen (Alexander's 3 columns);
  //flattened into rows + a per-row group path that drives the outline gutter
  //walked once and shared: the band above the table and the type split in the
  //sidebar are two views of the same numbers
  const stats = all.length ? computeStats(all, lang) : null;

  const tree = groupTags.length
    ? groupMeetingsTree(meetings, peopleOf, groupTags, lang)
    : null;
  const flat = tree ? flattenTree(tree) : null;
  const outlineMeta = flat ? flat.map((entry) => ({ id: entry.key, path: entry.path })) : null;
  //the gutter takes one 22px column per grouping level; the head shifts to match
  const gutterPad = groupTags.length ? groupTags.length * 22 : 0;

  //one row, rendered the same way inside a group and without one.
  //`key` is passed in when grouping, because the same meeting can appear under
  //several groups and its id alone would collide
  const row = (meeting, key = meeting.id) => (
    <MeetingRow
      key={key}
      meeting={meeting}
      participants={peopleOf.get(meeting.id) ?? []}
      longest={longest}
      columns={columns}
      lang={lang}
      selectLabel={t(lang, 'row.select')}
    />
  );


  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Avocado />
          <span className={styles.brandText}>
            <span className={styles.brandName}>Fathom</span>
            <span className={styles.brandKicker}>{t(lang, 'brand.kicker')}</span>
          </span>
        </div>

        {/* Переходы по разделам — своей группой и СОСЕДОМ правой части,
            а не её содержимым: на телефоне группа уезжает на вторую строку
            шапки, и там ей нужна вся ширина. Выход, языки и тема остаются
            на первой — их нажимают, а разделы просматривают. */}
        <nav className={styles.headerNav}>
          <Link href="/connect" className={styles.settingsLink}>
            {t(lang, 'nav.connect')}
          </Link>
          <Link href="/people" className={styles.settingsLink}>
            {t(lang, 'nav.people')}
          </Link>
          <Link href="/records" className={styles.settingsLink}>
            {t(lang, 'nav.records')}
          </Link>
          <Link href="/settings" className={styles.settingsLink}>
            {t(lang, 'nav.settings')}
          </Link>
        </nav>

        <div className={styles.headerActions}>
          <LangSwitch />
          <ThemeToggle />
          {/* выход — в самом правом углу, напротив названия: край строки
              находят не глядя, а язык с темой трогают куда реже */}
          <SignOut email={user?.email} />
        </div>
      </header>

      {/* «?» в любом месте страницы показывает, что вообще можно нажимать */}
      <ShortcutsHelp />

      <main className={styles.body}>
        {/* если сбор молчит, об этом должно быть видно там, где бывают каждый
            день, а не только на странице настроек */}
        <SyncAlert account={account} lang={lang} now={new Date().toISOString()} />

        <div className={styles.layout}>
          {/* sorting sits beside the meetings, on the left */}
          <aside className={styles.sidebar}>
            {stats && <Stats {...stats} lang={lang} />}
            <Slot slots={slots} facetsBySlot={facetsBySlot} groups={groupTags} />
          </aside>

          <div className={styles.content}>
            {all.length === 0 ? (
              <EmptyState lang={lang} />
            ) : meetings.length === 0 ? (
              <NoResults lang={lang} />
            ) : (
              <>
                <div className={styles.tableTools}>
                  {/* the count used to have a line of its own above the table;
                      it says as much from the left end of this row, and the
                      table starts a head higher */}
                  <span className={styles.count}>
                    {t(lang, 'home.count', { shown: meetings.length, total: all.length })}
                  </span>

                  {/* из вида «только эти» должен быть выход, иначе человек
                      остаётся в списке из трёх встреч и не понимает, куда
                      делись остальные двести */}
                  {only.length > 0 && (
                    <Link href="/" className={styles.onlyChip}>
                      {t(lang, 'bulk.onlyChosen')}
                      <span aria-hidden="true">×</span>
                  </Link>
                  )}
                  <DateFilter />
                  {/* выгружается ровно то, что сейчас в списке, и в том же
                      порядке — поэтому id берутся с уже отобранного списка */}
                  <ExportButton ids={meetings.map((m) => m.id)} />
                  <SearchBox />
                  {/* четыре пробела в данных — одной кнопкой с галочками.
                      Порознь они занимали 452 пикселя и не помещались в ряд
                      ни на одном телефоне */}
                  <GapsMenu
                    counts={{
                      nameless: namelessCount,
                      nosummary: noSummaryCount,
                      notype: noTypeCount,
                      norating: noRatingCount,
                    }}
                  />
                  {/* архив — не пробел в данных, а другой список, и живёт отдельно */}
                  <ArchiveFilter count={archivedCount} />
                  <ColumnManager />
                </div>

                {/* отметка строк — одно состояние на таблицу: шапка, строки и
                    панель действий смотрят в него, а строки остаются серверной
                    разметкой */}
                <PreviewProvider ids={(flat ? flat.map((entry) => entry.meeting.id) : meetings.map((m) => m.id))}>
                <div className={styles.withPreview}>
                <SelectionProvider ids={(flat ? flat.map((entry) => entry.meeting.id) : meetings.map((m) => m.id))}>
                <div
                  className={styles.tableScroll}
                  data-table-scroll
                  //Escape из панели действий возвращает фокус сюда: у списка
                  //должно быть куда его принять, иначе он уезжает в начало
                  //страницы
                  tabIndex={-1}
                >
                  {/* roles, not markup: the layout is a CSS grid of divs, and
                      without them a screen reader reads 222 meetings as one
                      long run of text with no columns and no headings */}
                  <div
                    className={styles.table}
                    style={gridStyle}
                    role="table"
                    aria-label={t(lang, 'table.aria')}
                    //grouping draws a gutter to the left of every row; a column
                    //stuck to the edge would sit on top of it, so it stays put
                    //only in the plain list
                    data-grouped={groupTags.length ? 'true' : undefined}
                  >
                    <div
                      className={styles.tableHead}
                      style={gutterPad ? { paddingLeft: 20 + gutterPad } : undefined}
                      role="row"
                    >
                      <span className={styles.checkCell} role="columnheader">
                        <SelectAllCheck label={t(lang, 'row.selectAll')} />
                      </span>

                      <SortableHeader facetsByTag={facetsByTag} columnFilters={columnFilters} />
                      {columns.map((column) => (
                        <span key={column.id} role="columnheader" aria-sort="none">
                          <ColumnHeader column={column} />
                        </span>
                      ))}
                    </div>

                    {/* границы между колонками поверх таблицы: слой клиентский,
                        сама таблица остаётся серверной разметкой */}
                    <ColumnResize
                      defaultGrid={gridStyle['--grid']}
                      lang={lang}
                      label={t(lang, 'columns.resize')}
                      resetLabel={t(lang, 'columns.resetWidths')}
                    />

                    <RowNav>
                      {flat ? (
                        <Outline meta={outlineMeta}>
                          {flat.map((entry) => row(entry.meeting, entry.key))}
                        </Outline>
                      ) : (
                        meetings.map((meeting) => row(meeting))
                      )}
                    </RowNav>
                  </div>
                </div>

                <BulkBar
                  //кнопка архива появляется, только когда колонка есть в базе:
                  //до применения db/archive-orphans.sql её нет, и поле у строк
                  //не приходит вовсе
                  canArchive={all.some((m) => 'archived' in m)}
                  inArchive={showArchived}
                  types={MEETING_TYPES.map((key) => ({ key, label: typeLabel(key, lang) }))}
                  typesById={Object.fromEntries(all.map((m) => [m.id, meetingTypes(m)]))}
                  words={{
                    selected: t(lang, 'bulk.selected'),
                    applying: t(lang, 'bulk.applying'),
                    setType: t(lang, 'bulk.setType'),
                    setPriority: t(lang, 'bulk.setPriority'),
                    shortType: t(lang, 'bulk.shortType'),
                    shortPriority: t(lang, 'bulk.shortPriority'),
                    clearType: t(lang, 'bulk.clearType'),
                    clearPriority: t(lang, 'bulk.clearPriority'),
                    clear: t(lang, 'bulk.clear'),
                    archive: t(lang, 'bulk.archive'),
                    unarchive: t(lang, 'bulk.unarchive'),
                    doneArchived: t(lang, 'bulk.doneArchived'),
                    doneUnarchived: t(lang, 'bulk.doneUnarchived'),
                    doneType: t(lang, 'bulk.doneType'),
                    doneTypeCleared: t(lang, 'bulk.doneTypeCleared'),
                    donePriority: t(lang, 'bulk.donePriority'),
                    donePriorityCleared: t(lang, 'bulk.donePriorityCleared'),
                    doneNote: t(lang, 'bulk.doneNote'),
                    partial: t(lang, 'bulk.partial'),
                    failed: t(lang, 'bulk.failed'),
                    failedNote: t(lang, 'bulk.failedNote'),
                    showUnchanged: t(lang, 'bulk.showUnchanged'),
                    retry: t(lang, 'bulk.retry'),
                    undo: t(lang, 'bulk.undo'),
                    undone: t(lang, 'bulk.undone'),
                  }}
                />
                </SelectionProvider>

                {/* панель просмотра: данные готовятся здесь, на сервере, и
                    приходят готовыми строками — панели не за чем ходить в базу
                    ради встречи, которая уже на экране */}
                <PreviewPanel
                  details={Object.fromEntries(meetings.map((m) => [m.id, {
                    title: meetingTitle(m, lang),
                    href: `/meetings/${m.id}`,
                    //время берётся из date: отдельной колонки start_time в
                    //базе нет, и ссылка на неё была бы вечным undefined
                    date: `${formatDate(m.date, lang)} · ${formatTime(m.date, lang)}`,
                    duration: m.duration_minutes == null ? null : formatDuration(m.duration_minutes, lang),
                    types: meetingTypes(m).map((key) => ({ key, label: typeLabel(key, lang) })),
                    summary: meetingSummary(m),
                    people: (peopleOf.get(m.id) ?? []).map((person) => person.name),
                    recordingUrl: m.recording_url ?? null,
                  }]))}
                />
                </div>
                </PreviewProvider>

              </>
            )}
          </div>
        </div>
      </main>

      {/* "?" opens the keyboard-shortcuts help; the list it shows mirrors lib/keys.js */}
      <Shortcuts />
    </div>
  );
}

//one meeting as a row of the grid
function MeetingRow({ meeting, participants, longest, columns, lang, selectLabel }) {
  const minutes = meeting.duration_minutes;
  const barWidth =
    longest > 0 && minutes ? Math.max(4, Math.round((minutes / longest) * 100)) : 0;
  const fields = meeting.custom_fields ?? {};
  const source = meetingTitleSource(meeting);
  const unnamed = NEEDS_NAME.has(source);
  const summary = meetingSummary(meeting);

  return (
    <div
      className={styles.row}
      data-id={meeting.id}
      data-unnamed={unnamed || undefined}
      //where this row leads. the whole row is a target, not just the title —
      //RowNav does the clicking and the keyboard, so the row stays a server
      //component with no handlers of its own
      data-href={`/meetings/${meeting.id}`}
      role="row"
    >
      <span className={styles.checkCell} role="cell">
        <RowCheck id={meeting.id} label={selectLabel} />
      </span>

      <span className={styles.date} role="cell">
        {formatDayMonth(meeting.date, lang)}
        <span className={styles.time}>{formatTime(meeting.start_time ?? meeting.date, lang)}</span>
      </span>

      <span className={styles.titleCell} role="cell">
        <EditableTitle
          meetingId={meeting.id}
          value={meetingTitle(meeting, lang)}
          source={source}
          href={`/meetings/${meeting.id}`}
          variant="row"
        />
        {summary && <span className={styles.rowSummary}>{summary}</span>}
      </span>

      <span role="cell">
        <TypePicker meetingId={meeting.id} value={meetingTypes(meeting)} variant="compact" />
      </span>

      <span className={styles.duration} role="cell">
        <span className={styles.durationTrack}>
          <span className={styles.durationFill} style={{ width: `${barWidth}%` }} />
        </span>
        <span className={styles.durationValue}>{formatDuration(minutes, lang)}</span>
      </span>

      <AvatarStack participants={participants} lang={lang} />

      <span role="cell">
        <Stars meetingId={meeting.id} value={meeting.importance ?? 0} />
      </span>

      {columns.map((column) => (
        <span key={column.id} role="cell">
          <CustomCell
            meetingId={meeting.id}
            column={column}
            value={fields[column.id]}
          />
        </span>
      ))}
    </div>
  );
}


//participants written out by name, a few per row with a "+N" tail
function AvatarStack({ participants, lang }) {
  if (participants.length === 0) {
    return <span className={styles.dash} role="cell">—</span>;
  }

  const shown = participants.slice(0, VISIBLE_AVATARS);
  const hidden = participants.length - shown.length;
  const names = participants.map((person) => person.name || person.email).join(', ');

  return (
    <span className={styles.people} title={names} role="cell">
      {shown.map((person) => (
        <span key={person.id} className={styles.personName}>
          {person.name || person.email}
        </span>
      ))}
      {hidden > 0 && <span className={styles.morePeople}>{t(lang, 'row.more', { n: hidden })}</span>}
    </span>
  );
}

//nothing connected yet — walk a new person through the two setup steps
function EmptyState({ lang }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyMark} />
      <h2 className={styles.emptyTitle}>{t(lang, 'empty.title')}</h2>
      <p className={styles.emptyText}>{t(lang, 'empty.text')}</p>

      <ol className={styles.onboard}>
        <li className={styles.onboardStep}>
          <span className={styles.onboardNum}>1</span>
          <span className={styles.onboardBody}>
            <b>{t(lang, 'empty.step1Strong')}</b>
            {t(lang, 'empty.step1Text')}
          <Link href="/settings" className={styles.onboardLink}>
              {t(lang, 'empty.step1Link')}
          </Link>
          </span>
        </li>
        <li className={styles.onboardStep}>
          <span className={styles.onboardNum}>2</span>
          <span className={styles.onboardBody}>
            <b>{t(lang, 'empty.step2Strong')}</b>
            {t(lang, 'empty.step2Text')}
          <Link href="/connect" className={styles.onboardLink}>
              {t(lang, 'empty.step2Link')}
          </Link>
          </span>
        </li>
      </ol>
    </div>
  );
}

//the filter hid everything
function NoResults({ lang }) {
  return (
    <div className={styles.noResults}>
      <p className={styles.noResultsTitle}>{t(lang, 'noResults.title')}</p>
      <p className={styles.noResultsHint}>{t(lang, 'noResults.hint')}</p>
      <Link href="/" className={styles.noResultsReset}>
        {t(lang, 'noResults.reset')}
      </Link>
    </div>
  );
}
