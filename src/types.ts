/**
 * OAuth authentication response from Investec API.
 */
export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

/**
 * Shared pagination / self-link envelope fields returned by many endpoints.
 */
export interface ApiLinks {
  self: string;
}

export interface ApiMeta {
  totalPages: number;
}

/**
 * Represents a single Investec Mauritius account.
 */
export interface Account {
  accountId: number;
  accountNumber: string;
  accountCurrency: string;
  profileId: number;
  profileName: string;
  /** Present in API responses though not always listed in the OpenAPI schema. */
  accountName?: string;
}

/**
 * Balance details for a specific Mauritius account.
 */
export interface AccountBalance {
  accountNumber: string;
  accountType: string;
  accountShortName: string;
  balance: number;
  availableBalance: number;
  encumbrances: number;
  currency: string;
  debitInterestRate: number;
  creditInterestRate: number;
  creditInterestAccrued: number;
  debitInterestAccrued: number;
  /** Present in API examples though not always listed in the OpenAPI schema. */
  overDraftLimit?: number;
}

/**
 * API response for a single account's balance.
 */
export interface AccountBalanceResponse {
  data: AccountBalance;
  links?: ApiLinks;
  meta?: ApiMeta;
}

/**
 * API response for a list of accounts.
 */
export interface AccountResponse {
  data: {
    accounts: Account[];
  };
  links?: ApiLinks;
  meta?: ApiMeta;
}

/**
 * Represents a single transaction on a Mauritius account.
 */
export interface AccountTransaction {
  description: string;
  creditAmount: number;
  debitAmount: number;
  transactionDate: string;
  bankReference: string;
  amount: number;
  runningBalance: number;
  /** Present in API examples though not always listed in the OpenAPI schema. */
  postDate?: string;
}

/**
 * API response for a list of transactions on an account.
 */
export interface AccountTransactionResponse {
  data: {
    transactions: AccountTransaction[];
  };
  links?: ApiLinks;
  meta?: ApiMeta;
}

/**
 * Metadata for a single available document (e.g. bank statement).
 */
export interface DocumentInformation {
  documentDate: string;
  documentType: string;
}

/**
 * Available documents for an account within a date range.
 */
export interface AvailableDocuments {
  accountNumber: string;
  documentInformation: DocumentInformation[];
}

/**
 * API response for listing available documents.
 */
export interface AccountDocumentsResponse {
  availableDocuments: AvailableDocuments;
}
