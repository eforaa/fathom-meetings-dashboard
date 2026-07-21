import { Suspense } from 'react';
import LoginForm from './login-form';
import styles from './login.module.css';


export default function LoginPage() {
  return (
    <main className={styles.page}>
      <Suspense fallback={<div className={styles.card} />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}