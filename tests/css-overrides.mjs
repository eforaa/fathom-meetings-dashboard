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

//Тот же капкан, вид сбоку. Чередование фона строк написано через переменную
//--row-bg именно потому, что селектор полосы точнее, чем .row:hover: задай
//она background напрямую — полоса легла бы поверх наведения, жёлтой строки
//«нужно имя» и курсора клавиатуры, и все три перестали бы быть видны на
//каждой второй строке.
const stripes = parse(readFileSync(join(APP, 'page.module.css'), 'utf8'));
const direct = [...stripes.outer, ...stripes.inMedia]
    .filter((r) => r.selector.includes('nth-child(even)') && r.props.includes('background'))
    .map((r) => r.selector);

check('полоса задаётся переменной, а не свойством background', direct, []);

//Отметка строки не имеет права красить фон.
//
//Фон занят тремя состояниями — чередование, «нужно имя», курсор клавиатуры, —
//и четвёртое вытеснило бы одно из них молча. Отмеченная жёлтая строка обязана
//остаться жёлтой; проверяется это здесь, потому что заливка выглядит слишком
//соблазнительно простым решением, чтобы к ней однажды не вернулись.
const rowStyles = parse(readFileSync(join(APP, 'page.module.css'), 'utf8'));
const painted = [...rowStyles.outer, ...rowStyles.inMedia]
    .filter((rule) => /data-checked/.test(rule.selector))
    .filter((rule) => rule.props.some((p) => p === 'background' || p === 'background-color'))
    .map((rule) => rule.selector);

check('отметка строки не задаёт фон — он занят тремя другими состояниями',
    painted, []);

//Третья ловушка того же рода, и её прошлый сторож не поймал.
//
//Прилипание колонок отключается в свёрнутой строке — там колонок нет вовсе.
//Когда слева добавилась ячейка отметки, дата стала второй, а отключение
//осталось написанным только для первой: в свёрнутой строке дата продолжала
//примерзать на 68 пикселей и наезжала на длительность.
//
//Проверка выше сравнивает правила, которые ОБА есть. Здесь другое: правила
//просто нет. Поэтому — отдельно: у каждой примерзающей ячейки обязан быть
//сброс внутри медиазапроса.
const table = parse(readFileSync(join(APP, 'page.module.css'), 'utf8'));

const sticky = table.outer
    .filter((rule) => rule.props.includes('position'))
    .filter((rule) => /:first-child|:nth-child\(\d+\)/.test(rule.selector))
    .map((rule) => core(rule.selector));

const released = new Set(
    table.inMedia
        .filter((rule) => rule.props.includes('position'))
        .map((rule) => core(rule.selector)),
);

check('каждая примерзающая ячейка отпускается в свёрнутой строке',
    [...new Set(sticky)].filter((selector) => !released.has(selector)), []);

//--- полоса, которую листают вбок, но не долистать ---------------------------
//
//Ряд кнопок над таблицей и ссылки в шапке на телефоне не переносятся, а
//прокручиваются вбок. Оба ряда прижаты вправо — так они задуманы на широком
//экране. Прижатый вправо ряд при переполнении вылезает за ЛЕВЫЙ край, в
//отрицательные координаты, а туда прокрутка не достаёт: кнопки не просто
//уехали за край, их нельзя добыть вовсе.
//
//Выглядит это как обрезанный ряд — то есть ровно так же, как задумано, и
//разницу видно, только если попробовать долистать.
const blocks = (css) =>
    [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
        selector: m[1].trim().split(String.fromCharCode(10)).pop().trim(),
        body: m[2],
    }));

const unreachable = blocks(readFileSync(join(APP, 'page.module.css'), 'utf8'))
    .filter((rule) => /overflow-x:\s*auto/.test(rule.body))
    .filter((rule) => /flex-wrap:\s*nowrap/.test(rule.body))
    .filter((rule) => !/justify-content:\s*(flex-start|start|left|normal)/.test(rule.body))
    .map((rule) => rule.selector);

check('прокручиваемый ряд начинается слева, иначе до его начала не добраться',
    unreachable, []);

//--- два места на одной полке ------------------------------------------------
//
//В свёрнутой строке порядок ячеек задаётся числами order — по одному на
//ячейку, потому что назвать их нельзя: три из семи приходят из чужих модулей
//и адресуются по счёту. Стоит вставить ячейку слева (так было с отметкой),
//как весь счёт съезжает на единицу.
//
//Если двум ячейкам достаётся одно число, они не ссорятся и ничего не ломают —
//просто встают в порядке разметки, то есть в том самом порядке колонок, от
//которого мы на телефоне и уходим. Ошибка молчит, а строка выглядит собранной
//наугад.
const orders = new Map();
for (const rule of blocks(readFileSync(join(APP, 'page.module.css'), 'utf8'))) {
    const found = rule.body.match(/(?:^|;)\s*order:\s*([\w+ ()-]+)\s*;/m);
    if (!found) continue;
    for (const cell of rule.selector.matchAll(/\.row > \*:(?:nth-child\(([^)]+)\)|(first-child))/g)) {
        orders.set((cell[1] ?? cell[2]).trim(), found[1].trim());
    }
}

const taken = new Map();
for (const [cell, order] of orders) taken.set(order, [...(taken.get(order) ?? []), cell]);

check('у каждой ячейки свёрнутой строки своё место',
    [...taken].filter(([, cells]) => cells.length > 1).map(([order]) => order), []);
check('места розданы всем семи ячейкам', orders.size, 7);
//--- переменная, которой нет ------------------------------------------------
//
//Меню выбора типа было прозрачным: сквозь него читались строки таблицы.
//Причина не в прозрачности, а в том, что фон ему задавала переменная --bg,
//которой в проекте не существует. CSS в таком случае не ругается и не берёт
//запасное значение — он ВЫБРАСЫВАЕТ всё свойство. Фона просто не стало.
//
//Там же нашлось второе: пять файлов писали шрифт через --font-sans, которого
//тоже нет. Они рисовались системным шрифтом вместо фирменного — и это никак
//не проявлялось, кроме как на глаз, если знать, что искать.
//
//Разрешены только переменные из globals.css и две, которые приходят снаружи:
//шрифтовые от next/font (они ставятся на <html>) и те, что задаются в разметке
//атрибутом style — ширина колонок, фон строки, доля в полосе.
const FROM_OUTSIDE = new Set(['--font-ui', '--font-mono', '--grid', '--row-bg', '--share']);

const globalsText = readFileSync(join(APP, 'globals.css'), 'utf8');
const declared = new Set([...globalsText.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

const undefinedTokens = [];
for (const file of readdirSync(APP).filter((name) => name.endsWith('.css'))) {
    const text = readFileSync(join(APP, file), 'utf8');
    for (const [, name] of text.matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (declared.has(name) || FROM_OUTSIDE.has(name)) continue;
        undefinedTokens.push(`${file}: ${name}`);
    }
}

check('каждая переменная, на которую ссылаются стили, где-то объявлена',
    [...new Set(undefinedTokens)], []);
//--- стекло там, где под ним текст -------------------------------------------
//
//Панель просмотра и меню выбора типа всплывают ПОВЕРХ списка. Стеклянный фон
//на них означает буквы на буквах: сквозь панель читались строки таблицы.
//
//Правило записано у mind-doc прямым текстом и стоит того, чтобы его стеречь:
//стекло — для карточек, лежащих на фоне страницы; всё, что поднято над
//содержимым, красится непрозрачным --menu-bg. position: relative сюда не
//относится — он ничего не поднимает.
const floating = blocks(readFileSync(join(APP, 'preview-panel.module.css'), 'utf8'))
    .concat(readdirSync(APP)
        .filter((name) => name.endsWith('.css'))
        .flatMap((name) => blocks(readFileSync(join(APP, name), 'utf8'))
            .map((rule) => ({ ...rule, file: name }))))
    .filter((rule) => /position:\s*(fixed|sticky|absolute)/.test(rule.body))
    .filter((rule) => /background:\s*var\(--glass-bg\)/.test(rule.body))
    .map((rule) => `${rule.file ?? 'preview-panel.module.css'}: ${rule.selector}`);

check('всплывающее поверх содержимого не бывает стеклянным',
    [...new Set(floating)], []);

done();
