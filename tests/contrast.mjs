// Text has to be readable on every surface it can land on.
//
// WCAG AA asks for 4.5:1 for normal text. The light --ink-45 used to measure
// 3.19:1 on the table's own background: readable on a good screen in a dim
// room, tiring on a laptop in daylight. Nobody notices a number like that by
// looking — it has to be measured, and then kept measured, which is what this
// file is for.
//
// Surfaces are read out of the stylesheets rather than listed here, so a new
// background added tomorrow is checked tomorrow.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { check, done } from './_check.mjs';

const APP = join(import.meta.dirname, '..', 'app');
const globals = readFileSync(join(APP, 'globals.css'), 'utf8');

//--- the maths --------------------------------------------------------------
const channel = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a, b) {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
}

//--- what the stylesheets declare -------------------------------------------
//  --name: light-dark(#aaa, #bbb);
function tokens(css) {
    const found = {};
    const re = /--([\w-]+):\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/gi;
    for (const [, name, light, dark] of css.matchAll(re)) found[name] = { light, dark };
    return found;
}

const token = tokens(globals);

//every colour any stylesheet paints a background with, plus the surface tokens
function surfaces() {
    const list = [];
    for (const name of ['paper', 'paper-raised', 'wash', 'warn-row', 'row-alt']) {
        if (token[name]) list.push({ where: `--${name}`, ...token[name] });
    }

    for (const file of readdirSync(APP).filter((n) => n.endsWith('.module.css'))) {
        const css = readFileSync(join(APP, file), 'utf8');
        const re = /background:\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/gi;
        for (const [, light, dark] of css.matchAll(re)) list.push({ where: file, light, dark });
    }

    return list;
}

const backgrounds = surfaces();

//--- the checks -------------------------------------------------------------
check('the palette was found at all', Object.keys(token).length > 10, true);
check('surfaces were collected from the stylesheets too', backgrounds.length >= 6, true);

//ink-25 is deliberately absent: it draws hairlines, hover borders and the
//unset stars, never words. A border at text contrast reads as an error state.
//--error и --warn попали сюда, когда история сбора начала писать ими слова
//(«ошибка», «не завершён»). До этого они были только заливкой значков, а с
//текстом требование другое
const TEXT = ['ink', 'ink-70', 'ink-45', 'error', 'warn'];

for (const name of TEXT) {
    for (const theme of ['light', 'dark']) {
        const fg = token[name][theme];
        const failures = backgrounds
            .map((bg) => ({ where: bg.where, r: ratio(fg, bg[theme]) }))
            .filter((x) => x.r < 4.5)
            .map((x) => `${x.where} ${x.r.toFixed(2)}:1`);

        check(`--${name}, ${theme === 'light' ? 'светлая' : 'тёмная'}: 4.5:1 на каждой поверхности`,
            failures, []);
    }
}

//the scale must stay a scale: three steps a person can tell apart.
//только чернила: --error и --warn проверяются выше на читаемость, но в шкалу
//не входят — они говорят о смысле, а не о степени приглушённости, и требовать
//от них места в лесенке значило бы проверять то, чего никто не задумывал
const SCALE = ['ink', 'ink-70', 'ink-45'];

for (const theme of ['light', 'dark']) {
    const steps = SCALE.map((n) => ratio(token[n][theme], token.paper[theme]));
    check(`--${SCALE.join(' > --')}, ${theme === 'light' ? 'светлая' : 'тёмная'}: ступени идут по убыванию`,
        steps[0] > steps[1] && steps[1] > steps[2], true);
}

//Цветные подложки типов встреч. Их две работы: подсветка-таблетка в списке
//типов (там текст пишется парным --type-*-ink) и полоса в сводке слева (там
//поверх идут обычные чернила --ink-70). Обе пары должны читаться.
//
//Почему они не попали в общий список поверхностей выше: --ink-45 на этих
//подложках даёт 4.3:1, и включи мы их туда целиком, тест потребовал бы
//переделать места, где --ink-45 на них и не появляется. Проверяется ровно то,
//что действительно встречается.
const TYPES = ['internal', 'client', 'automation', 'onboarding', 'other'];

for (const theme of ['light', 'dark']) {
    const тема = theme === 'light' ? 'светлая' : 'тёмная';

    const pairs = TYPES
        .filter((name) => token[`type-${name}-tint`] && token[`type-${name}-ink`])
        .map((name) => ({
            name,
            own: ratio(token[`type-${name}-ink`][theme], token[`type-${name}-tint`][theme]),
            ink: ratio(token['ink-70'][theme], token[`type-${name}-tint`][theme]),
        }));

    check(`подложки типов, ${тема}: все пять на месте`, pairs.length, 5);
    check(`парный цвет типа на своей подложке, ${тема}: 4.5:1`,
        pairs.filter((p) => p.own < 4.5).map((p) => `${p.name} ${p.own.toFixed(2)}:1`), []);
    check(`--ink-70 на подложке типа, ${тема}: 4.5:1`,
        pairs.filter((p) => p.ink < 4.5).map((p) => `${p.name} ${p.ink.toFixed(2)}:1`), []);
}

//Галочка отметки пишется поверх заливки акцента, а не по бумаге. Обычные
//чернила на --sage не читаются, поэтому у знака свой цвет — и он тоже текст,
//пусть и нарисованный линией: не разглядев его, человек не поймёт, отмечена
//строка или нет.
for (const theme of ['light', 'dark']) {
    const тема = theme === 'light' ? 'светлая' : 'тёмная';
    const on = ratio(token['on-sage'][theme], token.sage[theme]);

    check(`знак галочки на заливке акцента, ${тема}: 4.5:1`, on >= 4.5, true);
}

done();
