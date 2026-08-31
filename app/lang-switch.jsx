'use client';

import { useRouter } from 'next/navigation';
import { LANGS, LANG_LABELS, rememberLang } from '@/lib/i18n';
import { useLang, useT } from './lang-context';
import styles from './lang-switch.module.css';

//Одна кнопка вместо трёх.
//
//Раньше здесь стоял ряд из трёх коротких кнопок — УКР РУС ENG, — и он занимал
//104 пикселя. На телефоне это была пятая часть всей шапки ради выбора, который
//делают раз в жизни. Кнопка показывает нынешний язык и по нажатию переходит к
//следующему по кругу; трёх шагов хватает, чтобы вернуться к любому.
//
//Язык не меняется без перезагрузки: все слова отрисованы на сервере. Поэтому
//после записи cookie страницу надо попросить заново — router.refresh()
//перерисовывает серверные компоненты на месте, сохраняя прокрутку и вид.
export default function LangSwitch() {
    const router = useRouter();
    const current = useLang();
    const T = useT();

    const next = LANGS[(LANGS.indexOf(current) + 1) % LANGS.length];

    function choose() {
        rememberLang(next);
        router.refresh();
    }

    return (
        <button
            type="button"
            onClick={choose}
            className={styles.button}
            //Что здесь написано и что случится по нажатию — разные вещи, и
            //экранный диктор должен читать второе, иначе кнопка сообщает о
            //себе «УКР» и молчит о том, что она вообще что-то делает.
            aria-label={`${T('lang.label')}: ${LANG_LABELS[current]} → ${LANG_LABELS[next]}`}
            title={`${LANG_LABELS[current]} → ${LANG_LABELS[next]}`}
            lang={current}
        >
            {LANG_LABELS[current]}
        </button>
    );
}
