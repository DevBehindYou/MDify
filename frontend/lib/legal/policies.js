// MDify Privacy Policy and Terms of Service (EU: GDPR, ePrivacy, DSA).
//
// Single source for the in-app legal dialog and the /privacy and /terms
// pages. Changing either document materially means bumping LEGAL_VERSION:
// the consent banner then asks every visitor to accept again.
//
// OPERATOR is the public identity and contact point (GDPR Art. 13(1)(a), DSA
// Art. 11–12). By the owner's decision the documents name no postal address,
// governing-law country or specific providers: recipients are described by
// category (Art. 13(1)(e) allows that) and available on request.

export const LEGAL_VERSION = '2026-09-28';
export const LEGAL_UPDATED_LABEL = '28 September 2026';

export const OPERATOR = {
  name: 'DevBehindYou',
  email: 'devbehindyou@gmail.com',
};

export const RETENTION_HOURS = 48;

/**
 * Block shapes: { p: string } | { ul: string[] } | { note: string }.
 * Strings are plain text; the renderer handles layout.
 */
export const PRIVACY_POLICY = {
  title: 'Privacy Policy',
  summary: [
    'Files you upload are used for one thing: converting them to Markdown.',
    `They're deleted automatically ${RETENTION_HOURS} hours after upload, with no account needed.`,
    'No ads, no tracking, and nobody trains AI models on your files.',
  ],
  sections: [
    {
      id: 'controller',
      title: '1. Who is responsible',
      blocks: [
        { p: `MDify is run by ${OPERATOR.name}. For anything about your data, write to ${OPERATOR.email}.` },
        { p: 'We are the controller of the personal data described here under the EU General Data Protection Regulation (GDPR).' },
      ],
    },
    {
      id: 'data',
      title: '2. What we process',
      blocks: [
        { ul: [
          'The files you upload and everything inside them. Documents can contain personal data about you or other people, so please upload only what you need converted.',
          'File details: name, type and size.',
          'A job record for each conversion: when it started and finished, which of our servers handled it, and any error.',
          'Technical request data: your IP address, browser type and the time of each request. Our hosting providers log these to deliver and protect the service.',
        ] },
        { p: 'We don\'t ask for your name, email address or any account. We don\'t use cookies for tracking or advertising, and we run no third-party analytics.' },
      ],
    },
    {
      id: 'purposes',
      title: '3. Why we process it, and our legal basis',
      blocks: [
        { ul: [
          'Converting your files and giving you the result. Legal basis: performing the service you request under our Terms (Art. 6(1)(b) GDPR).',
          'Keeping MDify secure and working: blocking abuse, fixing errors and measuring capacity. Legal basis: our legitimate interest in running a safe, reliable service (Art. 6(1)(f) GDPR).',
          'Recording that you accepted the Terms and this policy, so we can show which version you agreed to. Legal basis: Art. 6(1)(b) and (f) GDPR.',
        ] },
        { p: 'We never use your files or their content for advertising, profiling or training machine learning models.' },
      ],
    },
    {
      id: 'retention',
      title: '4. How long we keep it',
      blocks: [
        { ul: [
          `Uploaded files and converted results: deleted automatically ${RETENTION_HOURS} hours after your upload finishes. Our cleanup runs every 30 minutes and retries any deletion that fails.`,
          'Authorised administrators can delete a file earlier. In a specific case, such as investigating abuse or meeting a legal obligation, they can keep a file longer. Every such decision is logged.',
          `File names: deleted together with the files. After that, a job record keeps only the file type, size, timings and outcome, with nothing that identifies you.`,
          'Technical request logs: kept by our hosting providers for the period set in their own policies.',
        ] },
        { p: 'Some conversions run fully in server memory without storing the file at all. The limits above are the maximum, not the norm.' },
      ],
    },
    {
      id: 'device',
      title: '5. Data kept on your device',
      blocks: [
        { p: 'MDify stores a few items in your browser\'s local storage. They stay on your device and are never sent to us:' },
        { ul: [
          'Your light or dark theme choice.',
          'Which version of these documents you accepted, and when.',
          'Your last 5 conversions (the Markdown text and file details), so you can reopen them. Clear them any time from the Recent panel.',
        ] },
        { p: 'These items are needed for features you use, so the EU ePrivacy rules don\'t require a separate cookie consent for them.' },
      ],
    },
    {
      id: 'recipients',
      title: '6. Who else handles your data',
      blocks: [
        { p: 'We use a small number of service providers to run MDify. Each one processes data only on our instructions, under a data processing agreement:' },
        { ul: [
          'hosting providers that run the website and our conversion servers,',
          'a cloud storage and database provider that holds uploaded files, results and job records until they are deleted.',
        ] },
        { p: `You can ask us which providers we use by writing to ${OPERATOR.email}.` },
        { note: 'The conversion software (open-source Microsoft MarkItDown and Tesseract OCR) runs on MDify\'s conversion servers. It does not send your files to Microsoft or to anyone else.' },
        { p: 'We don\'t sell or share your data with anyone else. We would disclose data to authorities only where the law requires it.' },
      ],
    },
    {
      id: 'transfers',
      title: '7. Transfers outside the EU',
      blocks: [
        { p: 'Some of our providers are based outside the EU, so your data may be processed in other countries, including the United States. We rely on the EU-US Data Privacy Framework where a provider is certified under it, and on the European Commission\'s Standard Contractual Clauses (Art. 46(2)(c) GDPR) otherwise. You can ask us for a copy of the safeguards.' },
      ],
    },
    {
      id: 'rights',
      title: '8. Your rights',
      blocks: [
        { p: 'Under the GDPR you can ask us to:' },
        { ul: [
          'show you the data we hold about you (Art. 15),',
          'correct it (Art. 16),',
          'delete it (Art. 17),',
          'limit how we use it (Art. 18),',
          'give it to you in a portable format (Art. 20),',
          'stop processing it where we rely on legitimate interests (Art. 21).',
        ] },
        { p: `Write to ${OPERATOR.email}. MDify has no accounts, so tell us the file name and the approximate time of the upload, and we'll find it if it still exists. We reply within one month.` },
        { p: 'You have the right to complain to a data protection supervisory authority, in particular in the EU country where you live or work (Art. 77 GDPR).' },
      ],
    },
    {
      id: 'required',
      title: '9. Do you have to give us data?',
      blocks: [
        { p: 'No. Without a file we can\'t convert anything, but using MDify is voluntary. We make no automated decisions about you that have legal effects or affect you in a comparably significant way (Art. 22 GDPR). Conversion and text recognition are automatic, technical steps.' },
      ],
    },
    {
      id: 'security',
      title: '10. Security',
      blocks: [
        { ul: [
          'All traffic is encrypted in transit (HTTPS).',
          'Files sit in private storage. Download links expire after 10 minutes.',
          'Only the conversion servers and authorised administrators can reach stored files, and administrator actions are logged.',
          'Every file is checked before conversion, and unsafe or unsupported files are rejected.',
        ] },
      ],
    },
    {
      id: 'children',
      title: '11. Children',
      blocks: [
        { p: 'MDify isn\'t aimed at children under 16. If you\'re younger, please use it only with a parent\'s or guardian\'s permission.' },
      ],
    },
    {
      id: 'changes',
      title: '12. Changes to this policy',
      blocks: [
        { p: 'We\'ll update the date at the top when this policy changes. If a change affects how we use your data, MDify asks you to accept the new version before your next conversion.' },
      ],
    },
  ],
};

export const TERMS_OF_SERVICE = {
  title: 'Terms of Service',
  summary: [
    'MDify is free. You keep full ownership of your files.',
    'Upload only content you have the right to use, and check results before relying on them.',
    `Files are deleted after ${RETENTION_HOURS} hours, so keep your own copies.`,
  ],
  sections: [
    {
      id: 'provider',
      title: '1. Who provides MDify',
      blocks: [
        { p: `MDify is provided by ${OPERATOR.name}. Contact: ${OPERATOR.email}.` },
      ],
    },
    {
      id: 'service',
      title: '2. The service',
      blocks: [
        { p: 'MDify converts documents (PDF, including scanned pages, Word, PowerPoint, Excel, EPUB, HTML, CSV, JSON, XML, text), images and ZIP files into Markdown. You don\'t need an account, and MDify is free of charge.' },
        { p: 'Current limits: 15 MB per document or ZIP file, 10 MB per image, 2,000 files inside a ZIP file and 20 files per batch. We can change these limits and the supported formats.' },
      ],
    },
    {
      id: 'acceptance',
      title: '3. Accepting these terms',
      blocks: [
        { p: 'You accept these terms when you click "Accept & continue" in MDify. You must be at least 16, or have permission from a parent or guardian.' },
      ],
    },
    {
      id: 'content',
      title: '4. Your files',
      blocks: [
        { p: 'You keep every right to the files you upload and to the Markdown MDify produces from them.' },
        { p: `You give us a limited, free, non-exclusive permission to store and process your files only to convert them and deliver the result, and only for as long as our Privacy Policy allows (at most ${RETENTION_HOURS} hours by default). We don't use your files for anything else, including training AI models.` },
        { p: 'MDify isn\'t a storage service. Files and results are deleted automatically, so keep your own copies.' },
      ],
    },
    {
      id: 'use',
      title: '5. Acceptable use',
      blocks: [
        { p: 'Don\'t use MDify to:' },
        { ul: [
          'upload illegal content, or content you have no right to process, including other people\'s personal data without a legal basis,',
          'upload malware or files built to attack or crash the service,',
          'get around the file limits or security checks, or overload the service with automated mass requests,',
          'break the law or other people\'s rights in any other way.',
        ] },
        { p: 'We can refuse a file, stop a conversion or block access if we see misuse. Where the law requires it, we\'ll tell you why.' },
      ],
    },
    {
      id: 'results',
      title: '6. Conversion results',
      blocks: [
        { p: 'Conversion and text recognition are automatic and can make mistakes: missing text, wrong characters, broken tables. Check every result before you rely on it, especially for legal, medical or financial content.' },
      ],
    },
    {
      id: 'availability',
      title: '7. Availability and changes',
      blocks: [
        { p: 'MDify is a free service with no guaranteed uptime. We can change, pause or end all or part of it. Where we reasonably can, we\'ll announce big changes in advance.' },
      ],
    },
    {
      id: 'illegal-content',
      title: '8. Reporting illegal content (EU Digital Services Act)',
      blocks: [
        { p: `Our single point of contact for users and authorities is ${OPERATOR.email}. We answer in English.` },
        { p: 'To report content you believe is illegal, send us: why you think it\'s illegal, the file name or job reference and the time, your name and email, and a statement that your report is accurate and made in good faith. We\'ll review it without undue delay and tell you what we decided. If we restrict content or access, we explain the reason to the person affected.' },
      ],
    },
    {
      id: 'liability',
      title: '9. Liability',
      blocks: [
        { p: 'We\'re fully liable for damage we cause intentionally or through gross negligence, for injury to life, body or health, and wherever mandatory law (such as product liability law) says so.' },
        { p: 'For slight negligence we\'re liable only if we breach a core obligation that makes the service possible and that you can reasonably rely on. Even then, our liability is limited to the typical damage we could foresee when you used MDify. Otherwise, as MDify is free, we aren\'t liable for slight negligence.' },
        { p: 'Nothing in these terms limits rights you have as a consumer under mandatory law.' },
      ],
    },
    {
      id: 'open-source',
      title: '10. Open-source software',
      blocks: [
        { p: 'MDify\'s source code is published under the GNU General Public License v3.0. That licence governs your use of the code. These terms govern the hosted service.' },
        { note: 'Conversion uses open-source components, including Microsoft MarkItDown (MIT License) and Tesseract OCR (Apache License 2.0). Their authors do not endorse MDify.' },
      ],
    },
    {
      id: 'changes',
      title: '11. Changes to these terms',
      blocks: [
        { p: 'We\'ll update the date at the top when these terms change. For changes that affect you, MDify asks you to accept the new version before your next conversion. If you don\'t accept, you can stop using MDify at any time.' },
      ],
    },
    {
      id: 'law',
      title: '12. Law and disputes',
      blocks: [
        { p: 'If you\'re a consumer living in the EU, the mandatory consumer protection laws of your country of residence apply to you, and you can bring a claim in the courts where you live.' },
        { p: `If you have a complaint, write to ${OPERATOR.email} first. We aim to answer within 14 days.` },
        { p: 'If any part of these terms turns out to be invalid, the rest still applies.' },
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS = { privacy: PRIVACY_POLICY, terms: TERMS_OF_SERVICE };
