// Правило, которое выглядит верным и молча не работает.
//
// За два дня я трижды написала одно и то же: внутри @media правило, которое
// должно что-то отключить на узком экране, — и каждый раз оно оказывалось
// СЛАБЕЕ того, что включает. В CSS выигрывает не тот, кто ниже, а тот, кто
// точнее; медиазапрос сам по себе веса не добавляет. Правило просто не
// применялось.
//
//   .row > *:not(:last-child)::after { content: ''; }      вес 0-2-1
//   @media (max-width: 860px) {
//     .row > *::after { content: none; }                   вес 0-1-1 — проиграет
//   }
//
// Ничего не падает, ошибок нет, на глаз при беглом взгляде не видно — линии
// просто остаются висеть там, где их быть не должно. Такое ловится либо
// внимательным человеком в нужную минуту, либо вот этой проверкой.
//
// Что она умеет: сравнивать пары правил, которые отличаются только скобками
// :not(...) — именно так выглядели все три случая. Чего не умеет: разбирать
// CSS целиком и рассуждать, какие селекторы совпадают по смыслу. Это не
// полноценный анализатор, а сторож для одной конкретной привычки.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { check, done } from './_check.mjs';

const APP = join(import.meta.dirname, '..', 'app');

//--- вес селектора: сколько идентификаторов, классов, элементов -------------
export function specificity(selector) {
    const s = selector.replace(/\s+/g, ' ').trim();

    const ids = (s.match(/#[\w-]+/g) ?? []).length;

    //классы, атрибуты и псевдоклассы весят одинаково. :not() сам по себе не
    //весит ничего — считается то, что внутри него, и это ровно тот случай,
    //на котором я спотыкалась
    const classes =
        (s.match(/\.[\w-]+/g) ?? []).length +
        (s.match(/\[[^\]]+\]/g) ?? []).length +
        (s.match(/(?<!:):(?!:)(?!not\b)[\w-]+(\([^)]*\))?/g) ?? []).length;

    //элементы и псевдоэлементы
    const elements =
        (s.match(/::[\w-]+/g) ?? []).length +
        (s.split(/[\s>+~]+/).filter((part) => /^[a-z]/i.test(part)).length);

    return [ids, classes, elements];
}

const heavier = (a, b) => {
    for (let i = 0; i < 3; i += 1) {
        if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
};

//то же правило без скобок :not(...) — по нему ищется пара
const core = (selector) =>
    selector.replace(/:not\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();

//--- очень простой разбор файла --------------------------------------------
//нужно немного: наружные правила, правила внутри @media, и какие свойства
//каждое из них задаёт
function parse(css) {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const outer = [];
    const inMedia = [];

    let i = 0;
    let media = 0;
    while (i < clean.length) {
        const brace = clean.indexOf('{', i);
        if (brace === -1) break;

        const head = clean.slice(i, brace).trim();

        if (head.startsWith('@media')) {
            media += 1;
            i = brace + 1;
            continue;
        }
        if (head.startsWith('@')) {
            //@keyframes и прочее пропускаем целиком
            let depth = 1;
            let j = brace + 1;
            while (j < clean.length && depth > 0) {
                if (clean[j] === '{') depth += 1;
                if (clean[j] === '}') depth -= 1;
                j += 1;
            }
            i = j;
            continue;
        }

        const end = clean.indexOf('}', brace);
        const body = clean.slice(brace + 1, end);
        const props = [...body.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]);

        for (const selector of head.split(',')) {
            const rule = { selector: selector.trim(), props };
            if (!rule.selector) continue;
            (media > 0 ? inMedia : outer).push(rule);
        }

        //закрылся ли на этом медиазапрос
        let rest = clean.slice(end + 1);
        while (media > 0 && /^\s*\}/.test(rest)) {
            media -= 1;
            rest = rest.replace(/^\s*\}/, '');
        }
        i = clean.length - rest.length;
    }

    return { outer, inMedia };
}

//--- собственно проверка ----------------------------------------------------
const files = readdirSync(APP).filter((n) => n.endsWith('.css'));
const losers = [];

for (const file of files) {
    const { outer, inMedia } = parse(readFileSync(join(APP, file), 'utf8'));

    for (const rule of inMedia) {
        const key = core(rule.selector);
        const weight = specificity(rule.selector);

        for (const base of outer) {
            if (core(base.selector) !== key) continue;
            if (!base.props.some((p) => rule.props.includes(p))) continue;
            if (heavier(specificity(base.selector), weight)) {
                losers.push(`${file}: «${rule.selector}» слабее «${base.selector}»`);
            }
        }
    }
}

check('вес селектора считается верно: :not не весит, его содержимое весит',
    [specificity('.row > *::after'), specificity('.row > *:not(:last-child)::after')],
    [[0, 1, 1], [0, 2, 1]]);
check('пара находится по правилу без :not',
    core(".table:not([data-grouped='true']) .row > *:first-child"),
    '.table .row > *:first-child');
check('файлы стилей разобраны', files.length >= 10, true);

check('ни одно правило внутри @media не слабее того, что оно отменяет', losers, []);

done();
