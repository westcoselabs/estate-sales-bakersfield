"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CopyId } from "../../_components/copy-id";

export interface CredentialManagerSource {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly productionAllowed: boolean;
}

export interface CredentialManagerCredential {
  readonly id: string;
  readonly name: string;
  readonly sourceKey: string;
  readonly sourceName: string;
  readonly displayPrefix: string;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
}

export interface CredentialManagerProps {
  readonly sources: readonly CredentialManagerSource[];
  readonly credentials: readonly CredentialManagerCredential[];
  readonly production: boolean;
}

interface ApiErrorResponse {
  readonly error?: string;
}

interface CreatedCredentialResponse extends ApiErrorResponse {
  readonly credential?: {
    readonly id: string;
    readonly sourceKey: string;
    readonly name: string;
    readonly displayPrefix: string;
    readonly token: string;
    readonly createdAt: string;
  };
}

interface RevokedCredentialResponse extends ApiErrorResponse {
  readonly alreadyRevoked?: boolean;
}

interface CreatedCredentialToken {
  readonly name: string;
  readonly token: string;
}

async function responseBody<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function reauthenticate(password: string): Promise<void> {
  const response = await fetch("/api/admin/reauth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const body = await responseBody<ApiErrorResponse>(response);
    throw new Error(body?.error ?? "Password confirmation failed.");
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(date);
}

function DateValue({ value }: { readonly value: string | null }) {
  return value && Number.isFinite(new Date(value).getTime()) ? (
    <time dateTime={value}>{formatDate(value)}</time>
  ) : (
    <>—</>
  );
}

export function CredentialManager({
  sources,
  credentials,
  production,
}: CredentialManagerProps) {
  const router = useRouter();
  const createDialog = useRef<HTMLDialogElement>(null);
  const createForm = useRef<HTMLFormElement>(null);
  const tokenHeading = useRef<HTMLHeadingElement>(null);
  const revokeDialog = useRef<HTMLDialogElement>(null);
  const revokeForm = useRef<HTMLFormElement>(null);
  const [createdToken, setCreatedToken] =
    useState<CreatedCredentialToken | null>(null);
  const [selectedCredential, setSelectedCredential] =
    useState<CredentialManagerCredential | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [revokePending, setRevokePending] = useState(false);
  const [createMessage, setCreateMessage] = useState("");
  const [revokeMessage, setRevokeMessage] = useState("");
  const [notice, setNotice] = useState("");
  const eligibleSources = production
    ? sources.filter((source) => source.productionAllowed)
    : sources;

  useEffect(() => {
    if (createdToken) tokenHeading.current?.focus();
  }, [createdToken]);

  function openCreateDialog() {
    setCreatedToken(null);
    setCreateMessage("");
    createForm.current?.reset();
    createDialog.current?.showModal();
  }

  function closeCreateDialog() {
    const tokenWasShown = createdToken !== null;
    setCreatedToken(null);
    setCreateMessage("");
    createForm.current?.reset();
    createDialog.current?.close();
    if (tokenWasShown) {
      setNotice("Credential created. Its one-time token was cleared.");
      router.refresh();
    }
  }

  function openRevokeDialog(credential: CredentialManagerCredential) {
    setSelectedCredential(credential);
    setRevokeMessage("");
    revokeForm.current?.reset();
    revokeDialog.current?.showModal();
  }

  function closeRevokeDialog() {
    setSelectedCredential(null);
    setRevokeMessage("");
    revokeForm.current?.reset();
    revokeDialog.current?.close();
  }

  async function createCredential(form: FormData) {
    setCreatePending(true);
    setCreateMessage("");
    setNotice("");
    try {
      await reauthenticate(String(form.get("password") ?? ""));
      const response = await fetch("/api/admin/imports/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceKey: String(form.get("sourceKey") ?? ""),
          name: String(form.get("name") ?? ""),
        }),
      });
      const body = await responseBody<CreatedCredentialResponse>(response);
      const credential = body?.credential;
      if (
        !response.ok ||
        !credential ||
        !/^esb_ing_[A-Za-z0-9_-]{43}$/u.test(credential.token)
      ) {
        throw new Error(
          body?.error ?? "The ingestion credential could not be created.",
        );
      }
      createForm.current?.reset();
      setCreatedToken({ name: credential.name, token: credential.token });
    } catch (error) {
      setCreateMessage(
        error instanceof Error
          ? error.message
          : "The ingestion credential could not be created.",
      );
    } finally {
      setCreatePending(false);
    }
  }

  async function revokeCredential(form: FormData) {
    if (!selectedCredential) return;
    setRevokePending(true);
    setRevokeMessage("");
    setNotice("");
    try {
      await reauthenticate(String(form.get("password") ?? ""));
      const response = await fetch(
        `/api/admin/imports/credentials/${selectedCredential.id}/revoke`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const body = await responseBody<RevokedCredentialResponse>(response);
      if (!response.ok) {
        throw new Error(
          body?.error ?? "The ingestion credential could not be revoked.",
        );
      }
      const alreadyRevoked = body?.alreadyRevoked === true;
      closeRevokeDialog();
      setNotice(
        alreadyRevoked
          ? "The credential was already revoked. The list was refreshed."
          : "Credential revoked.",
      );
      router.refresh();
    } catch (error) {
      setRevokeMessage(
        error instanceof Error
          ? error.message
          : "The ingestion credential could not be revoked.",
      );
    } finally {
      setRevokePending(false);
    }
  }

  return (
    <>
      <section className="admin-panel admin-panel--table">
        <div className="admin-table-toolbar">
          <div>
            <strong>Ingestion credentials</strong>
            <span>Raw tokens are shown once at creation</span>
          </div>
          <button
            className="ui-button ui-button--primary"
            disabled={eligibleSources.length === 0}
            onClick={openCreateDialog}
            type="button"
          >
            Create credential
          </button>
        </div>
        {notice ? (
          <p className="ui-alert ui-alert--success" role="status">
            {notice}
          </p>
        ) : null}
        {credentials.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption>Ingestion credential metadata</caption>
              <thead>
                <tr>
                  <th scope="col">Credential</th>
                  <th scope="col">Source</th>
                  <th scope="col">Prefix</th>
                  <th scope="col">Created</th>
                  <th scope="col">Last used</th>
                  <th scope="col">Revoked</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map((credential) => (
                  <tr key={credential.id}>
                    <td data-label="Credential">
                      <strong>{credential.name}</strong>
                    </td>
                    <td data-label="Source">
                      {credential.sourceName}
                      <br />
                      <small>{credential.sourceKey}</small>
                    </td>
                    <td data-label="Prefix">
                      <code>{credential.displayPrefix}</code>
                    </td>
                    <td data-label="Created">
                      <DateValue value={credential.createdAt} />
                    </td>
                    <td data-label="Last used">
                      <DateValue value={credential.lastUsedAt} />
                    </td>
                    <td data-label="Revoked">
                      {credential.revokedAt ? (
                        <DateValue value={credential.revokedAt} />
                      ) : (
                        <span className="admin-status admin-status--success">
                          Active
                        </span>
                      )}
                    </td>
                    <td data-label="Action">
                      {credential.revokedAt ? (
                        <span className="admin-status admin-status--error">
                          Revoked
                        </span>
                      ) : (
                        <button
                          aria-label={`Revoke credential ${credential.name}`}
                          className="ui-button ui-button--danger"
                          onClick={() => openRevokeDialog(credential)}
                          type="button"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No ingestion credentials have been created.</p>
        )}
      </section>

      <dialog
        aria-labelledby="credential-create-title"
        className="admin-dialog"
        onCancel={(event) => {
          event.preventDefault();
          if (!createPending) closeCreateDialog();
        }}
        onClose={() => {
          setCreatedToken(null);
          setCreateMessage("");
          createForm.current?.reset();
        }}
        ref={createDialog}
      >
        {createdToken ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              closeCreateDialog();
            }}
          >
            <p className="eyebrow">Credential created</p>
            <h2 id="credential-create-title" ref={tokenHeading} tabIndex={-1}>
              Copy {createdToken.name} now
            </h2>
            <p className="ui-alert ui-alert--warning">
              This raw token will not be shown again after this dialog closes.
            </p>
            <CopyId label="ingestion API token" value={createdToken.token} />
            <div className="admin-actions">
              <button
                className="ui-button ui-button--primary"
                onClick={closeCreateDialog}
                type="button"
              >
                I have copied the token
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void createCredential(new FormData(event.currentTarget));
            }}
            ref={createForm}
          >
            <p className="eyebrow">Importer access</p>
            <h2 id="credential-create-title">Create ingestion credential</h2>
            <label className="ui-field">
              <span className="ui-field__label">Credential name</span>
              <input
                autoComplete="off"
                className="ui-input"
                maxLength={100}
                minLength={1}
                name="name"
                required
              />
            </label>
            <label className="ui-field">
              <span className="ui-field__label">Source</span>
              <select className="ui-input" name="sourceKey" required>
                {eligibleSources.map((source) => (
                  <option key={source.id} value={source.key}>
                    {source.name} ({source.key})
                  </option>
                ))}
              </select>
            </label>
            <label className="ui-field">
              <span className="ui-field__label">Your password</span>
              <input
                autoComplete="current-password"
                className="ui-input"
                maxLength={128}
                name="password"
                required
                type="password"
              />
            </label>
            {createMessage ? (
              <p className="ui-alert ui-alert--error" role="alert">
                {createMessage}
              </p>
            ) : null}
            <div className="admin-actions">
              <button
                className="ui-button ui-button--primary"
                disabled={createPending}
                type="submit"
              >
                {createPending ? "Creating…" : "Create credential"}
              </button>
              <button
                className="ui-button ui-button--secondary"
                disabled={createPending}
                onClick={closeCreateDialog}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </dialog>

      <dialog
        aria-labelledby="credential-revoke-title"
        className="admin-dialog"
        onCancel={(event) => {
          event.preventDefault();
          if (!revokePending) closeRevokeDialog();
        }}
        onClose={() => {
          setSelectedCredential(null);
          setRevokeMessage("");
          revokeForm.current?.reset();
        }}
        ref={revokeDialog}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void revokeCredential(new FormData(event.currentTarget));
          }}
          ref={revokeForm}
        >
          <p className="eyebrow">Importer access</p>
          <h2 id="credential-revoke-title">
            Revoke {selectedCredential?.name ?? "credential"}?
          </h2>
          <p className="ui-alert ui-alert--warning">
            The importer will immediately receive an authentication failure when
            it next uses this credential.
          </p>
          <label className="ui-field">
            <span className="ui-field__label">Your password</span>
            <input
              autoComplete="current-password"
              className="ui-input"
              maxLength={128}
              name="password"
              required
              type="password"
            />
          </label>
          {revokeMessage ? (
            <p className="ui-alert ui-alert--error" role="alert">
              {revokeMessage}
            </p>
          ) : null}
          <div className="admin-actions">
            <button
              className="ui-button ui-button--danger"
              disabled={revokePending || !selectedCredential}
              type="submit"
            >
              {revokePending ? "Revoking…" : "Revoke credential"}
            </button>
            <button
              className="ui-button ui-button--secondary"
              disabled={revokePending}
              onClick={closeRevokeDialog}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
