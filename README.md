# Next.js issue 81198 reproduction

This minimal App Router app uses delayed parallel route slots. Run `npm install && npm run dev`, open `/dashboard`, follow **View Archived Revenue Data**, and then follow **Back to Dashboard**. The verifier checks whether the archived view remains visible without a loading indicator while the dashboard revenue slot is fetched again.
