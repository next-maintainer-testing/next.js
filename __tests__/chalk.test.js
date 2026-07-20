import chalk from 'chalk'

test('next/jest can load a pure ESM dependency', () => {
  expect(chalk.blue('Client Component Test')).toContain('Client Component Test')
})
