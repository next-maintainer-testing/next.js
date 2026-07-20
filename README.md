# Next.js issue 59374 reproduction

A minimal App Router app where an external UI package sets a button background to red and the app applies an equally specific blue CSS Module class. Run `npm install`, `npm run build`, and `npm start`; the local blue app style is expected to win.
