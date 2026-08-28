'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from './lang-context';
//та же кнопка, что у «без названия» и «без конспекта»: это соседи по ряду и
//по смыслу, и выглядеть они обязаны одинаково
import styles from './nameless-filter.module.css';

//Быстрый фильтр по пробелу в данных: «без типа», «без оценки».
//
//Один компонент на все такие кнопки, а не по файлу на каждую. Они отличаются
//ровно двумя вещами — именем в адресе и словом на кнопке, — и разводить под
//это отдельные копии значит однажды поправить три из четырёх.
//
//Кнопка не показывается, когда пробелов нет: предлагать «показать ноль
//встреч» незачем. Но если фильтр включён, она остаётся видимой — иначе из
//пустого списка не будет выхода.
export default function GapFilter({ param, word, count = 0 }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const T = useT();
    const on = searchParams.get(param) === '1';

    if (!count && !on) return null;

    function toggle() {
        const next = new URLSearchParams(searchParams.toString());
        if (on) next.delete(param);
        else next.set(param, '1');
        router.push(next.toString() ? `/?${next.toString()}` : '/');
    }

    return (
        <button type="button" onClick={toggle} data-active={on} className={styles.btn}>
            {T(word)}
            {count > 0 && <span className={styles.count}>{count}</span>}
        </button>
    );
}
