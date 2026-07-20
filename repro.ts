import { Bricolage_Grotesque } from 'next/font/google'

// The reporter expected to configure a concrete width-axis value here.
// next/font/google instead types `axes` only as an array of axis names.
export const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: {
    wdth: 80.7,
  },
})
