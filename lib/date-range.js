//Отбор встреч по датам: «с» и «по».
//
//Вся арифметика собрана здесь, без DOM и без базы, потому что проверять надо
//именно её: границы включительно, перепутанные местами концы, день по Киеву
//против дня по UTC.
//
//Про часовой пояс. Встречи хранятся моментом времени, а показываются по Киеву
//— так же, как везде в приложении. Значит, и отбирать их надо по киевскому
//дню: встреча 19 августа в 00:30 по Киеву — это 18-е по UTC, и человек,
//выбравший «с 19 августа», ждёт увидеть её в списке. Сравнение идёт строками
//вида ГГГГ-ММ-ДД, что заодно избавляет от возни с переходом на летнее время.

const ZONE = 'Europe/Kyiv';

//шведская локаль печатает дату ровно как ГГГГ-ММ-ДД — это её обычный формат,
//а не хитрость: строки такого вида сравниваются как даты
const DAY = new Intl.DateTimeFormat('sv-SE', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

//киевский день момента времени
export function dayOf(iso) {
    if (!iso) return null;

    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return null;

    return DAY.format(at);
}

//что пришло в адресе строки. Мусор — это не ошибка, а просто «не выбрано»:
//ссылку могли поправить руками, и падать из-за этого нечему
export function readRange({ from, to } = {}) {
    const start = ISO_DAY.test(String(from ?? '')) ? String(from) : null;
    const end = ISO_DAY.test(String(to ?? '')) ? String(to) : null;

    //концы перепутаны местами — меняем их обратно, а не показываем пустоту.
    //Человек, выбравший «с 20-го по 10-е», ошибся, а не попросил ничего
    if (start && end && start > end) return { from: end, to: start };

    return { from: start, to: end };
}

//Отбор. Границы включительно: «с 1 по 31» — это весь месяц, а не 29 дней
//посередине.
//
//Встреча без даты выпадает из любого отбора по датам. Спрятать её нельзя было
//бы честнее: она не «раньше» и не «позже», про неё просто ничего не известно.
export function inRange(iso, { from, to } = {}) {
    if (!from && !to) return true;

    const day = dayOf(iso);
    if (!day) return false;

    if (from && day < from) return false;
    if (to && day > to) return false;

    return true;
}

export const filterByRange = (meetings, range) =>
    (!range?.from && !range?.to ? meetings : meetings.filter((m) => inRange(m.date, range)));

//--- быстрые кнопки ---------------------------------------------------------
//«сегодня», «7 дней», «30 дней», «этот месяц». Момент «сейчас» приходит
//аргументом, иначе это нельзя было бы проверить ни для одного дня, кроме
//сегодняшнего.
function shiftDays(day, delta) {
    const [y, m, d] = day.split('-').map(Number);
    const at = new Date(Date.UTC(y, m - 1, d + delta));
    return at.toISOString().slice(0, 10);
}

export function presetRange(name, now) {
    const today = dayOf(now) ?? dayOf(new Date().toISOString());

    if (name === 'today') return { from: today, to: today };
    //семь дней — это сегодня и шесть предыдущих, а не сегодня и семь: неделя
    //с воскресенья по субботу состоит из семи дней, включая оба конца
    if (name === 'week') return { from: shiftDays(today, -6), to: today };
    if (name === 'month') return { from: shiftDays(today, -29), to: today };
    if (name === 'thisMonth') return { from: `${today.slice(0, 7)}-01`, to: today };

    return { from: null, to: null };
}

//Что показать на кнопке отбора. Возвращает не готовую фразу, а то, из чего её
//соберёт страница: слова принадлежат словарю
export function rangeShape({ from, to } = {}) {
    if (!from && !to) return { kind: 'any' };
    if (from && to && from === to) return { kind: 'day', day: from };
    if (from && to) return { kind: 'between', from, to };
    if (from) return { kind: 'since', day: from };
    return { kind: 'until', day: to };
}

//Подпись отбора одной строкой: «Усі дати», «12.08», «12.08 — 19.08»,
//«з 12.08», «по 19.08».
//
//Живёт здесь, а не в кнопке, потому что читателей теперь двое: сама кнопка и
//свёрнутая панель сортировки, которая обязана сказать, что список отобран по
//датам. Две копии этой логики однажды разошлись бы, и панель уверяла бы одно,
//а кнопка показывала другое.
//
//Слова приходят снаружи: здесь нет ни языка, ни словаря.
export function rangeLabel(range, t) {
    const shape = rangeShape(range);
    const nice = (day) => day.split('-').reverse().slice(0, 2).join('.');

    if (shape.kind === 'any') return t('dates.any');
    if (shape.kind === 'day') return nice(shape.day);
    if (shape.kind === 'between') return `${nice(shape.from)} — ${nice(shape.to)}`;
    if (shape.kind === 'since') return `${t('dates.sinceShort')} ${nice(shape.day)}`;
    return `${t('dates.untilShort')} ${nice(shape.day)}`;
}
