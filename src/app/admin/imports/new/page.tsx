import Link from "next/link";

import { ManualImportForm } from "../_components/manual-import-form";

export default function NewListingImportPage() {
  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Listing imports</p>
          <h1>Manual import</h1>
          <p>
            Submit a bounded JSON or CSV export to the same review pipeline used
            by the ingestion API.
          </p>
        </div>
        <Link className="ui-button ui-button--secondary" href="/admin/imports">
          Back to imports
        </Link>
      </header>
      <ManualImportForm />
    </div>
  );
}
