import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import POSTS from '../lib/blogPosts.generated.json' with { type: 'json' };
import { SITE_URL, siteJsonLd } from '../lib/siteContent.js';
import { articleMetadata, articleJsonLd } from '../lib/articleSeo.mjs';
import sitemap from '../app/sitemap.js';
import robots from '../app/robots.js';
test('every published article has a unique canonical, complete metadata and sitemap/AI discovery',()=>{
 assert.equal(SITE_URL,'https://mdify.devbehindyou.com'); assert.equal(POSTS.length,8);
 const urls=new Set(sitemap().map(x=>x.url));assert.equal(urls.size,13);
 const llms=fs.readFileSync(new URL('../public/llms.txt',import.meta.url),'utf8');
 for(const post of POSTS){
  const url=SITE_URL+'/blog/'+post.id;const meta=articleMetadata(post);const graph=articleJsonLd(post)['@graph'];
  assert.ok(urls.has(url));assert.ok(llms.includes(url));assert.equal(meta.alternates.canonical,url);assert.equal(meta.openGraph.url,url);
  assert.match(post.publishedAt,/^\d{4}-\d{2}-\d{2}$/);assert.ok(meta.description.length>30);
  assert.equal(graph[0].mainEntityOfPage,url);assert.equal(graph[0].datePublished,post.publishedAt);assert.equal(graph[1].itemListElement[2].item,url);
 }
 assert.equal(robots().sitemap,SITE_URL+'/sitemap.xml');assert.doesNotMatch(JSON.stringify(siteJsonLd())+llms,/mdify-app.vercel.app/);
});
test('old production hostname redirects paths permanently; previews and POST APIs are not forced to another host',async()=>{
 const {default:config}=await import('../next.config.js');const redirects=await config.redirects();const redirect=redirects.find(r=>r.source==='/blog/:path*');assert.ok(!redirects.some(r=>r.source.includes('api')||r.source.includes('controller')));
 assert.deepEqual(redirect.has,[{type:'host',value:'mdify-app.vercel.app'}]);assert.equal(redirect.permanent,true);assert.equal(redirect.destination,SITE_URL+'/blog/:path*');
});
