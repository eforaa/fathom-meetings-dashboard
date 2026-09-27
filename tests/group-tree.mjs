// Папки встреч: правила дерева.
//
// Всё, что здесь проверяется, — это вопросы, на которые нельзя ответить
// «на глаз»: куда папку переносить нельзя, кто её потомки, сколько встреч под
// ней, и что будет, если в данных уже есть цикл. Последнее не выдумка:
// достаточно двух параллельных переносов, чтобы A стала родителем B, а B —
// родителем A, и любая наивная функция после этого крутится вечно.
//
// Run: node tests/group-tree.mjs   (никакой базы, никакой сети)
import {
    MAX_GROUP_NAME,
    normalizeGroupName,
    buildGroupTree,
    flattenGroupTree,
    subtreeIds,
    depthOf,
    heightOf,
    wouldCycle,
    moveTargets,
    countsByGroup,
    groupPath,
} from '../lib/group-tree.js';
import { check, isTrue, done } from './_check.mjs';

//  clients
//    ├── acme
//    │     └── rollout
//    └── globex
//  internal
const TREE = [
    { id: 'clients', name: 'Clients', parent_id: null, position: 0 },
    { id: 'acme', name: 'Acme', parent_id: 'clients', position: 0 },
    { id: 'rollout', name: 'Rollout', parent_id: 'acme', position: 0 },
    { id: 'globex', name: 'Globex', parent_id: 'clients', position: 1 },
    { id: 'internal', name: 'Internal', parent_id: null, position: 1 },
];

// --- имена -----------------------------------------------------------------
check('пробелы по краям срезаются', normalizeGroupName('  Клиенты  '), 'Клиенты');
check('внутренние пробелы схлопываются', normalizeGroupName('Acme   \n  Corp'), 'Acme Corp');
check('пустое имя остаётся пустым — вызывающий обязан это заметить',
    normalizeGroupName('   '), '');
check('не строка тоже даёт пустое', [normalizeGroupName(null), normalizeGroupName(42)], ['', '42']);
check(`имя режется до ${MAX_GROUP_NAME} знаков`,
    normalizeGroupName('я'.repeat(200)).length, MAX_GROUP_NAME);

// --- сборка дерева ---------------------------------------------------------
const roots = buildGroupTree(TREE);
check('корней ровно два', roots.map((node) => node.id), ['clients', 'internal']);
check('порядок соседей — по position', roots[0].children.map((node) => node.id), ['acme', 'globex']);
check('вложенность сохраняется', roots[0].children[0].children.map((node) => node.id), ['rollout']);

check('строка с несуществующим родителем всплывает в корень, а не пропадает',
    buildGroupTree([{ id: 'lost', name: 'Lost', parent_id: 'gone' }]).map((node) => node.id),
    ['lost']);

check('папка, назначенная родителем самой себе, тоже видна',
    buildGroupTree([{ id: 'self', name: 'Self', parent_id: 'self' }]).map((node) => node.id),
    ['self']);

// цикл в данных: A → B → A. Дерево обязано собраться и остаться конечным
const LOOP = [
    { id: 'a', name: 'A', parent_id: 'b' },
    { id: 'b', name: 'B', parent_id: 'a' },
];
const loopRoots = buildGroupTree(LOOP);
check('на цикле в данных сборка не виснет и показывает обе папки',
    flattenGroupTree(loopRoots).length >= 2, true);

check('пустой список даёт пустое дерево', buildGroupTree([]), []);
check('и отсутствующий тоже', buildGroupTree(undefined), []);

// --- плоский показ ---------------------------------------------------------
check('раскрытое дерево читается сверху вниз с глубинами',
    flattenGroupTree(roots).map((row) => `${row.depth}:${row.group.id}`),
    ['0:clients', '1:acme', '2:rollout', '1:globex', '0:internal']);

check('свёрнутая ветка не показывает своих детей',
    flattenGroupTree(roots, (id) => id !== 'clients').map((row) => row.group.id),
    ['clients', 'internal']);

check('у листа отмечено отсутствие детей',
    flattenGroupTree(roots).find((row) => row.group.id === 'rollout').hasChildren, false);

// --- поддерево -------------------------------------------------------------
check('поддерево включает саму папку и всех потомков',
    subtreeIds(TREE, 'clients').sort(), ['acme', 'clients', 'globex', 'rollout']);
check('у листа поддерево — он один', subtreeIds(TREE, 'rollout'), ['rollout']);
check('несуществующая папка даёт саму себя и ничего больше',
    subtreeIds(TREE, 'nope'), ['nope']);
check('цикл в данных не делает поддерево бесконечным',
    subtreeIds(LOOP, 'a').sort(), ['a', 'b']);

check('глубина считается от корня', [depthOf(TREE, 'clients'), depthOf(TREE, 'acme'), depthOf(TREE, 'rollout')], [0, 1, 2]);
check('высота поддерева — до самого дальнего листа',
    [heightOf(TREE, 'clients'), heightOf(TREE, 'acme'), heightOf(TREE, 'rollout')], [2, 1, 0]);
check('высота на цикле конечна', heightOf(LOOP, 'a') >= 0, true);

// --- циклы при переносе ----------------------------------------------------
isTrue('папка не может стать родителем самой себе', wouldCycle(TREE, 'acme', 'acme'));
isTrue('папка не может уехать под собственного ребёнка', wouldCycle(TREE, 'clients', 'acme'));
isTrue('и под внука тоже', wouldCycle(TREE, 'clients', 'rollout'));
check('перенос в чужую ветку разрешён', wouldCycle(TREE, 'acme', 'internal'), false);
check('перенос в корень — это не цикл', wouldCycle(TREE, 'acme', null), false);
check('перенос к тому же родителю — не цикл', wouldCycle(TREE, 'acme', 'clients'), false);
isTrue('на уже испорченных данных проверка отвечает, а не зацикливается',
    wouldCycle(LOOP, 'a', 'b'));
check('родитель, которого нет в списке, циклом не считается',
    wouldCycle(TREE, 'acme', 'unknown-id'), false);

check('в предложенных целях нет ни себя, ни своего поддерева',
    moveTargets(TREE, 'clients').map((group) => group.id), ['internal']);
check('лист можно перенести куда угодно, кроме себя',
    moveTargets(TREE, 'rollout').map((group) => group.id).sort(),
    ['acme', 'clients', 'globex', 'internal']);

// --- счётчики --------------------------------------------------------------
// m1 лежит и в acme, и в rollout — родитель обязан посчитать её один раз
const MEMBERSHIP = new Map([
    ['clients', ['m9']],
    ['acme', ['m1', 'm2']],
    ['rollout', ['m1', 'm3']],
    ['globex', []],
]);
const counts = countsByGroup(TREE, MEMBERSHIP);

check('в папке считается и своё, и всё, что под ней',
    [counts.get('acme').direct, counts.get('acme').total], [2, 3]);
check('встреча, лежащая в папке и в подпапке, в сумме родителя — одна',
    counts.get('clients').total, 4);
check('рубрика без своих встреч показывает 0 своих и сумму детей',
    [counts.get('clients').direct, counts.get('globex').total], [1, 0]);
check('у листа своё и общее совпадают',
    [counts.get('rollout').direct, counts.get('rollout').total], [2, 2]);
check('папка без записей в членстве считается пустой, а не отсутствующей',
    counts.get('internal'), { direct: 0, total: 0 });

check('членство можно передать и обычным объектом',
    countsByGroup(TREE, { acme: ['m1'] }).get('acme'), { direct: 1, total: 1 });

// --- путь ------------------------------------------------------------------
check('путь читается от корня к папке',
    groupPath(TREE, 'rollout').map((group) => group.name), ['Clients', 'Acme', 'Rollout']);
check('у корневой папки путь — она сама', groupPath(TREE, 'internal').map((g) => g.id), ['internal']);
check('путь несуществующей папки пуст', groupPath(TREE, 'nope'), []);
check('путь на цикле обрывается, а не крутится',
    groupPath(LOOP, 'a').length <= 2, true);

done();
