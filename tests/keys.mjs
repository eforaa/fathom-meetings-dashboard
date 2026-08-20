// Which key means what in the list.
//
// The trap these guard against is a shortcut that fires while someone is
// typing: pressing "j" in the middle of renaming a meeting must write a "j",
// not jump the cursor down a row.
import {
    isTyping, nextIndex, wantsSearch, opensRow, clearsCursor,
    selectionAction, escapeMeans,
} from '../lib/keys.js';
import { check, done } from './_check.mjs';

// --- who is allowed to hear a shortcut -------------------------------------
check('a text field swallows shortcuts', ['INPUT', 'TEXTAREA', 'SELECT'].map((t) => isTyping(t)),
    [true, true, true]);
check('the tag name is matched however it is written', isTyping('input'), true);
check('an editable element counts as typing too', isTyping('DIV', true), true);
check('an ordinary element does not', isTyping('DIV'), false);
check('a missing target is not typing', isTyping(undefined), false);

// --- walking the rows -------------------------------------------------------
check('j and the down arrow do the same thing',
    [nextIndex('j', 0, 5), nextIndex('ArrowDown', 0, 5)], [1, 1]);
check('k and the up arrow do the same thing',
    [nextIndex('k', 3, 5), nextIndex('ArrowUp', 3, 5)], [2, 2]);

check('with no row chosen, down starts at the top', nextIndex('j', null, 5), 0);
check('with no row chosen, up starts at the bottom', nextIndex('k', null, 5), 4);

check('the last row does not wrap around to the first', nextIndex('j', 4, 5), 4);
check('nor the first to the last', nextIndex('k', 0, 5), 0);

check('Home and g go to the top', [nextIndex('Home', 3, 5), nextIndex('g', 3, 5)], [0, 0]);
check('End and G go to the bottom', [nextIndex('End', 1, 5), nextIndex('G', 1, 5)], [4, 4]);

check('a key that means nothing here is left alone', nextIndex('x', 2, 5), null);
check('an empty list has nowhere to go', nextIndex('j', null, 0), null);

// --- the rest ---------------------------------------------------------------
check('slash opens the search box', wantsSearch('/', false), true);
check('but not while writing a title — it types a slash instead', wantsSearch('/', true), false);

check('Enter opens the row the cursor is on', opensRow('Enter', 3), true);
check('Enter with no cursor does nothing', opensRow('Enter', null), false);
check('Escape puts the cursor away', clearsCursor('Escape'), true);

// --- отметка строк ----------------------------------------------------------
check('x отмечает строку под курсором', selectionAction('x'), 'toggle');
check('Shift+X тянет отметку от прошлой до нынешней',
    selectionAction('X', { shiftKey: true }), 'range');
check('a берёт всё, что на экране', selectionAction('a'), 'all');
check('другая буква ничего не отмечает', selectionAction('q'), null);
//та же защита, что у остальных сочетаний: буква, набранная в поле ввода,
//остаётся буквой
check('x внутри поля ввода — просто икс', selectionAction('x', { typing: true }), null);

check('Escape сначала снимает отметку', escapeMeans(true), 'selection');
check('и только потом убирает курсор', escapeMeans(false), 'cursor');

done();
