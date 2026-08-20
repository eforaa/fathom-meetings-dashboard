//Здоровье сбора встреч — одной строкой, понятной без объяснений.
//
//Функция намеренно чистая: ни базы, ни времени «сейчас» изнутри. Всё, что ей
//нужно, приходит аргументами, поэтому её можно проверить тестами на любой
//момент времени, включая те, которые не наступят ещё год.
//
//Расписание в vercel.json — раз в сутки, 17:00 UTC. Отсюда пороги.

//сутки плюс два часа: запуск в 17:00 и запуск в 17:00 следующего дня разделяет
//ровно 24 часа, и без запаса «здоров» мигал бы в «опоздал» каждый вечер
const EXPECTED_HOURS = 24;
const GRACE_HOURS = 2;

const HOUR = 60 * 60 * 1000;

//уровни, от спокойного к тревожному. Порядок важен: страница красит строку по
//уровню, и цвет должен усиливаться вместе со смыслом
export const LEVELS = ['ok', 'late', 'stale', 'failing', 'never'];

export function syncHealth({ lastSyncedAt, lastStatus, now, expectedHours = EXPECTED_HOURS } = {}) {
    const at = lastSyncedAt ? new Date(lastSyncedAt).getTime() : null;
    const nowMs = now ? new Date(now).getTime() : Date.now();

    //аккаунт подключили, но сбор ещё ни разу не доходил до конца
    if (!at || Number.isNaN(at)) {
        return { level: 'never', hoursAgo: null, missed: 0 };
    }

    const hoursAgo = Math.max(0, (nowMs - at) / HOUR);

    //сколько запусков пропущено. Считается от порога, а не от голых суток:
    //опоздание на десять минут — это ноль пропущенных, а не один
    const missed = Math.max(0, Math.floor((hoursAgo - GRACE_HOURS) / expectedHours));

    //последний запуск сообщил об ошибке — это важнее давности: сбор жив,
    //приходит по расписанию и каждый раз падает
    if (lastStatus === 'failed') {
        return { level: 'failing', hoursAgo, missed };
    }

    //Здесь и живёт та беда, ради которой всё затевалось. Расписание может
    //молча перестать срабатывать: ошибки нет, потому что и запуска не было,
    //last_synced_at просто застывает. Единственный её след — вот эта давность.
    if (missed === 0) return { level: 'ok', hoursAgo, missed };
    if (missed === 1) return { level: 'late', hoursAgo, missed };

    return { level: 'stale', hoursAgo, missed };
}

//«3 часа назад» и «2 дня назад» — в часах до суток, дальше в днях.
//Возвращает число и единицу, а не готовую строку: слова принадлежат словарю,
//иначе они не переведутся
export function ago(hoursAgo) {
    if (hoursAgo == null) return null;
    if (hoursAgo < 1) return { value: Math.max(1, Math.round(hoursAgo * 60)), unit: 'minute' };
    if (hoursAgo < 24) return { value: Math.round(hoursAgo), unit: 'hour' };
    return { value: Math.round(hoursAgo / 24), unit: 'day' };
}

//Тихая остановка другого рода: запуски проходят успешно, но не приносят
//ничего. Само по себе это нормально — неделя без встреч бывает, — поэтому
//здесь не уровень тревоги, а факт, который страница показывает рядом.
//Учитываются только успешные запуски: упавший ничего не приносит по другой
//причине, и мешать эти два случая нельзя.
export function quietFor(runs = []) {
    const good = runs.filter((run) => run.ok === true);
    if (!good.length) return 0;

    let quiet = 0;
    for (const run of good) {
        if ((run.fetched ?? 0) > 0) break;
        quiet += 1;
    }

    return quiet;
}
