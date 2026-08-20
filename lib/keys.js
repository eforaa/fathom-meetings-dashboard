//Which key means what in the meetings list.
//
//Kept away from the DOM so the rules can be read and tested on their own: the
//component that listens for keys does nothing but ask these questions and act
//on the answers.

//A shortcut must never steal a letter from someone writing a title. Anything
//that accepts text answers here.
export function isTyping(tagName, isContentEditable = false) {
    if (isContentEditable) return true;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(String(tagName ?? '').toUpperCase());
}

//Where the cursor goes. Returns the new row index, or null when the key means
//nothing here.
//
//j/k are the pair every list in a terminal uses and the arrows are what
//everyone else reaches for; both do the same thing. The ends do not wrap:
//holding a key to fly past the last row and land back at the top is
//disorienting in a list this long.
export function nextIndex(key, current, count) {
    if (count <= 0) return null;

    const down = key === 'j' || key === 'ArrowDown';
    const up = key === 'k' || key === 'ArrowUp';
    const first = key === 'Home' || key === 'g';
    const last = key === 'End' || key === 'G';

    //nothing chosen yet: down starts at the top, up starts at the bottom
    if (current == null) {
        if (down || first) return 0;
        if (up || last) return count - 1;
        return null;
    }

    if (down) return Math.min(current + 1, count - 1);
    if (up) return Math.max(current - 1, 0);
    if (first) return 0;
    if (last) return count - 1;
    return null;
}

//"/" is the search shortcut every list on the web shares.
export const wantsSearch = (key, typing) => key === '/' && !typing;

//Enter opens the row the cursor is on; Escape puts the cursor away.
export const opensRow = (key, current) => key === 'Enter' && current != null;
export const clearsCursor = (key) => key === 'Escape';

//--- отметка строк ----------------------------------------------------------
//Пакетная уборка — основная работа в этом списке, и делать её мышью по строке
//за раз мучительно. Буквы выбраны те же, что в почте и в файловых менеджерах:
//x отмечает, Shift+X растягивает отметку от прошлой до нынешней, a берёт всё
//видимое.
//
//«Всё видимое» — это именно то, что прошло поиск и фильтры. Отмечать то, чего
//человек на экране не видит, нельзя: он нажимает «задать тип» по тому, что
//перед глазами.
export function selectionAction(key, { shiftKey = false, typing = false } = {}) {
    if (typing) return null;

    if (key === 'x' || key === 'X') return shiftKey ? 'range' : 'toggle';
    if (key === 'a' || key === 'A') return 'all';

    return null;
}

//Escape делает то, что человек в этот момент считает лишним. Пока есть
//отметка — снимает её (и панель уходит вместе с ней). Отметки нет — убирает
//курсор. Обратный порядок раздражал бы: курсор исчезал бы, а панель, которая
//закрывает низ экрана, оставалась.
export const escapeMeans = (hasSelection) => (hasSelection ? 'selection' : 'cursor');
