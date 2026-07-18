'use client'

import { use } from 'react'
import { getStockBySlug } from '../actions'

export function StockValue({ slug }) {
  const stock = use(getStockBySlug(slug))
  return <p data-stock>Stock: {stock}</p>
}
