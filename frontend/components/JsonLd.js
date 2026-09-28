/**
 * schema.org structured data as a JSON-LD script. Rendered on the server, so
 * crawlers read it without running JavaScript. "<" is escaped so text inside
 * the data can never close the script tag.
 */
export default function JsonLd({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
