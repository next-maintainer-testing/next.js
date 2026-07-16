import styles from "./page.module.css";

export default function Home() {
  return (
    <main>
      <div id="baseline" className={styles.description}>description</div>
      <div id="target" className={styles.largeDescription}>large description</div>
    </main>
  );
}
