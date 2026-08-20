import { db } from './supabase.js';

//Журнал синхронизаций. Схема — db/sync-log.sql.
//
//Главное правило этого файла: журнал НИКОГДА не роняет сбор. Запись в него —
//не часть работы, а рассказ о ней; провалившаяся запись не должна стоить нам
//встреч. Поэтому каждая функция ниже гасит свою ошибку сама и возвращает
//что-нибудь безобидное.
//
//Отдельный случай — таблицы просто нет. Миграции здесь применяет человек
//руками в Supabase, и между выкладкой кода и этим действием проходит от часа
//до недели. Всё это время код уже вызывает startRun. Если бы отсутствие
//таблицы было ошибкой, сбор встал бы ровно из-за того, что мы завели для него
//дневник.

const DAYS_KEPT = 90;

//postgrest отвечает по-разному в зависимости от версии, поэтому смотрим на всё
//сразу: 42P01 — «relation does not exist» от самого postgres, PGRST205 — «не
//нашёл такую таблицу в схеме» от postgrest
function missingTable(error) {
    if (!error) return false;
    const code = error.code ?? '';
    return code === '42P01' || code === 'PGRST205'
        || /does not exist|schema cache/i.test(error.message ?? '');
}

function complain(what, error) {
    if (missingTable(error)) return;
    console.error(`sync log: ${what} — ${error.message ?? error}`);
}

//запуск начался. Возвращает id строки или null — вызывающий код обязан
//пережить null и продолжить работу
export async function startRun(userEmail, source) {
    try {
        const { data, error } = await db
            .from('sync_runs')
            .insert({ user_email: userEmail, source })
            .select('id')
            .single();

        if (error) {
            complain('не смог открыть запись', error);
            return null;
        }

        return data.id;
    } catch (caught) {
        complain('не смог открыть запись', caught);
        return null;
    }
}

//запуск кончился — успехом или ошибкой.
//id === null означает, что открыть запись не удалось: закрывать нечего
export async function finishRun(id, { ok, error, counts = {}, meetingsTotal } = {}) {
    if (!id) return;

    try {
        const { error: failed } = await db
            .from('sync_runs')
            .update({
                finished_at: new Date().toISOString(),
                ok,
                //длинную ошибку обрезаем: в журнале нужна причина, а не стек
                error: ok ? null : String(error ?? '').slice(0, 500),
                fetched: counts.fetched ?? null,
                inserted: counts.inserted ?? null,
                skipped: counts.skipped ?? null,
                people_refreshed: counts.peopleRefreshed ?? null,
                meetings_total: meetingsTotal ?? null,
            })
            .eq('id', id);

        if (failed) complain('не смог закрыть запись', failed);
    } catch (caught) {
        complain('не смог закрыть запись', caught);
    }
}

//последние запуски одного аккаунта, свежие сверху.
//пустой список — честный ответ и когда запусков не было, и когда таблицы нет:
//страница в обоих случаях показывает «истории пока нет»
export async function recentRuns(userEmail, limit = 14) {
    try {
        const { data, error } = await db
            .from('sync_runs')
            .select('id, source, started_at, finished_at, ok, error, fetched, inserted, meetings_total')
            .eq('user_email', userEmail)
            .order('started_at', { ascending: false })
            .limit(limit);

        if (error) {
            complain('не смог прочитать историю', error);
            return [];
        }

        return data ?? [];
    } catch (caught) {
        complain('не смог прочитать историю', caught);
        return [];
    }
}

//чистка старого. Вызывается после сбора, а не по отдельному расписанию:
//лишний ежедневный запуск ради одного delete не нужен
export async function pruneRuns(days = DAYS_KEPT) {
    const edge = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    try {
        const { error } = await db.from('sync_runs').delete().lt('started_at', edge);
        if (error) complain('не смог почистить старое', error);
    } catch (caught) {
        complain('не смог почистить старое', caught);
    }
}
