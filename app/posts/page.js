import styles from './PostGrid.module.css'
import cardStyles from './PostCard.module.css'

const posts = [
  { id: 1, title: 'First post', body: 'Static content for deterministic rendering.' },
  { id: 2, title: 'Second post', body: 'The route uses CSS modules loaded on navigation.' },
]

export default function Page() {
  return (
    <div>
      <h1>Posts page</h1>
      <ul className={styles.container}>
        {posts.map((post) => (
          <li className={cardStyles.container} key={post.id}>
            <h2 className={cardStyles.title}>{post.title}</h2>
            <p className={cardStyles.text}>{post.body}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
