'use strict'

const React = require('react')
const BoxContext = React.createContext({})

function Box({ children }) {
  return React.createElement(BoxContext.Provider, { value: {} }, React.createElement('div', null, children))
}

exports.Box = Box
