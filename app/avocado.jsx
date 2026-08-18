import styles from './avocado.module.css';

//The AiVocado mark, sitting beside the product name in the header.
//Drawn rather than dropped in as the 🥑 emoji: an emoji renders differently on
//every platform, ignores the editorial palette, and goes muddy in dark mode.
//This one is built from the same tokens as everything else, so it changes with
//the theme on its own.
export default function Avocado({ size = 20 }) {
    return (
        <span className={styles.mark} style={{ width: size, height: size }} aria-hidden="true">
            <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
                {/* the flesh: a pear-shaped body, narrow at the stem */}
                <path
                    d="M12 2.6c3.1 0 5.6 2.5 5.6 5.4 0 1.7-.7 2.8-1.2 4-.6 1.4-.6 2.3-.6 3.4 0 3-1.7 5.6-3.8 5.6s-3.8-2.6-3.8-5.6c0-1.1 0-2-.6-3.4-.5-1.2-1.2-2.3-1.2-4C6.4 5.1 8.9 2.6 12 2.6Z"
                    className={styles.flesh}
                />
                {/* the stone */}
                <ellipse cx="12" cy="14.6" rx="2.5" ry="3" className={styles.stone} />
            </svg>
        </span>
    );
}
