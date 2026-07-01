# Chicago Eats Ledger

A modern React frontend with an AWS-ready Express backend using DynamoDB for shared persistence.

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start frontend + backend together:
   ```bash
   npm run dev
   ```
3. Open http://localhost:4174

## Production build

```bash
npm run build
```

## Start server

```bash
npm start
```

## AWS deployment notes

- `server/server.js` uses DynamoDB and environment variables:
  - `AWS_REGION`
  - `DYNAMODB_TABLE` (default: `ChicagoEatsLedgerSpots`)

- Create a DynamoDB table with `pk` as the partition key (string).
- Deploy the built `dist` folder with Node on AWS Elastic Beanstalk, ECS, or AWS App Runner.
- Ensure AWS credentials are available to the runtime environment.
