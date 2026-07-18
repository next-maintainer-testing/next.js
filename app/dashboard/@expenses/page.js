const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default async function ExpensesPage() {
  await delay(2000)
  return <article style={{ border: '1px solid #999', padding: 20 }}><h2>Expenses</h2><p>Expense data has loaded.</p></article>
}
