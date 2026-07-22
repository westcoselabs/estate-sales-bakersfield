# Provider Inventory Through Phase 4

| Capability           | Local                                | Test                                 | Vercel Preview                                     | Production          |
| -------------------- | ------------------------------------ | ------------------------------------ | -------------------------------------------------- | ------------------- |
| PostgreSQL/PostGIS   | optional isolated Preview Neon       | isolated Test Neon                   | isolated Preview Neon                              | reserved; untouched |
| Authentication email | capture file                         | capture file                         | Preview Resend                                     | separate later      |
| Media                | non-Production adapter/resource      | `.tmp` deterministic store           | private Preview Blob                               | separate later      |
| Location             | fixture/non-Production               | deterministic Bakersfield fixture    | Preview Mapbox                                     | separate later      |
| Rate limits/jobs     | PostgreSQL                           | scoped Test PostgreSQL               | Preview PostgreSQL + authenticated runner          | separate later      |
| Payment              | deterministic fake and fixture price | deterministic fake and fixture price | regular Stripe account, test mode, hosted Checkout | unset and untouched |

Stripe Connect, another queue, local PostgreSQL, Docker, Upstash, card collection, custom Elements, embedded Checkout, and a second payment processor are not part of Phase 4.
