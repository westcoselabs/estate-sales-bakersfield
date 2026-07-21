import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <section aria-labelledby="foundation-title">
        <p>Estate &amp; Yard Sale Directory</p>
        <h1 id="foundation-title">Organizer accounts are ready.</h1>
        <p>
          Create an account and complete your organizer profile. Event
          publishing begins in the next product phase.
        </p>
        <p>
          <Link href="/signup">Create an account</Link> or{" "}
          <Link href="/login">log in</Link>.
        </p>
      </section>
    </main>
  );
}
