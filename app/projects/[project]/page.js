import Link from 'next/link'

export default function ProjectPage({ params }) {
  return (
    <section>
      <h1>Project {params.project}</h1>
      <Link data-open-create href={`/projects/${params.project}/create`}>
        Create
      </Link>
    </section>
  )
}
