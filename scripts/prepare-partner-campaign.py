"""Prepare a local campaign review package. Never imports, sends, or schedules email."""

import argparse
import csv
import hashlib
import html
import io
import json
from pathlib import Path
import re
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EMAIL = re.compile(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}")
RANK = {"subscribed": 0, "unsubscribed": 1, "cleaned": 2}


def read_audience(archive_path):
    """Deduplicate case-insensitively; a suppression always beats a subscription."""
    contacts, invalid, counts = {}, [], {}
    with zipfile.ZipFile(archive_path) as archive:
        for entry in archive.infolist():
            status = Path(entry.filename).name.split("_")[0]
            if status not in RANK or not entry.filename.lower().endswith(".csv"):
                continue
            if entry.file_size > 20_000_000:
                raise ValueError("Audience CSV exceeds the 20 MB preparation limit")
            reader = csv.DictReader(io.StringIO(archive.read(entry).decode("utf-8-sig")))
            if not {"Email Address", "First Name", "Last Name"}.issubset(reader.fieldnames or []):
                raise ValueError("Audience CSV is missing required email/name columns")
            counts[status] = counts.get(status, 0)
            for row in reader:
                counts[status] += 1
                email = row["Email Address"].strip().lower()
                row = {**row, "email": email, "source_status": status}
                # Formula-like addresses and malformed values need manual review.
                if not EMAIL.fullmatch(email) or email.startswith(("=", "+", "-", "@")):
                    invalid.append(row)
                    continue
                prior = contacts.get(email)
                if not prior or RANK[status] > RANK[prior["source_status"]]:
                    contacts[email] = row
    if not counts:
        raise ValueError("No recognized Mailchimp audience CSVs found")
    return sorted(contacts.values(), key=lambda row: row["email"]), invalid, counts


def safe_cell(value):
    text = str(value or "")
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text


def write_csv(path, rows, fields):
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows({k: safe_cell(row.get(k, "")) for k in fields} for row in rows)


def tracked(url, slug, content):
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.hostname != "estatesalesbakersfield.com":
        raise ValueError("Campaign destinations must use the public HTTPS website")
    query = dict(parse_qsl(parts.query))
    query.update(utm_source="partner_email", utm_medium="email", utm_campaign=slug, utm_content=content)
    return urlunsplit(parts._replace(query=urlencode(query)))


def prepare(config_path, archive_path, output_path):
    output_path = output_path.resolve()
    # Audience PII belongs only in the git-ignored local directory, never public/.
    if not output_path.is_relative_to((ROOT / ".local").resolve()):
        raise ValueError("Campaign packages must be saved inside this repository's .local directory")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if config["audience_type"] != "attendee" or "audience:business-owner" in config["audience_tags"]:
        raise ValueError("This preparation workflow is exclusively for attendee audiences")
    contacts, invalid, counts = read_audience(archive_path)
    output_path.mkdir(parents=True, exist_ok=True)
    tags = ";".join(config["audience_tags"])
    normalized = []
    for row in contacts:
        normalized.append({
            "email": row["email"], "first_name": row["First Name"].strip(),
            "last_name": row["Last Name"].strip(), "audience_type": "attendee",
            "audience_category": config.get("audience_category", "Estate Sale Attendees"),
            "source_tag": config.get("source_tag", config["partner_name"]),
            "partner": config["partner_name"], "tags": tags,
            "source_status": row["source_status"],
            "unsubscribed": "false" if row["source_status"] == "subscribed" else "true",
            "original_tags": row.get("TAGS", ""), "original_source": row.get("SOURCE", ""),
            "original_optin_time": row.get("OPTIN_TIME", ""),
            "original_confirm_time": row.get("CONFIRM_TIME", ""),
            "original_unsubscribe_time": row.get("UNSUB_TIME", ""),
            "original_clean_time": row.get("CLEAN_TIME", ""),
            "permission_review": "confirmed" if config["consent_confirmed"] else "pending_partner_permission_confirmation",
        })
    fields = ["email", "first_name", "last_name", "audience_type", "audience_category", "source_tag", "partner", "tags", "source_status", "unsubscribed", "permission_review", "original_tags", "original_source", "original_optin_time", "original_confirm_time", "original_unsubscribe_time", "original_clean_time"]
    candidates = [row for row in normalized if row["source_status"] == "subscribed"]
    suppressions = [row for row in normalized if row["source_status"] != "subscribed"]
    write_csv(output_path / "attendees-all-tagged.csv", normalized, fields)
    write_csv(output_path / "attendees-subscribed-candidates.csv", candidates, fields)
    write_csv(output_path / "attendees-suppressions.csv", suppressions, fields)
    write_csv(output_path / "invalid-addresses-review.csv", invalid, ["email", "source_status"])
    website = "https://estatesalesbakersfield.com"
    listing = tracked(config["listing_url"], config["campaign_slug"], "featured_sale")
    values = {
        **config["content"], "SUBJECT": config["subject"], "PREHEADER": config["preheader"], "PHOTO_COUNT": str(config["photo_count"]),
        "PARTNER_NAME": config["partner_name"], "LISTING_URL": listing,
        "WEBSITE_URL": tracked(website, config["campaign_slug"], "brand"),
        "BROWSE_URL": tracked(config.get("browse_url", website + "/search"), config["campaign_slug"], "browse_sales"),
        "PRIVACY_URL": website + "/privacy", "REPLY_TO": config["reply_to"],
        "LOGO_URL": website + "/images/Logo-gold-white-01.webp",
        "MAILING_ADDRESS": config["mailing_address"] or "[Business mailing address needed before sending]",
    }
    template = (ROOT / "campaigns/templates/partner-sale.html").read_text(encoding="utf-8")
    for key, value in values.items():
        template = template.replace("{{" + key + "}}", html.escape(str(value), quote=True))
    remaining = re.findall(r"\{\{[A-Z_]+\}\}", template.replace("{{{RESEND_UNSUBSCRIBE_URL}}}", ""))
    if remaining:
        raise ValueError("Unfilled template fields: " + ", ".join(remaining))
    (output_path / "campaign.html").write_text(template, encoding="utf-8")
    # Browser preview keeps the provider token out of a clickable, broken URL.
    preview = template.replace('href="{{{RESEND_UNSUBSCRIBE_URL}}}"', 'href="#unsubscribe-preview" title="Resend inserts a personalized unsubscribe link at send time"')
    preview = preview.replace('<table role="presentation" width="100%"', '<p style="margin:0;padding:10px 16px;background:#fff4d6;color:#73500c;font:12px/18px Arial;text-align:center">DRAFT FOR REVIEW · Nothing sent · See campaign manifest for pending items</p><table role="presentation" width="100%"', 1)
    (output_path / "preview.html").write_text(preview, encoding="utf-8")
    text = f"""Estate Sales Bakersfield — Partner Spotlight

{values['HEADLINE']}

Hi there,

{values['INTRO']}

{values['CTA_LABEL']}: {listing}
{values['PHOTO_NOTE']}

{values['SALE_TITLE']}
Presented by {config['partner_name']}
{values['SALE_DATES']} | {values['SALE_HOURS']}
{values['SALE_ADDRESS']}, {values['SALE_CITY']}
{values['SALE_NOTE']} Check the listing for the latest details before you head out.

{values['DISCOVERY_COPY']}

Explore more local sales: {values['BROWSE_URL']}

{values['RELATIONSHIP_COPY']}
Estate Sales Bakersfield
{values['MAILING_ADDRESS']}
Contact: {config['reply_to']}
Privacy: {values['PRIVACY_URL']}
Unsubscribe: {{{{{{RESEND_UNSUBSCRIBE_URL}}}}}}
"""
    (output_path / "campaign.txt").write_text(text, encoding="utf-8")
    manifest = {
        "status": "LOCAL_CAMPAIGN_DRAFT_NOT_SENT", "contact_import_status": "NOT_CHECKED_BY_PREPARATION_SCRIPT", "campaign": config["name"],
        "subject": config["subject"], "preheader": config["preheader"],
        "segment_name": config["segment_name"], "tags": config["audience_tags"],
        "audience_category": config.get("audience_category", "Estate Sale Attendees"),
        "source_tag": config.get("source_tag", config["partner_name"]),
        "consent_confirmed": config["consent_confirmed"],
        "consent_confirmation": config.get("consent_confirmation"),
        "source_sha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(),
        "source_counts": counts, "unique_contacts": len(contacts),
        "subscribed_candidates": len(candidates), "suppressed": len(suppressions),
        "invalid": len(invalid), "duplicate_rows_removed": sum(counts.values()) - len(contacts) - len(invalid),
        "verified_photo_count": config["photo_count"], "listing_url": config["listing_url"],
        "sale_end": config["sale_end"], "send": False,
        "pending": ["Provider access and draft/import save", "Confirm partner permission covers Estate Sales Bakersfield" if not config["consent_confirmed"] else None, "Business mailing address" if not config["mailing_address"] else None, "Verified From address" if not config["from"] else None, "Owner review before any test or campaign send", "Recheck listing dates, availability, and photo count immediately before sending"],
    }
    manifest["pending"] = [item for item in manifest["pending"] if item]
    (output_path / "campaign-manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    # Deliberately incomplete provider payload; no network calls exist in this script.
    payload = {"name": config["name"], "segment_id": "REPLACE_WITH_ATTENDEE_SEGMENT_ID", "from": config["from"] or "REPLACE_WITH_VERIFIED_FROM_ADDRESS", "reply_to": config["reply_to"], "subject": config["subject"], "html": template, "text": text, "send": False}
    (output_path / "resend-draft-payload.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--audience-zip", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.config, args.audience_zip, args.output)
