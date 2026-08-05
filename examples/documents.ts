/**
 * List and optionally download Mauritius account statement PDFs.
 *
 * Required env:
 *   INVESTEC_CLIENT_ID / INVESTEC_CLIENT_SECRET / INVESTEC_API_KEY
 *   INVESTEC_ACCOUNT_ID
 *
 * Optional env:
 *   INVESTEC_HOST=https://openapisandbox.investec.com
 *   INVESTEC_FROM_DATE=2025-01-01
 *   INVESTEC_TO_DATE=2025-01-31
 *   INVESTEC_STATEMENT_DATE=2025-01-31   # required to download
 *   INVESTEC_STATEMENT_OUT=statement.pdf
 *   CONFIRM_DOWNLOAD=true               # required to write the PDF
 *
 * Run:
 *   npm run example:documents
 *   CONFIRM_DOWNLOAD=true npm run example:documents
 */

import { writeFile } from 'node:fs/promises';
import { InvestecApiError } from '../src/index.js';
import { createClientFromEnv, requireEnv } from './create-client.js';

async function main() {
  const mau = createClientFromEnv();
  const accountId = requireEnv('INVESTEC_ACCOUNT_ID');
  const toDate =
    process.env.INVESTEC_TO_DATE ?? new Date().toISOString().slice(0, 10);
  const fromDateDefault = new Date(toDate);
  fromDateDefault.setMonth(fromDateDefault.getMonth() - 3);
  const fromDate =
    process.env.INVESTEC_FROM_DATE ??
    fromDateDefault.toISOString().slice(0, 10);
  const statementDate = process.env.INVESTEC_STATEMENT_DATE;
  const outPath = process.env.INVESTEC_STATEMENT_OUT ?? 'statement.pdf';
  const confirm = process.env.CONFIRM_DOWNLOAD === 'true';

  console.log(
    `Listing documents for account ${accountId} (${fromDate} → ${toDate})...`,
  );
  const documents = await mau.getAccountDocuments(accountId, fromDate, toDate);
  const info = documents.availableDocuments.documentInformation ?? [];
  console.log(
    `Account ${documents.availableDocuments.accountNumber}: ${info.length} document(s)`,
  );
  for (const doc of info) {
    console.log(`  - ${doc.documentDate} (${doc.documentType})`);
  }

  if (!statementDate) {
    console.log(
      '\nSet INVESTEC_STATEMENT_DATE to download a statement PDF (and CONFIRM_DOWNLOAD=true to write it).',
    );
    return;
  }

  if (!confirm) {
    console.log(
      `\nWould download statement for ${statementDate} to ${outPath}. Re-run with CONFIRM_DOWNLOAD=true to write the file.`,
    );
    return;
  }

  console.log(`\nDownloading statement for ${statementDate}...`);
  const pdf = await mau.downloadAccountStatement(accountId, statementDate);
  await writeFile(outPath, Buffer.from(pdf));
  console.log(`Wrote ${pdf.byteLength} bytes to ${outPath}`);
}

main().catch((err) => {
  if (err instanceof InvestecApiError) {
    console.error('Investec API error:', {
      status: err.status,
      endpoint: err.endpoint,
      body: err.body,
      message: err.message,
    });
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
