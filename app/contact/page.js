import { sendMessage } from './actions'

export default function Contact() {
  return (
    <main>
      <h1>Contact</h1>
      <form id="contact-form" action={sendMessage}>
        <input name="message" defaultValue="hello" />
        <button type="submit">Send</button>
      </form>
    </main>
  )
}
