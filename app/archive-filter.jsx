'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from './lang-context';
import styles from './nameless-filter.module.css';

//Переключатель «показать архив».
//
//Архив — это встречи владельцев без ключа Fathom: 788 из 1111. Они не
//сломаны, их можно читать, искать и размечать, но новых конспектов и
//участников у них не появится, пока ключ не подключат. По умолчанию список
//показывает живые встречи, иначе три четверти строк выглядят как «разбор не
//доехал», и каждый заново выясняет, почему.
//
//Прятать совсем нельзя: искать в них по-прежнему нужно. Поэтому кнопка, а не
//удаление, и счётчик рядом — чтобы объём архива был виден, а не забыт.
export default function ArchiveFilter({ count = 0 }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const T = useT();
    const on = searchParams.get('archived') === '1';

    //нечего показывать — нечего и предлагать: до применения
    //db/archive-orphans.sql архива не существует
    if (!count && !on) return null;

    function toggle() {
        const next = new URLSearchParams(searchParams.toString());
        if (on) next.delete('archived');
        else next.set('archived', '1');
        router.push(next.toString() ? `/?${next.toString()}` : '/');
    }

    return (
        <button type="button" onClick={toggle} data-active={on} className={styles.btn}>
            {T('archive.button')}
            {count > 0 && <span className={styles.count}>{count}</span>}
        </button>
    );
}
