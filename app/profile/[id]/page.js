import ProfileLink from '../../ProfileLink'

export default function Profile({ params }) {
  return <main><h1 id="profile">Profile {params.id}</h1><ProfileLink id={params.id} /></main>
}
