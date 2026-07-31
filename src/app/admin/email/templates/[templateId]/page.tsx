import { notFound } from "next/navigation";
import { getCurrentSession } from "@/modules/auth";
import { createConfiguredEmailCenter } from "@/modules/email";
import { EmailTemplateEditor } from "./template-editor";

export default async function EmailTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const template = await createConfiguredEmailCenter().getTemplate(
    await getCurrentSession(),
    templateId,
  );
  if (!template) notFound();
  return (
    <div className="admin-page admin-page--wide">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Email center / Templates</p>
          <h1>{template.name}</h1>
          <p>
            {template.key
              ? "Protected system template"
              : "Custom marketing template"}{" "}
            · Draft version {template.draftVersion}
          </p>
        </div>
      </header>
      <EmailTemplateEditor
        template={{
          id: template.id,
          name: template.name,
          key: template.key,
          draftSubject: template.draftSubject,
          draftHtml: template.draftHtml,
          draftVersion: template.draftVersion,
          draftDigest: template.draftDigest,
          activeRevision: template.activeRevision,
          revisions: template.revisions.map((revision) => ({
            ...revision,
            publishedAt: revision.publishedAt.toISOString(),
          })),
        }}
      />
    </div>
  );
}
