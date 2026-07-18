import { Card } from '../../shared/ui/card'
import { Heading } from '../../shared/ui/redesign'
import styles from './CourseProgramCard.module.scss'

export function CourseProgramCard({ className }: { className?: string }) {
  return (
    <Card className={`${styles.card} ${className}`}>
      <Heading>Course</Heading>
    </Card>
  )
}
