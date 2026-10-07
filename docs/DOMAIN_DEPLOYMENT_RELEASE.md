# Custom domain and deployment storage release

Reviewed on 7 October 2026. Production site: https://mdify.devbehindyou.com.

## Confirmed cause

The four Smallpp worker projects are intentional production peers, not four copies of the frontend. Vercel's activity list shows all four building frontend-only PRs #5 (blogs), #7 (navigation), #9 (client downloads), and #11 (upload admission). Those retained Python artifacts accumulated despite low request traffic. Removing a worker would remove a configured conversion/failover peer.

| Project | Root | Role | Repository / production branch | Framework | Current deployed size |
| --- | --- | --- | --- | --- | --- |
| mdify-api-n1n | backendN | documents, PDF page preparation | DevBehindYou/MDify / main | FastAPI, Python 3.12 | 67 MB in Resources |
| mdify-api-n2n | backendN | document peer | DevBehindYou/MDify / main | FastAPI | See Resources for its exact package size |
| mdify-api-z1z | backendZ | archive expansion and merging | DevBehindYou/MDify / main | FastAPI, Python 3.12 | 67 MB in Resources |
| mdify-api-z2z | backendZ | archive peer | DevBehindYou/MDify / main | FastAPI | See Resources for its exact package size |

Each worker has its own `*.vercel.app` production alias. The frontend is `mdify-app` in DevBehindYou's separate team, root `frontend`, and has the custom domain. Its observed custom-domain deployment was a promoted PR #11 preview at 0c3851c; main is the equivalent merged release a05e86b. All four worker production deployments showed main/a05e86b in the project list. Normal and archive endpoint lists still use both peers. No project, domain, credential or environment variable was removed. Secret values were not exported or compared; identical values must not be assumed. Instance identity should differ between peers.

## Applied deployment safeguards

All four worker projects had Ignored Build Step = Automatic, 30-day retention in all categories, and root-folder skipping enabled. These Python projects lack the JavaScript workspace graph needed for Vercel's automatic unaffected-project detection.

Their Project Settings now have Ignored Build Step = Custom:

```sh
b="$VERCEL_GIT_PREVIOUS_SHA"; [ -n "$b" ] || { [ "$VERCEL_ENV" = preview ] && git fetch --depth=1 origin main >/dev/null 2>&1 || exit 1; b=FETCH_HEAD; }; git diff --quiet "$b" HEAD -- . && exit 0; exit 1
```

Vercel executes this in the configured root. Exit 0 skips an unchanged folder; exit 1 explicitly permits a build. The previous successful project/branch deployment is the baseline. On a first preview, where Vercel leaves the previous SHA empty, fetch main as the baseline. A missing production baseline, failed fetch or invalid Git revision permits the build. This normalizes Git errors to exit 1; the initial unguarded command failed with exit 128 on the first preview and was replaced before merge. Whole-tree comparisons cover changes across multiple commits. Regression tests execute the exact saved shell command. The frontend ships a corresponding Node ignore command, validating SHAs and building on uncertain history.

The worker command is a dashboard setting deliberately applied before this frontend-only PR. Adding new worker runtime/config files just to install a script would itself build Python packages. Future worker changes remain eligible for production and preview builds. Skipped builds may still consume deployment-count/build-slot limits, but do not produce new function packages. Confirm the live skipped outcome on this release before declaring the change verified.

## Bundle analysis

The measured N1 and Z1 packages are 67 MB each, not 2 GB per deployment. The screenshot's 2.28/2.08 GB figures are historical per-project storage totals. Large local Windows dependencies include pandas, NumPy, ONNX Runtime/Magika, Pillow, PDF libraries and lxml. Local virtualenv sizes are not deployed Linux package measurements. They support existing format handling; no dependency was removed without format parity validation. `.vercelignore` and `excludeFiles` already exclude local environments, tests, caches and local secrets. User documents go to private object storage, not the Git deployment. No evidence of user uploads bundled into Functions was found.

## Domain/search changes

- Canonicals, Open Graph/X image URLs, structured-data identity, API examples, README links, robots and llms use the new HTTPS origin.
- The former production host permanently redirects public routes, including blog and crawler routes. API and controller requests remain usable on that host; protected preview origins are unaffected.
- All eight existing articles get static `/blog/{slug}` pages, BlogPosting and breadcrumb structured data, ISO publication dates, individual metadata, sitemap and llms links. The blog dialog remains and links to the article pages. Unknown article slugs return 404.
- Updated social preview artwork shows the new domain. No Google/Bing verification token was invented. Search Console property verification and change-of-address submission require the owner's verified account.

## Cleanup and rollback

No worker is safe to remove under the present pool configuration. Preserve all four production aliases and current healthy releases. Folder-aware skips prevent needless future storage growth. Optional next step: shorten successful preview retention from 30 to 7 days after reviewing Vercel's protected-deployment exceptions and recovery policy; keep production rollback retention. No retention/deletion change was made in this release.

Rollback the site by reverting this PR or promoting its prior frontend deployment. Restore any worker's Ignored Build Step to Automatic to undo folder skipping. For a deliberate redeploy, use Vercel's override of the ignore step. No database migration, new secret or backend rollout is required.

Storage is retained deployment output, not simply a rolling count of requests or uploads. Deletion/reclamation and retention exceptions affect when the dashboard drops. Do not promise an immediate reset or a measured GB reduction before observing it. With unchanged worker folders, a frontend-only push should produce zero new worker function packages. Two measured worker packages alone account for about 134 MB of avoidable output per build batch; check all four sizes for the full total.

Sources: [Vercel monorepos](https://vercel.com/docs/monorepos), [Deployment Storage](https://vercel.com/docs/deployment-storage), [storage optimization](https://vercel.com/docs/deployment-storage/optimize), [retention and recovery](https://vercel.com/docs/deployment-retention).

## Verification

Before merge: 25 focused domain/blog/deployment tests, lint, production build, generated blog index and SQL setup consistency passed. Full CI remains required. Inspect preview pages and actual worker skip results. After merge: verify HTTPS, public route redirects with query preservation, sitemap/robots/llms, all eight article canonicals/structured data, unknown-slug 404, converter navigation and one synthetic document conversion. Inspect scheduled job health without manually invoking global cleanup/ticks. Record final results in the optimization status report.

Private MDify-Pro's existing archive changes match the released archive implementation. Its converter lacks the newer public start/retry improvements; keep those in the public checkout and do not overwrite them with an older private file. Existing private edits are preserved.

Local browser validation: the eight-article index and full article content render in the production build. The article canonical and Open Graph URL use the custom domain. At 390 × 844 the article has no horizontal overflow; its images load and BlogPosting/BreadcrumbList are present. The Smallpp browser account cannot access the frontend team's protected preview, so browser validation used the same built frontend locally. All six CI jobs passed on 045b2f6. Worker previews were healthy but did not yet skip; their live baseline/fallback behavior is still being investigated. Do not count a green worker deployment as proof of skipping.
