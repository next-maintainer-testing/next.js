import styles from './style.module.css'

export function HelloWorld() {
  return <p id="dynamic-css-target" className={styles.message}>DYNAMIC CSS TARGET</p>
}
