import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { createClientForServer } from '@/lib/supabase-auth';
import { tokenForOwner } from '@/lib/mcp-server';
import ConnectPanel from './connect-panel';
import styles from './connect.module.css';

export const dynamic = 'force-dynamic';

//a one-screen "connect Claude to your meetings" page: the person copies a
//ready link (token already inside) and pastes it into Claude — no juggling a
//separate key. replaces the manual token dance.
export default async function ConnectPage() {
  const supabase = createClientForServer(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const token = tokenForOwner(user?.email);

  //build the site origin from the incoming request
  const h = await headers();
  const host = h.get('host') ?? 'fathom-meetings-dashboard.vercel.app';
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  const base = `${proto}://${host}`;
  const url = token ? `${base}/api/mcp/${token}` : null;

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        ← dashboard
      </Link>

      <h1 className={styles.title}>Подключить Claude к встречам</h1>
      <p className={styles.lede}>
        Чтобы Claude мог искать, называть и разбирать ваши встречи прямо из чата —
        подключите коннектор. Это делается один раз.
      </p>

      {url ? (
        <ConnectPanel url={url} token={token} base={base} email={user?.email} />
      ) : (
        <div className={styles.noToken}>
          <p className={styles.noTokenTitle}>Ключ ещё не выпущен для {user?.email}</p>
          <p className={styles.noTokenText}>
            Напишите администратору проекта (Sofiia) — она добавит ваш ключ, и на этой
            странице появится готовая ссылка для подключения.
          </p>
        </div>
      )}
    </main>
  );
}
