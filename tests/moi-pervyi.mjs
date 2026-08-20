import { formatDuration } from '../lib/format.js'; // что проверяем
import { check, done } from './_check.mjs'; // чем проверяем
check('45 минут показываются как "45 min"', formatDuration(45, 'en'), '45 min');
done();
