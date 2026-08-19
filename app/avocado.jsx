import Image from 'next/image';
import mascot from '../public/avocado.png';
import styles from './avocado.module.css';

//The AiVocado mascot, used as the product mark.
//
//The source was a 1280px JPG on solid white. White is opaque, so a dark theme
//would have shown a white square behind it, and most of the frame was margin —
//at 20px the mascot itself would have been a few pixels across. The asset in
//public/ is the same picture with the background flood-filled to transparent
//from the corners (the glare on the face and the highlights in the eyes are
//white too, so a blanket "white becomes transparent" would have eaten them)
//and the margin trimmed away.
export default function Avocado({ size = 32 }) {
    return (
        <span className={styles.mark} style={{ width: size, height: size }}>
            <Image
                src={mascot}
                alt=""
                width={size}
                height={size}
                className={styles.image}
                //part of the first screen in both places it is used, and a few
                //kilobytes at this size — lazy loading would only make it pop in
                priority
            />
        </span>
    );
}
