import { NewTemplateForm } from "./new-template-form";
export default function NewEmailTemplatePage() {
  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Email center / Templates</p>
          <h1>New marketing template</h1>
          <p>
            Create a reusable HTML layout. Custom templates are marketing-only
            and remain archived in history.
          </p>
        </div>
      </header>
      <NewTemplateForm />
    </div>
  );
}
