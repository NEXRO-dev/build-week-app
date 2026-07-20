This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Localized routes

- Japanese: `http://localhost:3000/jp-ja`
- English (US): `http://localhost:3000/us-en`
- `/` redirects to the Japanese route.

Both routes share the same features and authentication. The selected locale is also preserved through the authentication callback.

## Google authentication

Google OAuth and email/password authentication are provided by Better Auth, which stores users and sessions in Turso.
Copy `.env.local.example` to `.env.local`, fill in the values, and register this Google OAuth redirect URI:

```text
http://localhost:3000/api/auth/callback/google
```

For production, replace the origin with the deployed domain and set `BETTER_AUTH_URL` to that same origin.

Generate the session secret and create the Better Auth tables before the first run:

```bash
openssl rand -base64 48
npx auth@latest migrate
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
