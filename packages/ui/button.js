"use client";

import styles from "./button.module.css";

export function Button({ children, className }) {
  return <button className={`${styles.myButton} ${className}`}>{children}</button>;
}
