'use client';

import { usePreview } from './preview';
import { useT } from './lang-context';
import styles from './cards-view.module.css';

//Вид «карточки»: тот же список встреч, что и в таблице, но плитками. Данные
//приходят готовыми с сервера (page.jsx), панель просмотра — та же: клик по
//карточке открывает её сбоку, как клик по строке. Редактирование остаётся в
//панели, поэтому карточка только показывает и ведёт внутрь.
export default function CardsView({ cards = [] }) {
    const { open } = usePreview();
    const T = useT();

    if (!cards.length) return null;

    return (
        <div className={styles.grid}>
            {cards.map((card) => (
                <button key={card.id} type="button" className={styles.card} onClick={() => open(card.id)}>
                    <span className={styles.title}>{card.title}</span>

                    <span className={styles.meta}>
                        <span>{card.when}</span>
                        {card.duration && <span>· {card.duration}</span>}
                        {card.people > 0 && <span>· {T('row.people').replace('{n}', card.people)}</span>}
                    </span>

                    {card.types.length > 0 && (
                        <span className={styles.types}>
                            {card.types.map((type) => (
                                <span key={type.key} className={styles.type} data-type={type.key}>
                                    {type.label}
                                </span>
                            ))}
                        </span>
                    )}

                    {card.importance > 0 && (
                        <span className={styles.stars} aria-label={String(card.importance)}>
                            {'★'.repeat(card.importance)}
                        </span>
                    )}

                    {card.summary && <span className={styles.summary}>{card.summary}</span>}
                </button>
            ))}
        </div>
    );
}
