'use client';

/**
 * This component receives the plaintext initial password as a PROP, passed
 * once by the caller right after a successful provisioning server action.
 * It is held only in React state on this page — never re-fetched, never
 * written to a table (see services/admin/provisioning-service.ts). If the
 * page is refreshed, this component unmounts and the password is gone for
 * good; that's intentional, not a bug to route around (spec §11).
 */
export interface CredentialSheetData {
  accountType: 'Farmer' | 'CSC Operator' | 'Centre Operator';
  accountHolderName: string;
  mobileNumber: string;
  accountId: string;
  initialPassword: string;
  issueDate: string;
}

const SIGNATURE_LABELS: Record<CredentialSheetData['accountType'], string> = {
  'Farmer': 'Farmer Signature / Thumb Impression',
  'CSC Operator': 'CSC Operator Signature',
  'Centre Operator': 'Centre Operator Signature',
};

export function CredentialPrintSheet({ data }: { data: CredentialSheetData }) {
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">
          Print this now — the password cannot be shown again after you leave this page.
        </p>
        <button
          onClick={() => window.print()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Print credentials
        </button>
      </div>

      <div id="credential-sheet" className="rounded-lg border border-border bg-card p-8 print:border-none print:p-0">
        <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
          <div>
            <p className="font-heading text-2xl">AnnaSetu</p>
            <p className="text-sm text-muted-foreground">Account Credentials — {data.accountType}</p>
          </div>
          <p className="text-xs text-muted-foreground">Issued {data.issueDate}</p>
        </div>

        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Account Type</dt>
          <dd className="font-medium">{data.accountType}</dd>

          <dt className="text-muted-foreground">Account Holder Name</dt>
          <dd className="font-medium">{data.accountHolderName}</dd>

          <dt className="text-muted-foreground">Mobile Number</dt>
          <dd className="font-medium">{data.mobileNumber}</dd>

          <dt className="text-muted-foreground">Account ID</dt>
          <dd className="font-mono text-xs">{data.accountId}</dd>

          <dt className="text-muted-foreground">Initial Password</dt>
          <dd className="font-mono text-base font-semibold tracking-wide">{data.initialPassword}</dd>

          <dt className="text-muted-foreground">Creation Date</dt>
          <dd className="font-medium">{data.issueDate}</dd>
        </dl>

        <p className="mt-6 rounded-md bg-accent/10 px-3 py-2 text-sm font-medium text-accent">
          Initial credentials — change password on first login.
        </p>

        <div className="mt-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">First-login instructions</p>
          <ol className="ml-4 list-decimal">
            <li>Sign in with the mobile number and initial password above.</li>
            <li>You will be required to set a new password immediately.</li>
            <li>The initial password stops working as soon as the new one is set.</li>
          </ol>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
          <div>
            <div className="h-16 border-b border-foreground" />
            <p className="mt-2 text-muted-foreground">Authorized Signatory</p>
          </div>
          <div>
            <div className="h-16 border-b border-foreground" />
            <p className="mt-2 text-muted-foreground">{SIGNATURE_LABELS[data.accountType]}</p>
          </div>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">Reference: {data.accountId}</p>
      </div>

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #credential-sheet, #credential-sheet * { visibility: visible; }
          #credential-sheet { position: absolute; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
