import { use } from 'react'

function getPosts() {
  return new Promise((resolve) => {
    setTimeout(() => resolve([{ id: 1, title: 'Loaded post' }]), 50)
  })
}

export async function Post() {
  const posts = use(getPosts())

  return posts.map((post) => (
    <article key={post.id}>
      <h2>{post.title}</h2>
      <p id="success-marker">POSTS_RENDERED</p>
    </article>
  ))
}
