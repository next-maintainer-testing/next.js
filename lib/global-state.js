const previous = global.__nextIssue52165Imported ?? 'undefined'
console.log(`ISSUE52165_GLOBAL_BEFORE:${previous}`)

if (global.__nextIssue52165Imported === undefined) {
  global.__nextIssue52165Imported = 'hello'
}

export function getGlobalState() {
  return {
    previous,
    current: global.__nextIssue52165Imported,
  }
}
