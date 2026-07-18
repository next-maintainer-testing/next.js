import type { ReactNode } from 'react'
import styles from './styles.module.scss'

export function FloatingContainer({ children }: { children: ReactNode }) {
  return <div className={styles.container}>{children}</div>
}
