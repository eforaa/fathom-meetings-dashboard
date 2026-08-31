'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePreview } from './preview';
import { useT } from './lang-context';
import styles from './preview-panel.module.css';

//Встреча сбоку, не уходя из списка.
//
//Раньше единственный способ прочитать конспект был — открыть страницу встречи
//и потерять всё: фильтры, прокрутку, место в списке. Для работы, где надо
//просмотреть двадцать встреч подряд, это означало двадцать возвращений назад.
//
//Панель открывается щелчком по строке, листается стрелками и закрывается по
//Escape. Название внутри остаётся настоящей ссылкой: поделиться встречей,
//открыть её в новой вкладке и прочитать расшифровку целиком — всё там же, где
//и было.

export default function PreviewPanel({ details }) {
    const { openId, isOpen, close, step, order } = usePreview();
    const T = useT();
    const boxRef = useRef(null);
    const cameFrom = useRef(null);

    //стрелки листают, Escape закрывает. Перехват стоит раньше списка: иначе
    //Escape закрыл бы панель и заодно снял отметку со строк
    useEffect(() => {
        if (!isOpen) return undefined;

        function onKey(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                event.preventDefault();
                close();
                return;
            }

            if (['ArrowDown', 'j', 'ArrowUp', 'k'].includes(event.key)) {
                event.stopPropagation();
                event.preventDefault();
                step(event.key === 'ArrowDown' || event.key === 'j' ? 1 : -1);
            }
        }

        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [isOpen, close, step]);

    //фокус уходит в панель и возвращается туда, откуда пришёл
    useEffect(() => {
        if (isOpen) {
            cameFrom.current = document.activeElement;
            boxRef.current?.focus();
        } else {
            cameFrom.current?.focus?.();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const meeting = details?.[openId];
    const at = order.indexOf(openId);

    return (
        <>
        {/* на узком экране панель лежит поверх списка, и щелчок мимо неё
            закрывает — как у любой выезжающей шторки */}
        <div className={styles.veil} onClick={close} aria-hidden="true" />

        <aside
            className={styles.panel}
            ref={boxRef}
            tabIndex={-1}
            role="complementary"
            aria-label={T('preview.title')}
        >
            <div className={styles.head}>
                <span className={styles.position}>
                    {T('preview.position', { n: at + 1, total: order.length })}
                </span>

                <span className={styles.headActions}>
                    <button
                        type="button"
                        className={styles.step}
                        onClick={() => step(-1)}
                        disabled={at <= 0}
                        aria-label={T('preview.previous')}
                    >
                        ↑
                    </button>
                    <button
                        type="button"
                        className={styles.step}
                        onClick={() => step(1)}
                        disabled={at >= order.length - 1}
                        aria-label={T('preview.next')}
                    >
                        ↓
                    </button>
                    <button
                        type="button"
                        className={styles.close}
                        onClick={close}
                        aria-label={T('preview.close')}
                    >
                        ✕
                    </button>
                </span>
            </div>

            {!meeting ? (
                <p className={styles.empty}>{T('preview.gone')}</p>
            ) : (
                <>
                    <p className={styles.when}>
                        {meeting.date}
                        {meeting.duration && <span className={styles.dot}> · {meeting.duration}</span>}
                    </p>

                    <h2 className={styles.title}>
                        <Link href={meeting.href} className={styles.titleLink}>{meeting.title}</Link>
                    </h2>

                    {meeting.types?.length > 0 && (
                        <p className={styles.types}>
                            {meeting.types.map((type) => (
                                <span key={type.key} className={styles.type} data-type={type.key}>
                                    {type.label}
                                </span>
                            ))}
                        </p>
                    )}

                    <section className={styles.block}>
                        <h3 className={styles.blockTitle}>{T('preview.summary')}</h3>
                        {meeting.summary
                            ? <p className={styles.summary}>{meeting.summary}</p>
                            : <p className={styles.none}>{T('preview.noSummary')}</p>}
                    </section>

                    <section className={styles.block}>
                        <h3 className={styles.blockTitle}>
                            {T('preview.people')}
                            <span className={styles.count}>{meeting.people?.length ?? 0}</span>
                        </h3>
                        {meeting.people?.length
                            ? (
                                <ul className={styles.people}>
                                    {meeting.people.map((person) => (
                                        <li key={person} className={styles.person}>{person}</li>
                                    ))}
                                </ul>
                            )
                            : <p className={styles.none}>{T('preview.noPeople')}</p>}
                    </section>

                    <div className={styles.actions}>
                        <Link href={meeting.href} className={styles.action}>
                            {T('preview.openPage')}
                        </Link>
                        {meeting.recordingUrl && (
                            <a
                                href={meeting.recordingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.action}
                            >
                                {T('preview.openFathom')}
                            </a>
                        )}
                    </div>

                    <p className={styles.hint}>{T('preview.hint')}</p>
                </>
            )}
        </aside>
        </>
    );
}
